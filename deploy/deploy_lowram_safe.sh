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
RED='\033[0;31m'
NC='\033[0m'

mem_check() {
  echo -e "${YELLOW}--- RAM ---${NC}"
  free -h
  echo ""
}

disk_check() {
  echo -e "${YELLOW}--- Disk ---${NC}"
  df -h /
  echo ""
}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Low-RAM safe deploy (2GB server)${NC}"
echo -e "${GREEN}========================================${NC}"
echo "Compose: ${BASE_FILE} + ${OVERRIDE_FILE}"
mem_check
disk_check

# -------------------------------------------------------
echo -e "${GREEN}[1/13] Pull latest code${NC}"
# -------------------------------------------------------
git pull --ff-only origin main

# -------------------------------------------------------
echo -e "${GREEN}[2/13] Stop current stack${NC}"
# -------------------------------------------------------
${COMPOSE_CMD} down --remove-orphans || true

# -------------------------------------------------------
echo -e "${GREEN}[3/13] Clean Docker (images, cache, containers)${NC}"
# -------------------------------------------------------
docker system prune -af || true
docker builder prune -af || true
disk_check

# -------------------------------------------------------
echo -e "${GREEN}[4/13] Clean system (logs, apt cache)${NC}"
# -------------------------------------------------------
journalctl --vacuum-size=50M 2>/dev/null || true
apt-get clean 2>/dev/null || true
# Очищаем лог-файлы контейнеров Docker
find /var/lib/docker/containers/ -name '*-json.log' -exec truncate -s 0 {} \; 2>/dev/null || true
disk_check

# -------------------------------------------------------
echo -e "${GREEN}[5/13] Build images sequentially${NC}"
# -------------------------------------------------------
export COMPOSE_PARALLEL_LIMIT=1
for svc in backend bot frontend mini-app kanban-api; do
  echo -e "${YELLOW}Building ${svc}...${NC}"
  ${COMPOSE_CMD} build "${svc}"
  mem_check
done

# -------------------------------------------------------
echo -e "${GREEN}[6/13] Start infra: postgres + redis + minio${NC}"
# -------------------------------------------------------
${COMPOSE_CMD} up -d postgres redis minio createbuckets
echo "Waiting 15s for infra to become healthy..."
sleep 15
${COMPOSE_CMD} ps
mem_check

# -------------------------------------------------------
echo -e "${GREEN}[7/13] Start backend${NC}"
# -------------------------------------------------------
${COMPOSE_CMD} up -d backend
echo "Waiting 20s for backend to start..."
sleep 20
${COMPOSE_CMD} ps
mem_check

# -------------------------------------------------------
echo -e "${GREEN}[8/13] Run migrations + collectstatic${NC}"
# -------------------------------------------------------
${COMPOSE_CMD} exec -T backend python manage.py migrate --noinput
${COMPOSE_CMD} exec -T backend python manage.py collectstatic --noinput

# -------------------------------------------------------
echo -e "${GREEN}[9/13] Start ERP services (one by one)${NC}"
# -------------------------------------------------------
for svc in celery-worker celery-beat bot frontend mini-app; do
  echo -e "${YELLOW}Starting ${svc}...${NC}"
  ${COMPOSE_CMD} up -d "${svc}"
  sleep 10
  mem_check
done

# -------------------------------------------------------
echo -e "${GREEN}[10/13] Create kanban DB + run kanban migrations${NC}"
# -------------------------------------------------------
${COMPOSE_CMD} up createkanbandb
echo "Kanban DB created, running migrations..."
${COMPOSE_CMD} run --rm kanban-api python manage.py migrate --settings=kanban_service.settings --noinput 2>/dev/null || \
  ${COMPOSE_CMD} run --rm kanban-api sh -c "DJANGO_SETTINGS_MODULE=kanban_service.settings python manage.py migrate --noinput" || true

# -------------------------------------------------------
echo -e "${GREEN}[11/13] Start kanban services (one by one)${NC}"
# -------------------------------------------------------
for svc in kanban-api kanban-celery-worker kanban-celery-beat; do
  echo -e "${YELLOW}Starting ${svc}...${NC}"
  ${COMPOSE_CMD} up -d "${svc}"
  sleep 10
  mem_check
done

# -------------------------------------------------------
echo -e "${GREEN}[12/13] Health checks${NC}"
# -------------------------------------------------------
sleep 5
curl -fsS http://127.0.0.1:8000/api/schema/ >/dev/null 2>&1 && echo -e "${GREEN}Backend: OK${NC}" || echo -e "${RED}Backend: FAILED${NC}"
curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1 && echo -e "${GREEN}Frontend: OK${NC}" || echo -e "${RED}Frontend: FAILED${NC}"
curl -fsS http://127.0.0.1:3001/ >/dev/null 2>&1 && echo -e "${GREEN}Mini-app: OK${NC}" || echo -e "${RED}Mini-app: FAILED${NC}"
curl -fsS http://127.0.0.1:8081/bot/webhook >/dev/null 2>&1 && echo -e "${GREEN}Bot: OK${NC}" || true
curl -fsS http://127.0.0.1:8000/kanban-api/health/ >/dev/null 2>&1 && echo -e "${GREEN}Kanban API: OK${NC}" || echo -e "${RED}Kanban API: FAILED${NC}"

# -------------------------------------------------------
echo -e "${GREEN}[13/13] Final status${NC}"
# -------------------------------------------------------
${COMPOSE_CMD} ps
echo ""
docker stats --no-stream 2>/dev/null || true
echo ""
mem_check
disk_check

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Low-RAM safe deploy completed!${NC}"
echo -e "${GREEN}========================================${NC}"
