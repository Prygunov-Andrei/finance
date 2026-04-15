"""
Mock сервиса распознавания.
Запускается на порту 5001.
Не для production.
"""
import json
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, request

app = Flask(__name__)

FIXTURES_DIR = Path(__file__).parent / "fixtures"

SESSIONS: dict[str, dict] = {}


@app.route("/api/recognition/v1/health")
def health():
    return {"status": "ok", "service": "recognition-mock"}


@app.route("/api/recognition/v1/sessions", methods=["POST"])
def create_session():
    uploaded = request.files.getlist("file") or [request.files.get("file")]
    if not uploaded or not uploaded[0]:
        return {"error": "file is required"}, 400

    filename = uploaded[0].filename or ""
    fixture_name = _select_fixture(filename)
    session_id = str(uuid.uuid4())

    SESSIONS[session_id] = {
        "id": session_id,
        "status": "pending",
        "filename": filename,
        "fixture": fixture_name,
        "created_at": time.time(),
    }
    return {"session_id": session_id, "status": "pending"}, 201


@app.route("/api/recognition/v1/sessions/<session_id>", methods=["GET"])
def get_session(session_id):
    session = SESSIONS.get(session_id)
    if not session:
        return {"error": "not found"}, 404

    # через 2 секунды после создания считаем done
    if time.time() - session["created_at"] > 2 and session["status"] == "pending":
        session["status"] = "done"

    return {
        "id": session_id,
        "status": session["status"],
        "filename": session["filename"],
    }


@app.route("/api/recognition/v1/sessions/<session_id>/result", methods=["GET"])
def get_result(session_id):
    session = SESSIONS.get(session_id)
    if not session:
        return {"error": "not found"}, 404

    # форсим done для упрощения
    fixture_path = FIXTURES_DIR / session["fixture"]
    if not fixture_path.exists():
        # fallback — vent-20
        fixture_path = FIXTURES_DIR / "vent-20.json"

    with open(fixture_path, encoding="utf-8") as f:
        return jsonify(json.load(f))


@app.route("/api/recognition/v1/sessions/<session_id>/cancel", methods=["POST"])
def cancel_session(session_id):
    session = SESSIONS.get(session_id)
    if not session:
        return {"error": "not found"}, 404
    session["status"] = "cancelled"
    return {"id": session_id, "status": "cancelled"}


def _select_fixture(filename: str) -> str:
    """Выбрать фикстуру по паттерну в имени файла."""
    lower = filename.lower()
    if "cond" in lower or "конд" in lower:
        return "cond-50.json"
    if "mixed" in lower or "200" in lower:
        return "mixed-200.json"
    return "vent-20.json"


if __name__ == "__main__":
    print("🔧 Recognition mock starting on http://localhost:5001")
    print("   Endpoints: /api/recognition/v1/sessions[/:id[/result|/cancel]]")
    app.run(port=5001, debug=True)
