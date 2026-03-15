"""
Массовый импорт счетов из локальной папки — полный автоматический цикл.

4-фазный pipeline:
  1. Discovery + фильтрация (исключение актов, КС, чеков, смет, договоров)
  2. Recognize — LLM-парсинг через InvoiceService.recognize()
  3. Auto-verify — создание товаров, цен, категорий + статус PAID
  4. FNS-обогащение — обновление контрагентов данными из ЕГРЮЛ/ЕГРИП

Поддерживаемые форматы: PDF, XLSX, XLS, PNG, JPG, JPEG.
Неподдерживаемые (.doc, .docx, .rtf, .txt) — пропускаются.

Использование:
    python manage.py import_invoices_bulk ./СЧЕТА --dry-run
    python manage.py import_invoices_bulk ./СЧЕТА --limit 5 --verify-inline
    python manage.py import_invoices_bulk ./СЧЕТА --verify-inline
    python manage.py import_invoices_bulk ./СЧЕТА --verify-inline --resume manifest.json
    python manage.py import_invoices_bulk ./СЧЕТА --skip-fns

Manifest JSON:
    Создаётся автоматически (_bulk_import_manifest.json) для отслеживания
    прогресса и возможности продолжить после сбоя через --resume.
"""
import json
import re
import time
import logging
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone as tz

logger = logging.getLogger('bulk_import')

SUPPORTED_EXTENSIONS = {'.pdf', '.xlsx', '.xls', '.png', '.jpg', '.jpeg'}

# Папки, которые полностью исключаются из обработки (lowercase)
EXCLUDED_DIRS = {
    'письма контрагентам',
    'учредительные документы',
    'учредительные документы гк',
    'сметы',
}

# Regex-паттерны для исключения файлов по имени (без расширения)
EXCLUDED_FILENAME_PATTERNS = [
    re.compile(r'(?i)\bакт[аыу]?\b'),           # Акт, Акты, Акта, Акту
    re.compile(r'(?i)\bакт\s+выполненных'),      # Акт выполненных работ
    re.compile(r'(?i)\bкс[-\s]?\d*\b'),          # КС, КС-2, КС-3, КС 2
    re.compile(r'(?i)\bче[кч]'),                 # Чек, чеки
    re.compile(r'(?i)\bсмет[аыу]'),              # Смета, сметы, смету
    re.compile(r'(?i)(?<!счет[-\s])(?<!счёт[-\s])\bдоговор\b'),  # Договор (но не Счет-договор)
    re.compile(r'(?i)\bписьм[оа]\b'),            # Письмо, письма
    re.compile(r'(?i)\bнакладн'),                # Накладная
    re.compile(r'(?i)\bупд\b'),                  # УПД
    re.compile(r'(?i)\bторг[-\s]?\d+'),          # ТОРГ-12
]

# Задержка между файлами при rate limit (секунды)
RATE_LIMIT_INITIAL_DELAY = 60
RATE_LIMIT_MAX_DELAY = 300
RATE_LIMIT_BACKOFF = 2

# Задержка между FNS-запросами (секунды)
FNS_DELAY = 0.5


class Command(BaseCommand):
    help = (
        'Массовый импорт счетов из локальной папки — полный автоматический цикл '
        '(recognize → auto-verify → FNS-обогащение)'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            'directory',
            type=str,
            help='Путь к директории с файлами счетов',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Только показать файлы и статистику, не импортировать',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Максимальное количество файлов для обработки',
        )
        parser.add_argument(
            '--offset',
            type=int,
            default=0,
            help='Пропустить первые N файлов',
        )
        parser.add_argument(
            '--verify-inline',
            action='store_true',
            help='Верифицировать каждый счёт сразу после recognize (создаёт товары)',
        )
        parser.add_argument(
            '--skip-verify',
            action='store_true',
            help='Пропустить фазу auto-verify',
        )
        parser.add_argument(
            '--skip-fns',
            action='store_true',
            help='Пропустить фазу FNS-обогащения контрагентов',
        )
        parser.add_argument(
            '--resume',
            type=str,
            default=None,
            help='Путь к manifest JSON для продолжения прерванного импорта',
        )

    # =========================================================================
    # Фаза 1: Discovery + фильтрация
    # =========================================================================

    def _discover_files(self, directory: Path) -> tuple[list[Path], list[tuple[Path, str]]]:
        """
        Рекурсивно находит файлы и фильтрует не-счета.

        Returns:
            (to_process, skipped) — списки файлов для обработки
            и пропущенных с причиной.
        """
        all_files = []
        for ext in SUPPORTED_EXTENSIONS:
            all_files.extend(directory.rglob(f'*{ext}'))
            # case-insensitive: ищем также с заглавными расширениями
            all_files.extend(directory.rglob(f'*{ext.upper()}'))

        # Убираем дубли (если расширение совпало и в lower, и в upper)
        seen = set()
        unique_files = []
        for f in all_files:
            resolved = f.resolve()
            if resolved not in seen:
                seen.add(resolved)
                unique_files.append(f)

        unique_files.sort(key=lambda f: f.name)

        to_process = []
        skipped = []

        for filepath in unique_files:
            skip_reason = self._should_skip(filepath, directory)
            if skip_reason:
                skipped.append((filepath, skip_reason))
            else:
                to_process.append(filepath)

        return to_process, skipped

    def _should_skip(self, filepath: Path, base_dir: Path) -> str:
        """
        Проверяет, нужно ли пропустить файл.

        Returns:
            Причина пропуска (строка) или '' если файл нужно обработать.
        """
        # 1. Проверка папки
        try:
            relative = filepath.relative_to(base_dir)
        except ValueError:
            relative = filepath

        for part in relative.parts[:-1]:  # все части кроме имени файла
            if part.lower() in EXCLUDED_DIRS:
                return f'папка "{part}"'

        # 2. Проверка имени файла
        stem = filepath.stem  # имя без расширения
        for pattern in EXCLUDED_FILENAME_PATTERNS:
            if pattern.search(stem):
                return f'имя файла ({pattern.pattern})'

        return ''

    def _print_dry_run(self, to_process, skipped):
        """Выводит подробную статистику в режиме dry-run."""
        self.stdout.write('')
        self.stdout.write('=' * 70)
        self.stdout.write(self.style.SUCCESS('РЕЖИМ DRY-RUN — файлы не будут обработаны'))
        self.stdout.write('=' * 70)

        # Статистика по расширениям
        ext_counts = {}
        for f in to_process:
            ext = f.suffix.lower()
            ext_counts[ext] = ext_counts.get(ext, 0) + 1

        self.stdout.write(f'\nФайлов для обработки: {len(to_process)}')
        for ext, count in sorted(ext_counts.items(), key=lambda x: -x[1]):
            self.stdout.write(f'  {ext}: {count}')

        # Статистика пропущенных
        if skipped:
            reason_counts = {}
            for _, reason in skipped:
                reason_counts[reason] = reason_counts.get(reason, 0) + 1

            self.stdout.write(f'\nПропущено: {len(skipped)}')
            for reason, count in sorted(reason_counts.items(), key=lambda x: -x[1]):
                self.stdout.write(f'  {reason}: {count}')

            self.stdout.write('\nПропущенные файлы:')
            for filepath, reason in skipped[:50]:
                self.stdout.write(f'  SKIP [{reason}] {filepath.name}')
            if len(skipped) > 50:
                self.stdout.write(f'  ... и ещё {len(skipped) - 50} файлов')

        # Оценка ресурсов
        self.stdout.write(f'\n--- Оценка ресурсов ---')
        self.stdout.write(f'LLM-вызовов (recognize): ~{len(to_process)}')
        est_products = len(to_process) * 5
        self.stdout.write(f'Ориентировочно товаров: ~{est_products}')
        self.stdout.write(f'LLM-вызовов (категоризация): ~{est_products // 20}')
        self.stdout.write(
            f'Примерное время: {len(to_process) * 15 // 3600} ч '
            f'{(len(to_process) * 15 % 3600) // 60} мин'
        )
        self.stdout.write('=' * 70)

    # =========================================================================
    # Фаза 2: Recognize
    # =========================================================================

    def _is_likely_not_invoice(self, invoice) -> tuple[bool, str]:
        """
        Post-recognize проверка: является ли документ счётом.

        Проверяет результат LLM-распознавания на признаки не-счёта:
        - Очень низкая уверенность (< 0.3)
        - Отсутствие номера И суммы И позиций одновременно

        Returns:
            (skip: bool, reason: str)
        """
        # 1. Очень низкая уверенность
        if (
            invoice.recognition_confidence is not None
            and invoice.recognition_confidence < 0.3
        ):
            return True, f'low confidence: {invoice.recognition_confidence:.2f}'

        # 2. Нет номера И нет суммы И нет позиций
        has_number = bool(invoice.invoice_number)
        has_amount = bool(invoice.amount_gross)
        has_items = invoice.items.exists()

        if not has_number and not has_amount and not has_items:
            return True, 'нет номера, суммы и позиций'

        return False, ''

    def _process_single_file(
        self, filepath: Path, auto_counterparty: bool, verify_inline: bool,
    ) -> dict:
        """
        Обрабатывает один файл: recognize + (опционально) auto_verify.

        Returns:
            dict с результатом: {status, invoice_id, error, counterparty_inn}
        """
        from payments.models import Invoice, InvoiceEvent
        from payments.services import InvoiceService

        result = {
            'status': 'failed',
            'invoice_id': None,
            'error': '',
            'counterparty_inn': '',
        }

        # 1. Создать Invoice
        invoice = Invoice.objects.create(
            source=Invoice.Source.BULK_IMPORT,
            status=Invoice.Status.RECOGNITION,
            invoice_type=Invoice.InvoiceType.SUPPLIER,
            description=f'Массовый импорт: {filepath.name}',
        )
        result['invoice_id'] = invoice.id

        # 2. Сохранить файл
        file_content = filepath.read_bytes()
        invoice.invoice_file.save(
            filepath.name,
            ContentFile(file_content),
            save=True,
        )

        # 3. Recognize
        InvoiceService.recognize(
            invoice.id,
            auto_counterparty=auto_counterparty,
        )

        # Перечитываем из БД
        invoice.refresh_from_db()

        # 4. Post-recognize фильтрация
        is_not_invoice, reason = self._is_likely_not_invoice(invoice)
        if is_not_invoice:
            invoice.status = Invoice.Status.CANCELLED
            invoice.save(update_fields=['status'])
            InvoiceEvent.objects.create(
                invoice=invoice,
                event_type=InvoiceEvent.EventType.CANCELLED,
                comment=f'Не является счётом: {reason}',
            )
            result['status'] = 'skipped_not_invoice'
            result['error'] = reason
            return result

        # Сохраняем ИНН контрагента
        if invoice.counterparty:
            result['counterparty_inn'] = invoice.counterparty.inn or ''

        # 5. Auto-verify (если запрошено)
        if verify_inline and invoice.status == Invoice.Status.REVIEW:
            try:
                InvoiceService.auto_verify(invoice.id)
                invoice.refresh_from_db()
            except Exception as exc:
                logger.warning(
                    'auto_verify failed for invoice #%d: %s', invoice.id, exc,
                )

        result['status'] = invoice.status
        return result

    # =========================================================================
    # Фаза 4: FNS-обогащение
    # =========================================================================

    def _enrich_counterparties(self, manifest: dict):
        """
        Обогащает новых контрагентов данными из ФНС (ЕГРЮЛ/ЕГРИП).

        Находит контрагентов без ОГРН (признак «не обогащён»),
        запрашивает get_egr() по ИНН и обновляет: name, short_name,
        kpp, ogrn, address, legal_form.
        """
        from accounting.models import Counterparty

        try:
            from fns.services import FNSClient, FNSClientError
        except ImportError:
            self.stdout.write(self.style.WARNING(
                'Модуль fns не найден — пропускаем FNS-обогащение'
            ))
            return

        # Собираем уникальные ИНН из манифеста
        inns = set()
        for entry in manifest.get('files', {}).values():
            inn = entry.get('counterparty_inn', '')
            if inn:
                inns.add(inn)

        if not inns:
            self.stdout.write('Нет контрагентов для обогащения')
            return

        # Фильтруем: только те, кто ещё не обогащён (ogrn пустой)
        to_enrich = Counterparty.objects.filter(
            inn__in=inns,
        ).filter(
            ogrn='',
        )

        total = to_enrich.count()
        if total == 0:
            self.stdout.write('Все контрагенты уже обогащены')
            return

        self.stdout.write(f'\nFNS-обогащение: {total} контрагентов')

        try:
            client = FNSClient()
        except FNSClientError as exc:
            self.stdout.write(self.style.ERROR(f'FNS клиент не инициализирован: {exc}'))
            return

        enriched = 0
        errors = 0

        for cp in to_enrich:
            self.stdout.write(f'  FNS: {cp.inn} ({cp.name})... ', ending='')
            try:
                raw = client.get_egr(cp.inn)
                data = FNSClient.parse_egr_requisites(raw)

                if not data:
                    self.stdout.write(self.style.WARNING('нет данных'))
                    continue

                if data.get('name'):
                    cp.name = data['name']
                if data.get('short_name'):
                    cp.short_name = data['short_name']
                if data.get('kpp'):
                    cp.kpp = data['kpp']
                if data.get('ogrn'):
                    cp.ogrn = data['ogrn']
                if data.get('address'):
                    cp.address = data['address']
                if data.get('legal_form'):
                    cp.legal_form = data['legal_form']
                if data.get('contact_info'):
                    cp.contact_info = data['contact_info']

                cp.save()
                enriched += 1
                self.stdout.write(self.style.SUCCESS('OK'))

            except FNSClientError as exc:
                errors += 1
                self.stdout.write(self.style.ERROR(f'ошибка: {exc}'))

            except Exception as exc:
                errors += 1
                self.stdout.write(self.style.ERROR(f'ошибка: {exc}'))
                logger.exception('FNS enrichment failed for INN %s', cp.inn)

            time.sleep(FNS_DELAY)

        self.stdout.write(f'\nFNS-обогащение завершено: {enriched} успешно, {errors} ошибок')

    # =========================================================================
    # Manifest (resumability)
    # =========================================================================

    def _load_manifest(self, path: str) -> dict:
        """Загружает manifest JSON для продолжения импорта."""
        manifest_path = Path(path)
        if not manifest_path.exists():
            raise CommandError(f'Manifest не найден: {path}')
        with open(manifest_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def _save_manifest(self, manifest: dict, path: Path):
        """Сохраняет manifest JSON с текущим прогрессом."""
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)

    # =========================================================================
    # Основной handle
    # =========================================================================

    def handle(self, *args, **options):
        from llm_services.services.exceptions import RateLimitError

        directory = Path(options['directory'])
        if not directory.exists():
            raise CommandError(f'Директория не найдена: {directory}')
        if not directory.is_dir():
            raise CommandError(f'Не является директорией: {directory}')

        # ── Фаза 1: Discovery ──
        self.stdout.write(f'\n{"=" * 70}')
        self.stdout.write('ФАЗА 1: Поиск и фильтрация файлов')
        self.stdout.write(f'{"=" * 70}')

        to_process, skipped = self._discover_files(directory)

        self.stdout.write(
            f'Найдено: {len(to_process) + len(skipped)} файлов, '
            f'для обработки: {len(to_process)}, пропущено: {len(skipped)}'
        )

        if options['dry_run']:
            self._print_dry_run(to_process, skipped)
            return

        # Offset / Limit
        offset = options['offset']
        if offset:
            to_process = to_process[offset:]
            self.stdout.write(f'Offset: пропущено первых {offset} файлов')

        limit = options['limit']
        if limit:
            to_process = to_process[:limit]
            self.stdout.write(f'Limit: будет обработано {len(to_process)} файлов')

        if not to_process:
            self.stdout.write(self.style.WARNING('Нет файлов для обработки'))
            return

        # ── Manifest ──
        manifest_path = Path('_bulk_import_manifest.json')

        if options['resume']:
            manifest = self._load_manifest(options['resume'])
            manifest_path = Path(options['resume'])
            self.stdout.write(
                f'Продолжение с манифеста: '
                f'{sum(1 for v in manifest["files"].values() if v["status"] not in ("pending",))} '
                f'уже обработано'
            )
        else:
            manifest = {
                'directory': str(directory.resolve()),
                'started_at': tz.now().isoformat(),
                'files': {},
            }

        # ── Фаза 2+3: Recognize + Auto-verify ──
        verify_inline = options['verify_inline'] and not options['skip_verify']

        self.stdout.write(f'\n{"=" * 70}')
        phase_name = 'ФАЗА 2+3: Recognize + Auto-verify' if verify_inline else 'ФАЗА 2: Recognize'
        self.stdout.write(phase_name)
        self.stdout.write(f'{"=" * 70}')

        total = len(to_process)
        successful = 0
        failed = 0
        skipped_not_invoice = 0
        rate_limit_delay = RATE_LIMIT_INITIAL_DELAY

        for i, filepath in enumerate(to_process, 1):
            file_key = str(filepath.resolve())

            # Пропуск уже обработанных (resume)
            if file_key in manifest.get('files', {}):
                prev = manifest['files'][file_key]
                if prev.get('status') not in ('pending', 'failed'):
                    continue

            self.stdout.write(f'[{i}/{total}] {filepath.name}... ', ending='')

            try:
                result = self._process_single_file(
                    filepath,
                    auto_counterparty=True,
                    verify_inline=verify_inline,
                )

                manifest['files'][file_key] = result

                if result['status'] == 'skipped_not_invoice':
                    skipped_not_invoice += 1
                    self.stdout.write(
                        self.style.WARNING(f'НЕ СЧЁТ ({result["error"]})')
                    )
                elif result['status'] in ('paid', 'verified', 'review'):
                    successful += 1
                    self.stdout.write(self.style.SUCCESS(
                        f'OK [{result["status"].upper()}]'
                    ))
                    rate_limit_delay = RATE_LIMIT_INITIAL_DELAY  # reset
                else:
                    failed += 1
                    self.stdout.write(self.style.ERROR(
                        f'СТАТУС: {result["status"]}'
                    ))

            except RateLimitError as exc:
                self.stdout.write(self.style.ERROR(f'RATE LIMIT'))
                manifest['files'][file_key] = {
                    'status': 'failed',
                    'error': f'rate limit: {exc}',
                }
                self._save_manifest(manifest, manifest_path)

                # Exponential backoff
                self.stdout.write(
                    f'  Ожидание {rate_limit_delay}с перед повтором...'
                )
                time.sleep(rate_limit_delay)
                rate_limit_delay = min(
                    rate_limit_delay * RATE_LIMIT_BACKOFF,
                    RATE_LIMIT_MAX_DELAY,
                )

                # Повторная попытка
                try:
                    self.stdout.write(f'[{i}/{total}] ПОВТОР {filepath.name}... ', ending='')
                    result = self._process_single_file(
                        filepath,
                        auto_counterparty=True,
                        verify_inline=verify_inline,
                    )
                    manifest['files'][file_key] = result
                    if result['status'] in ('paid', 'verified', 'review'):
                        successful += 1
                        self.stdout.write(self.style.SUCCESS(f'OK [{result["status"].upper()}]'))
                    else:
                        failed += 1
                        self.stdout.write(self.style.ERROR(f'СТАТУС: {result["status"]}'))

                except RateLimitError:
                    failed += 1
                    self.stdout.write(self.style.ERROR('RATE LIMIT — пропуск'))
                    manifest['files'][file_key] = {
                        'status': 'failed',
                        'error': 'rate limit (retry failed)',
                    }

                except Exception as exc2:
                    failed += 1
                    manifest['files'][file_key] = {
                        'status': 'failed',
                        'error': str(exc2),
                    }
                    self.stdout.write(self.style.ERROR(f'ОШИБКА: {exc2}'))

            except Exception as exc:
                failed += 1
                manifest['files'][file_key] = {
                    'status': 'failed',
                    'error': str(exc),
                }
                self.stdout.write(self.style.ERROR(f'ОШИБКА: {exc}'))

            # Сохраняем manifest после каждого файла
            self._save_manifest(manifest, manifest_path)

            # Прогресс каждые 10 файлов
            if i % 10 == 0:
                self.stdout.write(
                    f'\n  --- Прогресс: {i}/{total} '
                    f'(OK: {successful}, не-счёт: {skipped_not_invoice}, '
                    f'ошибок: {failed}) ---\n'
                )

        # ── Итоги фазы 2+3 ──
        self.stdout.write(f'\n{"=" * 70}')
        self.stdout.write('ИТОГИ ИМПОРТА')
        self.stdout.write(f'{"=" * 70}')
        self.stdout.write(f'  Обработано:        {successful + failed + skipped_not_invoice}')
        self.stdout.write(self.style.SUCCESS(f'  Успешно:           {successful}'))
        self.stdout.write(f'  Не счета:          {skipped_not_invoice}')
        if failed:
            self.stdout.write(self.style.ERROR(f'  С ошибками:        {failed}'))
        self.stdout.write(f'  Manifest:          {manifest_path}')

        # ── Фаза 3 (batch): Auto-verify для оставшихся ──
        if not options['skip_verify'] and not verify_inline:
            self._batch_auto_verify(manifest)

        # ── Фаза 4: FNS-обогащение ──
        if not options['skip_fns']:
            self.stdout.write(f'\n{"=" * 70}')
            self.stdout.write('ФАЗА 4: FNS-обогащение контрагентов')
            self.stdout.write(f'{"=" * 70}')
            self._enrich_counterparties(manifest)

        # Финальное сохранение
        manifest['completed_at'] = tz.now().isoformat()
        self._save_manifest(manifest, manifest_path)

        self.stdout.write(f'\n{"=" * 70}')
        self.stdout.write(self.style.SUCCESS('ИМПОРТ ЗАВЕРШЁН'))
        self.stdout.write(f'{"=" * 70}')

    def _batch_auto_verify(self, manifest: dict):
        """Batch auto-verify для всех счетов в статусе REVIEW."""
        from payments.models import Invoice
        from payments.services import InvoiceService

        self.stdout.write(f'\n{"=" * 70}')
        self.stdout.write('ФАЗА 3: Batch Auto-verify')
        self.stdout.write(f'{"=" * 70}')

        # Собираем invoice_id из манифеста
        invoice_ids = []
        for entry in manifest.get('files', {}).values():
            inv_id = entry.get('invoice_id')
            if inv_id and entry.get('status') == 'review':
                invoice_ids.append(inv_id)

        if not invoice_ids:
            # Попробуем найти все REVIEW из bulk_import
            invoices = Invoice.objects.filter(
                source=Invoice.Source.BULK_IMPORT,
                status=Invoice.Status.REVIEW,
            )
            invoice_ids = list(invoices.values_list('id', flat=True))

        if not invoice_ids:
            self.stdout.write('Нет счетов для верификации')
            return

        self.stdout.write(f'Счетов для верификации: {len(invoice_ids)}')
        verified = 0
        errors = 0

        for i, inv_id in enumerate(invoice_ids, 1):
            self.stdout.write(f'  [{i}/{len(invoice_ids)}] Invoice #{inv_id}... ', ending='')
            try:
                InvoiceService.auto_verify(inv_id)
                verified += 1
                self.stdout.write(self.style.SUCCESS('OK'))
            except Exception as exc:
                errors += 1
                self.stdout.write(self.style.ERROR(f'ОШИБКА: {exc}'))

        self.stdout.write(
            f'Верификация: {verified} успешно, {errors} ошибок'
        )
