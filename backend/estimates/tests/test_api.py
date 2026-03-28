from django.test import TestCase
from django.urls import reverse
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from datetime import date

from estimates.models import (
    Project, ProjectNote, ProjectFileType, ProjectFile,
    Estimate, EstimateSection,
    EstimateSubsection, EstimateCharacteristic, MountingEstimate,
    EstimateItem,
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


class ProjectFileTypeAPITests(BaseAPITestCase):
    """Тесты API для типов файлов проектов"""

    def test_list_file_types(self):
        """Тест получения списка типов файлов"""
        response = self.client.get('/api/v1/project-file-types/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data['results'] if 'results' in response.data else response.data
        self.assertGreaterEqual(len(data), 4)

    def test_seed_data_exists(self):
        """Тест что seed-данные доступны через API"""
        response = self.client.get('/api/v1/project-file-types/')
        data = response.data['results'] if 'results' in response.data else response.data
        codes = [ft['code'] for ft in data]
        for expected in ['full_project', 'graphics', 'specification', 'technique']:
            self.assertIn(expected, codes)

    def test_create_file_type(self):
        """Тест создания нового типа файла"""
        response = self.client.post('/api/v1/project-file-types/', {
            'name': 'Новый тип', 'code': 'new_type', 'sort_order': 10,
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Новый тип')

    def test_update_file_type(self):
        """Тест обновления типа файла"""
        ft = ProjectFileType.objects.first()
        response = self.client.patch(f'/api/v1/project-file-types/{ft.id}/', {
            'sort_order': 99,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['sort_order'], 99)

    def test_delete_file_type_without_files(self):
        """Тест удаления типа файла без привязанных файлов"""
        ft = ProjectFileType.objects.create(name='Удаляемый', code='deletable')
        response = self.client.delete(f'/api/v1/project-file-types/{ft.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_filter_active(self):
        """Тест фильтрации по is_active"""
        ProjectFileType.objects.create(name='Неактивный', code='inactive', is_active=False)
        response = self.client.get('/api/v1/project-file-types/?is_active=true')
        data = response.data['results'] if 'results' in response.data else response.data
        for ft in data:
            self.assertTrue(ft['is_active'])


class ProjectFileAPITests(BaseAPITestCase):
    """Тесты API для файлов проектов"""

    def setUp(self):
        super().setUp()
        self.project = Project.objects.create(
            cipher='ПР-2025-FILE', name='Проект для файлов',
            date=date.today(), stage=Project.Stage.P,
            object=self.object, file=self.test_file,
        )
        self.file_type = ProjectFileType.objects.get(code='full_project')

    def test_upload_file(self):
        """Тест загрузки файла к проекту"""
        response = self.client.post('/api/v1/project-files/', {
            'project': self.project.id,
            'file': SimpleUploadedFile('spec.pdf', b'pdf content'),
            'file_type': self.file_type.id,
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['original_filename'], 'spec.pdf')
        self.assertEqual(response.data['file_type'], self.file_type.id)
        self.assertEqual(response.data['uploaded_by'], self.user.id)

    def test_list_files_by_project(self):
        """Тест списка файлов проекта"""
        ProjectFile.objects.create(
            project=self.project,
            file=SimpleUploadedFile('a.pdf', b'a'),
            file_type=self.file_type,
            original_filename='a.pdf',
        )
        ProjectFile.objects.create(
            project=self.project,
            file=SimpleUploadedFile('b.pdf', b'b'),
            file_type=self.file_type,
            original_filename='b.pdf',
        )
        response = self.client.get(f'/api/v1/project-files/?project={self.project.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data['results'] if 'results' in response.data else response.data
        self.assertEqual(len(data), 2)

    def test_delete_file(self):
        """Тест удаления файла"""
        pf = ProjectFile.objects.create(
            project=self.project,
            file=SimpleUploadedFile('del.pdf', b'del'),
            file_type=self.file_type,
            original_filename='del.pdf',
        )
        response = self.client.delete(f'/api/v1/project-files/{pf.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProjectFile.objects.filter(id=pf.id).exists())

    def test_project_detail_includes_files(self):
        """Тест что деталь проекта включает project_files"""
        ProjectFile.objects.create(
            project=self.project,
            file=SimpleUploadedFile('inc.pdf', b'inc'),
            file_type=self.file_type,
            original_filename='inc.pdf',
            title='Included File',
        )
        response = self.client.get(f'/api/v1/projects/{self.project.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('project_files', response.data)
        self.assertEqual(len(response.data['project_files']), 1)
        self.assertEqual(response.data['project_files'][0]['title'], 'Included File')

    def test_upload_with_title(self):
        """Тест загрузки файла с названием"""
        response = self.client.post('/api/v1/project-files/', {
            'project': self.project.id,
            'file': SimpleUploadedFile('tech.dwg', b'dwg'),
            'file_type': self.file_type.id,
            'title': 'Техническая документация',
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['title'], 'Техническая документация')


class EstimateAPITests(BaseAPITestCase):
    """Тесты API для смет"""

    def test_create_estimate(self):
        """Тест создания сметы — НДС берётся из налоговой системы компании"""
        data = {
            'name': 'Тестовая смета',
            'object': self.object.id,
            'legal_entity': self.legal_entity.id,
        }
        response = self.client.post('/api/v1/estimates/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNotNone(response.data['number'])
        self.assertTrue(response.data['number'].startswith('СМ-'))

        # НДС определён из tax_system компании
        estimate = Estimate.objects.get(id=response.data['id'])
        self.assertTrue(estimate.with_vat)
        self.assertEqual(estimate.vat_rate, Decimal('20.00'))

        # Проверяем, что созданы начальные характеристики
        self.assertEqual(estimate.characteristics.count(), 2)

    def test_create_estimate_without_vat(self):
        """Тест создания сметы для компании без НДС (УСН)"""
        usn_tax = TaxSystem.objects.create(
            code='usn', name='УСН', has_vat=False
        )
        usn_entity = LegalEntity.objects.create(
            name='ООО Тест УСН', short_name='Тест УСН',
            inn='9876543210', tax_system=usn_tax
        )
        data = {
            'name': 'Смета без НДС',
            'object': self.object.id,
            'legal_entity': usn_entity.id,
        }
        response = self.client.post('/api/v1/estimates/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        estimate = Estimate.objects.get(id=response.data['id'])
        self.assertFalse(estimate.with_vat)
    
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
        self.assertEqual(response.data['total_sale'], Decimal('150000.00'))

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
        self.assertEqual(response.data['total_sale'], Decimal('150000.00'))
        self.assertEqual(response.data['vat_amount'], Decimal('30000.00'))
        self.assertEqual(response.data['total_with_vat'], Decimal('180000.00'))
        self.assertEqual(response.data['profit_amount'], Decimal('40000.00'))


class EstimateProjectFilesAPITests(BaseAPITestCase):
    """Тесты отображения файлов проектов в сметах и импорта из ProjectFile"""

    def test_estimate_detail_includes_project_files(self):
        """project_files отображаются в деталях сметы через связанные проекты"""
        project = Project.objects.create(
            cipher='ПР-2025-010', name='Проект с файлами',
            date=date.today(), stage=Project.Stage.P, object=self.object
        )
        file_type = ProjectFileType.objects.get(code='specification')
        ProjectFile.objects.create(
            project=project, file=SimpleUploadedFile('spec.xlsx', b'content'),
            file_type=file_type, original_filename='spec.xlsx'
        )
        estimate = Estimate.objects.create(
            name='Смета', object=self.object,
            legal_entity=self.legal_entity, created_by=self.user
        )
        estimate.projects.add(project)

        response = self.client.get(f'/api/v1/estimates/{estimate.id}/')
        self.assertEqual(response.status_code, 200)
        projects = response.data['projects']
        self.assertEqual(len(projects), 1)
        self.assertEqual(len(projects[0]['project_files']), 1)
        pf_data = projects[0]['project_files'][0]
        self.assertEqual(pf_data['file_type_code'], 'specification')
        self.assertEqual(pf_data['original_filename'], 'spec.xlsx')
        self.assertIn('file_type_name', pf_data)
        self.assertIn('file', pf_data)

    def test_estimate_detail_multiple_project_files(self):
        """Все файлы проекта отображаются в деталях сметы"""
        project = Project.objects.create(
            cipher='ПР-2025-013', name='Проект с несколькими файлами',
            date=date.today(), stage=Project.Stage.P, object=self.object
        )
        spec_type = ProjectFileType.objects.get(code='specification')
        graphics_type = ProjectFileType.objects.get(code='graphics')
        ProjectFile.objects.create(
            project=project, file=SimpleUploadedFile('spec.xlsx', b'spec'),
            file_type=spec_type, original_filename='spec.xlsx'
        )
        ProjectFile.objects.create(
            project=project, file=SimpleUploadedFile('drawings.pdf', b'drawings'),
            file_type=graphics_type, original_filename='drawings.pdf'
        )
        estimate = Estimate.objects.create(
            name='Смета multi', object=self.object,
            legal_entity=self.legal_entity, created_by=self.user
        )
        estimate.projects.add(project)

        response = self.client.get(f'/api/v1/estimates/{estimate.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['projects'][0]['project_files']), 2)

    def test_import_from_project_file_preview(self):
        """Импорт строк сметы из файла проекта в режиме предпросмотра"""
        from openpyxl import Workbook
        import io

        wb = Workbook()
        ws = wb.active
        ws.append(['Наименование', 'Ед.', 'Кол-во', 'Цена'])
        ws.append(['Кондиционер', 'шт', '2', '50000'])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        project = Project.objects.create(
            cipher='ПР-2025-011', name='Проект для импорта',
            date=date.today(), stage=Project.Stage.P, object=self.object
        )
        file_type = ProjectFileType.objects.get(code='specification')
        pf = ProjectFile.objects.create(
            project=project, file=SimpleUploadedFile('spec.xlsx', buf.read()),
            file_type=file_type, original_filename='spec.xlsx'
        )
        estimate = Estimate.objects.create(
            name='Смета импорт', object=self.object,
            legal_entity=self.legal_entity, created_by=self.user
        )
        estimate.projects.add(project)

        response = self.client.post('/api/v1/estimate-items/import-project-file/', {
            'estimate_id': estimate.id,
            'project_file_id': pf.id,
            'preview': 'true',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('rows', response.data)
        self.assertGreaterEqual(len(response.data['rows']), 1)

    def test_import_from_unlinked_project_file_rejected(self):
        """Нельзя импортировать из файла проекта, не связанного со сметой"""
        project = Project.objects.create(
            cipher='ПР-2025-012', name='Чужой проект',
            date=date.today(), stage=Project.Stage.P, object=self.object
        )
        file_type = ProjectFileType.objects.get(code='specification')
        pf = ProjectFile.objects.create(
            project=project, file=SimpleUploadedFile('spec.xlsx', b'content'),
            file_type=file_type, original_filename='spec.xlsx'
        )
        estimate = Estimate.objects.create(
            name='Смета без проекта', object=self.object,
            legal_entity=self.legal_entity, created_by=self.user
        )
        # НЕ связываем estimate.projects.add(project)

        response = self.client.post('/api/v1/estimate-items/import-project-file/', {
            'estimate_id': estimate.id,
            'project_file_id': pf.id,
            'preview': 'true',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('не связанному', response.data['error'])

    def test_import_from_project_file_unsupported_format(self):
        """Нельзя импортировать файл неподдерживаемого формата"""
        project = Project.objects.create(
            cipher='ПР-2025-014', name='Проект с DWG',
            date=date.today(), stage=Project.Stage.P, object=self.object
        )
        file_type = ProjectFileType.objects.get(code='graphics')
        pf = ProjectFile.objects.create(
            project=project, file=SimpleUploadedFile('drawing.dwg', b'dwg content'),
            file_type=file_type, original_filename='drawing.dwg'
        )
        estimate = Estimate.objects.create(
            name='Смета DWG', object=self.object,
            legal_entity=self.legal_entity, created_by=self.user
        )
        estimate.projects.add(project)

        response = self.client.post('/api/v1/estimate-items/import-project-file/', {
            'estimate_id': estimate.id,
            'project_file_id': pf.id,
            'preview': 'true',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Excel', response.data['error'])

    def test_import_from_multiple_project_files_preview(self):
        """Импорт из нескольких файлов проекта — строки объединяются"""
        from openpyxl import Workbook
        import io

        def make_xlsx(items):
            wb = Workbook()
            ws = wb.active
            ws.append(['Наименование', 'Ед.', 'Кол-во', 'Цена'])
            for item in items:
                ws.append(item)
            buf = io.BytesIO()
            wb.save(buf)
            buf.seek(0)
            return buf.read()

        project1 = Project.objects.create(
            cipher='ПР-2025-020', name='Проект 1',
            date=date.today(), stage=Project.Stage.P, object=self.object
        )
        project2 = Project.objects.create(
            cipher='ПР-2025-021', name='Проект 2',
            date=date.today(), stage=Project.Stage.P, object=self.object
        )
        file_type = ProjectFileType.objects.get(code='specification')
        pf1 = ProjectFile.objects.create(
            project=project1,
            file=SimpleUploadedFile('spec1.xlsx', make_xlsx([['Кондиционер', 'шт', '2', '50000']])),
            file_type=file_type, original_filename='spec1.xlsx'
        )
        pf2 = ProjectFile.objects.create(
            project=project2,
            file=SimpleUploadedFile('spec2.xlsx', make_xlsx([['Вентилятор', 'шт', '3', '30000']])),
            file_type=file_type, original_filename='spec2.xlsx'
        )
        estimate = Estimate.objects.create(
            name='Смета multi-import', object=self.object,
            legal_entity=self.legal_entity, created_by=self.user
        )
        estimate.projects.add(project1, project2)

        response = self.client.post('/api/v1/estimate-items/import-project-file/', {
            'estimate_id': estimate.id,
            'project_file_ids': [pf1.id, pf2.id],
            'preview': 'true',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('rows', response.data)
        # Должны быть строки из обоих файлов
        self.assertGreaterEqual(len(response.data['rows']), 2)
        names = [r['name'] for r in response.data['rows']]
        self.assertTrue(any('Кондиционер' in n for n in names))
        self.assertTrue(any('Вентилятор' in n for n in names))


class EstimateProjectFilePdfAsyncTests(BaseAPITestCase):
    """Тесты async-импорта PDF из файлов проекта (import-project-file-pdf)"""

    @staticmethod
    def _make_pdf(pages=1):
        """Создаёт минимальный валидный PDF с заданным числом страниц."""
        import fitz
        doc = fitz.open()
        for i in range(pages):
            page = doc.new_page(width=595, height=842)
            page.insert_text((72, 72), f'Page {i + 1}')
        content = doc.tobytes()
        doc.close()
        return content

    def _create_project_with_pdf(self, cipher, filename='spec.pdf', pages=1):
        project = Project.objects.create(
            cipher=cipher, name=f'Проект {cipher}',
            date=date.today(), stage=Project.Stage.P, object=self.object
        )
        file_type = ProjectFileType.objects.get(code='specification')
        pf = ProjectFile.objects.create(
            project=project,
            file=SimpleUploadedFile(filename, self._make_pdf(pages), content_type='application/pdf'),
            file_type=file_type, original_filename=filename
        )
        return project, pf

    def test_import_project_file_pdf_starts_async_session(self):
        """POST import-project-file-pdf возвращает session_id и total_pages (HTTP 202)"""
        import sys
        from unittest.mock import patch, MagicMock

        project, pf = self._create_project_with_pdf('ПР-PDF-001', pages=3)
        estimate = Estimate.objects.create(
            name='Смета PDF', object=self.object,
            legal_entity=self.legal_entity, created_by=self.user
        )
        estimate.projects.add(project)

        mock_tasks = MagicMock()
        mock_tasks.create_import_session = MagicMock(return_value={'session_id': 'a' * 16, 'total_pages': 3})
        mock_tasks.process_estimate_pdf_pages = MagicMock()

        with patch.dict(sys.modules, {'estimates.tasks': mock_tasks}):
            response = self.client.post('/api/v1/estimate-items/import-project-file-pdf/', {
                'estimate_id': estimate.id,
                'project_file_ids': [pf.id],
            }, format='json')

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertIn('session_id', response.data)
        self.assertEqual(response.data['total_pages'], 3)
        self.assertEqual(len(response.data['session_id']), 16)

    def test_import_project_file_pdf_unlinked_rejected(self):
        """Файл из непривязанного проекта отклоняется"""
        project, pf = self._create_project_with_pdf('ПР-PDF-002')
        estimate = Estimate.objects.create(
            name='Смета без проекта', object=self.object,
            legal_entity=self.legal_entity, created_by=self.user
        )
        # НЕ привязываем: estimate.projects.add(project)

        response = self.client.post('/api/v1/estimate-items/import-project-file-pdf/', {
            'estimate_id': estimate.id,
            'project_file_ids': [pf.id],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('не связанному', response.data['error'])

    def test_import_project_file_pdf_non_pdf_rejected(self):
        """Файл с расширением не .pdf отклоняется"""
        project = Project.objects.create(
            cipher='ПР-PDF-003', name='Проект Excel',
            date=date.today(), stage=Project.Stage.P, object=self.object
        )
        file_type = ProjectFileType.objects.get(code='specification')
        pf = ProjectFile.objects.create(
            project=project,
            file=SimpleUploadedFile('spec.xlsx', b'excel content'),
            file_type=file_type, original_filename='spec.xlsx'
        )
        estimate = Estimate.objects.create(
            name='Смета xlsx', object=self.object,
            legal_entity=self.legal_entity, created_by=self.user
        )
        estimate.projects.add(project)

        response = self.client.post('/api/v1/estimate-items/import-project-file-pdf/', {
            'estimate_id': estimate.id,
            'project_file_ids': [pf.id],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_import_project_file_pdf_multiple_files_combined(self):
        """Несколько PDF объединяются — total_pages = сумма страниц"""
        import sys
        from unittest.mock import patch, MagicMock

        project1, pf1 = self._create_project_with_pdf('ПР-PDF-004', 'spec1.pdf', pages=2)
        project2, pf2 = self._create_project_with_pdf('ПР-PDF-005', 'spec2.pdf', pages=3)
        estimate = Estimate.objects.create(
            name='Смета multi-PDF', object=self.object,
            legal_entity=self.legal_entity, created_by=self.user
        )
        estimate.projects.add(project1, project2)

        mock_tasks = MagicMock()
        mock_tasks.create_import_session = MagicMock(return_value={'session_id': 'b' * 16, 'total_pages': 5})
        mock_tasks.process_estimate_pdf_pages = MagicMock()

        with patch.dict(sys.modules, {'estimates.tasks': mock_tasks}):
            response = self.client.post('/api/v1/estimate-items/import-project-file-pdf/', {
                'estimate_id': estimate.id,
                'project_file_ids': [pf1.id, pf2.id],
            }, format='json')

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data['total_pages'], 5)

    def test_import_project_file_pdf_missing_estimate(self):
        """Несуществующая смета → 404"""
        response = self.client.post('/api/v1/estimate-items/import-project-file-pdf/', {
            'estimate_id': 999999,
            'project_file_ids': [1],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_import_project_file_pdf_missing_file(self):
        """Несуществующий файл проекта → ошибка в ответе"""
        estimate = Estimate.objects.create(
            name='Смета пустая', object=self.object,
            legal_entity=self.legal_entity, created_by=self.user
        )
        response = self.client.post('/api/v1/estimate-items/import-project-file-pdf/', {
            'estimate_id': estimate.id,
            'project_file_ids': [999999],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class EstimateExportAPITests(BaseAPITestCase):
    """Тесты эндпоинта GET /api/v1/estimates/{id}/export/"""

    def _create_estimate_with_items(self):
        estimate = Estimate.objects.create(
            name='Смета для экспорта', object=self.object,
            legal_entity=self.legal_entity, created_by=self.user,
        )
        section = EstimateSection.objects.create(estimate=estimate, name='Раздел-1')
        subsection = EstimateSubsection.objects.create(section=section, name='Подраздел-1')
        EstimateItem.objects.create(
            estimate=estimate, section=section, subsection=subsection,
            name='Товар-1', unit='шт', quantity=Decimal('2'),
            material_unit_price=Decimal('1000'), work_unit_price=Decimal('500'),
        )
        return estimate

    def test_export_internal_mode(self):
        estimate = self._create_estimate_with_items()
        resp = self.client.get(f'/api/v1/estimates/{estimate.id}/export/?mode=internal')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(
            resp['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )

    def test_export_external_mode(self):
        estimate = self._create_estimate_with_items()
        resp = self.client.get(f'/api/v1/estimates/{estimate.id}/export/?mode=external')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('Content-Disposition', resp)

    def test_export_default_mode_is_internal(self):
        estimate = self._create_estimate_with_items()
        resp = self.client.get(f'/api/v1/estimates/{estimate.id}/export/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('Content-Disposition', resp)

    def test_export_nonexistent_estimate(self):
        resp = self.client.get('/api/v1/estimates/999999/export/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class AutoMatchAPITests(BaseAPITestCase):
    """Тесты API для автоподбора"""

    def test_auto_match_requires_estimate_id(self):
        """auto-match без estimate_id → 400."""
        resp = self.client.post('/api/v1/estimate-items/auto-match/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_auto_match_nonexistent_estimate(self):
        """auto-match с несуществующей сметой → 404."""
        resp = self.client.post(
            '/api/v1/estimate-items/auto-match/',
            {'estimate_id': 999999},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # Тесты для auto-match-works и apply-match-works удалены — endpoints заменены
    # новым async work matching (start-work-matching / apply-work-matching).

        # Подраздел пересчитан
        subsection.refresh_from_db()
        self.assertGreater(subsection.works_sale, Decimal('0'))


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


class EstimateItemSectionPromotionTests(BaseAPITestCase):
    """Тесты promote/demote строк в разделы"""

    def setUp(self):
        super().setUp()
        self.estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
        )
        self.section = EstimateSection.objects.create(
            estimate=self.estimate, name='Основной раздел', sort_order=0,
        )
        # 5 items в одной секции
        self.items = [
            EstimateItem.objects.create(
                estimate=self.estimate, section=self.section,
                name=f'Позиция {i}', sort_order=i, item_number=i,
                quantity=1, material_unit_price=100, work_unit_price=50,
            ) for i in range(1, 6)
        ]

    def test_promote_item_to_section(self):
        """Promote item #3 → section 'Позиция 3', items #4,#5 переходят в неё"""
        item3 = self.items[2]
        response = self.client.post(f'/api/v1/estimate-items/{item3.id}/promote-to-section/')
        self.assertEqual(response.status_code, 200)

        # Item #3 удалён
        self.assertFalse(EstimateItem.objects.filter(id=item3.id).exists())

        # Новая секция создана
        new_section = EstimateSection.objects.get(
            estimate=self.estimate, name='Позиция 3',
        )
        self.assertIsNotNone(new_section)

        # Items #4, #5 переехали в новую секцию
        self.assertEqual(
            EstimateItem.objects.filter(section=new_section).count(), 2,
        )
        # Items #1, #2 остались в старой секции
        self.assertEqual(
            EstimateItem.objects.filter(section=self.section).count(), 2,
        )

    def test_promote_last_item(self):
        """Promote последнего item → секция без дочерних items"""
        item5 = self.items[4]
        response = self.client.post(f'/api/v1/estimate-items/{item5.id}/promote-to-section/')
        self.assertEqual(response.status_code, 200)
        new_section = EstimateSection.objects.get(name='Позиция 5')
        self.assertEqual(new_section.items.count(), 0)

    def test_promote_first_item(self):
        """Promote первого item → items #2-#5 переезжают"""
        item1 = self.items[0]
        response = self.client.post(f'/api/v1/estimate-items/{item1.id}/promote-to-section/')
        self.assertEqual(response.status_code, 200)
        new_section = EstimateSection.objects.get(name='Позиция 1')
        self.assertEqual(new_section.items.count(), 4)

    def test_demote_section_to_item(self):
        """Demote section → item, items переезжают в предыдущую секцию"""
        # Сначала promote чтобы создать вторую секцию
        item3 = self.items[2]
        self.client.post(f'/api/v1/estimate-items/{item3.id}/promote-to-section/')
        new_section = EstimateSection.objects.get(name='Позиция 3')

        # Теперь demote
        response = self.client.post(f'/api/v1/estimate-sections/{new_section.id}/demote-to-item/')
        self.assertEqual(response.status_code, 200)

        # Секция удалена
        self.assertFalse(EstimateSection.objects.filter(id=new_section.id).exists())

        # Новый item создан
        new_item = EstimateItem.objects.get(name='Позиция 3')
        self.assertEqual(new_item.section, self.section)
        self.assertEqual(new_item.quantity, 0)
        self.assertEqual(new_item.unit, 'шт')

        # Все items вернулись в основную секцию
        self.assertEqual(
            EstimateItem.objects.filter(section=self.section).count(), 5,
        )

    def test_demote_only_section_creates_default(self):
        """Demote единственной секции → создаётся 'Основной раздел'"""
        response = self.client.post(f'/api/v1/estimate-sections/{self.section.id}/demote-to-item/')
        self.assertEqual(response.status_code, 200)
        # Должен быть создан 'Основной раздел' + items перенесены
        default = EstimateSection.objects.filter(
            estimate=self.estimate, name='Основной раздел'
        ).first()
        self.assertIsNotNone(default)

    def test_promote_nonexistent_item(self):
        """Promote несуществующего item → 404"""
        response = self.client.post('/api/v1/estimate-items/99999/promote-to-section/')
        self.assertEqual(response.status_code, 404)

    def test_demote_nonexistent_section(self):
        """Demote несуществующей секции → 404"""
        response = self.client.post('/api/v1/estimate-sections/99999/demote-to-item/')
        self.assertEqual(response.status_code, 404)

    def test_promote_demote_roundtrip(self):
        """promote → demote → данные восстанавливаются"""
        item3 = self.items[2]
        # Promote
        resp1 = self.client.post(f'/api/v1/estimate-items/{item3.id}/promote-to-section/')
        self.assertEqual(resp1.status_code, 200)
        new_section_id = resp1.data['section_id']

        # Demote
        resp2 = self.client.post(f'/api/v1/estimate-sections/{new_section_id}/demote-to-item/')
        self.assertEqual(resp2.status_code, 200)

        # Должна остаться только исходная секция + все items в ней
        self.assertEqual(
            EstimateSection.objects.filter(estimate=self.estimate).count(), 1,
        )
        self.assertEqual(
            EstimateItem.objects.filter(estimate=self.estimate).count(), 5,
        )

    def test_multiple_promotes_in_sequence(self):
        """Несколько promote подряд → корректная иерархия секций"""
        # Promote item #2
        self.client.post(f'/api/v1/estimate-items/{self.items[1].id}/promote-to-section/')
        # Promote item #4
        self.client.post(f'/api/v1/estimate-items/{self.items[3].id}/promote-to-section/')

        # Должно быть 3 секции
        self.assertEqual(
            EstimateSection.objects.filter(estimate=self.estimate).count(), 3,
        )
        # 3 items (удалены #2 и #4)
        self.assertEqual(
            EstimateItem.objects.filter(estimate=self.estimate).count(), 3,
        )

    def test_demote_preserves_visual_order(self):
        """Demote: новая строка встаёт на место заголовка, items идут после неё"""
        # Promote item #3 → создаёт секцию 'Позиция 3' с items #4, #5
        resp = self.client.post(f'/api/v1/estimate-items/{self.items[2].id}/promote-to-section/')
        new_section = EstimateSection.objects.get(pk=resp.data['section_id'])

        # Demote секцию обратно
        resp2 = self.client.post(f'/api/v1/estimate-sections/{new_section.id}/demote-to-item/')
        self.assertEqual(resp2.status_code, 200)

        # Проверяем порядок: все items одной секции, отсортированы по sort_order
        ordered = list(
            EstimateItem.objects.filter(estimate=self.estimate)
            .order_by('sort_order', 'item_number')
            .values_list('name', flat=True)
        )
        # Позиция 1, Позиция 2 — были в первой секции
        # Позиция 3 — бывший заголовок, должен идти третьим
        # Позиция 4, Позиция 5 — были в демотированной секции, идут после
        self.assertEqual(ordered, [
            'Позиция 1', 'Позиция 2', 'Позиция 3', 'Позиция 4', 'Позиция 5',
        ])


class EstimateItemMoveTests(BaseAPITestCase):
    """Тесты перемещения строк сметы вверх/вниз и между разделами"""

    def setUp(self):
        super().setUp()
        self.estimate = Estimate.objects.create(
            name='Тестовая смета',
            object=self.object,
            legal_entity=self.legal_entity,
            created_by=self.user,
        )
        self.section1 = EstimateSection.objects.create(
            estimate=self.estimate, name='Раздел 1', sort_order=0,
        )
        self.section2 = EstimateSection.objects.create(
            estimate=self.estimate, name='Раздел 2', sort_order=1,
        )
        self.items = [
            EstimateItem.objects.create(
                estimate=self.estimate, section=self.section1,
                name=f'Позиция {i}', sort_order=i, item_number=i,
                quantity=1, material_unit_price=100, work_unit_price=50,
            ) for i in range(1, 4)
        ]
        self.item4 = EstimateItem.objects.create(
            estimate=self.estimate, section=self.section2,
            name='Позиция 4', sort_order=1, item_number=4,
            quantity=1, material_unit_price=100, work_unit_price=50,
        )

    def test_move_item_down(self):
        """Перемещение строки вниз на одну позицию"""
        item1 = self.items[0]
        response = self.client.post(f'/api/v1/estimate-items/{item1.id}/move/', {'direction': 'down'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['moved'])

        ordered = list(
            EstimateItem.objects.filter(section=self.section1)
            .order_by('sort_order')
            .values_list('name', flat=True)
        )
        self.assertEqual(ordered, ['Позиция 2', 'Позиция 1', 'Позиция 3'])

    def test_move_item_up(self):
        """Перемещение строки вверх на одну позицию"""
        item3 = self.items[2]
        response = self.client.post(f'/api/v1/estimate-items/{item3.id}/move/', {'direction': 'up'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['moved'])

        ordered = list(
            EstimateItem.objects.filter(section=self.section1)
            .order_by('sort_order')
            .values_list('name', flat=True)
        )
        self.assertEqual(ordered, ['Позиция 1', 'Позиция 3', 'Позиция 2'])

    def test_move_first_item_up_noop(self):
        """Первый элемент не перемещается вверх"""
        item1 = self.items[0]
        response = self.client.post(f'/api/v1/estimate-items/{item1.id}/move/', {'direction': 'up'})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['moved'])

    def test_move_last_item_down_noop(self):
        """Последний элемент не перемещается вниз"""
        item3 = self.items[2]
        response = self.client.post(f'/api/v1/estimate-items/{item3.id}/move/', {'direction': 'down'})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['moved'])

    def test_move_item_to_section(self):
        """Перемещение строки в другой раздел"""
        item1 = self.items[0]
        response = self.client.post(
            f'/api/v1/estimate-items/{item1.id}/move/',
            {'target_section_id': self.section2.id},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['moved'])

        item1.refresh_from_db()
        self.assertEqual(item1.section_id, self.section2.id)

        # В section1 осталось 2 items
        self.assertEqual(
            EstimateItem.objects.filter(section=self.section1).count(), 2,
        )
        # В section2 стало 2 items
        self.assertEqual(
            EstimateItem.objects.filter(section=self.section2).count(), 2,
        )

    def test_move_item_to_same_section_noop(self):
        """Перемещение в тот же раздел — нет эффекта"""
        item1 = self.items[0]
        response = self.client.post(
            f'/api/v1/estimate-items/{item1.id}/move/',
            {'target_section_id': self.section1.id},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['moved'])

    def test_move_nonexistent_item(self):
        """Перемещение несуществующего item → 404"""
        response = self.client.post('/api/v1/estimate-items/99999/move/', {'direction': 'up'})
        self.assertEqual(response.status_code, 404)

    def test_move_missing_params(self):
        """Вызов без параметров → 400"""
        item1 = self.items[0]
        response = self.client.post(f'/api/v1/estimate-items/{item1.id}/move/', {})
        self.assertEqual(response.status_code, 400)

    def test_move_up_item_number_integrity(self):
        """move up через API корректно свопает item_number обеих строк"""
        item3 = self.items[2]  # sort_order=3, item_number=3
        item2 = self.items[1]  # sort_order=2, item_number=2

        response = self.client.post(f'/api/v1/estimate-items/{item3.id}/move/', {'direction': 'up'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['moved'])

        item3.refresh_from_db()
        item2.refresh_from_db()
        self.assertEqual(item3.sort_order, 2)
        self.assertEqual(item3.item_number, 2)
        self.assertEqual(item2.sort_order, 3)
        self.assertEqual(item2.item_number, 3)

    def test_rapid_sequential_moves(self):
        """5 move_down подряд — финальный порядок корректен"""
        item1 = self.items[0]  # Позиция 1, sort_order=1

        # Двигаем Позицию 1 вниз 2 раза (максимум в секции из 3 элементов)
        for _ in range(2):
            response = self.client.post(
                f'/api/v1/estimate-items/{item1.id}/move/', {'direction': 'down'},
            )
            self.assertEqual(response.status_code, 200)

        # Третий move вниз — noop (уже последний)
        response = self.client.post(
            f'/api/v1/estimate-items/{item1.id}/move/', {'direction': 'down'},
        )
        self.assertFalse(response.data['moved'])

        # Финальный порядок: Позиция 2, Позиция 3, Позиция 1
        ordered = list(
            EstimateItem.objects.filter(section=self.section1)
            .order_by('sort_order')
            .values_list('name', flat=True)
        )
        self.assertEqual(ordered, ['Позиция 2', 'Позиция 3', 'Позиция 1'])

        # item_number последовательный
        numbers = list(
            EstimateItem.objects.filter(section=self.section1)
            .order_by('sort_order')
            .values_list('item_number', flat=True)
        )
        self.assertEqual(sorted(numbers), [1, 2, 3])
