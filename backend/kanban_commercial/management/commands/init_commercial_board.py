from django.core.management.base import BaseCommand
from kanban_core.models import Board, Column


BOARD_KEY = 'commercial_pipeline'
BOARD_TITLE = 'Коммерческий пайплайн'

COLUMNS = [
    {'order': 1,  'key': 'new_clients',        'title': 'Новые клиенты'},
    {'order': 2,  'key': 'meeting_scheduled',   'title': 'Назначена встреча'},
    {'order': 3,  'key': 'meeting_done',        'title': 'Проведена встреча'},
    {'order': 4,  'key': 'new_calculation',     'title': 'Новый расчет'},
    {'order': 5,  'key': 'in_progress',         'title': 'В работе'},
    {'order': 6,  'key': 'invoices_requested',  'title': 'Счета запрошены'},
    {'order': 7,  'key': 'estimate_approval',   'title': 'Утверждение сметы'},
    {'order': 8,  'key': 'estimate_approved',   'title': 'Смета утверждена'},
    {'order': 9,  'key': 'kp_prepared',         'title': 'Подготовлено КП'},
    {'order': 10, 'key': 'calculation_done',    'title': 'Расчет подготовлен'},
    {'order': 11, 'key': 'no_result',           'title': 'Нет результата'},
    {'order': 12, 'key': 'has_result',          'title': 'Есть результат'},
]


class Command(BaseCommand):
    help = 'Инициализация борда commercial_pipeline с 12 колонками'

    def handle(self, *args, **options):
        board, created = Board.objects.get_or_create(
            key=BOARD_KEY,
            defaults={'title': BOARD_TITLE},
        )
        action = 'Создан' if created else 'Уже существует'
        self.stdout.write(f'{action} борд: {board.key} ({board.title})')

        for col_data in COLUMNS:
            col, col_created = Column.objects.get_or_create(
                board=board,
                key=col_data['key'],
                defaults={
                    'title': col_data['title'],
                    'order': col_data['order'],
                },
            )
            status = 'создана' if col_created else 'уже существует'
            self.stdout.write(f'  Колонка [{col_data["order"]:>2}] {col_data["key"]}: {status}')

        self.stdout.write(self.style.SUCCESS(
            f'Борд "{BOARD_TITLE}" готов — {len(COLUMNS)} колонок'
        ))
