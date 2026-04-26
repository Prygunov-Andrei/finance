#!/bin/bash
set -euo pipefail

echo "=========================================="
echo "Full Deployment Script"
echo "=========================================="
echo ""

# Проверка что мы на сервере
if [ ! -d "/opt/finans_assistant" ]; then
    echo "Error: /opt/finans_assistant does not exist!"
    echo "Please run this script on the production server."
    exit 1
fi

cd /opt/finans_assistant

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
COMPOSE=(docker compose -f docker-compose.prod.yml)

wait_for_http() {
    local url="$1"
    local label="$2"
    local attempts="${3:-30}"
    local delay="${4:-2}"

    for ((i=1; i<=attempts; i++)); do
        if curl -fsS "$url" >/dev/null 2>&1; then
            echo -e "${GREEN}${label} OK${NC}"
            return 0
        fi
        sleep "$delay"
    done

    echo -e "${RED}${label} failed: ${url}${NC}"
    return 1
}

run_backend_check() {
    local description="$1"
    shift
    echo -e "${GREEN}${description}${NC}"
    "${COMPOSE[@]}" exec -T backend "$@"
}

echo -e "${GREEN}[1/9] Syncing application code...${NC}"
if [ "${SKIP_GIT_PULL:-0}" = "1" ]; then
    echo -e "${YELLOW}SKIP_GIT_PULL=1, using current server workspace without git pull.${NC}"
else
    git pull origin main
fi

echo -e "${GREEN}[1.5/9] Computing release version...${NC}"
git fetch --tags --prune origin 2>/dev/null || echo -e "${YELLOW}Warning: git fetch --tags failed, using local tags${NC}"
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
HEAD_SHA=$(git rev-parse HEAD)
HEAD_TAG=$(git tag --points-at HEAD 2>/dev/null | head -n1)

if [ -n "$HEAD_TAG" ]; then
    APP_VERSION="$HEAD_TAG"
    echo "Using existing tag on HEAD: $APP_VERSION"
elif [ -n "$LAST_TAG" ]; then
    NEW_COMMITS=$(git log "$LAST_TAG..HEAD" --oneline 2>/dev/null | wc -l | tr -d ' ')
    if [ "$NEW_COMMITS" = "0" ]; then
        APP_VERSION="$LAST_TAG"
        echo "No new commits since $LAST_TAG — redeploy without version bump"
    else
        BASE=${LAST_TAG#v}
        MAJOR=$(echo "$BASE" | cut -d. -f1)
        MINOR=$(echo "$BASE" | cut -d. -f2)
        PATCH=$(echo "$BASE" | cut -d. -f3)
        if ! [[ "$MAJOR" =~ ^[0-9]+$ && "$MINOR" =~ ^[0-9]+$ && "$PATCH" =~ ^[0-9]+$ ]]; then
            echo -e "${YELLOW}Warning: тег $LAST_TAG не SemVer, использую как есть${NC}"
            APP_VERSION="$LAST_TAG"
        else
            APP_VERSION="v${MAJOR}.${MINOR}.$((PATCH+1))"
            git tag "$APP_VERSION" HEAD
            if git push origin "$APP_VERSION" 2>/dev/null; then
                echo "Auto-bumped patch: $LAST_TAG → $APP_VERSION ($NEW_COMMITS new commits, pushed)"
            else
                echo -e "${YELLOW}Auto-bumped patch: $LAST_TAG → $APP_VERSION (pushed to origin failed — tag only local)${NC}"
            fi
        fi
    fi
else
    APP_VERSION="v1.0.0"
    git tag "$APP_VERSION" HEAD 2>/dev/null || true
    git push origin "$APP_VERSION" 2>/dev/null || echo -e "${YELLOW}Baseline tag push failed — tag only local${NC}"
    echo "Baseline release: $APP_VERSION"
fi
export APP_VERSION
export HEAD_SHA
echo "Release: $APP_VERSION ($HEAD_SHA)"

# Проверка критических переменных окружения
MISSING_SECRETS=0
if ! grep -qE '^SECRET_KEY=.+' .env 2>/dev/null || grep -q 'django-insecure' .env 2>/dev/null; then
    echo -e "${RED}ВНИМАНИЕ: SECRET_KEY не задан или содержит django-insecure! Это небезопасно для production.${NC}"
    MISSING_SECRETS=1
fi
if ! grep -qE '^BANK_ENCRYPTION_KEY=.+' .env 2>/dev/null; then
    echo -e "${YELLOW}Внимание: BANK_ENCRYPTION_KEY не задан в .env. Добавьте его для работы банковского модуля.${NC}"
    echo "Сгенерировать: python3 -c \"from cryptography.fernet import Fernet; print('BANK_ENCRYPTION_KEY=' + Fernet.generate_key().decode())\""
fi
if ! grep -qE '^JWT_PRIVATE_KEY=.+' .env 2>/dev/null && ! grep -qE '^SIGNING_KEY=.+' .env 2>/dev/null; then
    echo -e "${YELLOW}Внимание: JWT_PRIVATE_KEY / SIGNING_KEY не задан. JWT аутентификация может работать с дефолтным SECRET_KEY.${NC}"
fi
if grep -qE '^DEBUG=True' .env 2>/dev/null; then
    echo -e "${RED}ВНИМАНИЕ: DEBUG=True в production! Это небезопасно.${NC}"
    MISSING_SECRETS=1
fi
if [ "$MISSING_SECRETS" -eq 1 ]; then
    echo -e "${YELLOW}Продолжить деплой? (y/N)${NC}"
    read -r -t 10 REPLY || REPLY="y"
    if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
        echo "Деплой отменён."
        exit 1
    fi
fi

echo -e "${GREEN}[2/9] Backing up database before deploy...${NC}"
./deploy/backup.sh || echo -e "${YELLOW}Warning: Full backup failed (services may not be running yet)${NC}"

echo -e "${GREEN}[3/9] Stopping existing containers...${NC}"
"${COMPOSE[@]}" down --remove-orphans

echo -e "${GREEN}[4/9] Building Docker images...${NC}"
"${COMPOSE[@]}" build --no-cache

echo -e "${GREEN}[5/9] Starting containers...${NC}"
"${COMPOSE[@]}" up -d

echo -e "${GREEN}[6/9] Waiting for services to be healthy...${NC}"
wait_for_http "http://localhost:8000/api/v1/health/" "Backend health"

echo -e "${GREEN}[7/9] Running database migrations...${NC}"
"${COMPOSE[@]}" exec -T backend python manage.py migrate --noinput

echo -e "${GREEN}[7.1/9] Настройка LLM-провайдеров...${NC}"
"${COMPOSE[@]}" exec -T backend python manage.py setup_providers

echo -e "${GREEN}[7.2/9] Collecting static files...${NC}"
"${COMPOSE[@]}" exec -T backend python manage.py collectstatic --noinput

echo -e "${GREEN}[7.25/9] Recording release in database...${NC}"
"${COMPOSE[@]}" exec -T backend python manage.py generate_changelog --tag "$APP_VERSION" --sha "$HEAD_SHA" --repo /app || echo -e "${YELLOW}Warning: generate_changelog failed — changelog will not be updated for this release${NC}"

run_backend_check "[7.3/9] Django system checks..." python manage.py check
run_backend_check "[7.4/9] HVAC smoke checks..." python manage.py hvac_api_smoke --skip-feedback-write

echo -e "${GREEN}[8/9] Checking service status...${NC}"
"${COMPOSE[@]}" ps

echo -e "${GREEN}[9/9] Testing backend health...${NC}"
wait_for_http "http://localhost:8000/api/schema/" "Backend schema"
wait_for_http "http://localhost:3000/" "Frontend root" 40 3

echo -e "${GREEN}[9.1/9] Cleaning unused Docker artifacts...${NC}"
docker container prune -f >/dev/null 2>&1 || true
docker image prune -af >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true

echo -e "${GREEN}[9.2/9] Revalidating frontend ISR-cache...${NC}"
# Сбрасываем stale-empty cache если backend был недоступен во время
# prerender'а главной. Берём секрет из .env или уже загруженного окружения.
REVALIDATE_SECRET_VALUE="${REVALIDATE_SECRET:-}"
if [ -z "$REVALIDATE_SECRET_VALUE" ] && [ -f ".env" ]; then
    REVALIDATE_SECRET_VALUE=$(grep -E '^REVALIDATE_SECRET=' .env | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
fi
if [ -n "$REVALIDATE_SECRET_VALUE" ]; then
    # Список путей под revalidate. Включает:
    #   - корень и старый /ratings/ (редирект → но revalidate безопасен);
    #   - переехавший рейтинг /rating-split-system/* (главная + methodology/archive/submit);
    #   - короткий SEO-URL /quiet и ценовые лендинги /price/do-XX000-rub;
    #   - пресет-страницы /rating-split-system/preset/<slug> (5 захардкоженных
    #     slug'ов из ac_methodology/migrations/0005_seed_initial_presets;
    #     TODO: fetch'ить динамически через API methodology — сейчас рискуем
    #     рассинхроном при добавлении пресета через Django Admin).
    REVALIDATE_PATHS=(
        "/"
        "/ratings/"
        "/rating-split-system/"
        "/rating-split-system/methodology/"
        "/rating-split-system/archive/"
        "/rating-split-system/submit/"
        "/quiet"
        "/price/do-20000-rub"
        "/price/do-25000-rub"
        "/price/do-30000-rub"
        "/price/do-35000-rub"
        "/price/do-40000-rub"
        "/price/do-50000-rub"
        "/price/do-60000-rub"
        "/rating-split-system/preset/silence"
        "/rating-split-system/preset/cold"
        "/rating-split-system/preset/budget"
        "/rating-split-system/preset/house"
        "/rating-split-system/preset/allergy"
    )
    for path in "${REVALIDATE_PATHS[@]}"; do
        encoded_path=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$path")
        if curl -fsS -X POST "http://127.0.0.1:3000/api/revalidate?path=${encoded_path}&secret=${REVALIDATE_SECRET_VALUE}" -o /dev/null 2>&1; then
            echo -e "${GREEN}  revalidated: ${path}${NC}"
        else
            echo -e "${YELLOW}  revalidate failed: ${path} (non-fatal)${NC}"
        fi
    done
else
    echo -e "${YELLOW}  REVALIDATE_SECRET not set — skipping ISR revalidate${NC}"
    echo -e "${YELLOW}  (добавь REVALIDATE_SECRET=<random> в /opt/finans_assistant/.env)${NC}"
fi

echo -e "${GREEN}[9.3/9] Cloudflare cache purge...${NC}"
# Сбрасываем edge-кэш CF чтобы новые деплои не подменялись stale-ответами.
# Берём токен и Zone ID из .env или уже загруженного окружения.
CF_API_TOKEN_VALUE="${CF_API_TOKEN:-}"
CF_ZONE_ID_VALUE="${CF_ZONE_ID:-}"
if [ -z "$CF_API_TOKEN_VALUE" ] && [ -f ".env" ]; then
    CF_API_TOKEN_VALUE=$(grep -E '^CF_API_TOKEN=' .env | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
fi
if [ -z "$CF_ZONE_ID_VALUE" ] && [ -f ".env" ]; then
    CF_ZONE_ID_VALUE=$(grep -E '^CF_ZONE_ID=' .env | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
fi
if [ -n "$CF_API_TOKEN_VALUE" ] && [ -n "$CF_ZONE_ID_VALUE" ]; then
    if curl -fsS -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID_VALUE}/purge_cache" \
        -H "Authorization: Bearer ${CF_API_TOKEN_VALUE}" \
        -H "Content-Type: application/json" \
        --data '{"purge_everything":true}' \
        -o /dev/null 2>&1; then
        echo -e "${GREEN}  Cloudflare cache purged (purge_everything)${NC}"
    else
        echo -e "${YELLOW}  Cloudflare purge failed (non-fatal)${NC}"
    fi
else
    echo -e "${YELLOW}  CF_API_TOKEN или CF_ZONE_ID не заданы — skipping Cloudflare purge${NC}"
    echo -e "${YELLOW}  (добавь CF_API_TOKEN и CF_ZONE_ID в /opt/finans_assistant/.env)${NC}"
fi

echo ""
echo -e "${GREEN}Deployment completed!${NC}"
echo ""
echo "Services status:"
"${COMPOSE[@]}" ps
echo ""
echo "To view logs: docker compose -f docker-compose.prod.yml logs -f [service]"
echo "To restart: docker compose -f docker-compose.prod.yml restart [service]"
echo "Для локальной разработки с production DB используйте SSH-туннель на 127.0.0.1:5432 сервера."
echo ""
