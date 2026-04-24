"""API-тесты Estimate CRUD (E4.1)."""

import json
import uuid

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.estimate.models import Estimate, EstimateItem, EstimateSection
from apps.estimate.services.estimate_service import EstimateService
from apps.workspace.models import Workspace

User = get_user_model()


@pytest.fixture()
def user():
    return User.objects.create_user(username="apiuser", password="pass")


@pytest.fixture()
def ws_a():
    return Workspace.objects.create(name="WS-A", slug="ws-a-api")


@pytest.fixture()
def ws_b():
    return Workspace.objects.create(name="WS-B", slug="ws-b-api")


@pytest.fixture()
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture()
def estimate_a(ws_a, user):
    return Estimate.objects.create(workspace=ws_a, name="Смета A", created_by=user)


@pytest.fixture()
def section_a(estimate_a, ws_a):
    return EstimateSection.objects.create(
        estimate=estimate_a, workspace=ws_a, name="Вентиляция", sort_order=1
    )


@pytest.fixture()
def item_a(section_a, estimate_a, ws_a):
    return EstimateService.create_item(
        section_a, estimate_a, ws_a.id,
        {"name": "Вентилятор", "unit": "шт", "quantity": 4}
    )


WS_HEADER = "HTTP_X_WORKSPACE_ID"


@pytest.mark.django_db
class TestEstimateCRUD:
    def test_create_estimate(self, client, ws_a):
        resp = client.post(
            "/api/v1/estimates/",
            {"name": "Новая смета", "folder_name": "Офис"},
            format="json",
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 201
        assert resp.data["name"] == "Новая смета"
        assert resp.data["status"] == "draft"

    def test_list_estimates(self, client, ws_a, estimate_a):
        resp = client.get("/api/v1/estimates/", **{WS_HEADER: str(ws_a.id)})
        assert resp.status_code == 200
        assert len(resp.data) == 1
        assert resp.data[0]["name"] == "Смета A"

    def test_retrieve_estimate(self, client, ws_a, estimate_a):
        resp = client.get(f"/api/v1/estimates/{estimate_a.id}/", **{WS_HEADER: str(ws_a.id)})
        assert resp.status_code == 200
        assert resp.data["name"] == "Смета A"
        assert "version" in resp.data

    def test_update_estimate(self, client, ws_a, estimate_a):
        resp = client.patch(
            f"/api/v1/estimates/{estimate_a.id}/",
            {"name": "Обновлённая"},
            format="json",
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 200
        assert resp.data["name"] == "Обновлённая"

    def test_archive_estimate(self, client, ws_a, estimate_a):
        resp = client.delete(
            f"/api/v1/estimates/{estimate_a.id}/", **{WS_HEADER: str(ws_a.id)}
        )
        assert resp.status_code == 204
        estimate_a.refresh_from_db()
        assert estimate_a.status == "archived"

    # TD-02 (#29): свободная заметка PO к смете — «стикер».
    def test_note_default_empty(self, client, ws_a, estimate_a):
        resp = client.get(
            f"/api/v1/estimates/{estimate_a.id}/", **{WS_HEADER: str(ws_a.id)}
        )
        assert resp.status_code == 200
        assert resp.data["note"] == ""

    def test_patch_note_persists(self, client, ws_a, estimate_a):
        resp = client.patch(
            f"/api/v1/estimates/{estimate_a.id}/",
            {"note": "Позвонить Иванову по БП-2 после 15:00"},
            format="json",
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 200
        assert resp.data["note"] == "Позвонить Иванову по БП-2 после 15:00"
        estimate_a.refresh_from_db()
        assert estimate_a.note == "Позвонить Иванову по БП-2 после 15:00"

    def test_patch_note_overwrites_no_history(self, client, ws_a, estimate_a):
        """PO спец: история не хранится, value перезаписывается."""
        client.patch(
            f"/api/v1/estimates/{estimate_a.id}/",
            {"note": "первая версия"},
            format="json",
            **{WS_HEADER: str(ws_a.id)},
        )
        resp = client.patch(
            f"/api/v1/estimates/{estimate_a.id}/",
            {"note": "вторая"},
            format="json",
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 200
        estimate_a.refresh_from_db()
        assert estimate_a.note == "вторая"

    def test_patch_note_empty_string(self, client, ws_a, estimate_a):
        estimate_a.note = "что-то"
        estimate_a.save(update_fields=["note"])
        resp = client.patch(
            f"/api/v1/estimates/{estimate_a.id}/",
            {"note": ""},
            format="json",
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 200
        estimate_a.refresh_from_db()
        assert estimate_a.note == ""

    def test_patch_note_cap_5000_chars(self, client, ws_a, estimate_a):
        """Cap на 5000 символов — 422/400 при превышении."""
        resp = client.patch(
            f"/api/v1/estimates/{estimate_a.id}/",
            {"note": "x" * 5001},
            format="json",
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 400
        # поле упомянуто в ошибке
        assert "note" in resp.data

    def test_patch_note_cap_boundary_5000_ok(self, client, ws_a, estimate_a):
        resp = client.patch(
            f"/api/v1/estimates/{estimate_a.id}/",
            {"note": "y" * 5000},
            format="json",
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 200
        estimate_a.refresh_from_db()
        assert len(estimate_a.note) == 5000


@pytest.mark.django_db
class TestSectionCRUD:
    def test_create_section(self, client, ws_a, estimate_a):
        resp = client.post(
            f"/api/v1/estimates/{estimate_a.id}/sections/",
            {"name": "Кондиционирование", "sort_order": 2},
            format="json",
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 201
        assert resp.data["name"] == "Кондиционирование"

    def test_list_sections(self, client, ws_a, estimate_a, section_a):
        resp = client.get(
            f"/api/v1/estimates/{estimate_a.id}/sections/",
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 200
        assert len(resp.data) == 1

    def test_update_section(self, client, ws_a, section_a):
        resp = client.patch(
            f"/api/v1/sections/{section_a.id}/",
            {"name": "Воздуховоды (обновлено)"},
            format="json",
            HTTP_IF_MATCH=str(section_a.version),
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 200
        assert resp.data["name"] == "Воздуховоды (обновлено)"

    def test_delete_section(self, client, ws_a, section_a):
        resp = client.delete(
            f"/api/v1/sections/{section_a.id}/", **{WS_HEADER: str(ws_a.id)}
        )
        assert resp.status_code == 204


@pytest.mark.django_db
class TestItemCRUD:
    def test_create_item(self, client, ws_a, estimate_a, section_a):
        resp = client.post(
            f"/api/v1/estimates/{estimate_a.id}/items/",
            {"section_id": str(section_a.id), "name": "Датчик дыма", "quantity": 10},
            format="json",
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 201
        assert resp.data["name"] == "Датчик дыма"

    def test_list_items(self, client, ws_a, estimate_a, item_a):
        resp = client.get(
            f"/api/v1/estimates/{estimate_a.id}/items/",
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 200
        assert len(resp.data) == 1

    def test_update_item_optimistic_lock(self, client, ws_a, item_a):
        resp = client.patch(
            f"/api/v1/items/{item_a.id}/",
            {"name": "Вентилятор обновлённый"},
            format="json",
            HTTP_IF_MATCH=str(item_a.version),
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 200
        assert resp.data["name"] == "Вентилятор обновлённый"
        assert resp["ETag"] == str(item_a.version + 1)

    def test_delete_section_with_items_returns_409(self, client, ws_a, section_a, item_a):
        """UI-09 data-loss guard: DELETE section с живыми items → 409."""
        resp = client.delete(
            f"/api/v1/sections/{section_a.id}/",
            HTTP_IF_MATCH=str(section_a.version),
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 409
        assert resp.data["items_count"] == 1
        assert EstimateSection.objects.filter(id=section_a.id).count() == 1
        assert EstimateItem.all_objects.filter(id=item_a.id).count() == 1

    def test_delete_section_with_force_bypasses_guard(self, client, ws_a, section_a, item_a):
        """?force=true — осознанное каскадное удаление с items."""
        resp = client.delete(
            f"/api/v1/sections/{section_a.id}/?force=true",
            HTTP_IF_MATCH=str(section_a.version),
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 204

    def test_delete_empty_section_ok(self, client, ws_a, estimate_a):
        """DELETE пустой секции — 204 без guard."""
        empty = EstimateSection.objects.create(
            estimate=estimate_a, workspace=ws_a, name="Пусто", sort_order=99
        )
        resp = client.delete(
            f"/api/v1/sections/{empty.id}/",
            HTTP_IF_MATCH=str(empty.version),
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 204

    def test_patch_item_section_moves_item(self, client, ws_a, estimate_a, section_a, item_a):
        """UI-09 Move Items / Merge Sections: PATCH {section: id} должен
        реально менять section_id в БД. Без fix — section_id игнорировался,
        и последующий DELETE source section каскадно удалял items.
        """
        other_section = EstimateSection.objects.create(
            estimate=estimate_a, workspace=ws_a, name="Электрика", sort_order=2
        )
        resp = client.patch(
            f"/api/v1/items/{item_a.id}/",
            {"section": str(other_section.id)},
            format="json",
            HTTP_IF_MATCH=str(item_a.version),
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 200
        item_a.refresh_from_db()
        assert str(item_a.section_id) == str(other_section.id), (
            "PATCH {section: X} должен менять section_id в БД"
        )

    def test_soft_delete_item(self, client, ws_a, item_a):
        resp = client.delete(
            f"/api/v1/items/{item_a.id}/",
            HTTP_IF_MATCH=str(item_a.version),
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 204
        assert EstimateItem.objects.filter(id=item_a.id).count() == 0
        assert EstimateItem.all_objects.filter(id=item_a.id).count() == 1


@pytest.mark.django_db
class TestOptimisticLock409:
    def test_stale_version_returns_409(self, client, ws_a, item_a):
        resp = client.patch(
            f"/api/v1/items/{item_a.id}/",
            {"name": "Первое обновление"},
            format="json",
            HTTP_IF_MATCH=str(item_a.version),
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 200

        resp2 = client.patch(
            f"/api/v1/items/{item_a.id}/",
            {"name": "Устаревшее обновление"},
            format="json",
            HTTP_IF_MATCH=str(item_a.version),  # stale
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp2.status_code == 409


@pytest.mark.django_db
class TestMultiTenancyAPI:
    def test_workspace_isolation(self, client, ws_a, ws_b, estimate_a):
        Estimate.objects.create(workspace=ws_b, name="Смета B")

        resp_a = client.get("/api/v1/estimates/", **{WS_HEADER: str(ws_a.id)})
        resp_b = client.get("/api/v1/estimates/", **{WS_HEADER: str(ws_b.id)})

        names_a = {e["name"] for e in resp_a.data}
        names_b = {e["name"] for e in resp_b.data}

        assert "Смета A" in names_a
        assert "Смета B" not in names_a
        assert "Смета B" in names_b
        assert "Смета A" not in names_b


@pytest.mark.django_db
class TestCreateVersion:
    def test_create_version_copies_all(self, client, ws_a, estimate_a, section_a, item_a):
        resp = client.post(
            f"/api/v1/estimates/{estimate_a.id}/create-version/",
            **{WS_HEADER: str(ws_a.id)},
        )
        assert resp.status_code == 201
        assert resp.data["version_number"] == 2
        assert str(resp.data["parent_version"]) == str(estimate_a.id)

        new_id = resp.data["id"]
        new_sections = EstimateSection.objects.filter(estimate_id=new_id)
        assert new_sections.count() == 1
        assert new_sections.first().parent_version_section_id == section_a.id

        new_items = EstimateItem.objects.filter(estimate_id=new_id, workspace_id=ws_a.id)
        assert new_items.count() == 1
        assert new_items.first().source_item_id == item_a.id
