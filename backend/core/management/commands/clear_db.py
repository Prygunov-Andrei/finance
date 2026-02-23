from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction, connection

User = get_user_model()


class Command(BaseCommand):
    help = 'Очищает базу данных, оставляя только суперпользователей.'

    def handle(self, *args, **options):
        self.stdout.write('Начинаем очистку базы данных...')

        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("""
                    DO $$ DECLARE
                        r RECORD;
                    BEGIN
                        FOR r IN (
                            SELECT tablename FROM pg_tables
                            WHERE schemaname = 'public'
                            AND tablename NOT IN (
                                'django_migrations',
                                'django_content_type',
                                'auth_permission',
                                'auth_group',
                                'auth_group_permissions',
                                'django_session',
                                'django_admin_log'
                            )
                        ) LOOP
                            EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
                        END LOOP;
                    END $$;
                """)

            self.stdout.write('Все таблицы очищены (TRUNCATE CASCADE).')

            admin = User.objects.create_superuser(
                'admin', 'admin@example.com', 'admin'
            )
            self.stdout.write(f'Создан суперпользователь: admin/admin (id={admin.id})')

        self.stdout.write(self.style.SUCCESS(
            'База данных успешно очищена! Создан admin.'
        ))
