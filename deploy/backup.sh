#!/bin/bash
set -euo pipefail

echo "=========================================="
echo "Backup Script"
echo "=========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_MODE="${BACKUP_MODE:-auto}"
DATE="$(date +%Y%m%d_%H%M%S)"

if [ "$RUN_MODE" = "auto" ]; then
    if [ -d "/opt/finans_assistant" ] && command -v docker >/dev/null 2>&1; then
        RUN_MODE="docker"
    else
        RUN_MODE="local"
    fi
fi

if [ "$RUN_MODE" = "docker" ]; then
    PROJECT_ROOT="/opt/finans_assistant"
    DEFAULT_BACKUP_DIR="/opt/backups/finans_assistant"
else
    DEFAULT_BACKUP_DIR="$PROJECT_ROOT/backups"
fi

BACKUP_DIR="${BACKUP_DIR:-$DEFAULT_BACKUP_DIR}"
mkdir -p "$BACKUP_DIR"
cd "$PROJECT_ROOT"

if [ "${BACKUP_SKIP_ENV_FILE:-0}" != "1" ] && [ -f ".env" ]; then
    set -a
    . ./.env
    set +a
fi

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PRIMARY_DB_NAME="${DB_NAME:-finans_assistant}"
PRIMARY_DB_USER="${DB_USER:-postgres}"
PRIMARY_DB_HOST="${DB_HOST:-localhost}"
PRIMARY_DB_PORT="${DB_PORT:-5432}"
HVAC_LEGACY_DB_NAME="${HVAC_DB_NAME:-hvac_db}"
HVAC_LEGACY_DB_USER="${HVAC_DB_USER:-$PRIMARY_DB_USER}"
HVAC_LEGACY_DB_HOST="${HVAC_DB_HOST:-$PRIMARY_DB_HOST}"
HVAC_LEGACY_DB_PORT="${HVAC_DB_PORT:-$PRIMARY_DB_PORT}"
LEGACY_HVAC_MEDIA_VOLUME="${LEGACY_HVAC_MEDIA_VOLUME:-finans_assistant_hvac_media}"
LEGACY_HVAC_MEDIA_ROOT="${LEGACY_HVAC_MEDIA_ROOT:-$BACKUP_DIR/legacy_hvac_media_source}"
MINIO_VOLUME_NAME="${MINIO_VOLUME_NAME:-finans_assistant_minio_data}"

verify_dump() {
    local dump_path="$1"
    if [ ! -s "$dump_path" ]; then
        echo "ERROR: Backup file is empty: $dump_path"
        rm -f "$dump_path"
        exit 1
    fi

    if command -v pg_restore >/dev/null 2>&1 && pg_restore --list "$dump_path" >/dev/null 2>&1; then
        echo "Backup verification: pg_restore --list OK ($(basename "$dump_path"))"
        return
    fi

    if [ "$RUN_MODE" = "docker" ] && docker run --rm -v "$BACKUP_DIR":/backup postgres:14-alpine pg_restore --list "/backup/$(basename "$dump_path")" >/dev/null 2>&1; then
        echo "Backup verification: pg_restore --list OK ($(basename "$dump_path"))"
        return
    fi

    echo "ERROR: pg_restore verification failed for $dump_path"
    exit 1
}

backup_db_local() {
    local db_name="$1"
    local db_user="$2"
    local db_host="$3"
    local db_port="$4"
    local dump_path="$5"
    pg_dump -Fc -h "$db_host" -p "$db_port" -U "$db_user" "$db_name" > "$dump_path"
}

backup_db_docker() {
    local db_name="$1"
    local db_user="$2"
    local dump_path="$3"
    docker compose -f docker-compose.prod.yml exec -T postgres \
        pg_dump -Fc -U "$db_user" "$db_name" > "$dump_path"
}

# Проверяет, существует ли БД с заданным именем.
# В docker-режиме ходим через `docker compose exec postgres psql -l`,
# в local-режиме используем локальный psql.
# Возвращает 0 если БД существует, 1 если нет.
db_exists() {
    local db_name="$1"
    local db_user="$2"
    local db_host="${3:-}"
    local db_port="${4:-}"

    if [ "$RUN_MODE" = "docker" ]; then
        docker compose -f docker-compose.prod.yml exec -T postgres \
            psql -U "$db_user" -lqt 2>/dev/null \
            | cut -d \| -f 1 \
            | grep -qw "$db_name"
    else
        if ! command -v psql >/dev/null 2>&1; then
            return 1
        fi
        psql -h "$db_host" -p "$db_port" -U "$db_user" -lqt 2>/dev/null \
            | cut -d \| -f 1 \
            | grep -qw "$db_name"
    fi
}

archive_directory() {
    local source_path="$1"
    local archive_path="$2"

    if [ -d "$source_path" ]; then
        tar czf "$archive_path" -C "$source_path" .
        return
    fi

    tmp_empty_dir="$(mktemp -d)"
    tar czf "$archive_path" -C "$tmp_empty_dir" .
    rmdir "$tmp_empty_dir"
    echo -e "${YELLOW}Warning: Source directory not found, created empty archive: $source_path${NC}"
}

echo -e "${GREEN}[1/5] Backing up primary PostgreSQL database (custom dump)...${NC}"
PRIMARY_DUMP_PATH="$BACKUP_DIR/postgres_backup_$DATE.dump"
if [ "$RUN_MODE" = "docker" ]; then
    backup_db_docker "$PRIMARY_DB_NAME" "$PRIMARY_DB_USER" "$PRIMARY_DUMP_PATH"
else
    backup_db_local "$PRIMARY_DB_NAME" "$PRIMARY_DB_USER" "$PRIMARY_DB_HOST" "$PRIMARY_DB_PORT" "$PRIMARY_DUMP_PATH"
fi
verify_dump "$PRIMARY_DUMP_PATH"

echo -e "${GREEN}[2/5] Backing up legacy HVAC PostgreSQL database (custom dump)...${NC}"
HVAC_DUMP_PATH="$BACKUP_DIR/hvac_legacy_backup_$DATE.dump"
# Единая инсталляция: и ERP, и HVAC живут в одной БД finans_assistant.
# Отдельной hvac_db здесь нет — без этой проверки pg_dump висит на таймауте
# и ломает автоматические бекапы. Если hvac_db реально появится
# (отдельная инсталляция), дамп снова пойдёт автоматически.
if db_exists "$HVAC_LEGACY_DB_NAME" "$HVAC_LEGACY_DB_USER" "$HVAC_LEGACY_DB_HOST" "$HVAC_LEGACY_DB_PORT"; then
    if [ "$RUN_MODE" = "docker" ]; then
        backup_db_docker "$HVAC_LEGACY_DB_NAME" "$HVAC_LEGACY_DB_USER" "$HVAC_DUMP_PATH"
    else
        backup_db_local "$HVAC_LEGACY_DB_NAME" "$HVAC_LEGACY_DB_USER" "$HVAC_LEGACY_DB_HOST" "$HVAC_LEGACY_DB_PORT" "$HVAC_DUMP_PATH"
    fi
    verify_dump "$HVAC_DUMP_PATH"
else
    echo -e "${YELLOW}Warning: database '$HVAC_LEGACY_DB_NAME' not found — skipping legacy HVAC dump.${NC}"
fi

echo -e "${GREEN}[3/5] Backing up legacy HVAC media...${NC}"
HVAC_MEDIA_ARCHIVE="$BACKUP_DIR/hvac_legacy_media_$DATE.tar.gz"
if [ "$RUN_MODE" = "docker" ]; then
    docker run --rm \
        -v "$LEGACY_HVAC_MEDIA_VOLUME":/data:ro \
        -v "$BACKUP_DIR":/backup \
        alpine tar czf "/backup/$(basename "$HVAC_MEDIA_ARCHIVE")" -C /data .
else
    archive_directory "$LEGACY_HVAC_MEDIA_ROOT" "$HVAC_MEDIA_ARCHIVE"
fi

if command -v python3 >/dev/null 2>&1 && [ -f "$PROJECT_ROOT/backend/manage.py" ]; then
    HVAC_MEDIA_MANIFEST="$BACKUP_DIR/hvac_legacy_media_manifest_$DATE.json"
    if BACKUP_SKIP_ENV_FILE=1 python3 "$PROJECT_ROOT/backend/manage.py" hvac_media_manifest --output "$HVAC_MEDIA_MANIFEST" --base-root "$LEGACY_HVAC_MEDIA_ROOT" >/dev/null 2>&1; then
        gzip -f "$HVAC_MEDIA_MANIFEST"
        echo "Media manifest saved: ${HVAC_MEDIA_MANIFEST}.gz"
    else
        echo -e "${YELLOW}Warning: Failed to generate HVAC media manifest.${NC}"
    fi
fi

echo -e "${GREEN}[4/5] Backing up MinIO data...${NC}"
MINIO_ARCHIVE="$BACKUP_DIR/minio_backup_$DATE.tar.gz"
if [ "$RUN_MODE" = "docker" ]; then
    docker run --rm \
        -v "$MINIO_VOLUME_NAME":/data:ro \
        -v "$BACKUP_DIR":/backup \
        alpine tar czf "/backup/$(basename "$MINIO_ARCHIVE")" -C /data .
else
    echo -e "${YELLOW}Warning: MinIO volume backup is skipped in local mode.${NC}"
fi

echo -e "${GREEN}[5/5] Backing up .env file...${NC}"
if [ -f "$PROJECT_ROOT/.env" ]; then
    cp "$PROJECT_ROOT/.env" "$BACKUP_DIR/env_backup_$DATE"
else
    echo -e "${YELLOW}Warning: .env file not found, skipping env backup.${NC}"
fi

echo ""
echo "Backup completed! Files saved to: $BACKUP_DIR"
ls -lh "$BACKUP_DIR" | tail -5
echo ""

echo "Cleaning up old backups (keeping at least 5 newest, removing >30 days)..."
shopt -s nullglob
for PREFIX in postgres_backup hvac_legacy_backup hvac_legacy_media minio_backup env_backup; do
    MATCHED_FILES=("$BACKUP_DIR"/${PREFIX}_*)
    COUNT=${#MATCHED_FILES[@]}
    if [ "$COUNT" -gt 5 ]; then
        printf '%s\n' "${MATCHED_FILES[@]}" | xargs ls -1t | tail -n +6 | while read -r OLD; do
            if [ "$(find "$OLD" -mtime +30 2>/dev/null)" ]; then
                rm -f "$OLD"
                echo "  Removed: $(basename "$OLD")"
            fi
        done
    fi
done
shopt -u nullglob
echo "Done!"
