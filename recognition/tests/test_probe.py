"""Test POST /v1/probe — cheap PDF inspection without LLM."""

import io

import fitz


def _make_text_pdf(pages: int = 2, text_per_page: str = "Оборудование " * 20) -> bytes:
    doc = fitz.open()
    for _ in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), text_per_page)
    data = doc.tobytes()
    doc.close()
    return data


def _make_scanned_like_pdf(pages: int = 2) -> bytes:
    """PDF с одним png-изображением и без текстового слоя — имитация скана."""
    import base64

    # 1x1 png (red)
    png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    png_bytes = base64.b64decode(png_b64)
    doc = fitz.open()
    for _ in range(pages):
        page = doc.new_page()
        rect = fitz.Rect(0, 0, 100, 100)
        page.insert_image(rect, stream=png_bytes)
    data = doc.tobytes()
    doc.close()
    return data


def _make_mixed_pdf(rich_pages: int = 1, sparse_pages: int = 8) -> bytes:
    """Mixed PDF: N rich-text страниц + M sparse (<50 симв) — имитирует
    частично отсканированный документ (титул напечатан, остальное — сканы)."""
    doc = fitz.open()
    rich_text = "Equipment spec line " * 20  # ~400 симв > 50
    for _ in range(rich_pages):
        page = doc.new_page()
        page.insert_text((72, 72), rich_text)
    for _ in range(sparse_pages):
        page = doc.new_page()
        page.insert_text((72, 72), "WM")  # 2 симв < 50
    data = doc.tobytes()
    doc.close()
    return data


class TestProbeEndpoint:
    def test_happy_text_layer(self, client, auth_headers):
        pdf = _make_text_pdf(3)
        resp = client.post(
            "/v1/probe",
            files={"file": ("spec.pdf", io.BytesIO(pdf), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["pages_total"] == 3
        assert data["text_layer_pages"] == 3
        assert data["has_text_layer"] is True
        assert data["text_chars_total"] > 0
        assert data["estimated_seconds"] >= 1
        assert data["estimated_seconds"] <= 10

    def test_scanned_pdf_no_text_layer(self, client, auth_headers):
        pdf = _make_scanned_like_pdf(2)
        resp = client.post(
            "/v1/probe",
            files={"file": ("scan.pdf", io.BytesIO(pdf), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["pages_total"] == 2
        assert data["text_layer_pages"] == 0
        assert data["has_text_layer"] is False
        # vision path ~ 5s/page
        assert data["estimated_seconds"] >= 10

    def test_mixed_pdf_strict_has_text_layer(self, client, auth_headers):
        """Regression-test к QA #1: 1 rich + 8 sparse не должно считаться
        has_text_layer=True — иначе SpecParser уйдёт в Vision на 8 страницах,
        progress bar порвётся."""
        pdf = _make_mixed_pdf(rich_pages=1, sparse_pages=8)
        resp = client.post(
            "/v1/probe",
            files={"file": ("mixed.pdf", io.BytesIO(pdf), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["pages_total"] == 9
        assert data["text_layer_pages"] == 1
        assert data["has_text_layer"] is False
        # estimated_seconds = 2 + 0.1*1 + 5*8 = 42 (round)
        assert 40 <= data["estimated_seconds"] <= 45

    def test_missing_api_key_401(self, client):
        pdf = _make_text_pdf(1)
        resp = client.post(
            "/v1/probe",
            files={"file": ("spec.pdf", io.BytesIO(pdf), "application/pdf")},
        )
        assert resp.status_code == 401
        assert resp.json()["error"] == "invalid_api_key"

    def test_non_pdf_415(self, client, auth_headers):
        resp = client.post(
            "/v1/probe",
            files={"file": ("test.txt", io.BytesIO(b"not a pdf"), "text/plain")},
            headers=auth_headers,
        )
        assert resp.status_code == 415

    def test_bad_pdf_magic_415(self, client, auth_headers):
        resp = client.post(
            "/v1/probe",
            files={"file": ("test.pdf", io.BytesIO(b"NOT-A-PDF"), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 415

    def test_empty_file_400(self, client, auth_headers):
        resp = client.post(
            "/v1/probe",
            files={"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["error"] == "invalid_file"

    def test_missing_file_400(self, client, auth_headers):
        resp = client.post("/v1/probe", headers=auth_headers)
        assert resp.status_code == 400
