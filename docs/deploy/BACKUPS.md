# Backups

Скрипт: `deploy/backup.sh`

Ручной запуск:

```bash
cd /opt/finans_assistant
./deploy/backup.sh
```

Cron:
- пример расписания: `deploy/crontab.example`

Проверка:

```bash
crontab -l
ls -la /opt/backups/finans_assistant/ || true
```
