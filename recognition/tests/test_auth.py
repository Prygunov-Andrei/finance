"""Test X-API-Key authentication + error body format per specs §5."""

import io

import fitz


def _fake_pdf() -> io.BytesIO:
    doc = fitz.open()
    doc.new_page()
    data = doc.tobytes()
    doc.close()
    return io.BytesIO(data)


def test_missing_api_key_401(client):
    resp = client.post(
        "/v1/parse/spec",
        files={"file": ("test.pdf", _fake_pdf(), "application/pdf")},
    )
    assert resp.status_code == 401
    assert resp.json() == {"error": "invalid_api_key"}


def test_wrong_api_key_401(client):
    resp = client.post(
        "/v1/parse/spec",
        files={"file": ("test.pdf", _fake_pdf(), "application/pdf")},
        headers={"X-API-Key": "wrong-key"},
    )
    assert resp.status_code == 401
    assert resp.json() == {"error": "invalid_api_key"}


def test_valid_api_key_passes_auth(client, auth_headers):
    """Valid key passes auth — healthz is a safer probe than /parse/spec here."""
    resp = client.get("/v1/healthz", headers=auth_headers)
    assert resp.status_code == 200
