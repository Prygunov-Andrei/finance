from django.test import TestCase
from django.urls import reverse
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from datetime import date

from estimates.models import (
    Project, ProjectNote, Estimate, EstimateSection,
    EstimateSubsection, EstimateCharacteristic, MountingEstimate
)
from objects.models import Object
from accounting.models import LegalEntity, TaxSystem, Counterparty
from pricelists.models import PriceList


class BaseAPITestCase(TestCase):
    """Базовый класс для API тестов"""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        
        # Создаём базовые данные с уникальным именем
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        self.object = Object.objects.create(
            name=f'Тестовый объект {unique_id}',
            address='Тестовый адрес'
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
        # Создаём тестовый файл для проектов
        self.test_file = SimpleUploadedFile('project.zip', b'fake zip content')


class ProjectAPITests(BaseAPITestCase):
    """Тесты API для проектов"""
    
    def test_list_projects(self):
        """Тест получения списка проектов"""
        Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        response = self.client.get('/api/v1/projects/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)
    
    def test_create_project(self):
        """Тест создания проекта"""
        data = {
            'cipher': 'ПР-2025-001',
            'name': 'Тестовый проект',
            'date': '2025-01-15',
            'stage': Project.Stage.P,
            'object': self.object.id,
            'file': self.test_file
        }
        response = self.client.post('/api/v1/projects/', data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['cipher'], 'ПР-2025-001')
    
    def test_get_project_detail(self):
        """Тест получения деталей проекта"""
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        response = self.client.get(f'/api/v1/projects/{project.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['cipher'], 'ПР-2025-001')
    
    def test_create_project_version(self):
        """Тест создания новой версии проекта"""
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        response = self.client.post(f'/api/v1/projects/{project.id}/create-version/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['version_number'], 2)
        
        # Проверяем, что старая версия помечена как неактуальная
        project.refresh_from_db()
        self.assertFalse(project.is_current)
    
    def test_primary_check(self):
        """Тест отметки первичной проверки"""
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        response = self.client.post(f'/api/v1/projects/{project.id}/primary-check/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        project.refresh_from_db()
        self.assertTrue(project.primary_check_done)
        self.assertEqual(project.primary_check_by, self.user)
    
    def test_filter_projects(self):
        """Тест фильтрации проектов"""
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
            stage=Project.Stage.RD,
            object=self.object,
            file=self.test_file
        )
        
        response = self.client.get('/api/v1/projects/?stage=П')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['cipher'], 'ПР-2025-001')
    
    def test_update_project(self):
        """Тест обновления проекта"""
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        data = {'name': 'Обновлённый проект'}
        response = self.client.patch(f'/api/v1/projects/{project.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Обновлённый проект')
    
    def test_search_projects(self):
        """Тест поиска проектов"""
        Project.objects.create(
            cipher='ПР-2025-001',
            name='Вентиляция объекта',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        Project.objects.create(
            cipher='ПР-2025-002',
            name='Кондиционирование',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        response = self.client.get('/api/v1/projects/?search=Вентиляция')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertIn('Вентиляция', response.data['results'][0]['name'])
    
    def test_secondary_check(self):
        """Тест отметки вторичной проверки"""
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        response = self.client.post(f'/api/v1/projects/{project.id}/secondary-check/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        project.refresh_from_db()
        self.assertTrue(project.secondary_check_done)
        self.assertEqual(project.secondary_check_by, self.user)
    
    def test_approve_production(self):
        """Тест разрешения в производство"""
        from django.core.files.uploadedfile import SimpleUploadedFile
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        file_content = b'fake approval file'
        approval_file = SimpleUploadedFile('approval.pdf', file_content)
        
        response = self.client.post(
            f'/api/v1/projects/{project.id}/approve-production/',
            {'production_approval_file': approval_file},
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        project.refresh_from_db()
        self.assertTrue(project.is_approved_for_production)
        self.assertIsNotNone(project.production_approval_date)
    
    def test_project_versions_history(self):
        """Тест получения истории версий проекта"""
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        project_id = project.id  # Сохраняем ID до создания версий
        
        version2 = project.create_new_version()
        version3 = version2.create_new_version()
        
        # Используем ID последней версии (которая актуальна)
        # или исходного проекта - endpoint должен найти все версии через parent_version
        response = self.client.get(f'/api/v1/projects/{version3.id}/versions/')
        if response.status_code == 404:
            # Если не найдено, пробуем исходный проект
            response = self.client.get(f'/api/v1/projects/{project_id}/versions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Должно быть 3 версии: исходная + 2 новые
        self.assertGreaterEqual(len(response.data), 3)
    
    def test_project_list_only_current(self):
        """Тест списка только актуальных версий"""
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        project.create_new_version()
        
        response = self.client.get('/api/v1/projects/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Должна быть только одна актуальная версия
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['version_number'], 2)


class ProjectNoteAPITests(BaseAPITestCase):
    """Тесты API для замечаний к проектам"""
    
    def setUp(self):
        super().setUp()
        self.project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
    
    def test_create_project_note(self):
        """Тест создания замечания"""
        data = {
            'project': self.project.id,
            'text': 'Тестовое замечание'
        }
        response = self.client.post('/api/v1/project-notes/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['text'], 'Тестовое замечание')
        self.assertEqual(response.data['author']['username'], 'testuser')
    
    def test_list_project_notes(self):
        """Тест получения списка замечаний"""
        ProjectNote.objects.create(
            project=self.project,
            author=self.user,
            text='Тестовое замечание'
        )
        
        response = self.client.get('/api/v1/project-notes/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)
    
    def test_update_project_note(self):
        """Тест обновления замечания"""
        note = ProjectNote.objects.create(
            project=self.project,
            author=self.user,
            text='Тестовое замечание'
        )
        
        data = {'text': 'Обновлённое замечание'}
        response = self.client.patch(f'/api/v1/project-notes/{note.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['text'], 'Обновлённое замечание')
    
    def test_delete_project_note(self):
        """Тест удаления замечания"""
        note = ProjectNote.objects.create(
            project=self.project,
            author=self.user,
            text='Тестовое замечание'
        )
        
        response = self.client.delete(f'/api/v1/project-notes/{note.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProjectNote.objects.filter(id=note.id).exists())
    
    def test_filter_project_notes(self):
        """Тест фильтрации замечаний по проекту"""
        project2 = Project.objects.create(
            cipher='ПР-2025-002',
            name='Проект 2',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        note1 = ProjectNote.objects.create(
            project=self.project,
            author=self.user,
            text='Замечание 1'
        )
        note2 = ProjectNote.objects.create(
            project=project2,
            author=self.user,
            text='Замечание 2'
        )
        
        response = self.client.get(f'/api/v1/project-notes/?project={self.project.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], note1.id)


class EstimateAPITests(BaseAPITestCase):
    """Тесты API для смет"""
    
    def test_create_estimate(self):
        """Тест создания сметы"""
        data = {
            'name': 'Тестовая смета',
            'object': self.object.id,
            'legal_entity': self.legal_entity.id,
            'with_vat': True,
            'vat_rate': '20.00'
        }
        response = self.client.post('/api/v1/estimates/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNotNone(response.data['number'])
        self.assertTrue(response.data['number'].startswith('СМ-'))
        
        # Проверяем, что созданы начальные характеристики
        estimate = Estimate.objects.get(id=response.data['id'])
        self.assertEqual(estimate.characteristics.count(), 2)
    
    def test_get_estimate_detail(self):
        """Тест получения деталей сметы"""
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
            materials_sale=Decimal('100000.00'),
            works_sale=Decimal('50000.00')
        )
        
        response = self.client.get(f'/api/v1/estimates/{estimate.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Тестовая смета')
        self.assertEqual(len(response.data['sections']), 1)
        self.assertEqual(len(response.data['sections'][0]['subsections']), 1)
        
        # Проверяем вычисляемые поля
        self.assertEqual(response.data['total_sale'], '150000.00')
    
    def test_create_estimate_version(self):
        """Тест создания новой версии сметы"""
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
        
        response = self.client.post(f'/api/v1/estimates/{estimate.id}/create-version/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['version_number'], 2)
        self.assertEqual(response.data['status'], 'draft')
        
        # Проверяем, что разделы скопированы
        new_estimate = Estimate.objects.get(id=response.data['id'])
        self.assertEqual(new_estimate.sections.count(), 1)
        self.assertEqual(new_estimate.sections.first().subsections.count(), 1)
    
    def test_create_mounting_estimate_from_estimate(self):
        """Тест создания монтажной сметы из обычной сметы"""
        estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            man_hours=Decimal('100.00')
        )
        
        # Создаём раздел с работами
        section = EstimateSection.objects.create(
            estimate=estimate,
            name='Вентиляция'
        )
        EstimateSubsection.objects.create(
            section=section,
            name='Приточная система',
            works_purchase=Decimal('50000.00')
        )
        
        response = self.client.post(
            f'/api/v1/estimates/{estimate.id}/create-mounting-estimate/'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['number'].startswith('МС-'))
        self.assertEqual(response.data['total_amount'], '50000.00')
        self.assertEqual(response.data['man_hours'], '100.00')
    
    def test_update_estimate(self):
        """Тест обновления сметы"""
        estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        
        data = {'name': 'Обновлённая смета', 'status': Estimate.Status.IN_PROGRESS}
        response = self.client.patch(f'/api/v1/estimates/{estimate.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Обновлённая смета')
        self.assertEqual(response.data['status'], 'in_progress')
    
    def test_estimate_with_projects(self):
        """Тест создания сметы с проектами"""
        project = Project.objects.create(
            cipher='ПР-2025-001',
            name='Тестовый проект',
            date=date.today(),
            stage=Project.Stage.P,
            object=self.object,
            file=self.test_file
        )
        
        data = {
            'name': 'Тестовая смета',
            'object': self.object.id,
            'legal_entity': self.legal_entity.id,
            'projects': [project.id]
        }
        response = self.client.post('/api/v1/estimates/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # В EstimateCreateSerializer projects возвращается как список ID
        self.assertEqual(len(response.data['projects']), 1)
        self.assertIn(project.id, response.data['projects'])
    
    def test_estimate_filter_by_status(self):
        """Тест фильтрации смет по статусу"""
        estimate1 = Estimate.objects.create(
            name='Смета 1',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            status=Estimate.Status.DRAFT
        )
        estimate2 = Estimate.objects.create(
            name='Смета 2',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            status=Estimate.Status.APPROVED
        )
        
        response = self.client.get('/api/v1/estimates/?status=approved')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], estimate2.id)
    
    def test_estimate_search(self):
        """Тест поиска смет"""
        Estimate.objects.create(
            number='СМ-2025-001',
            name='Смета на вентиляцию',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        Estimate.objects.create(
            number='СМ-2025-002',
            name='Смета на кондиционирование',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        
        response = self.client.get('/api/v1/estimates/?search=вентиляцию')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertIn('вентиляцию', response.data['results'][0]['name'].lower())
    
    def test_estimate_versions_history(self):
        """Тест получения истории версий сметы"""
        estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
        
        version2 = estimate.create_new_version()
        version3 = version2.create_new_version()
        
        response = self.client.get(f'/api/v1/estimates/{estimate.id}/versions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)
    
    def test_estimate_calculated_fields(self):
        """Тест вычисляемых полей в API"""
        estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
            with_vat=True,
            vat_rate=Decimal('20.00')
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
            materials_purchase=Decimal('80000.00'),
            works_purchase=Decimal('30000.00')
        )
        
        response = self.client.get(f'/api/v1/estimates/{estimate.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_sale'], '150000.00')
        self.assertEqual(response.data['vat_amount'], '30000.00')
        self.assertEqual(response.data['total_with_vat'], '180000.00')
        self.assertEqual(response.data['profit_amount'], '40000.00')


class EstimateSectionAPITests(BaseAPITestCase):
    """Тесты API для разделов сметы"""
    
    def setUp(self):
        super().setUp()
        self.estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
    
    def test_create_section(self):
        """Тест создания раздела"""
        data = {
            'estimate': self.estimate.id,
            'name': 'Вентиляция',
            'sort_order': 1
        }
        response = self.client.post('/api/v1/estimate-sections/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Вентиляция')
    
    def test_list_sections(self):
        """Тест получения списка разделов"""
        EstimateSection.objects.create(
            estimate=self.estimate,
            name='Вентиляция'
        )
        
        response = self.client.get(f'/api/v1/estimate-sections/?estimate={self.estimate.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)
    
    def test_update_section(self):
        """Тест обновления раздела"""
        section = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Вентиляция'
        )
        
        data = {'name': 'Обновлённая вентиляция', 'sort_order': 5}
        response = self.client.patch(f'/api/v1/estimate-sections/{section.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Обновлённая вентиляция')
        self.assertEqual(response.data['sort_order'], 5)
    
    def test_delete_section(self):
        """Тест удаления раздела"""
        section = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Вентиляция'
        )
        
        response = self.client.delete(f'/api/v1/estimate-sections/{section.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(EstimateSection.objects.filter(id=section.id).exists())
    
    def test_section_with_subsections(self):
        """Тест раздела с подразделами в API"""
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
        
        response = self.client.get(f'/api/v1/estimate-sections/{section.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['subsections']), 1)
        self.assertEqual(response.data['total_sale'], '150000.00')


class EstimateSubsectionAPITests(BaseAPITestCase):
    """Тесты API для подразделов сметы"""
    
    def setUp(self):
        super().setUp()
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
    
    def test_create_subsection(self):
        """Тест создания подраздела"""
        data = {
            'section': self.section.id,
            'name': 'Приточная система',
            'materials_sale': '100000.00',
            'works_sale': '50000.00',
            'materials_purchase': '80000.00',
            'works_purchase': '30000.00'
        }
        response = self.client.post('/api/v1/estimate-subsections/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['total_sale'], '150000.00')
        self.assertEqual(response.data['total_purchase'], '110000.00')
    
    def test_update_subsection(self):
        """Тест обновления подраздела"""
        subsection = EstimateSubsection.objects.create(
            section=self.section,
            name='Приточная система',
            materials_sale=Decimal('100000.00')
        )
        
        data = {'materials_sale': '120000.00'}
        response = self.client.patch(f'/api/v1/estimate-subsections/{subsection.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['materials_sale'], '120000.00')
    
    def test_delete_subsection(self):
        """Тест удаления подраздела"""
        subsection = EstimateSubsection.objects.create(
            section=self.section,
            name='Приточная система',
            materials_sale=Decimal('100000.00')
        )
        
        response = self.client.delete(f'/api/v1/estimate-subsections/{subsection.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(EstimateSubsection.objects.filter(id=subsection.id).exists())
    
    def test_filter_subsections_by_estimate(self):
        """Тест фильтрации подразделов по смете"""
        section2 = EstimateSection.objects.create(
            estimate=self.estimate,
            name='Кондиционирование'
        )
        subsection1 = EstimateSubsection.objects.create(
            section=self.section,
            name='Подраздел 1',
            materials_sale=Decimal('100000.00')
        )
        subsection2 = EstimateSubsection.objects.create(
            section=section2,
            name='Подраздел 2',
            materials_sale=Decimal('200000.00')
        )
        
        response = self.client.get(f'/api/v1/estimate-subsections/?estimate={self.estimate.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 2)


class EstimateCharacteristicAPITests(BaseAPITestCase):
    """Тесты API для характеристик сметы"""
    
    def setUp(self):
        super().setUp()
        self.estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user
        )
    
    def test_create_characteristic(self):
        """Тест создания характеристики"""
        data = {
            'estimate': self.estimate.id,
            'name': 'Доставка',
            'purchase_amount': '0',
            'sale_amount': '5000.00',
            'source_type': EstimateCharacteristic.SourceType.MANUAL
        }
        response = self.client.post('/api/v1/estimate-characteristics/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Доставка')
    
    def test_update_characteristic_resets_auto_calculated(self):
        """Тест обновления характеристики сбрасывает is_auto_calculated"""
        char = EstimateCharacteristic.objects.create(
            estimate=self.estimate,
            name='Материалы',
            sale_amount=Decimal('100000.00'),
            is_auto_calculated=True,
            source_type=EstimateCharacteristic.SourceType.SECTIONS
        )
        
        data = {'sale_amount': '110000.00'}
        response = self.client.patch(
            f'/api/v1/estimate-characteristics/{char.id}/',
            data
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        char.refresh_from_db()
        self.assertFalse(char.is_auto_calculated)
    
    def test_delete_characteristic(self):
        """Тест удаления характеристики"""
        char = EstimateCharacteristic.objects.create(
            estimate=self.estimate,
            name='Доставка',
            sale_amount=Decimal('5000.00'),
            source_type=EstimateCharacteristic.SourceType.MANUAL
        )
        
        response = self.client.delete(f'/api/v1/estimate-characteristics/{char.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(EstimateCharacteristic.objects.filter(id=char.id).exists())
    
    def test_list_characteristics(self):
        """Тест получения списка характеристик"""
        EstimateCharacteristic.objects.create(
            estimate=self.estimate,
            name='Доставка',
            sale_amount=Decimal('5000.00'),
            source_type=EstimateCharacteristic.SourceType.MANUAL
        )
        
        response = self.client.get(f'/api/v1/estimate-characteristics/?estimate={self.estimate.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)


class MountingEstimateAPITests(BaseAPITestCase):
    """Тесты API для монтажных смет"""
    
    def setUp(self):
        super().setUp()
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
    
    def test_create_mounting_estimate_from_estimate_endpoint(self):
        """Тест создания монтажной сметы через endpoint"""
        data = {'estimate_id': self.estimate.id}
        response = self.client.post(
            '/api/v1/mounting-estimates/from-estimate/',
            data
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['number'].startswith('МС-'))
        self.assertEqual(response.data['source_estimate']['id'], self.estimate.id)
    
    def test_agree_mounting_estimate(self):
        """Тест согласования монтажной сметы"""
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
            source_estimate=self.estimate,
            total_amount=Decimal('50000.00'),
            created_by=self.user
        )
        
        data = {'counterparty_id': counterparty.id}
        response = self.client.post(
            f'/api/v1/mounting-estimates/{mounting_estimate.id}/agree/',
            data
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        mounting_estimate.refresh_from_db()
        self.assertEqual(mounting_estimate.agreed_counterparty, counterparty)
        self.assertEqual(mounting_estimate.status, MountingEstimate.Status.APPROVED)
    
    def test_agree_mounting_estimate_invalid_counterparty(self):
        """Тест согласования с невалидным контрагентом"""
        counterparty = Counterparty.objects.create(
            name='ООО Заказчик',
            short_name='Заказчик',
            type=Counterparty.Type.CUSTOMER,  # Неправильный тип
            legal_form=Counterparty.LegalForm.OOO,
            inn='1111111111'
        )
        
        mounting_estimate = MountingEstimate.objects.create(
            name='Монтажная смета',
            object=self.object,
            total_amount=Decimal('50000.00'),
            created_by=self.user
        )
        
        data = {'counterparty_id': counterparty.id}
        response = self.client.post(
            f'/api/v1/mounting-estimates/{mounting_estimate.id}/agree/',
            data
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_create_mounting_estimate_directly(self):
        """Тест создания монтажной сметы напрямую"""
        data = {
            'name': 'Монтажная смета',
            'object': self.object.id,
            'total_amount': '50000.00',
            'man_hours': '100.00',
            'status': MountingEstimate.Status.DRAFT
        }
        response = self.client.post('/api/v1/mounting-estimates/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['number'].startswith('МС-'))
    
    def test_update_mounting_estimate(self):
        """Тест обновления монтажной сметы"""
        mounting_estimate = MountingEstimate.objects.create(
            name='Монтажная смета',
            object=self.object,
            total_amount=Decimal('50000.00'),
            created_by=self.user
        )
        
        data = {'name': 'Обновлённая монтажная смета', 'status': MountingEstimate.Status.SENT}
        response = self.client.patch(f'/api/v1/mounting-estimates/{mounting_estimate.id}/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Обновлённая монтажная смета')
        self.assertEqual(response.data['status'], 'sent')
    
    def test_mounting_estimate_versioning(self):
        """Тест версионирования монтажной сметы"""
        mounting_estimate = MountingEstimate.objects.create(
            name='Монтажная смета',
            object=self.object,
            total_amount=Decimal('50000.00'),
            created_by=self.user
        )
        
        response = self.client.post(f'/api/v1/mounting-estimates/{mounting_estimate.id}/create-version/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['version_number'], 2)
        self.assertEqual(response.data['status'], 'draft')
    
    def test_filter_mounting_estimates(self):
        """Тест фильтрации монтажных смет"""
        mounting_estimate1 = MountingEstimate.objects.create(
            name='Монтажная смета 1',
            object=self.object,
            total_amount=Decimal('50000.00'),
            created_by=self.user,
            status=MountingEstimate.Status.DRAFT
        )
        mounting_estimate2 = MountingEstimate.objects.create(
            name='Монтажная смета 2',
            object=self.object,
            total_amount=Decimal('60000.00'),
            created_by=self.user,
            status=MountingEstimate.Status.APPROVED
        )
        
        response = self.client.get('/api/v1/mounting-estimates/?status=approved')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], mounting_estimate2.id)
    
    def test_search_mounting_estimates(self):
        """Тест поиска монтажных смет"""
        MountingEstimate.objects.create(
            number='МС-2025-001',
            name='Монтажная смета на вентиляцию',
            object=self.object,
            total_amount=Decimal('50000.00'),
            created_by=self.user
        )
        MountingEstimate.objects.create(
            number='МС-2025-002',
            name='Монтажная смета на кондиционирование',
            object=self.object,
            total_amount=Decimal('60000.00'),
            created_by=self.user
        )
        
        response = self.client.get('/api/v1/mounting-estimates/?search=вентиляцию')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertIn('вентиляцию', response.data['results'][0]['name'].lower())
    
    def test_agree_mounting_estimate_missing_counterparty(self):
        """Тест согласования без указания контрагента"""
        mounting_estimate = MountingEstimate.objects.create(
            name='Монтажная смета',
            object=self.object,
            total_amount=Decimal('50000.00'),
            created_by=self.user
        )
        
        response = self.client.post(f'/api/v1/mounting-estimates/{mounting_estimate.id}/agree/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_agree_mounting_estimate_nonexistent_counterparty(self):
        """Тест согласования с несуществующим контрагентом"""
        mounting_estimate = MountingEstimate.objects.create(
            name='Монтажная смета',
            object=self.object,
            total_amount=Decimal('50000.00'),
            created_by=self.user
        )
        
        data = {'counterparty_id': 99999}
        response = self.client.post(
            f'/api/v1/mounting-estimates/{mounting_estimate.id}/agree/',
            data
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
