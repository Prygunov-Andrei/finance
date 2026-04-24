"""Тесты PDF import — вызов Recognition Service (E15.02b).

Проверяем:
- apply_parsed_items (unit): section/section_name маппинг, skip пустых имён.
- endpoint /api/v1/estimates/{id}/import/pdf/ — happy / partial / 401 / 413.
"""

import httpx
import pytest
import respx
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.estimate.models import Estimate, EstimateItem, EstimateSection
from apps.estimate.services.pdf_import_service import apply_parsed_items
from apps.workspace.models import Workspace

User = get_user_model()
WS_HEADER = "HTTP_X_WORKSPACE_ID"


# Recognition-style response — полный контракт §1.
SPEC_OK = {
    "status": "done",
    "items": [
        {"name": "Дефлектор Цаги ф355", "model_name": "ДВЦ-355", "brand": "Цаги",
         "unit": "шт", "quantity": 58, "tech_specs": "",
         "section_name": "Вентиляция", "page_number": 1, "sort_order": 0},
        {"name": "Воздуховод прямоугольный 200x200", "model_name": "", "brand": "",
         "unit": "м.п.", "quantity": 850, "tech_specs": "",
         "section_name": "Вентиляция", "page_number": 1, "sort_order": 1},
        {"name": "Вентилятор канальный WNK 100", "model_name": "WNK-100", "brand": "Корф",
         "unit": "шт", "quantity": 10, "tech_specs": "",
         "section_name": "МОП", "page_number": 2, "sort_order": 2},
        {"name": "Огнезадерживающий клапан EI60", "model_name": "", "brand": "",
         "unit": "шт", "quantity": 2, "tech_specs": "",
         "section_name": "МОП", "page_number": 2, "sort_order": 3},
    ],
    "errors": [],
    "pages_stats": {"total": 5, "processed": 4, "skipped": 1, "error": 0},
}


RECOGNITION_URL = "http://recognition:8003"


@pytest.fixture()
def ws():
    return Workspace.objects.create(name="WS-PDF", slug="ws-pdf")


@pytest.fixture()
def user():
    return User.objects.create_user(username="pdf-user", password="pass")


@pytest.fixture()
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture()
def estimate(ws, user):
    return Estimate.objects.create(
        workspace=ws, name="PDF test",
        default_material_markup={"type": "percent", "value": 30},
        default_work_markup={"type": "percent", "value": 300},
        created_by=user,
    )


@pytest.fixture(autouse=True)
def _configure_recognition(settings):
    settings.RECOGNITION_URL = RECOGNITION_URL
    settings.RECOGNITION_API_KEY = "test-key"


@pytest.mark.django_db
class TestApplyParsedItems:
    def test_apply_creates_sections_and_items_from_section_name(self, estimate, ws):
        """Recognition items используют section_name (§1)."""
        result = apply_parsed_items(str(estimate.id), str(ws.id), SPEC_OK["items"])
        assert result["created"] == 4
        assert result["sections"] == 2
        sections = EstimateSection.objects.filter(estimate=estimate)
        assert set(sections.values_list("name", flat=True)) == {"Вентиляция", "МОП"}
        # model_name/brand не отдельные колонки в EstimateItem — кладём в tech_specs.
        item = EstimateItem.objects.filter(
            estimate=estimate, name="Вентилятор канальный WNK 100"
        ).first()
        assert item is not None
        assert item.tech_specs.get("model_name") == "WNK-100"
        assert item.tech_specs.get("brand") == "Корф"
        assert item.tech_specs.get("source_page") == 2

    def test_apply_falls_back_to_legacy_section_key(self, estimate, ws):
        """Legacy fallback: если item.section_name отсутствует, читаем item.section."""
        items = [{"name": "Позиция", "unit": "шт", "quantity": 1, "section": "Legacy"}]
        result = apply_parsed_items(str(estimate.id), str(ws.id), items)
        assert result["created"] == 1
        assert EstimateSection.objects.filter(
            estimate=estimate, name="Legacy"
        ).exists()

    def test_apply_skips_empty_names(self, estimate, ws):
        items = [{"name": "", "unit": "шт", "quantity": 1, "section_name": "Test"}]
        result = apply_parsed_items(str(estimate.id), str(ws.id), items)
        assert result["created"] == 0

    def test_apply_propagates_comments_to_tech_specs(self, estimate, ws):
        """E15.04: Recognition отдаёт item.comments — проксируем в
        tech_specs.comments (UI-04 читает именно эту ветку JSON)."""
        items = [
            {
                "name": "Огнезащитная клеящая смесь",
                "model_name": "Kleber",
                "unit": "кг",
                "quantity": 4900,
                "section_name": "Вентиляция",
                "page_number": 1,
                "comments": "1кг на 1м2",
            }
        ]
        result = apply_parsed_items(str(estimate.id), str(ws.id), items)
        assert result["created"] == 1
        item = EstimateItem.objects.filter(
            estimate=estimate, name="Огнезащитная клеящая смесь"
        ).first()
        assert item is not None
        assert item.tech_specs.get("comments") == "1кг на 1м2"
        assert item.tech_specs.get("model_name") == "Kleber"

    def test_apply_propagates_manufacturer_to_tech_specs(self, estimate, ws):
        """E15.05 it2 (R22): Recognition отдаёт item.manufacturer — проксируем
        в tech_specs.manufacturer отдельно от brand (это разные колонки ЕСКД:
        brand = торговая марка, manufacturer = завод-изготовитель)."""
        items = [
            {
                "name": "Комплект автоматизации П1",
                "brand": "",
                "manufacturer": 'ООО "КОРФ"',
                "unit": "шт.",
                "quantity": 1,
                "section_name": "Оборудование автоматизации",
                "page_number": 1,
            }
        ]
        result = apply_parsed_items(str(estimate.id), str(ws.id), items)
        assert result["created"] == 1
        item = EstimateItem.objects.filter(
            estimate=estimate, name="Комплект автоматизации П1"
        ).first()
        assert item is not None
        assert item.tech_specs.get("manufacturer") == 'ООО "КОРФ"'
        # brand пуст — в tech_specs его быть не должно.
        assert "brand" not in item.tech_specs

    def test_apply_no_comments_field_leaves_tech_specs_unset(self, estimate, ws):
        """Обратная совместимость: items без comments не создают ключ в JSON
        (чтобы не засорять tech_specs пустыми строками)."""
        items = [
            {
                "name": "Воздуховод",
                "unit": "м.п.",
                "quantity": 100,
                "section_name": "Вентиляция",
            }
        ]
        apply_parsed_items(str(estimate.id), str(ws.id), items)
        item = EstimateItem.objects.filter(estimate=estimate, name="Воздуховод").first()
        assert item is not None
        assert "comments" not in item.tech_specs

    def test_apply_truncates_oversized_name(self, estimate, ws, caplog):
        """E15.03-hotfix: name >500 символов обрезается до 500 + warning,
        а не падает с VARCHAR overflow на весь import."""
        import logging

        long_name = "Вентилятор канальный " + "ТТХ " * 200  # ~820 символов
        assert len(long_name) > 500
        items = [
            {
                "name": long_name,
                "unit": "шт",
                "quantity": 1,
                "section_name": "Вентиляция",
                "page_number": 3,
            }
        ]
        with caplog.at_level(logging.WARNING, logger="apps.estimate.services.pdf_import_service"):
            result = apply_parsed_items(str(estimate.id), str(ws.id), items)
        assert result["created"] == 1
        item = EstimateItem.objects.get(estimate=estimate)
        assert len(item.name) == 500
        assert item.name == long_name[:500]
        assert any("truncated" in rec.message for rec in caplog.records), (
            f"expected warning with 'truncated': {[r.message for r in caplog.records]}"
        )


@pytest.mark.django_db
class TestPDFImportEndpoint:
    URL = "/api/v1/estimates/{}/import/pdf/"

    def _pdf_file(self):
        return SimpleUploadedFile("spec.pdf", b"%PDF-fake", content_type="application/pdf")

    def test_happy_path(self, client, estimate, ws):
        with respx.mock() as mock:
            mock.post(f"{RECOGNITION_URL}/v1/parse/spec").mock(
                return_value=httpx.Response(200, json=SPEC_OK)
            )
            resp = client.post(
                self.URL.format(estimate.id),
                {"file": self._pdf_file()},
                format="multipart",
                **{WS_HEADER: str(ws.id)},
            )
        assert resp.status_code == 200
        assert resp.data["created"] == 4
        assert resp.data["sections"] == 2
        assert resp.data["pages_total"] == 5
        assert resp.data["pages_processed"] == 4
        assert resp.data["errors"] == []

    def test_partial_status_propagates_errors(self, client, estimate, ws):
        partial = dict(SPEC_OK)
        partial["status"] = "partial"
        partial["errors"] = ["Page 3: extract failed"]
        partial["pages_stats"] = {"total": 5, "processed": 3, "skipped": 1, "error": 1}
        with respx.mock() as mock:
            mock.post(f"{RECOGNITION_URL}/v1/parse/spec").mock(
                return_value=httpx.Response(200, json=partial)
            )
            resp = client.post(
                self.URL.format(estimate.id),
                {"file": self._pdf_file()},
                format="multipart",
                **{WS_HEADER: str(ws.id)},
            )
        assert resp.status_code == 200
        # items всё равно создаются
        assert resp.data["created"] == 4
        assert resp.data["errors"] == ["Page 3: extract failed"]
        assert resp.data["pages_processed"] == 3

    def test_pages_summary_passthrough(self, client, estimate, ws):
        """TD-02 (3): pages_summary из Recognition должен попадать в response
        import/pdf — блокирует UI-10 warning suspicious pages."""
        with_summary = dict(SPEC_OK)
        with_summary["pages_summary"] = [
            {"page": 1, "expected_count": 20, "parsed_count": 20,
             "retried": False, "suspicious": False},
            {"page": 2, "expected_count": 25, "expected_count_vision": 27,
             "parsed_count": 22, "retried": True, "suspicious": True},
        ]
        with respx.mock() as mock:
            mock.post(f"{RECOGNITION_URL}/v1/parse/spec").mock(
                return_value=httpx.Response(200, json=with_summary)
            )
            resp = client.post(
                self.URL.format(estimate.id),
                {"file": self._pdf_file()},
                format="multipart",
                **{WS_HEADER: str(ws.id)},
            )
        assert resp.status_code == 200
        assert resp.data["pages_summary"] == with_summary["pages_summary"]
        # Поле включено даже когда items есть (не только в empty-ветке).
        assert resp.data["created"] == 4

    def test_pages_summary_empty_items_branch(self, client, estimate, ws):
        """pages_summary также пробрасывается когда items пустые."""
        empty = {
            "status": "error",
            "items": [],
            "errors": ["Не распознано"],
            "pages_stats": {"total": 1, "processed": 0, "skipped": 0, "error": 1},
            "pages_summary": [
                {"page": 1, "expected_count": 10, "parsed_count": 0,
                 "retried": True, "suspicious": True},
            ],
        }
        with respx.mock() as mock:
            mock.post(f"{RECOGNITION_URL}/v1/parse/spec").mock(
                return_value=httpx.Response(200, json=empty)
            )
            resp = client.post(
                self.URL.format(estimate.id),
                {"file": self._pdf_file()},
                format="multipart",
                **{WS_HEADER: str(ws.id)},
            )
        assert resp.status_code == 200
        assert resp.data["created"] == 0
        assert resp.data["pages_summary"] == empty["pages_summary"]

    def test_pages_summary_absent_defaults_to_empty_list(self, client, estimate, ws):
        """Если Recognition не вернул pages_summary — ключ = []."""
        with respx.mock() as mock:
            mock.post(f"{RECOGNITION_URL}/v1/parse/spec").mock(
                return_value=httpx.Response(200, json=SPEC_OK)
            )
            resp = client.post(
                self.URL.format(estimate.id),
                {"file": self._pdf_file()},
                format="multipart",
                **{WS_HEADER: str(ws.id)},
            )
        assert resp.status_code == 200
        assert resp.data["pages_summary"] == []

    def test_no_items_returns_empty_with_error_msg(self, client, estimate, ws):
        empty = {"status": "error", "items": [], "errors": ["Не распознано"],
                 "pages_stats": {"total": 1, "processed": 0, "skipped": 0, "error": 1}}
        with respx.mock() as mock:
            mock.post(f"{RECOGNITION_URL}/v1/parse/spec").mock(
                return_value=httpx.Response(200, json=empty)
            )
            resp = client.post(
                self.URL.format(estimate.id),
                {"file": self._pdf_file()},
                format="multipart",
                **{WS_HEADER: str(ws.id)},
            )
        assert resp.status_code == 200
        assert resp.data["created"] == 0
        assert resp.data["sections"] == 0
        assert resp.data["errors"] == ["Не распознано"]

    def test_401_from_recognition_returns_502(self, client, estimate, ws):
        with respx.mock() as mock:
            mock.post(f"{RECOGNITION_URL}/v1/parse/spec").mock(
                return_value=httpx.Response(401, json={"error": "invalid_api_key"})
            )
            resp = client.post(
                self.URL.format(estimate.id),
                {"file": self._pdf_file()},
                format="multipart",
                **{WS_HEADER: str(ws.id)},
            )
        assert resp.status_code == 502
        assert resp.data["code"] == "invalid_api_key"

    def test_502_llm_unavailable_returns_502(self, client, estimate, ws):
        with respx.mock() as mock:
            mock.post(f"{RECOGNITION_URL}/v1/parse/spec").mock(
                return_value=httpx.Response(
                    502, json={"error": "llm_unavailable", "retry_after_sec": 30}
                )
            )
            resp = client.post(
                self.URL.format(estimate.id),
                {"file": self._pdf_file()},
                format="multipart",
                **{WS_HEADER: str(ws.id)},
            )
        assert resp.status_code == 502
        assert resp.data["code"] == "llm_unavailable"

    def test_missing_workspace_400(self, client, estimate):
        resp = client.post(
            self.URL.format(estimate.id),
            {"file": self._pdf_file()},
            format="multipart",
        )
        assert resp.status_code == 400

    def test_non_pdf_400(self, client, estimate, ws):
        txt = SimpleUploadedFile("x.txt", b"not pdf", content_type="text/plain")
        resp = client.post(
            self.URL.format(estimate.id),
            {"file": txt},
            format="multipart",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 400


@pytest.mark.django_db
class TestProbePDFEndpoint:
    """POST /api/v1/estimates/{id}/probe/pdf/ — прокси в Recognition /v1/probe (E15.03)."""

    URL = "/api/v1/estimates/{}/probe/pdf/"
    PROBE_OK = {
        "pages_total": 9,
        "text_layer_pages": 9,
        "has_text_layer": True,
        "text_chars_total": 12985,
        "estimated_seconds": 3,
    }

    def _pdf_file(self):
        return SimpleUploadedFile("spec.pdf", b"%PDF-fake", content_type="application/pdf")

    def test_happy_returns_probe_dict(self, client, estimate, ws):
        with respx.mock() as mock:
            route = mock.post(f"{RECOGNITION_URL}/v1/probe").mock(
                return_value=httpx.Response(200, json=self.PROBE_OK)
            )
            resp = client.post(
                self.URL.format(estimate.id),
                {"file": self._pdf_file()},
                format="multipart",
                **{WS_HEADER: str(ws.id)},
            )
        assert route.called
        assert resp.status_code == 200
        assert resp.data == self.PROBE_OK

    def test_missing_workspace_400(self, client, estimate):
        resp = client.post(
            self.URL.format(estimate.id),
            {"file": self._pdf_file()},
            format="multipart",
        )
        assert resp.status_code == 400

    def test_missing_file_400(self, client, estimate, ws):
        resp = client.post(
            self.URL.format(estimate.id),
            format="multipart",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 400

    def test_non_pdf_400(self, client, estimate, ws):
        txt = SimpleUploadedFile("x.txt", b"not pdf", content_type="text/plain")
        resp = client.post(
            self.URL.format(estimate.id),
            {"file": txt},
            format="multipart",
            **{WS_HEADER: str(ws.id)},
        )
        assert resp.status_code == 400

    def test_recognition_415_returns_502(self, client, estimate, ws):
        with respx.mock() as mock:
            mock.post(f"{RECOGNITION_URL}/v1/probe").mock(
                return_value=httpx.Response(
                    415, json={"error": "unsupported_media_type", "detail": "bad magic"}
                )
            )
            resp = client.post(
                self.URL.format(estimate.id),
                {"file": self._pdf_file()},
                format="multipart",
                **{WS_HEADER: str(ws.id)},
            )
        assert resp.status_code == 502
        assert resp.data["code"] == "unsupported_media_type"

    def test_recognition_unavailable_network_502(self, client, estimate, ws):
        with respx.mock() as mock:
            mock.post(f"{RECOGNITION_URL}/v1/probe").mock(
                side_effect=httpx.ConnectError("Connection refused")
            )
            resp = client.post(
                self.URL.format(estimate.id),
                {"file": self._pdf_file()},
                format="multipart",
                **{WS_HEADER: str(ws.id)},
            )
        assert resp.status_code == 502
        assert resp.data["code"] == "network_error"
