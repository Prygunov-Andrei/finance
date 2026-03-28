import logging

from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from django.db import transaction
from django.db.models import F, ExpressionWrapper, DecimalField, Sum
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend

logger = logging.getLogger(__name__)

# Лимит размера файла для импорта (50 МБ)
from django.conf import settings as django_settings
MAX_IMPORT_FILE_SIZE = getattr(django_settings, 'ESTIMATE_IMPORT_MAX_FILE_SIZE', 50 * 1024 * 1024)

ALLOWED_EXCEL_CONTENT_TYPES = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',  # некоторые браузеры отправляют так
}
ALLOWED_PDF_CONTENT_TYPES = {
    'application/pdf',
    'application/octet-stream',
}

from core.version_mixin import VersioningMixin
from estimates.formula_engine import topological_sort
from estimates.models import (
    Estimate, EstimateSection, EstimateSubsection,
    EstimateCharacteristic, EstimateItem,
    MountingEstimate,
)
from estimates.serializers import (
    EstimateSerializer, EstimateListSerializer, EstimateCreateSerializer,
    EstimateSectionSerializer, EstimateSubsectionSerializer,
    EstimateCharacteristicSerializer,
    EstimateItemSerializer, EstimateItemBulkCreateSerializer,
    MountingEstimateSerializer,
    EstimateMarkupDefaultsSerializer, BulkSetMarkupSerializer,
)
from estimates.models import EstimateMarkupDefaults


class EstimateMarkupDefaultsViewSet(viewsets.ViewSet):
    """ViewSet для глобальных дефолтных наценок (синглтон)"""

    def list(self, request):
        defaults = EstimateMarkupDefaults.get()
        serializer = EstimateMarkupDefaultsSerializer(defaults)
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        defaults = EstimateMarkupDefaults.get()
        serializer = EstimateMarkupDefaultsSerializer(defaults, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class EstimateViewSet(VersioningMixin, viewsets.ModelViewSet):
    """ViewSet для смет (с поддержкой версионирования через VersioningMixin)"""

    queryset = Estimate.objects.select_related(
        'object', 'legal_entity', 'price_list', 'created_by',
        'checked_by', 'approved_by', 'parent_version'
    ).prefetch_related(
        'projects',
        'projects__project_files',
        'projects__project_files__file_type',
        'sections',
        'sections__subsections',
        'characteristics'
    )
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = [
        'object', 'legal_entity', 'status', 'approved_by_customer'
    ]
    search_fields = ['number', 'name']

    def get_serializer_class(self):
        if self.action == 'create':
            return EstimateCreateSerializer
        if self.action == 'list':
            return EstimateListSerializer
        return EstimateSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        # Аннотируем агрегаты для избежания N+1 в сериализаторе
        if self.action in ('list', 'retrieve'):
            queryset = queryset.annotate(
                _total_materials_sale=Sum('sections__subsections__materials_sale'),
                _total_works_sale=Sum('sections__subsections__works_sale'),
                _total_materials_purchase=Sum('sections__subsections__materials_purchase'),
                _total_works_purchase=Sum('sections__subsections__works_purchase'),
            )
        return queryset

    # Методы versions() и create_version() наследуются от VersioningMixin

    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_mat = old_instance.default_material_markup_percent
        old_work = old_instance.default_work_markup_percent
        instance = serializer.save()
        # При изменении дефолтных наценок — пересчитать все подразделы
        if (instance.default_material_markup_percent != old_mat or
                instance.default_work_markup_percent != old_work):
            from estimates.services.markup_service import recalculate_estimate_subsections
            recalculate_estimate_subsections(instance.id)

    @action(detail=True, methods=['post'], url_path='create-mounting-estimate')
    def create_mounting_estimate(self, request, pk=None):
        """Создать монтажную смету из обычной сметы"""
        estimate = self.get_object()
        created_by = request.user
        mounting_estimate = MountingEstimate.create_from_estimate(estimate, created_by)
        serializer = MountingEstimateSerializer(mounting_estimate)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='export')
    def export(self, request, pk=None):
        """Экспорт сметы в Excel. mode=internal|external (по умолчанию internal)."""
        from estimates.services.estimate_excel_exporter import EstimateExcelExporter

        estimate = self.get_object()
        mode = request.query_params.get('mode', 'internal')
        exporter = EstimateExcelExporter(estimate)
        buffer = exporter.export_with_column_config(mode=mode)

        suffix = 'внутр' if mode == 'internal' else 'клиент'
        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        filename = f'Смета_{estimate.number}_{suffix}.xlsx'
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class EstimateSectionViewSet(viewsets.ModelViewSet):
    """ViewSet для разделов сметы"""

    queryset = EstimateSection.objects.select_related('estimate').prefetch_related('subsections')
    serializer_class = EstimateSectionSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['estimate']

    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_mat = old_instance.material_markup_percent
        old_work = old_instance.work_markup_percent
        instance = serializer.save()
        if (instance.material_markup_percent != old_mat or
                instance.work_markup_percent != old_work):
            from estimates.services.markup_service import recalculate_section_subsections
            recalculate_section_subsections(instance.id)

    @action(detail=True, methods=['post'], url_path='demote-to-item')
    def demote_to_item(self, request, pk=None):
        """Превратить раздел обратно в обычную строку сметы."""
        try:
            section = EstimateSection.objects.get(pk=pk)
        except EstimateSection.DoesNotExist:
            return Response({'error': 'Раздел не найден'}, status=status.HTTP_404_NOT_FOUND)

        from estimates.services.estimate_import_service import EstimateImportService
        result = EstimateImportService().demote_section_to_item(int(pk))
        return Response(result)


class EstimateSubsectionViewSet(viewsets.ModelViewSet):
    """ViewSet для подразделов сметы"""

    queryset = EstimateSubsection.objects.select_related('section', 'section__estimate')
    serializer_class = EstimateSubsectionSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['section']

    def get_queryset(self):
        queryset = super().get_queryset()
        # Фильтрация по смете через раздел
        estimate_id = self.request.query_params.get('estimate')
        if estimate_id:
            queryset = queryset.filter(section__estimate_id=estimate_id)
        return queryset


class EstimateCharacteristicViewSet(viewsets.ModelViewSet):
    """ViewSet для характеристик сметы"""

    queryset = EstimateCharacteristic.objects.select_related('estimate')
    serializer_class = EstimateCharacteristicSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['estimate']


class EstimateItemPagination(PageNumberPagination):
    """Пагинация строк сметы. page_size=all отключает пагинацию (обратная совместимость)."""
    page_size = 200
    page_size_query_param = 'page_size'
    max_page_size = 2000

    def paginate_queryset(self, queryset, request, view=None):
        if request.query_params.get('page_size') == 'all':
            return None
        return super().paginate_queryset(queryset, request, view)


class EstimateItemViewSet(viewsets.ModelViewSet):
    """ViewSet для строк сметы"""
    pagination_class = EstimateItemPagination

    queryset = EstimateItem.objects.select_related(
        'estimate', 'section', 'subsection',
        'product', 'work_item', 'source_price_history',
        'supplier_product__integration__counterparty',
    )
    serializer_class = EstimateItemSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        'estimate', 'section', 'subsection', 'product',
        'work_item', 'is_analog',
    ]
    search_fields = ['name', 'model_name', 'original_name']
    ordering_fields = ['sort_order', 'item_number', 'name', 'material_unit_price', 'work_unit_price']
    ordering = ['sort_order', 'item_number']

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        estimate_id = self.request.query_params.get('estimate')
        if estimate_id:
            try:
                estimate = Estimate.objects.only('column_config').get(pk=estimate_id)
                column_config = estimate.column_config or []
                ctx['column_config'] = column_config
                # Pre-compute topological sort once for all items
                ctx['sorted_columns'] = topological_sort(column_config)
            except Estimate.DoesNotExist:
                pass
        return ctx

    def get_queryset(self):
        return super().get_queryset().annotate(
            _material_total=ExpressionWrapper(
                F('quantity') * F('material_unit_price'),
                output_field=DecimalField(max_digits=15, decimal_places=2),
            ),
            _work_total=ExpressionWrapper(
                F('quantity') * F('work_unit_price'),
                output_field=DecimalField(max_digits=15, decimal_places=2),
            ),
            _line_total=ExpressionWrapper(
                F('quantity') * F('material_unit_price') + F('quantity') * F('work_unit_price'),
                output_field=DecimalField(max_digits=15, decimal_places=2),
            ),
        )

    @action(detail=True, methods=['post'], url_path='promote-to-section')
    def promote_to_section(self, request, pk=None):
        """Превратить строку сметы в раздел (секцию)."""
        try:
            EstimateItem.objects.get(pk=pk)
        except EstimateItem.DoesNotExist:
            return Response({'error': 'Строка не найдена'}, status=status.HTTP_404_NOT_FOUND)

        from estimates.services.estimate_import_service import EstimateImportService
        result = EstimateImportService().promote_item_to_section(int(pk))
        return Response(result)

    @action(detail=True, methods=['post'], url_path='move')
    def move(self, request, pk=None):
        """Переместить строку сметы вверх/вниз или в другой раздел."""
        try:
            EstimateItem.objects.get(pk=pk)
        except EstimateItem.DoesNotExist:
            return Response({'error': 'Строка не найдена'}, status=status.HTTP_404_NOT_FOUND)

        from estimates.services.estimate_import_service import EstimateImportService
        service = EstimateImportService()

        direction = request.data.get('direction')
        target_section_id = request.data.get('target_section_id')

        if direction in ('up', 'down'):
            if direction == 'up':
                result = service.move_item_up(int(pk))
            else:
                result = service.move_item_down(int(pk))
        elif target_section_id is not None:
            try:
                EstimateSection.objects.get(pk=target_section_id)
            except EstimateSection.DoesNotExist:
                return Response({'error': 'Раздел не найден'}, status=status.HTTP_404_NOT_FOUND)
            result = service.move_item_to_section(int(pk), int(target_section_id))
        else:
            return Response(
                {'error': 'Укажите direction (up/down) или target_section_id'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(result)

    @action(detail=False, methods=['post'], url_path='bulk-create')
    def bulk_create(self, request):
        """Создать множество строк сметы за одну операцию"""
        serializer = EstimateItemBulkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        items = serializer.save()
        return Response(
            EstimateItemSerializer(items, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'], url_path='bulk-move')
    def bulk_move(self, request):
        """Переместить группу строк на указанную позицию."""
        item_ids = request.data.get('item_ids', [])
        target_position = request.data.get('target_position')

        if not item_ids or not isinstance(item_ids, list):
            return Response(
                {'error': 'Необходим непустой массив item_ids'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target_position is None or not isinstance(target_position, int) or target_position < 1:
            return Response(
                {'error': 'target_position должен быть целым числом >= 1'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from estimates.services.estimate_import_service import EstimateImportService
        result = EstimateImportService().bulk_move_items(item_ids, target_position)
        return Response(result)

    @action(detail=False, methods=['post'], url_path='bulk-merge')
    def bulk_merge(self, request):
        """Объединить выбранные строки сметы в одну."""
        item_ids = request.data.get('item_ids', [])

        if not item_ids or not isinstance(item_ids, list) or len(item_ids) < 2:
            return Response(
                {'error': 'Необходим массив item_ids с минимум 2 элементами'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from estimates.services.estimate_import_service import EstimateImportService
        try:
            result = EstimateImportService().merge_items(item_ids)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result)

    @action(detail=False, methods=['post'], url_path='bulk-set-markup')
    def bulk_set_markup(self, request):
        """Массовая установка наценки на выбранные строки сметы."""
        serializer = BulkSetMarkupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        from estimates.services.markup_service import bulk_set_item_markup
        bulk_set_item_markup(
            item_ids=data['item_ids'],
            material_markup_type=data.get('material_markup_type'),
            material_markup_value=data.get('material_markup_value'),
            work_markup_type=data.get('work_markup_type'),
            work_markup_value=data.get('work_markup_value'),
        )
        return Response({'status': 'ok', 'updated': len(data['item_ids'])})

    # Поля, разрешённые для массового обновления через bulk-update
    BULK_UPDATE_ALLOWED_FIELDS = frozenset({
        'name', 'model_name', 'unit', 'quantity',
        'material_unit_price', 'work_unit_price',
        'sort_order', 'item_number',
        'is_analog', 'analog_reason', 'original_name',
        'material_markup_type', 'material_markup_value',
        'work_markup_type', 'work_markup_value',
        'custom_data',
    })

    @action(detail=False, methods=['post'], url_path='bulk-update')
    def bulk_update_items(self, request):
        """Обновить множество строк сметы за одну операцию.
        Ожидает массив объектов с обязательным полем 'id'."""
        items_data = request.data
        if not isinstance(items_data, list) or not items_data:
            return Response(
                {'error': 'Ожидается непустой массив объектов'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ids = [item.get('id') for item in items_data if item.get('id')]
        existing = {
            item.id: item
            for item in EstimateItem.objects.filter(id__in=ids)
            .select_related('subsection__section__estimate')
        }

        # Собираем update_fields из ВСЕХ items (не только первого)
        all_fields = set()
        for item_data in items_data:
            all_fields.update(k for k in item_data.keys() if k != 'id')
        allowed_fields = all_fields & self.BULK_UPDATE_ALLOWED_FIELDS

        if not allowed_fields:
            return Response(
                {'error': 'Нет разрешённых полей для обновления'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            updated = []
            for item_data in items_data:
                item_id = item_data.get('id')
                if not item_id or item_id not in existing:
                    continue
                obj = existing[item_id]
                for field, value in item_data.items():
                    if field == 'id' or field not in self.BULK_UPDATE_ALLOWED_FIELDS:
                        continue
                    setattr(obj, field, value)
                updated.append(obj)

            if updated:
                EstimateItem.objects.bulk_update(updated, list(allowed_fields))
                # bulk_update не вызывает post_save сигналы — пересчитываем вручную
                from estimates.services.markup_service import recalculate_subsections_for_items
                recalculate_subsections_for_items([obj.id for obj in updated])

        # Перечитываем из БД для корректной типизации полей в сериализаторе
        if updated:
            updated = list(self.get_queryset().filter(id__in=[o.id for o in updated]))
        return Response(
            EstimateItemSerializer(updated, many=True).data,
        )

    @action(detail=False, methods=['post'], url_path='auto-match')
    def auto_match(self, request):
        """Автоматический подбор цен и работ для строк сметы"""
        estimate_id = request.data.get('estimate_id')
        price_list_id = request.data.get('price_list_id')

        if not estimate_id:
            return Response(
                {'error': 'Не указан estimate_id'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            estimate = Estimate.objects.get(pk=estimate_id)
        except Estimate.DoesNotExist:
            return Response(
                {'error': 'Смета не найдена'},
                status=status.HTTP_404_NOT_FOUND,
            )

        supplier_ids = request.data.get('supplier_ids', [])
        price_strategy = request.data.get('price_strategy', 'cheapest')

        from estimates.services.estimate_auto_matcher import EstimateAutoMatcher
        matcher = EstimateAutoMatcher()
        results = matcher.preview_matches(
            estimate,
            supplier_ids=supplier_ids or None,
            price_strategy=price_strategy,
        )
        return Response(results)

    # ====================== Async Work Matching ======================

    @action(detail=False, methods=['post'], url_path='start-work-matching')
    def start_work_matching(self, request):
        """Запустить фоновый подбор работ для сметы."""
        estimate_id = request.data.get('estimate_id')
        if not estimate_id:
            return Response(
                {'error': 'Необходим estimate_id'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from estimates.services.work_matching import WorkMatchingService
        svc = WorkMatchingService()

        try:
            result = svc.start_matching(
                estimate_id=int(estimate_id),
                user_id=request.user.id,
            )
        except ValueError as e:
            msg = str(e)
            if msg.startswith('ALREADY_RUNNING:'):
                existing_session = msg.split(':')[1]
                return Response(
                    {'error': 'Подбор уже запущен', 'session_id': existing_session},
                    status=status.HTTP_409_CONFLICT,
                )
            raise

        return Response(result, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=['get'],
            url_path='work-matching-progress/(?P<session_id>[a-f0-9]+)')
    def work_matching_progress(self, request, session_id=None):
        """Получить прогресс подбора работ."""
        from estimates.services.work_matching import WorkMatchingService
        svc = WorkMatchingService()
        progress = svc.get_progress(session_id)
        if not progress:
            return Response(
                {'error': 'Сессия не найдена или истекла'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(progress)

    @action(detail=False, methods=['post'],
            url_path='cancel-work-matching/(?P<session_id>[a-f0-9]+)')
    def cancel_work_matching(self, request, session_id=None):
        """Отменить подбор работ."""
        from estimates.services.work_matching import WorkMatchingService
        svc = WorkMatchingService()
        cancelled = svc.cancel(session_id)
        if cancelled:
            return Response({'status': 'cancelled'})
        return Response(
            {'error': 'Сессия не найдена'},
            status=status.HTTP_404_NOT_FOUND,
        )

    @action(detail=False, methods=['post'], url_path='apply-work-matching')
    def apply_work_matching(self, request):
        """Применить результаты подбора работ."""
        session_id = request.data.get('session_id')
        items_data = request.data.get('items', [])
        if not session_id or not items_data:
            return Response(
                {'error': 'Необходимы session_id и items'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from estimates.services.work_matching import WorkMatchingService
        svc = WorkMatchingService()
        result = svc.apply_results(
            session_id=session_id,
            items=items_data,
            user=request.user,
        )

        # Пересчёт наценок для обновлённых строк
        item_ids = [d['item_id'] for d in items_data if d.get('work_item_id')]
        if item_ids:
            from estimates.services.markup_service import recalculate_subsections_for_items
            recalculate_subsections_for_items(item_ids)

        return Response(result)

    @action(detail=False, methods=['post'], url_path='import',
            parser_classes=[MultiPartParser])
    def import_file(self, request):
        """Импорт строк сметы из Excel или PDF.
        Если preview=true, возвращает предпросмотр без сохранения."""
        estimate_id = request.data.get('estimate_id')
        file = request.FILES.get('file')
        preview_mode = request.data.get('preview', '').lower() in ('true', '1')

        if not estimate_id or not file:
            return Response(
                {'error': 'Необходимы estimate_id и file'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # B2: пустой файл
        if file.size == 0:
            return Response(
                {'error': 'Файл пуст'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # B1: лимит размера
        if file.size > MAX_IMPORT_FILE_SIZE:
            return Response(
                {'error': f'Файл слишком большой (макс. {MAX_IMPORT_FILE_SIZE // (1024 * 1024)} МБ)'},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        try:
            estimate = Estimate.objects.get(pk=estimate_id)
        except Estimate.DoesNotExist:
            return Response(
                {'error': 'Смета не найдена'},
                status=status.HTTP_404_NOT_FOUND,
            )

        filename = file.name.lower()
        ext = filename.rsplit('.', 1)[-1] if '.' in filename else ''

        # B3: проверка расширения + MIME-type
        if ext in ('xlsx', 'xls'):
            if file.content_type not in ALLOWED_EXCEL_CONTENT_TYPES:
                logger.warning('Import: unexpected content_type %s for Excel file %s', file.content_type, file.name)
        elif ext == 'pdf':
            if file.content_type not in ALLOWED_PDF_CONTENT_TYPES:
                logger.warning('Import: unexpected content_type %s for PDF file %s', file.content_type, file.name)
        else:
            return Response(
                {'error': 'Поддерживаются только файлы Excel (.xlsx) и PDF'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_content = file.read()

        from estimates.services.estimate_import_service import EstimateImportService
        importer = EstimateImportService()

        try:
            if ext in ('xlsx', 'xls'):
                parsed = importer.import_from_excel(file_content, file.name)
            else:
                parsed = importer.import_from_pdf(file_content, file.name)
        except Exception:
            logger.exception('Ошибка парсинга файла %s для сметы %s', file.name, estimate_id)
            return Response(
                {'error': 'Не удалось распознать файл. Проверьте формат.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if preview_mode:
            result = {
                'rows': [row.model_dump() for row in parsed.rows],
                'sections': parsed.sections,
                'total_rows': parsed.total_rows,
                'confidence': parsed.confidence,
            }
            if parsed.warnings:
                result['warnings'] = parsed.warnings
            return Response(result)

        created_items = importer.save_imported_items(int(estimate_id), parsed)
        return Response(
            EstimateItemSerializer(created_items, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'], url_path='import-project-file')
    def import_from_project_file(self, request):
        """Импорт строк сметы из файлов проекта (ProjectFile).
        Принимает estimate_id и project_file_ids (массив) или project_file_id (одиночный),
        preview=true для предпросмотра."""
        from estimates.models import ProjectFile, Estimate

        estimate_id = request.data.get('estimate_id')
        preview_mode = str(request.data.get('preview', '')).lower() in ('true', '1')

        # Поддержка массива и одиночного ID
        project_file_ids = request.data.get('project_file_ids', [])
        single_id = request.data.get('project_file_id')
        if single_id and not project_file_ids:
            project_file_ids = [single_id]

        if not estimate_id or not project_file_ids:
            return Response(
                {'error': 'Необходимы estimate_id и project_file_ids'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            estimate = Estimate.objects.get(pk=estimate_id)
        except Estimate.DoesNotExist:
            return Response({'error': 'Смета не найдена'}, status=status.HTTP_404_NOT_FOUND)

        linked_project_ids = set(estimate.projects.values_list('pk', flat=True))

        from estimates.services.estimate_import_service import EstimateImportService
        importer = EstimateImportService()

        all_rows = []
        all_sections = []
        all_warnings = []
        min_confidence = 1.0
        errors = []

        for pf_id in project_file_ids:
            try:
                project_file = ProjectFile.objects.select_related('file_type', 'project').get(pk=pf_id)
            except ProjectFile.DoesNotExist:
                errors.append(f'Файл {pf_id} не найден')
                continue

            if project_file.project_id not in linked_project_ids:
                errors.append(f'Файл «{project_file.original_filename}» принадлежит проекту, не связанному с этой сметой')
                continue

            try:
                project_file.file.open('rb')
                file_content = project_file.file.read()
                project_file.file.close()
            except Exception:
                logger.exception('Не удалось прочитать файл проекта %s', pf_id)
                errors.append(f'Не удалось прочитать файл «{project_file.original_filename}»')
                continue

            filename = project_file.original_filename or project_file.file.name
            ext = filename.lower().rsplit('.', 1)[-1] if '.' in filename else ''

            if ext not in ('xlsx', 'xls', 'pdf'):
                errors.append(f'Файл «{filename}»: поддерживаются только Excel (.xlsx) и PDF')
                continue

            try:
                if ext in ('xlsx', 'xls'):
                    parsed = importer.import_from_excel(file_content, filename)
                else:
                    parsed = importer.import_from_pdf(file_content, filename)
            except Exception:
                logger.exception('Ошибка парсинга файла проекта %s для сметы %s', pf_id, estimate_id)
                errors.append(f'Не удалось распознать файл «{filename}»')
                continue

            # Добавляем source_file к каждой строке для идентификации источника
            for row in parsed.rows:
                row_dict = row.model_dump()
                row_dict['source_file'] = filename
                all_rows.append(row_dict)

            for s in parsed.sections:
                if s not in all_sections:
                    all_sections.append(s)

            if parsed.confidence is not None:
                min_confidence = min(min_confidence, parsed.confidence)

            if parsed.warnings:
                all_warnings.extend(parsed.warnings)

        if not all_rows and errors:
            return Response(
                {'error': '; '.join(errors)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if preview_mode:
            result = {
                'rows': all_rows,
                'sections': all_sections,
                'total_rows': len(all_rows),
                'confidence': min_confidence if all_rows else 0,
            }
            if all_warnings:
                result['warnings'] = all_warnings
            if errors:
                result['errors'] = errors
            return Response(result)

        # Для non-preview: сохраняем строки
        from estimates.services.estimate_import_schemas import EstimateImportRow, ParsedEstimate
        parsed_combined = ParsedEstimate(
            rows=[EstimateImportRow(**{k: v for k, v in row.items() if k != 'source_file'}) for row in all_rows],
            sections=all_sections,
            total_rows=len(all_rows),
            confidence=min_confidence,
        )
        created_items = importer.save_imported_items(int(estimate_id), parsed_combined)
        return Response(
            EstimateItemSerializer(created_items, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['post'], url_path='import-project-file-pdf')
    def import_project_file_pdf(self, request):
        """Async-импорт PDF из файлов проекта через Celery.
        Принимает estimate_id и project_file_ids (массив ID ProjectFile).
        Возвращает session_id для polling прогресса."""
        import fitz
        from estimates.models import ProjectFile, Estimate

        estimate_id = request.data.get('estimate_id')
        project_file_ids = request.data.get('project_file_ids', [])

        if not estimate_id or not project_file_ids:
            return Response(
                {'error': 'Необходимы estimate_id и project_file_ids'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            estimate = Estimate.objects.get(pk=estimate_id)
        except Estimate.DoesNotExist:
            return Response({'error': 'Смета не найдена'}, status=status.HTTP_404_NOT_FOUND)

        linked_project_ids = set(estimate.projects.values_list('pk', flat=True))

        combined_doc = fitz.open()
        errors = []

        for pf_id in project_file_ids:
            try:
                project_file = ProjectFile.objects.select_related('file_type', 'project').get(pk=pf_id)
            except ProjectFile.DoesNotExist:
                errors.append(f'Файл {pf_id} не найден')
                continue

            if project_file.project_id not in linked_project_ids:
                errors.append(f'Файл «{project_file.original_filename}» принадлежит проекту, не связанному с этой сметой')
                continue

            filename = project_file.original_filename or project_file.file.name
            ext = filename.lower().rsplit('.', 1)[-1] if '.' in filename else ''
            if ext != 'pdf':
                errors.append(f'Файл «{filename}»: ожидается PDF, получен .{ext}')
                continue

            try:
                project_file.file.open('rb')
                file_content = project_file.file.read()
                project_file.file.close()
            except Exception:
                logger.exception('Не удалось прочитать файл проекта %s', pf_id)
                errors.append(f'Не удалось прочитать файл «{filename}»')
                continue

            try:
                src_doc = fitz.open(stream=file_content, filetype='pdf')
                combined_doc.insert_pdf(src_doc)
                src_doc.close()
            except Exception:
                logger.exception('Не удалось открыть PDF %s', pf_id)
                errors.append(f'Не удалось открыть PDF «{filename}»')
                continue

        if len(combined_doc) == 0:
            combined_doc.close()
            return Response(
                {'error': '; '.join(errors) if errors else 'Не найдено PDF файлов для обработки'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        combined_bytes = combined_doc.tobytes()
        combined_doc.close()

        from estimates.tasks import create_import_session, process_estimate_pdf_pages
        session = create_import_session(combined_bytes, int(estimate_id), user_id=request.user.id)
        process_estimate_pdf_pages.delay(session['session_id'])

        result = session
        if errors:
            result['warnings'] = errors

        return Response(result, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=['post'], url_path='import-rows')
    def import_rows(self, request):
        """Импорт строк из предпросмотра (JSON) с назначенными разделами."""
        estimate_id = request.data.get('estimate_id')
        rows = request.data.get('rows', [])

        if not estimate_id or not rows:
            return Response(
                {'error': 'Необходимы estimate_id и rows'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # B8: валидация структуры rows
        if not isinstance(rows, list):
            return Response(
                {'error': 'rows должен быть массивом'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for i, row in enumerate(rows):
            if not isinstance(row, dict) or not row.get('name', '').strip():
                return Response(
                    {'error': f'Строка {i + 1}: отсутствует или пустое поле name'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            Estimate.objects.get(pk=estimate_id)
        except Estimate.DoesNotExist:
            return Response(
                {'error': 'Смета не найдена'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from estimates.services.estimate_import_service import EstimateImportService
        importer = EstimateImportService()
        try:
            created_items = importer.save_rows_from_preview(int(estimate_id), rows)
        except Exception:
            # B5: не возвращаем exception message клиенту
            logger.exception('Ошибка импорта строк сметы %s', estimate_id)
            return Response(
                {'error': 'Ошибка при сохранении строк. Проверьте данные и повторите.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {'created_count': len(created_items), 'item_ids': [item.id for item in created_items]},
            status=status.HTTP_201_CREATED,
        )

    # -- Постраничный импорт PDF --

    @action(detail=False, methods=['post'], url_path='import-pdf',
            parser_classes=[MultiPartParser])
    def import_pdf(self, request):
        """Запуск постраничного импорта PDF. Возвращает session_id сразу."""
        estimate_id = request.data.get('estimate_id')
        file = request.FILES.get('file')

        if not estimate_id or not file:
            return Response(
                {'error': 'Необходимы estimate_id и file'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # B2: пустой файл
        if file.size == 0:
            return Response(
                {'error': 'Файл пуст'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # B1: лимит размера
        if file.size > MAX_IMPORT_FILE_SIZE:
            return Response(
                {'error': f'Файл слишком большой (макс. {MAX_IMPORT_FILE_SIZE // (1024 * 1024)} МБ)'},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        try:
            Estimate.objects.get(pk=estimate_id)
        except Estimate.DoesNotExist:
            return Response(
                {'error': 'Смета не найдена'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not file.name.lower().endswith('.pdf'):
            return Response(
                {'error': 'Только PDF файлы'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_content = file.read()

        from estimates.tasks import create_import_session, process_estimate_pdf_pages
        session = create_import_session(file_content, int(estimate_id), user_id=request.user.id)
        process_estimate_pdf_pages.delay(session['session_id'])

        return Response(session, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=['get'],
            url_path=r'import-progress/(?P<session_id>[a-f0-9]{16})')
    def import_progress(self, request, session_id=None):
        """Поллинг прогресса импорта PDF."""
        from estimates.tasks import get_session_data
        data = get_session_data(session_id)
        if not data:
            return Response(
                {'error': 'Сессия не найдена или истекла'},
                status=status.HTTP_404_NOT_FOUND,
            )
        # B7: проверяем что сессия принадлежит текущему пользователю
        session_user_id = data.pop('user_id', None)
        if session_user_id and session_user_id != '0' and int(session_user_id) != request.user.id:
            return Response(
                {'error': 'Сессия не найдена или истекла'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(data)

    @action(detail=False, methods=['post'],
            url_path=r'import-cancel/(?P<session_id>[a-f0-9]{16})')
    def import_cancel(self, request, session_id=None):
        """Отмена импорта PDF."""
        from estimates.tasks import get_session_data, cancel_session
        # B7: проверяем что сессия принадлежит текущему пользователю
        data = get_session_data(session_id)
        if data:
            session_user_id = data.get('user_id')
            if session_user_id and session_user_id != '0' and int(session_user_id) != request.user.id:
                return Response(
                    {'error': 'Сессия не найдена'},
                    status=status.HTTP_404_NOT_FOUND,
                )
        if cancel_session(session_id):
            return Response({'status': 'cancelled'})
        return Response(
            {'error': 'Сессия не найдена'},
            status=status.HTTP_404_NOT_FOUND,
        )
