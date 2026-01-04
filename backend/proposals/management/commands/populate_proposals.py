from django.core.management.base import BaseCommand
from proposals.models import FrontOfWorkItem, MountingCondition


class Command(BaseCommand):
    help = 'Создать начальные данные для справочников proposals'

    def handle(self, *args, **options):
        # Создание начальных данных для FrontOfWorkItem
        front_items = [
            {'name': 'Подвести электропитание к местам установки вентиляционного оборудования', 'category': 'Электрика'},
            {'name': 'Подвести электропитание к местам установки кондиционеров', 'category': 'Электрика'},
            {'name': 'Обеспечить доступ на кровлю', 'category': 'Доступ'},
            {'name': 'Подготовить строительные проёмы для прокладки воздуховодов', 'category': 'Строительство'},
            {'name': 'Обеспечить подъём оборудования на этаж', 'category': 'Логистика'},
            {'name': 'Предоставить помещение для хранения оборудования', 'category': 'Логистика'},
        ]
        
        created_count = 0
        for item_data in front_items:
            item, created = FrontOfWorkItem.objects.get_or_create(
                name=item_data['name'],
                defaults={
                    'category': item_data['category'],
                    'is_active': True,
                    'sort_order': created_count
                }
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'Создан пункт фронта работ: {item.name}'))
        
        if created_count == 0:
            self.stdout.write(self.style.WARNING('Все пункты фронта работ уже существуют'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Создано пунктов фронта работ: {created_count}'))
        
        # Создание начальных данных для MountingCondition
        conditions = [
            {'name': 'Проживание', 'description': 'Обеспечиваем проживание бригады на время работ'},
            {'name': 'Питание', 'description': 'Организация питания на объекте'},
            {'name': 'Инструмент', 'description': 'Предоставляем необходимый инструмент'},
            {'name': 'Спецодежда', 'description': 'Предоставляем спецодежду и СИЗ'},
            {'name': 'Транспорт', 'description': 'Обеспечиваем транспорт до объекта'},
        ]
        
        created_count = 0
        for condition_data in conditions:
            condition, created = MountingCondition.objects.get_or_create(
                name=condition_data['name'],
                defaults={
                    'description': condition_data['description'],
                    'is_active': True,
                    'sort_order': created_count
                }
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'Создано условие для МП: {condition.name}'))
        
        if created_count == 0:
            self.stdout.write(self.style.WARNING('Все условия для МП уже существуют'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Создано условий для МП: {created_count}'))
        
        self.stdout.write(self.style.SUCCESS('Начальные данные успешно созданы!'))
