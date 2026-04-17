"""Management command: seed_dev_data — создаёт два dev workspace.

UUIDs зафиксированы в .env.example (WORKSPACE_DEV_SEED_UUIDS).
Идемпотентна: при повторном запуске — обновляет, не дублирует.
"""

import uuid

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.workspace.models import MemberRole, Workspace, WorkspaceMember

User = get_user_model()

SEED_WORKSPACES = [
    {
        "id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
        "name": "Август Климат",
        "slug": "avgust-klimat",
    },
    {
        "id": uuid.UUID("22222222-2222-2222-2222-222222222222"),
        "name": "Тестовая Компания",
        "slug": "test-company",
    },
]


class Command(BaseCommand):
    help = "Создаёт dev workspace (идемпотентно)."

    def handle(self, *args, **options):
        admin_user, created = User.objects.get_or_create(
            username="admin",
            defaults={"is_staff": True, "is_superuser": True},
        )
        if created:
            admin_user.set_password("admin")
            admin_user.save()
            self.stdout.write(self.style.SUCCESS("  Создан суперпользователь admin/admin"))

        for ws_data in SEED_WORKSPACES:
            ws, created = Workspace.objects.update_or_create(
                id=ws_data["id"],
                defaults={"name": ws_data["name"], "slug": ws_data["slug"]},
            )
            verb = "Создан" if created else "Обновлён"
            self.stdout.write(self.style.SUCCESS(f"  {verb} workspace: {ws.name} ({ws.id})"))

            WorkspaceMember.objects.get_or_create(
                workspace=ws,
                user=admin_user,
                defaults={"role": MemberRole.OWNER},
            )

        self.stdout.write(self.style.SUCCESS(f"\nSeed завершён: {len(SEED_WORKSPACES)} workspace."))
