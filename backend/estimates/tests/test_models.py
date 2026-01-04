from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from decimal import Decimal
from datetime import date
import uuid

from estimates.models import (
    Project, ProjectNote, Estimate, EstimateSection,
    EstimateSubsection, EstimateCharacteristic, MountingEstimate
)
from objects.models import Object
from accounting.models import LegalEntity, TaxSystem, Counterparty
from pricelists.models import PriceList


class ProjectTests(TestCase):
    """Тесты для модели Project"""
    
    def setUp(self):
        # Используем уникальное имя для избежания конфликтов при параллельном запуске
        unique_id = str(uuid.uuid4())[:8]
        self.object = Object.objects.create(
            name=f'Тестовый объект {unique_id}',
            address='Тестовый адрес'
        )
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        # Создаём тестовый файл для проектов
        self.test_file = SimpleUploadedFile('project.zip', b'fake zip content')
    
    def test_create_project(self):
        """Тест создания проекта"""
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        self.assertEqual(project.cipher, 'ПР-2025-001')
        self.assertEqual(project.version_number, 1)
        self.assertTrue(project.is_current)
    
    def test_project_versioning(self):
        """Тест версионирования проекта"""
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        new_version = project.create_new_version()
        
        self.assertFalse(project.is_current)
        self.assertTrue(new_version.is_current)
        self.assertEqual(new_version.version_number, 2)
        self.assertEqual(new_version.parent_version, project)
        self.assertEqual(new_version.cipher, project.cipher)
    
    def test_project_approval_validation(self):
        """Тест валидации разрешения на производство"""
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        # Должна быть ошибка, если is_approved_for_production=True, но нет файла
        project.is_approved_for_production = True
        with self.assertRaises(ValidationError):
            project.full_clean()
    
    def test_get_current_projects(self):
        """Тест получения только актуальных версий"""
        project1 = Project.objects.create(
            cipher='ПР-2025-001',
            name='Проект 1',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        project2 = Project.objects.create(
            cipher='ПР-2025-002',
            name='Проект 2',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        # Создаём новую версию первого проекта
        project1.create_new_version()
        
        current_projects = Project.get_current_projects()
        self.assertEqual(current_projects.count(), 2)
        self.assertNotIn(project1, current_projects)
    
    def test_project_unique_together(self):
        """Тест уникальности по cipher и date"""
        Project.objects.create(
            cipher='ПР-2025-001',
            name='Проект 1',
            date=date(2025, 1, 15),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        # Можно создать с тем же cipher, но другой датой
        project2 = Project.objects.create(
            cipher='ПР-2025-001',
            name='Проект 2',
            date=date(2025, 2, 15),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        self.assertIsNotNone(project2)
    
    def test_project_stage_choices(self):
        """Тест выбора стадии проекта"""
        project_p = Project.objects.create(
            cipher='ПР-2025-001',
            name='Проект П',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        project_rd = Project.objects.create(
            cipher='ПР-2025-002',
            name='Проект РД',
            date=date.today(),
            stage=Project.Stage.RD,
            object=self.object,
            file=self.test_file
        )
        self.assertEqual(project_p.stage, Project.Stage.P)
        self.assertEqual(project_rd.stage, Project.Stage.RD)
    
    def test_project_with_approval_file(self):
        """Тест проекта с файлом разрешения"""
        from django.core.files.uploadedfile import SimpleUploadedFile
        file_content = b'fake file content'
        approval_file = SimpleUploadedFile('approval.pdf', file_content)
        
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file,
            is_approved_for_production=True,
            production_approval_file=approval_file,
            production_approval_date=date.today()
        )
        self.assertTrue(project.is_approved_for_production)
        self.assertIsNotNone(project.production_approval_file)
    
    def test_project_multiple_versions(self):
        """Тест создания нескольких версий проекта"""
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        version2 = project.create_new_version()
        version3 = version2.create_new_version()
        
        self.assertEqual(version2.version_number, 2)
        self.assertEqual(version3.version_number, 3)
        self.assertEqual(version3.parent_version, version2)
        self.assertEqual(version2.parent_version, project)


class ProjectNoteTests(TestCase):
    """Тесты для модели ProjectNote"""
    
    def setUp(self):
        # Используем уникальное имя для избежания конфликтов при параллельном запуске
        unique_id = str(uuid.uuid4())[:8]
        self.object = Object.objects.create(
            name=f'Тестовый объект {unique_id}',
            address='Тестовый адрес'
        )
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.test_file = SimpleUploadedFile('project.zip', b'fake zip content')
        self.project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
    
    def test_create_project_note(self):
        """Тест создания замечания к проекту"""
        note = ProjectNote.objects.create(
            project=self.project,
            author=self.user,
            text='Тестовое замечание'
        )
        self.assertEqual(note.project, self.project)
        self.assertEqual(note.author, self.user)
        self.assertEqual(note.text, 'Тестовое замечание')
    
    def test_project_note_ordering(self):
        """Тест сортировки замечаний"""
        note1 = ProjectNote.objects.create(
            project=self.project,
            author=self.user,
            text='Замечание 1'
        )
        note2 = ProjectNote.objects.create(
            project=self.project,
            author=self.user,
            text='Замечание 2'
        )
        
        notes = list(ProjectNote.objects.all())
        # Должны быть отсортированы по -created_at (новые первыми)
        self.assertEqual(notes[0], note2)
        self.assertEqual(notes[1], note1)


class EstimateTests(TestCase):
    """Тесты для модели Estimate"""
    
    def setUp(self):
        # Используем уникальное имя для избежания конфликтов при параллельном запуске
        unique_id = str(uuid.uuid4())[:8]
        self.object = Object.objects.create(
            name=f'Тестовый объект {unique_id}',
            address='Тестовый адрес'
        )
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.tax_system, _ = TaxSystem.objects.get_or_create(
            code='osn_vat_20',
            defaults={
                'name': 'ОСН с НДС 20%',
                'vat_rate': Decimal('20.00'),
                'has_vat': True
            }
        )
        self.legal_entity, _ = LegalEntity.objects.get_or_create(
            inn='1234567890',
            defaults={
                'name': 'ООО Тест',
                'short_name': 'Тест',
                'tax_system': self.tax_system
            }
        )
    
    def test_create_estimate_with_auto_number(self):
        """Тест создания сметы с автогенерацией номера"""
        estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        self.assertIsNotNone(estimate.number)
        self.assertTrue(estimate.number.startswith('СМ-'))
        self.assertEqual(estimate.status, Estimate.Status.DRAFT)
    
    def test_estimate_calculated_properties(self):
        """Тест вычисляемых свойств сметы"""
        estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            with_vat=True,
            vat_rate=Decimal('20.00')
        )
        
        # Создаём раздел и подраздел
        section = EstimateSection.objects.create(
            estimate=estimate,
            name='Вентиляция'
        )
        EstimateSubsection.objects.create(
            section=section,
            name='Приточная система',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('50000.00'),
            materials_purchase=Decimal('80000.00'),
            works_purchase=Decimal('30000.00')
        )
        
        # Проверяем вычисляемые свойства
        self.assertEqual(estimate.total_materials_sale, Decimal('100000.00'))
        self.assertEqual(estimate.total_works_sale, Decimal('50000.00'))
        self.assertEqual(estimate.total_sale, Decimal('150000.00'))
        self.assertEqual(estimate.vat_amount, Decimal('30000.00'))
        self.assertEqual(estimate.total_with_vat, Decimal('180000.00'))
        self.assertEqual(estimate.profit_amount, Decimal('40000.00'))
    
    def test_estimate_initial_characteristics(self):
        """Тест создания начальных характеристик"""
        estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        
        estimate.create_initial_characteristics()
        
        characteristics = estimate.characteristics.all()
        self.assertEqual(characteristics.count(), 2)
        
        names = [c.name for c in characteristics]
        self.assertIn('Материалы', names)
        self.assertIn('Работы', names)
        
        for char in characteristics:
            self.assertTrue(char.is_auto_calculated)
            self.assertEqual(char.source_type, EstimateCharacteristic.SourceType.SECTIONS)
    
    def test_estimate_versioning(self):
        """Тест версионирования сметы"""
        estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        
        # Создаём раздел и подраздел
        section = EstimateSection.objects.create(
            estimate=estimate,
            name='Вентиляция'
        )
        EstimateSubsection.objects.create(
            section=section,
            name='Приточная система',
            materials_sale=Decimal('100000.00')
        )
        
        # Создаём характеристику
        EstimateCharacteristic.objects.create(
            estimate=estimate,
            name='Доставка',
            sale_amount=Decimal('5000.00'),
            source_type=EstimateCharacteristic.SourceType.MANUAL
        )
        
        new_version = estimate.create_new_version()
        
        self.assertEqual(new_version.version_number, 2)
        self.assertEqual(new_version.parent_version, estimate)
        self.assertEqual(new_version.status, Estimate.Status.DRAFT)
        
        # Проверяем, что разделы и подразделы скопированы
        self.assertEqual(new_version.sections.count(), 1)
        self.assertEqual(new_version.sections.first().subsections.count(), 1)
        
        # Проверяем, что характеристики скопированы
        self.assertEqual(new_version.characteristics.count(), 1)
    
    def test_estimate_without_vat(self):
        """Тест сметы без НДС"""
        estimate = Estimate.objects.create(
            name='Смета без НДС',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            with_vat=False
        )
        
        section = EstimateSection.objects.create(
            estimate=estimate,
            name='Вентиляция'
        )
        EstimateSubsection.objects.create(
            section=section,
            name='Приточная система',
            materials_sale=Decimal('100000.00')
        )
        
        self.assertEqual(estimate.vat_amount, Decimal('0'))
        self.assertEqual(estimate.total_with_vat, estimate.total_sale)
    
    def test_estimate_profit_calculation(self):
        """Тест расчёта прибыли"""
        estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        
        section = EstimateSection.objects.create(
            estimate=estimate,
            name='Вентиляция'
        )
        EstimateSubsection.objects.create(
            section=section,
            name='Приточная система',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('50000.00'),
            materials_purchase=Decimal('60000.00'),
            works_purchase=Decimal('30000.00')
        )
        
        # Прибыль = 150000 - 90000 = 60000
        self.assertEqual(estimate.profit_amount, Decimal('60000.00'))
        # Прибыль в % = (60000 / 150000) * 100 = 40%
        self.assertEqual(estimate.profit_percent, Decimal('40.00'))
    
    def test_estimate_profit_percent_zero_sale(self):
        """Тест расчёта прибыли при нулевой продаже"""
        estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        
        # Нет подразделов, total_sale = 0
        self.assertEqual(estimate.profit_percent, Decimal('0'))
    
    def test_estimate_number_generation_sequence(self):
        """Тест последовательной генерации номеров смет"""
        estimate1 = Estimate.objects.create(
            name='Смета 1',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        estimate2 = Estimate.objects.create(
            name='Смета 2',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        
        # Номера должны быть последовательными
        num1 = int(estimate1.number.split('-')[-1])
        num2 = int(estimate2.number.split('-')[-1])
        self.assertEqual(num2, num1 + 1)
    
    def test_estimate_update_auto_characteristics(self):
        """Тест обновления автоматических характеристик"""
        estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        estimate.create_initial_characteristics()
        
        section = EstimateSection.objects.create(
            estimate=estimate,
            name='Вентиляция'
        )
        EstimateSubsection.objects.create(
            section=section,
            name='Приточная система',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('50000.00'),
            materials_purchase=Decimal('80000.00'),
            works_purchase=Decimal('30000.00')
        )
        
        # Характеристики должны обновиться
        materials_char = estimate.characteristics.get(name='Материалы')
        works_char = estimate.characteristics.get(name='Работы')
        
        self.assertEqual(materials_char.sale_amount, Decimal('100000.00'))
        self.assertEqual(works_char.sale_amount, Decimal('50000.00'))
    
    def test_estimate_with_projects(self):
        """Тест сметы с проектами-основаниями"""
        test_file = SimpleUploadedFile('project.zip', b'fake zip content')
        project1 = Project.objects.create(
            cipher='ПР-2025-001',
            name='Проект 1',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=test_file
        )
        project2 = Project.objects.create(
            cipher='ПР-2025-002',
            name='Проект 2',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=test_file
        )
        
        estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        estimate.projects.set([project1, project2])
        
        self.assertEqual(estimate.projects.count(), 2)


class EstimateSectionTests(TestCase):
    """Тесты для модели EstimateSection"""
    
    def setUp(self):
        # Используем уникальное имя для избежания конфликтов при параллельном запуске
        unique_id = str(uuid.uuid4())[:8]
        self.object = Object.objects.create(
            name=f'Тестовый объект {unique_id}',
            address='Тестовый адрес'
        )
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.tax_system, _ = TaxSystem.objects.get_or_create(
            code='osn_vat_20',
            defaults={
                'name': 'ОСН с НДС 20%',
                'vat_rate': Decimal('20.00'),
                'has_vat': True
            }
        )
        self.legal_entity, _ = LegalEntity.objects.get_or_create(
            inn='1234567890',
            defaults={
                'name': 'ООО Тест',
                'short_name': 'Тест',
                'tax_system': self.tax_system
            }
        )
        self.estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
    
    def test_section_calculated_properties(self):
        """Тест вычисляемых свойств раздела"""
        section = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Вентиляция'
        )
        
        EstimateSubsection.objects.create(
            section=section,
            name='Приточная система',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('50000.00'),
            materials_purchase=Decimal('80000.00'),
            works_purchase=Decimal('30000.00')
        )
        
        self.assertEqual(section.total_materials_sale, Decimal('100000.00'))
        self.assertEqual(section.total_works_sale, Decimal('50000.00'))
        self.assertEqual(section.total_sale, Decimal('150000.00'))
    
    def test_section_multiple_subsections(self):
        """Тест раздела с несколькими подразделами"""
        section = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Вентиляция'
        )
        
        EstimateSubsection.objects.create(
            section=section,
            name='Приточная система',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('50000.00')
        )
        EstimateSubsection.objects.create(
            section=section,
            name='Вытяжная система',
            materials_sale=Decimal('80000.00'),
            works_sale=Decimal('40000.00')
        )
        
        self.assertEqual(section.total_materials_sale, Decimal('180000.00'))
        self.assertEqual(section.total_works_sale, Decimal('90000.00'))
        self.assertEqual(section.total_sale, Decimal('270000.00'))
    
    def test_section_ordering(self):
        """Тест сортировки разделов"""
        section1 = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Раздел 1',
            sort_order=2
        )
        section2 = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Раздел 2',
            sort_order=1
        )
        
        sections = list(EstimateSection.objects.all())
        # Должны быть отсортированы по sort_order
        self.assertEqual(sections[0], section2)
        self.assertEqual(sections[1], section1)


class EstimateSubsectionTests(TestCase):
    """Тесты для модели EstimateSubsection"""
    
    def setUp(self):
        # Используем уникальное имя для избежания конфликтов при параллельном запуске
        unique_id = str(uuid.uuid4())[:8]
        self.object = Object.objects.create(
            name=f'Тестовый объект {unique_id}',
            address='Тестовый адрес'
        )
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.tax_system, _ = TaxSystem.objects.get_or_create(
            code='osn_vat_20',
            defaults={
                'name': 'ОСН с НДС 20%',
                'vat_rate': Decimal('20.00'),
                'has_vat': True
            }
        )
        self.legal_entity, _ = LegalEntity.objects.get_or_create(
            inn='1234567890',
            defaults={
                'name': 'ООО Тест',
                'short_name': 'Тест',
                'tax_system': self.tax_system
            }
        )
        self.estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        self.section = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Вентиляция'
        )
    
    def test_subsection_calculated_properties(self):
        """Тест вычисляемых свойств подраздела"""
        subsection = EstimateSubsection.objects.create(
            section=self.section,
            name='Приточная система',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('50000.00'),
            materials_purchase=Decimal('80000.00'),
            works_purchase=Decimal('30000.00')
        )
        
        self.assertEqual(subsection.total_sale, Decimal('150000.00'))
        self.assertEqual(subsection.total_purchase, Decimal('110000.00'))
    
    def test_auto_characteristics_update(self):
        """Тест автоматического обновления характеристик при изменении подраздела"""
        self.estimate.create_initial_characteristics()
        
        subsection = EstimateSubsection.objects.create(
            section=self.section,
            name='Приточная система',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('50000.00'),
            materials_purchase=Decimal('80000.00'),
            works_purchase=Decimal('30000.00')
        )
        
        # Характеристики должны обновиться автоматически через сигнал
        materials_char = self.estimate.characteristics.get(name='Материалы')
        works_char = self.estimate.characteristics.get(name='Работы')
        
        self.assertEqual(materials_char.sale_amount, Decimal('100000.00'))
        self.assertEqual(materials_char.purchase_amount, Decimal('80000.00'))
        self.assertEqual(works_char.sale_amount, Decimal('50000.00'))
        self.assertEqual(works_char.purchase_amount, Decimal('30000.00'))
    
    def test_subsection_delete_updates_characteristics(self):
        """Тест обновления характеристик при удалении подраздела"""
        self.estimate.create_initial_characteristics()
        
        subsection = EstimateSubsection.objects.create(
            section=self.section,
            name='Приточная система',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('50000.00')
        )
        
        # Удаляем подраздел
        subsection.delete()
        
        # Характеристики должны обновиться (стать нулевыми)
        materials_char = self.estimate.characteristics.get(name='Материалы')
        works_char = self.estimate.characteristics.get(name='Работы')
        
        self.assertEqual(materials_char.sale_amount, Decimal('0'))
        self.assertEqual(works_char.sale_amount, Decimal('0'))
    
    def test_subsection_update_updates_characteristics(self):
        """Тест обновления характеристик при изменении подраздела"""
        self.estimate.create_initial_characteristics()
        
        subsection = EstimateSubsection.objects.create(
            section=self.section,
            name='Приточная система',
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('50000.00')
        )
        
        # Обновляем суммы
        subsection.materials_sale = Decimal('120000.00')
        subsection.save()
        
        # Характеристики должны обновиться
        materials_char = self.estimate.characteristics.get(name='Материалы')
        self.assertEqual(materials_char.sale_amount, Decimal('120000.00'))


class MountingEstimateTests(TestCase):
    """Тесты для модели MountingEstimate"""
    
    def setUp(self):
        # Используем уникальное имя для избежания конфликтов при параллельном запуске
        unique_id = str(uuid.uuid4())[:8]
        self.object = Object.objects.create(
            name=f'Тестовый объект {unique_id}',
            address='Тестовый адрес'
        )
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.tax_system, _ = TaxSystem.objects.get_or_create(
            code='osn_vat_20',
            defaults={
                'name': 'ОСН с НДС 20%',
                'vat_rate': Decimal('20.00'),
                'has_vat': True
            }
        )
        self.legal_entity, _ = LegalEntity.objects.get_or_create(
            inn='1234567890',
            defaults={
                'name': 'ООО Тест',
                'short_name': 'Тест',
                'tax_system': self.tax_system
            }
        )
        self.estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            man_hours=Decimal('100.00')
        )
        
        # Создаём раздел с работами
        section = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Вентиляция'
        )
        EstimateSubsection.objects.create(
            section=section,
            name='Приточная система',
            works_purchase=Decimal('50000.00')
        )
    
    def test_create_mounting_estimate_from_estimate(self):
        """Тест создания монтажной сметы из обычной сметы"""
        mounting_estimate = MountingEstimate.create_from_estimate(
            self.estimate,
            self.user
        )
        
        self.assertIsNotNone(mounting_estimate.number)
        self.assertTrue(mounting_estimate.number.startswith('МС-'))
        self.assertEqual(mounting_estimate.source_estimate, self.estimate)
        self.assertEqual(mounting_estimate.total_amount, self.estimate.total_works_purchase)
        self.assertEqual(mounting_estimate.man_hours, self.estimate.man_hours)
    
    def test_mounting_estimate_validation(self):
        """Тест валидации монтажной сметы"""
        counterparty = Counterparty.objects.create(
            name='ООО Исполнитель',
            short_name='Исполнитель',
            type=Counterparty.Type.CUSTOMER,  # Неправильный тип
            legal_form=Counterparty.LegalForm.OOO,
            inn='9876543210'
        )
        
        mounting_estimate = MountingEstimate.objects.create(
            name='Монтажная смета',
            object=self.object,
            total_amount=Decimal('50000.00'),
            created_by=self.user
        )
        
        mounting_estimate.agreed_counterparty = counterparty
        with self.assertRaises(ValidationError):
            mounting_estimate.full_clean()
    
    def test_mounting_estimate_versioning(self):
        """Тест версионирования монтажной сметы"""
        mounting_estimate = MountingEstimate.objects.create(
            name='Монтажная смета',
            object=self.object,
            source_estimate=self.estimate,
            total_amount=Decimal('50000.00'),
            created_by=self.user
        )
        
        new_version = mounting_estimate.create_new_version()
        
        self.assertEqual(new_version.version_number, 2)
        self.assertEqual(new_version.parent_version, mounting_estimate)
        self.assertEqual(new_version.status, MountingEstimate.Status.DRAFT)
    
    def test_mounting_estimate_number_generation(self):
        """Тест автогенерации номера монтажной сметы"""
        mounting_estimate = MountingEstimate.objects.create(
            name='Монтажная смета',
            object=self.object,
            total_amount=Decimal('50000.00'),
            created_by=self.user
        )
        
        self.assertIsNotNone(mounting_estimate.number)
        self.assertTrue(mounting_estimate.number.startswith('МС-'))
    
    def test_mounting_estimate_valid_counterparty(self):
        """Тест валидации с валидным контрагентом"""
        counterparty = Counterparty.objects.create(
            name='ООО Исполнитель',
            short_name='Исполнитель',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO,
            inn='9876543210'
        )
        
        mounting_estimate = MountingEstimate.objects.create(
            name='Монтажная смета',
            object=self.object,
            total_amount=Decimal('50000.00'),
            created_by=self.user,
            agreed_counterparty=counterparty
        )
        
        # Не должно быть ошибки валидации
        mounting_estimate.full_clean()
        self.assertEqual(mounting_estimate.agreed_counterparty, counterparty)
    
    def test_mounting_estimate_both_type_counterparty(self):
        """Тест валидации с контрагентом типа BOTH"""
        counterparty = Counterparty.objects.create(
            name='ООО Контрагент',
            short_name='Контрагент',
            type=Counterparty.Type.BOTH,
            legal_form=Counterparty.LegalForm.OOO,
            inn='1111111111'
        )
        
        mounting_estimate = MountingEstimate.objects.create(
            name='Монтажная смета',
            object=self.object,
            total_amount=Decimal('50000.00'),
            created_by=self.user,
            agreed_counterparty=counterparty
        )
        
        mounting_estimate.full_clean()
        self.assertEqual(mounting_estimate.agreed_counterparty, counterparty)


class EstimateCharacteristicTests(TestCase):
    """Тесты для модели EstimateCharacteristic"""
    
    def setUp(self):
        # Используем уникальное имя для избежания конфликтов при параллельном запуске
        unique_id = str(uuid.uuid4())[:8]
        self.object = Object.objects.create(
            name=f'Тестовый объект {unique_id}',
            address='Тестовый адрес'
        )
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.tax_system, _ = TaxSystem.objects.get_or_create(
            code='osn_vat_20',
            defaults={
                'name': 'ОСН с НДС 20%',
                'vat_rate': Decimal('20.00'),
                'has_vat': True
            }
        )
        self.legal_entity, _ = LegalEntity.objects.get_or_create(
            inn='1234567890',
            defaults={
                'name': 'ООО Тест',
                'short_name': 'Тест',
                'tax_system': self.tax_system
            }
        )
        self.estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
    
    def test_create_manual_characteristic(self):
        """Тест создания ручной характеристики"""
        char = EstimateCharacteristic.objects.create(
            estimate=self.estimate,
            name='Доставка',
            purchase_amount=Decimal('0'),
            sale_amount=Decimal('5000.00'),
            is_auto_calculated=False,
            source_type=EstimateCharacteristic.SourceType.MANUAL
        )
        
        self.assertEqual(char.name, 'Доставка')
        self.assertFalse(char.is_auto_calculated)
        self.assertEqual(char.source_type, EstimateCharacteristic.SourceType.MANUAL)
    
    def test_characteristic_ordering(self):
        """Тест сортировки характеристик"""
        char1 = EstimateCharacteristic.objects.create(
            estimate=self.estimate,
            name='Характеристика 1',
            sort_order=2
        )
        char2 = EstimateCharacteristic.objects.create(
            estimate=self.estimate,
            name='Характеристика 2',
            sort_order=1
        )
        
        characteristics = list(EstimateCharacteristic.objects.all())
        # Должны быть отсортированы по sort_order
        self.assertEqual(characteristics[0], char2)
        self.assertEqual(characteristics[1], char1)
    
    def test_characteristic_source_type_choices(self):
        """Тест выбора типа источника данных"""
        char_sections = EstimateCharacteristic.objects.create(
            estimate=self.estimate,
            name='Материалы',
            source_type=EstimateCharacteristic.SourceType.SECTIONS
        )
        char_manual = EstimateCharacteristic.objects.create(
            estimate=self.estimate,
            name='Доставка',
            source_type=EstimateCharacteristic.SourceType.MANUAL
        )
        
        self.assertEqual(char_sections.source_type, EstimateCharacteristic.SourceType.SECTIONS)
        self.assertEqual(char_manual.source_type, EstimateCharacteristic.SourceType.MANUAL)
