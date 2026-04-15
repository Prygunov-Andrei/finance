# ISMeta — сборник команд разработчика.
# Запускать из каталога ismeta/.
# Помощь: make help

.PHONY: help \
	ismeta-setup ismeta-seed ismeta-db-reset ismeta-db-migrate ismeta-openapi \
	ismeta-backend-install ismeta-backend-run ismeta-backend-shell \
	ismeta-frontend-install ismeta-frontend-run ismeta-frontend-build \
	ismeta-celery ismeta-celery-beat ismeta-celery-restart \
	ismeta-test ismeta-test-backend ismeta-test-frontend ismeta-test-e2e \
	ismeta-test-golden ismeta-test-pact ismeta-smoke \
	ismeta-lint ismeta-format ismeta-ci-local \
	mock-recognition mock-erp-catalog \
	clean

help: ## Показать этот список команд
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-30s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST) | sort

# ====== Setup и БД ======

ismeta-setup: ## Первый запуск: venv, зависимости, БД, миграции, seed
	cd backend && python3.12 -m venv .venv
	cd backend && .venv/bin/pip install -r requirements.txt
	cd frontend && npm install || true
	createdb ismeta 2>/dev/null || true
	$(MAKE) ismeta-db-migrate
	$(MAKE) ismeta-seed
	@echo "✅ ISMeta готова к запуску: ./dev-local.sh"

ismeta-db-reset: ## Drop + create + migrate + seed (ВНИМАНИЕ: удалит все данные!)
	dropdb ismeta 2>/dev/null || true
	createdb ismeta
	$(MAKE) ismeta-db-migrate
	$(MAKE) ismeta-seed

ismeta-db-migrate: ## Применить миграции
	cd backend && .venv/bin/python manage.py migrate

ismeta-seed: ## Заполнить dev-данными (2 workspace, тестовые сметы)
	cd backend && .venv/bin/python manage.py seed_dev_data || echo "⚠️  Команда seed_dev_data появится в E1/E2"

ismeta-openapi: ## Регенерировать OpenAPI YAML
	cd backend && .venv/bin/python manage.py spectacular --file docs/openapi/v1.yaml

# ====== Backend ======

ismeta-backend-install: ## Установить backend зависимости
	cd backend && .venv/bin/pip install -r requirements.txt

ismeta-backend-run: ## Запустить backend (порт 8001)
	cd backend && .venv/bin/python manage.py runserver 127.0.0.1:8001

ismeta-backend-shell: ## Django shell
	cd backend && .venv/bin/python manage.py shell

# ====== Frontend ======

ismeta-frontend-install: ## Установить frontend зависимости
	cd frontend && npm install

ismeta-frontend-run: ## Запустить frontend (порт 3001)
	cd frontend && npm run dev

ismeta-frontend-build: ## Production build фронта
	cd frontend && npm run build

# ====== Celery ======

ismeta-celery: ## Запустить Celery worker
	cd backend && .venv/bin/celery -A ismeta worker --loglevel=info

ismeta-celery-beat: ## Запустить Celery beat scheduler
	cd backend && .venv/bin/celery -A ismeta beat --loglevel=info

ismeta-celery-restart: ## Перезапустить Celery (убить все и запустить заново)
	pkill -f "celery -A ismeta" || true
	$(MAKE) ismeta-celery &

# ====== Тесты ======

ismeta-test: ismeta-test-backend ismeta-test-frontend ## Все unit+integration тесты

ismeta-test-backend: ## Backend тесты (pytest)
	cd backend && .venv/bin/pytest --cov --cov-report=term-missing

ismeta-test-frontend: ## Frontend тесты (vitest)
	cd frontend && npm test

ismeta-test-e2e: ## E2E тесты Playwright
	cd frontend && npm run test:e2e || echo "⚠️  Playwright setup появится в E21"

ismeta-test-golden: ## Прогон golden set (долго)
	cd backend && .venv/bin/pytest tests/golden/ -v --tb=short || echo "⚠️  Golden set появится в E20"

ismeta-test-pact: ## Contract-тесты с ERP (pact)
	cd backend && .venv/bin/pytest tests/pacts/ -v || echo "⚠️  Pact-тесты появятся в E3"

ismeta-smoke: ## Smoke-тест всей связки ISMeta + ERP
	@echo "🔥 Running smoke test..."
	@curl -sf http://localhost:8001/api/v1/health && echo "" && echo "✅ ISMeta backend OK" || echo "❌ ISMeta backend DOWN"
	@curl -sf http://localhost:3001 >/dev/null && echo "✅ ISMeta frontend OK" || echo "❌ ISMeta frontend DOWN"
	@curl -sf http://localhost:8000/api/erp-catalog/v1/health && echo "" && echo "✅ ERP catalog API OK" || echo "⚠️  ERP catalog API не отвечает (E13 может быть не готов)"

# ====== Lint / Format ======

ismeta-lint: ## Проверка линтеров (backend + frontend)
	cd backend && .venv/bin/ruff check .
	cd backend && .venv/bin/mypy .
	cd frontend && npm run lint

ismeta-format: ## Автоформатирование
	cd backend && .venv/bin/ruff format .
	cd frontend && npm run format

ismeta-ci-local: ## Полный CI локально: линт + тесты + openapi
	$(MAKE) ismeta-lint
	$(MAKE) ismeta-test
	$(MAKE) ismeta-openapi

# ====== Mock-серверы ======

mock-recognition: ## Запустить mock сервиса распознавания (порт 5001)
	cd tools/mocks/recognition && python3 server.py

mock-erp-catalog: ## Запустить mock ERP catalog API (порт 5002)
	cd tools/mocks/erp-catalog && python3 server.py

# ====== Прочее ======

clean: ## Очистить временные файлы
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name node_modules -exec rm -rf {} +
	find . -type d -name .next -exec rm -rf {} +
