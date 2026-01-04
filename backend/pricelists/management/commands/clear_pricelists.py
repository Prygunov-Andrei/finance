from django.core.management.base import BaseCommand
from django.db import transaction
from pricelists.models import (
    PriceListItem,
    PriceListAgreement,
    PriceList,
    WorkItem,
    WorkerGradeSkills,
    WorkSection,
    WorkerGrade
)


class Command(BaseCommand):
    help = 'Очищает все данные из приложения pricelists (прайс-листы, работы, разделы, разряды)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--keep-grades',
            action='store_true',
            help='Сохранить разряды рабочих (WorkerGrade и WorkerGradeSkills)',
        )

    def handle(self, *args, **options):
        self.stdout.write('Начинаем очистку базы данных по прайс-листам...')

        keep_grades = options.get('keep_grades', False)

        with transaction.atomic():
            # 1. Удаляем позиции прайс-листов (зависят от PriceList и WorkItem)
            self.stdout.write('Удаляем позиции прайс-листов...')
            count_items = PriceListItem.objects.all().count()
            PriceListItem.objects.all().delete()
            self.stdout.write(f'  Удалено позиций прайс-листов: {count_items}')

            # 2. Удаляем согласования прайс-листов (зависят от PriceList)
            self.stdout.write('Удаляем согласования прайс-листов...')
            count_agreements = PriceListAgreement.objects.all().count()
            PriceListAgreement.objects.all().delete()
            self.stdout.write(f'  Удалено согласований: {count_agreements}')

            # 3. Удаляем прайс-листы (зависят от WorkItem)
            self.stdout.write('Удаляем прайс-листы...')
            count_pricelists = PriceList.objects.all().count()
            PriceList.objects.all().delete()
            self.stdout.write(f'  Удалено прайс-листов: {count_pricelists}')

            # 4. Удаляем работы (зависят от WorkSection и WorkerGrade)
            self.stdout.write('Удаляем работы...')
            count_work_items = WorkItem.objects.all().count()
            WorkItem.objects.all().delete()
            self.stdout.write(f'  Удалено работ: {count_work_items}')

            # 5. Удаляем разделы работ (могут иметь parent, но каскадное удаление сработает)
            self.stdout.write('Удаляем разделы работ...')
            count_sections = WorkSection.objects.all().count()
            WorkSection.objects.all().delete()
            self.stdout.write(f'  Удалено разделов: {count_sections}')

            # 6. Удаляем навыки разрядов (зависят от WorkerGrade)
            if not keep_grades:
                self.stdout.write('Удаляем навыки разрядов...')
                count_skills = WorkerGradeSkills.objects.all().count()
                WorkerGradeSkills.objects.all().delete()
                self.stdout.write(f'  Удалено навыков: {count_skills}')

                # 7. Удаляем разряды рабочих
                self.stdout.write('Удаляем разряды рабочих...')
                count_grades = WorkerGrade.objects.all().count()
                WorkerGrade.objects.all().delete()
                self.stdout.write(f'  Удалено разрядов: {count_grades}')
            else:
                self.stdout.write('  Разряды рабочих сохранены (--keep-grades)')

        total_deleted = (
            count_items + count_agreements + count_pricelists + 
            count_work_items + count_sections
        )
        if not keep_grades:
            total_deleted += count_skills + count_grades

        self.stdout.write(
            self.style.SUCCESS(
                f'\nБаза данных по прайс-листам успешно очищена! '
                f'Всего удалено записей: {total_deleted}'
            )
        )
