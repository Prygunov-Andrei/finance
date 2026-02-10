#!/bin/bash
set -e

echo "=========================================="
echo "Backup Script"
echo "=========================================="
echo ""

BACKUP_DIR="/opt/backups/finans_assistant"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

cd /opt/finans_assistant

GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}[1/3] Backing up PostgreSQL database...${NC}"
docker compose -f docker-compose.prod.yml exec -T postgres \
    pg_dump -U finans_user finans_assistant_prod \
    > "$BACKUP_DIR/postgres_backup_$DATE.sql"

echo -e "${GREEN}[2/3] Backing up MinIO data...${NC}"
docker run --rm \
    -v finans_assistant_minio_data:/data:ro \
    -v "$BACKUP_DIR":/backup \
    alpine tar czf "/backup/minio_backup_$DATE.tar.gz" -C /data .

echo -e "${GREEN}[3/3] Backing up .env file...${NC}"
cp /opt/finans_assistant/.env "$BACKUP_DIR/env_backup_$DATE"

echo ""
echo "Backup completed! Files saved to: $BACKUP_DIR"
ls -lh "$BACKUP_DIR" | tail -3
echo ""

# Удаление старых бэкапов (старше 30 дней)
echo "Cleaning up old backups (older than 30 days)..."
find "$BACKUP_DIR" -type f -mtime +30 -delete
echo "Done!"
