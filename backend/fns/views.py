import logging

from django.conf import settings
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import Counterparty
from .models import FNSReport
from .serializers import (
    FNSReportCreateSerializer,
    FNSReportListSerializer,
    FNSReportSerializer,
    FNSStatsSerializer,
    FNSSuggestResponseSerializer,
)
from .services import FNSClient, FNSClientError

logger = logging.getLogger('fns')


class FNSSuggestView(APIView):
    """
    GET /api/v1/fns/suggest/?q=<query>

    Автозаполнение данных контрагента по ИНН или названию.
    Сначала ищет в локальной БД, при отсутствии — в API-FNS.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if len(query) < 3:
            return Response(
                {'source': 'local', 'results': [], 'total': 0},
                status=status.HTTP_200_OK,
            )

        is_inn_query = query.isdigit()

        # 1. Поиск в локальной БД
        local_results = []
        if is_inn_query:
            qs = Counterparty.objects.filter(inn__startswith=query)[:10]
        else:
            qs = Counterparty.objects.filter(name__icontains=query)[:10]

        for cp in qs:
            local_results.append({
                'inn': cp.inn,
                'name': cp.name,
                'short_name': cp.short_name or '',
                'kpp': cp.kpp or '',
                'ogrn': cp.ogrn or '',
                'address': cp.contact_info or '',
                'legal_form': cp.legal_form,
                'status': 'Действующее' if cp.is_active else 'Неактивен',
                'registration_date': '',
                'is_local': True,
                'local_id': cp.id,
            })

        # Если нашли в локальной БД — возвращаем без запроса к API-FNS
        if local_results:
            return Response({
                'source': 'local',
                'results': local_results,
                'total': len(local_results),
            })

        # 2. Запрос к API-FNS (если ключ настроен)
        if not settings.FNS_API_KEY:
            return Response({
                'source': 'local',
                'results': [],
                'total': 0,
            })

        try:
            client = FNSClient()
            raw_data = client.search(query)
            fns_results = FNSClient.parse_search_results(raw_data)

            # Помечаем, какие из результатов уже есть в нашей БД
            fns_inns = [r['inn'] for r in fns_results if r.get('inn')]
            existing_inns = set(
                Counterparty.objects.filter(inn__in=fns_inns)
                .values_list('inn', flat=True)
            )
            existing_map = {
                cp.inn: cp.id
                for cp in Counterparty.objects.filter(inn__in=fns_inns)
            }

            results = []
            for r in fns_results:
                inn = r.get('inn', '')
                results.append({
                    **r,
                    'is_local': inn in existing_inns,
                    'local_id': existing_map.get(inn),
                })

            return Response({
                'source': 'fns',
                'results': results,
                'total': len(results),
            })

        except FNSClientError as e:
            logger.warning(f"FNS suggest error: {e}")
            return Response({
                'source': 'local',
                'results': [],
                'total': 0,
                'error': str(e),
            })


class FNSEnrichView(APIView):
    """
    GET /api/v1/fns/enrich/?inn=<inn>

    Обогащение данных контрагента по ИНН через EGR (ЕГРЮЛ/ЕГРИП).
    Возвращает полные реквизиты: КПП, адрес, директор, ОКВЭД и т.д.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        inn = request.query_params.get('inn', '').strip()
        if not inn or not inn.isdigit() or len(inn) not in (10, 12):
            return Response(
                {'error': 'Укажите корректный ИНН (10 или 12 цифр)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not settings.FNS_API_KEY:
            return Response(
                {'error': 'API-FNS не настроен'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            client = FNSClient()
            raw_data = client.get_egr(inn)
            requisites = FNSClient.parse_egr_requisites(raw_data)

            if not requisites.get('inn'):
                return Response(
                    {'error': 'Компания не найдена в ЕГРЮЛ/ЕГРИП'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            return Response(requisites)

        except FNSClientError as e:
            logger.error(f"FNS enrich error ({inn}): {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as e:
            logger.exception(f"FNS enrich unexpected error ({inn}): {e}")
            return Response(
                {'error': f'Ошибка обогащения: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class FNSReportCreateView(APIView):
    """
    POST /api/v1/fns/reports/

    Генерация отчетов по контрагенту.
    Принимает: {counterparty_id, report_types: ["check", "egr", "bo"]}
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = FNSReportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        counterparty_id = serializer.validated_data['counterparty_id']
        report_types = serializer.validated_data['report_types']

        # Получаем контрагента
        try:
            counterparty = Counterparty.objects.get(id=counterparty_id)
        except Counterparty.DoesNotExist:
            return Response(
                {'error': 'Контрагент не найден'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not settings.FNS_API_KEY:
            return Response(
                {'error': 'API-FNS не настроен (отсутствует FNS_API_KEY)'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        client = FNSClient()
        inn = counterparty.inn
        created_reports = []
        errors = []

        for report_type in report_types:
            try:
                # Запрашиваем данные из API-FNS
                if report_type == 'check':
                    raw_data = client.get_check(inn)
                    summary = FNSClient.parse_check_summary(raw_data)
                elif report_type == 'egr':
                    raw_data = client.get_egr(inn)
                    summary = None
                elif report_type == 'bo':
                    raw_data = client.get_bo(inn)
                    summary = None
                else:
                    continue

                # Сохраняем отчет
                report = FNSReport.objects.create(
                    counterparty=counterparty,
                    report_type=report_type,
                    inn=inn,
                    data=raw_data,
                    summary=summary,
                    requested_by=request.user,
                )
                created_reports.append(report)
                logger.info(
                    f"FNS report created: {report_type} for {inn} "
                    f"by {request.user.username}"
                )

            except FNSClientError as e:
                logger.error(f"FNS report error ({report_type}, {inn}): {e}")
                errors.append({
                    'report_type': report_type,
                    'error': str(e),
                })

        # Формируем ответ
        reports_data = FNSReportSerializer(created_reports, many=True).data

        response_data = {
            'reports': reports_data,
            'created_count': len(created_reports),
        }
        if errors:
            response_data['errors'] = errors

        return Response(
            response_data,
            status=status.HTTP_201_CREATED if created_reports else status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class FNSReportListView(generics.ListAPIView):
    """
    GET /api/v1/fns/reports/?counterparty=<id>&report_type=<type>

    Список отчетов ФНС с фильтрацией.
    """

    serializer_class = FNSReportListSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = FNSReport.objects.select_related(
            'counterparty', 'requested_by'
        ).all()

        counterparty_id = self.request.query_params.get('counterparty')
        if counterparty_id:
            qs = qs.filter(counterparty_id=counterparty_id)

        report_type = self.request.query_params.get('report_type')
        if report_type:
            qs = qs.filter(report_type=report_type)

        return qs


class FNSReportDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/fns/reports/<id>/

    Детальный отчет ФНС (включая полный JSON data).
    """

    serializer_class = FNSReportSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = FNSReport.objects.select_related('counterparty', 'requested_by')


class FNSStatsView(APIView):
    """
    GET /api/v1/fns/stats/

    Статистика использования API-ключа ФНС.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not settings.FNS_API_KEY:
            return Response({
                'is_configured': False,
                'status': 'NOT_CONFIGURED',
                'start_date': '',
                'end_date': '',
                'methods': [],
            })

        try:
            client = FNSClient()
            raw_data = client.get_stats()
            parsed = FNSClient.parse_stats(raw_data)
            parsed['is_configured'] = True
            return Response(parsed)

        except FNSClientError as e:
            logger.error(f"FNS stats error: {e}")
            return Response(
                {'error': str(e), 'is_configured': True},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class FNSQuickCheckView(APIView):
    """
    POST /api/v1/fns/quick-check/

    Быстрая проверка по ИНН без привязки к контрагенту.
    Используется при создании контрагента (кнопка "Проверить в ФНС").
    Принимает: {inn: "1234567890"}
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        inn = request.data.get('inn', '').strip()
        if not inn or not inn.isdigit() or len(inn) not in (10, 12):
            return Response(
                {'error': 'Укажите корректный ИНН (10 или 12 цифр)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not settings.FNS_API_KEY:
            return Response(
                {'error': 'API-FNS не настроен'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            client = FNSClient()
            check_data = client.get_check(inn)
            summary = FNSClient.parse_check_summary(check_data)

            return Response({
                'inn': inn,
                'summary': summary,
                'raw_data': check_data,
            })

        except FNSClientError as e:
            logger.error(f"FNS quick-check error ({inn}): {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as e:
            logger.exception(f"FNS quick-check unexpected error ({inn}): {e}")
            return Response(
                {'error': f'Ошибка проверки: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
