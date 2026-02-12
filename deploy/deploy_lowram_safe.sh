#!/bin/bash
set -euo pipefail

BASE_FILE="docker-compose.prod.yml"
OVERRIDE_FILE="docker-compose.lowram.override.yml"
COMPOSE_CMD="docker compose -f ${BASE_FILE} -f ${OVERRIDE_FILE}"

if [ ! -d "/opt/finans_assistant" ]; then
  echo "Error: /opt/finans_assistant does not exist"
  exit 1
fi

cd /opt/finans_assistant

if [ ! -f "${BASE_FILE}" ] || [ ! -f "${OVERRIDE_FILE}" ]; then
  echo "Error: compose files are missing"
  echo "Need ${BASE_FILE} and ${OVERRIDE_FILE} in /opt/finans_assistant"
  exit 1
fi

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Low-RAM safe deploy started${NC}"
echo "Compose: ${BASE_FILE} + ${OVERRIDE_FILE}"

echo -e "${GREEN}[1/8] Pull latest code${NC}"
git pull --ff-only origin main

echo -e "${GREEN}[2/8] Stop current stack${NC}"
${COMPOSE_CMD} down || true

echo -e "${GREEN}[3/8] Build images sequentially${NC}"
export COMPOSE_PARALLEL_LIMIT=1
for svc in backend bot frontend mini-app; do
  echo -e "${YELLOW}Building ${svc}${NC}"
  ${COMPOSE_CMD} build --pull "${svc}"
done

echo -e "${GREEN}[4/8] Start infra layer${NC}"
${COMPOSE_CMD} up -d postgres redis minio createbuckets
sleep 12
${COMPOSE_CMD} ps

echo -e "${GREEN}[5/8] Start app layer${NC}"
${COMPOSE_CMD} up -d backend celery-worker celery-beat bot frontend mini-app
sleep 20
${COMPOSE_CMD} ps

echo -e "${GREEN}[6/8] Run migrations and static collection${NC}"
${COMPOSE_CMD} exec -T backend python manage.py migrate --noinput
${COMPOSE_CMD} exec -T backend python manage.py collectstatic --noinput

echo -e "${GREEN}[7/8] Local health checks${NC}"
curl -fsS http://127.0.0.1:8000/api/v1/ >/dev/null || echo -e "${YELLOW}Backend health endpoint check failed${NC}"
curl -fsS http://127.0.0.1:3000/ >/dev/null || echo -e "${YELLOW}Frontend check failed${NC}"
curl -fsS http://127.0.0.1:3001/ >/dev/null || echo -e "${YELLOW}Mini-app check failed${NC}"
curl -fsS http://127.0.0.1:8081/bot/webhook >/dev/null || true

echo -e "${GREEN}[8/8] Final status${NC}"
${COMPOSE_CMD} ps
docker stats --no-stream || true
free -h

echo -e "${GREEN}Low-RAM safe deploy completed${NC}"
