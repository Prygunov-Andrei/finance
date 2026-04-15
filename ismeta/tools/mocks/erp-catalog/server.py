"""
Mock ERP catalog API.
Порт 5002.
Не для production.
"""
import json
from pathlib import Path

from flask import Flask, jsonify, request

app = Flask(__name__)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _load(name: str):
    path = FIXTURES_DIR / f"{name}.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@app.route("/api/erp-catalog/v1/health")
def health():
    return {"status": "ok", "service": "erp-catalog-mock"}


@app.route("/api/erp-catalog/v1/products")
def list_products():
    products = _load("products")
    limit = int(request.args.get("limit", 100))
    return jsonify({"results": products[:limit], "next_cursor": None})


@app.route("/api/erp-catalog/v1/products/<product_id>")
def get_product(product_id):
    products = _load("products")
    product = next((p for p in products if p["id"] == product_id), None)
    if not product:
        return {"error": "not found"}, 404
    return product


@app.route("/api/erp-catalog/v1/products/<product_id>/price-history")
def product_price_history(product_id):
    history = _load("price-history")
    filtered = [h for h in history if h["product_id"] == product_id]
    return jsonify({"results": filtered})


@app.route("/api/erp-catalog/v1/work-items")
def list_work_items():
    work_items = _load("work-items")
    price_list_id = request.args.get("price_list_id")
    if price_list_id:
        work_items = [w for w in work_items if w.get("price_list_id") == price_list_id]
    return jsonify({"results": work_items, "next_cursor": None})


@app.route("/api/erp-catalog/v1/work-sections")
def list_work_sections():
    return jsonify({"results": _load("work-sections")})


@app.route("/api/erp-catalog/v1/worker-grades")
def list_worker_grades():
    return jsonify({"results": _load("worker-grades")})


@app.route("/api/erp-catalog/v1/counterparties")
def list_counterparties():
    counterparties = _load("counterparties")
    q = request.args.get("q", "").lower()
    if q:
        counterparties = [c for c in counterparties if q in c["name"].lower()]
    limit = int(request.args.get("limit", 20))
    return jsonify({"results": counterparties[:limit]})


@app.route("/api/erp-catalog/v1/legal-entities")
def list_legal_entities():
    return jsonify({"results": _load("legal-entities")})


@app.route("/api/erp-catalog/v1/objects")
def list_objects():
    return jsonify({"results": _load("objects"), "next_cursor": None})


@app.route("/api/erp-catalog/v1/currency-rates")
def currency_rates():
    return jsonify(_load("currency-rates") or {"USD": 92.5, "EUR": 99.3, "CNY": 12.7, "date": "2026-04-15"})


@app.route("/api/erp-catalog/v1/events")
def events():
    since_id = request.args.get("since_event_id")
    limit = int(request.args.get("limit", 100))
    all_events = _load("events")
    if since_id:
        idx = next((i for i, e in enumerate(all_events) if e["event_id"] == since_id), -1)
        all_events = all_events[idx + 1 :]
    return jsonify({"results": all_events[:limit], "latest_event_id": all_events[-1]["event_id"] if all_events else None})


if __name__ == "__main__":
    print("🔧 ERP catalog mock starting on http://localhost:5002")
    app.run(port=5002, debug=True)
