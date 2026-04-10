"""
Одноразовая команда для начального заполнения флага is_kmp у производителей.
Использует LLM для определения крупных мировых производителей HVAC.
"""
from django.core.management.base import BaseCommand
from references.models import Manufacturer


# Известные КМП — крупные мировые производители HVAC
KNOWN_KMP_KEYWORDS = [
    'daikin', 'mitsubishi', 'lg', 'samsung', 'panasonic',
    'trane', 'york', 'johnson controls', 'carrier', 'lennox',
    'midea', 'gree', 'haier', 'hisense', 'fujitsu',
    'hitachi', 'toshiba', 'emerson', 'honeywell', 'schneider',
    'danfoss', 'bitzer', 'copeland', 'embraco', 'hussmann',
    'systemair', 'swegon', 'flakt', 'trox', 'air liquide',
    'ingersoll rand', 'vertiv', 'nibe', 'bosch', 'viessmann',
    'rheem', 'nortek', 'aaon', 'welbilt', 'manitowoc',
    'blue star', 'voltas', 'o.y.l.', 'mahle', 'carel',
    'belimo', 'grundfos', 'ebm-papst', 'ziehl-abegg', 'rosenberg',
    'aermec', 'climaveneta', 'clivet', 'euroclima', 'stulz',
    'uniflair', 'dantherm', 'munters', 'bard', 'addison',
    'whirlpool', 'sharp', 'general electric', 'ge appliances',
    'mcquay', 'dunham-bush', 'keeprite', 'bohn', 'heatcraft',
    'alfa laval', 'gea', 'spx cooling', 'evapco', 'baltimore aircoil',
    'frigel', 'airedale', 'data aire', 'canatal', 'zamil',
    'kirloskar', 'thermax', 'lloyd', 'bluestar', 'ogeneral',
    'chigo', 'aux', 'tcl', 'changhong', 'chunlan',
]


class Command(BaseCommand):
    help = 'Начальное заполнение флага is_kmp (крупный мировой производитель) у производителей'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Показать что будет изменено, но не менять',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        manufacturers = Manufacturer.objects.all()

        self.stdout.write(f"\nВсего производителей: {manufacturers.count()}")
        self.stdout.write("=" * 60)

        matched = []
        for m in manufacturers:
            name_lower = m.name.lower().strip()
            for keyword in KNOWN_KMP_KEYWORDS:
                if keyword in name_lower or name_lower in keyword:
                    matched.append(m)
                    break

        self.stdout.write(f"\nНайдено КМП по ключевым словам: {len(matched)}")

        for m in matched:
            status = "✓ уже КМП" if m.is_kmp else "→ будет отмечен"
            self.stdout.write(f"  {status}: {m.name} (region: {m.region or 'N/A'})")

        if dry_run:
            self.stdout.write(self.style.WARNING("\n[DRY RUN] Изменения не применены"))
            return

        # Применяем
        updated = 0
        for m in matched:
            if not m.is_kmp:
                m.is_kmp = True
                m.save(update_fields=['is_kmp'])
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f"\nГотово: {updated} производителей отмечены как КМП"
        ))
        self.stdout.write(
            "Проверьте и скорректируйте список в админке: "
            "/admin/references/manufacturer/?is_kmp=True"
        )
