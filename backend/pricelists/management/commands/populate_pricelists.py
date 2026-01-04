from django.core.management.base import BaseCommand
from pricelists.models import WorkerGrade, WorkSection, WorkItem


class Command(BaseCommand):
    help = 'Заполняет начальные данные для прайс-листов: разряды, разделы работ и примеры работ'

    def handle(self, *args, **options):
        self.stdout.write('Создание разрядов рабочих...')
        self.create_worker_grades()
        
        self.stdout.write('Создание разделов работ...')
        self.create_work_sections()
        
        self.stdout.write('Создание примеров работ...')
        self.create_work_items()
        
        self.stdout.write(self.style.SUCCESS('Начальные данные для прайс-листов успешно созданы!'))

    def create_worker_grades(self):
        grades = [
            {'grade': 1, 'name': 'Монтажник 1 разряда', 'default_hourly_rate': 500},
            {'grade': 2, 'name': 'Монтажник 2 разряда', 'default_hourly_rate': 650},
            {'grade': 3, 'name': 'Монтажник 3 разряда', 'default_hourly_rate': 800},
            {'grade': 4, 'name': 'Монтажник 4 разряда', 'default_hourly_rate': 950},
            {'grade': 5, 'name': 'Монтажник 5 разряда', 'default_hourly_rate': 1100},
        ]
        
        for grade_data in grades:
            grade, created = WorkerGrade.objects.get_or_create(
                grade=grade_data['grade'],
                defaults={
                    'name': grade_data['name'],
                    'default_hourly_rate': grade_data['default_hourly_rate']
                }
            )
            status = 'создан' if created else 'уже существует'
            self.stdout.write(f'  {grade.name}: {status}')

    def create_work_sections(self):
        sections = [
            {'code': 'VENT', 'name': 'Вентиляция', 'sort_order': 1},
            {'code': 'COND', 'name': 'Кондиционирование', 'sort_order': 2},
            {'code': 'HEAT', 'name': 'Отопление', 'sort_order': 3},
            {'code': 'PLUMB', 'name': 'Водоснабжение и канализация', 'sort_order': 4},
            {'code': 'ELEC', 'name': 'Электрика', 'sort_order': 5},
            {'code': 'BUILD', 'name': 'Строительные работы', 'sort_order': 6},
            {'code': 'AUTO', 'name': 'Автоматизация', 'sort_order': 7},
        ]
        
        for section_data in sections:
            section, created = WorkSection.objects.get_or_create(
                code=section_data['code'],
                defaults={
                    'name': section_data['name'],
                    'sort_order': section_data['sort_order']
                }
            )
            status = 'создан' if created else 'уже существует'
            self.stdout.write(f'  {section.code} - {section.name}: {status}')

    def create_work_items(self):
        work_items = [
            # Вентиляция
            {'article': 'V-001', 'section': 'VENT', 'name': 'Монтаж воздуховода круглого d100-200', 'unit': 'м.п.', 'hours': 2.0, 'grade': 2},
            {'article': 'V-002', 'section': 'VENT', 'name': 'Монтаж воздуховода круглого d250-400', 'unit': 'м.п.', 'hours': 2.5, 'grade': 2},
            {'article': 'V-003', 'section': 'VENT', 'name': 'Монтаж воздуховода прямоугольного до 500x500', 'unit': 'м²', 'hours': 3.0, 'grade': 3},
            {'article': 'V-004', 'section': 'VENT', 'name': 'Монтаж воздуховода прямоугольного свыше 500x500', 'unit': 'м²', 'hours': 3.5, 'grade': 3},
            {'article': 'V-005', 'section': 'VENT', 'name': 'Монтаж гибкого воздуховода', 'unit': 'м.п.', 'hours': 0.5, 'grade': 2},
            {'article': 'V-006', 'section': 'VENT', 'name': 'Монтаж вентилятора канального', 'unit': 'шт', 'hours': 4.0, 'grade': 3},
            {'article': 'V-007', 'section': 'VENT', 'name': 'Монтаж приточной установки до 3000 м³/ч', 'unit': 'шт', 'hours': 16.0, 'grade': 4},
            {'article': 'V-008', 'section': 'VENT', 'name': 'Монтаж приточной установки 3000-10000 м³/ч', 'unit': 'шт', 'hours': 24.0, 'grade': 4},
            {'article': 'V-009', 'section': 'VENT', 'name': 'Монтаж решётки вентиляционной', 'unit': 'шт', 'hours': 0.5, 'grade': 2},
            {'article': 'V-010', 'section': 'VENT', 'name': 'Монтаж диффузора', 'unit': 'шт', 'hours': 0.75, 'grade': 2},
            
            # Кондиционирование
            {'article': 'C-001', 'section': 'COND', 'name': 'Монтаж внутреннего блока настенного', 'unit': 'шт', 'hours': 3.0, 'grade': 3},
            {'article': 'C-002', 'section': 'COND', 'name': 'Монтаж внешнего блока до 5 кВт', 'unit': 'шт', 'hours': 4.0, 'grade': 4},
            {'article': 'C-003', 'section': 'COND', 'name': 'Монтаж внешнего блока 5-12 кВт', 'unit': 'шт', 'hours': 6.0, 'grade': 4},
            {'article': 'C-004', 'section': 'COND', 'name': 'Монтаж внутреннего блока кассетного', 'unit': 'шт', 'hours': 6.0, 'grade': 4},
            {'article': 'C-005', 'section': 'COND', 'name': 'Монтаж внутреннего блока канального', 'unit': 'шт', 'hours': 8.0, 'grade': 4},
            {'article': 'C-006', 'section': 'COND', 'name': 'Прокладка медной трассы', 'unit': 'м.п.', 'hours': 1.5, 'grade': 3},
            {'article': 'C-007', 'section': 'COND', 'name': 'Монтаж дренажной трассы', 'unit': 'м.п.', 'hours': 0.5, 'grade': 2},
            {'article': 'C-008', 'section': 'COND', 'name': 'Пуско-наладка сплит-системы', 'unit': 'шт', 'hours': 2.0, 'grade': 4},
            
            # Отопление
            {'article': 'H-001', 'section': 'HEAT', 'name': 'Монтаж радиатора отопления', 'unit': 'шт', 'hours': 3.0, 'grade': 3},
            {'article': 'H-002', 'section': 'HEAT', 'name': 'Монтаж трубопровода стального до 50 мм', 'unit': 'м.п.', 'hours': 2.0, 'grade': 3},
            {'article': 'H-003', 'section': 'HEAT', 'name': 'Монтаж трубопровода PPR', 'unit': 'м.п.', 'hours': 0.75, 'grade': 2},
            {'article': 'H-004', 'section': 'HEAT', 'name': 'Монтаж конвектора встраиваемого', 'unit': 'шт', 'hours': 4.0, 'grade': 3},
            {'article': 'H-005', 'section': 'HEAT', 'name': 'Монтаж теплового пункта', 'unit': 'компл', 'hours': 40.0, 'grade': 5},
            
            # Водоснабжение
            {'article': 'P-001', 'section': 'PLUMB', 'name': 'Монтаж трубопровода ХВС/ГВС PPR', 'unit': 'м.п.', 'hours': 0.75, 'grade': 2},
            {'article': 'P-002', 'section': 'PLUMB', 'name': 'Монтаж канализации d50', 'unit': 'м.п.', 'hours': 0.5, 'grade': 2},
            {'article': 'P-003', 'section': 'PLUMB', 'name': 'Монтаж канализации d110', 'unit': 'м.п.', 'hours': 0.75, 'grade': 2},
            {'article': 'P-004', 'section': 'PLUMB', 'name': 'Установка унитаза', 'unit': 'шт', 'hours': 2.0, 'grade': 3},
            {'article': 'P-005', 'section': 'PLUMB', 'name': 'Установка раковины', 'unit': 'шт', 'hours': 1.5, 'grade': 3},
            {'article': 'P-006', 'section': 'PLUMB', 'name': 'Установка смесителя', 'unit': 'шт', 'hours': 0.75, 'grade': 2},
            
            # Электрика
            {'article': 'E-001', 'section': 'ELEC', 'name': 'Прокладка кабеля в гофре', 'unit': 'м.п.', 'hours': 0.3, 'grade': 2},
            {'article': 'E-002', 'section': 'ELEC', 'name': 'Прокладка кабеля в лотке', 'unit': 'м.п.', 'hours': 0.2, 'grade': 2},
            {'article': 'E-003', 'section': 'ELEC', 'name': 'Монтаж розетки', 'unit': 'шт', 'hours': 0.5, 'grade': 3},
            {'article': 'E-004', 'section': 'ELEC', 'name': 'Монтаж выключателя', 'unit': 'шт', 'hours': 0.5, 'grade': 3},
            {'article': 'E-005', 'section': 'ELEC', 'name': 'Монтаж щита до 24 модулей', 'unit': 'шт', 'hours': 4.0, 'grade': 4},
            {'article': 'E-006', 'section': 'ELEC', 'name': 'Монтаж щита 24-48 модулей', 'unit': 'шт', 'hours': 8.0, 'grade': 4},
            
            # Строительные работы
            {'article': 'B-001', 'section': 'BUILD', 'name': 'Бурение отверстия в бетоне до d100', 'unit': 'шт', 'hours': 1.0, 'grade': 2},
            {'article': 'B-002', 'section': 'BUILD', 'name': 'Бурение отверстия в бетоне d100-200', 'unit': 'шт', 'hours': 2.0, 'grade': 3},
            {'article': 'B-003', 'section': 'BUILD', 'name': 'Монтаж короба ГКЛ', 'unit': 'м.п.', 'hours': 1.5, 'grade': 3},
            {'article': 'B-004', 'section': 'BUILD', 'name': 'Штробление стен', 'unit': 'м.п.', 'hours': 0.5, 'grade': 2},
            
            # Автоматизация
            {'article': 'A-001', 'section': 'AUTO', 'name': 'Монтаж датчика температуры', 'unit': 'шт', 'hours': 0.5, 'grade': 3},
            {'article': 'A-002', 'section': 'AUTO', 'name': 'Монтаж датчика давления', 'unit': 'шт', 'hours': 1.0, 'grade': 3},
            {'article': 'A-003', 'section': 'AUTO', 'name': 'Монтаж контроллера', 'unit': 'шт', 'hours': 4.0, 'grade': 4},
            {'article': 'A-004', 'section': 'AUTO', 'name': 'Прокладка кабеля управления', 'unit': 'м.п.', 'hours': 0.2, 'grade': 2},
            {'article': 'A-005', 'section': 'AUTO', 'name': 'Пуско-наладка системы автоматизации', 'unit': 'компл', 'hours': 16.0, 'grade': 5},
        ]
        
        # Получаем справочники
        sections = {s.code: s for s in WorkSection.objects.all()}
        grades = {g.grade: g for g in WorkerGrade.objects.all()}
        
        for item_data in work_items:
            section = sections.get(item_data['section'])
            grade = grades.get(item_data['grade'])
            
            if not section:
                self.stdout.write(self.style.WARNING(f'  Раздел {item_data["section"]} не найден для {item_data["article"]}'))
                continue
            if not grade:
                self.stdout.write(self.style.WARNING(f'  Разряд {item_data["grade"]} не найден для {item_data["article"]}'))
                continue
            
            work_item, created = WorkItem.objects.get_or_create(
                article=item_data['article'],
                defaults={
                    'section': section,
                    'name': item_data['name'],
                    'unit': item_data['unit'],
                    'hours': item_data['hours'],
                    'grade': grade
                }
            )
            status = 'создан' if created else 'уже существует'
            self.stdout.write(f'  {work_item.article} - {work_item.name}: {status}')
