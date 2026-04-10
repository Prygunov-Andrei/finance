"""
Одноразовый анализ опубликованных новостей для выявления паттернов
и предложения дополнительных критериев рейтинга.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Анализирует опубликованные новости через LLM для выявления паттернов оценки'

    def add_arguments(self, parser):
        parser.add_argument(
            '--config-id',
            type=int,
            default=None,
            help='ID конфигурации рейтинга (по умолчанию — активная)',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=100,
            help='Количество новостей для анализа (по умолчанию 100)',
        )

    def handle(self, *args, **options):
        from news.rating_service import NewsRatingService
        from news.models import RatingConfiguration

        config = None
        if options['config_id']:
            config = RatingConfiguration.objects.get(id=options['config_id'])

        self.stdout.write("Запуск анализа опубликованных новостей...")
        self.stdout.write(f"Лимит: {options['limit']} новостей")
        self.stdout.write("=" * 60)

        service = NewsRatingService(config=config)
        result = service.analyze_published_news()

        self.stdout.write(f"\nПроанализировано: {result.get('analyzed', 0)} новостей")

        suggestions = result.get('suggestions', [])
        if suggestions:
            self.stdout.write(self.style.SUCCESS(
                f"\nНайдено {len(suggestions)} предложений по критериям:"
            ))
            for i, s in enumerate(suggestions, 1):
                stars = '★' * s.get('star_rating', 0)
                self.stdout.write(f"\n  {i}. {stars} {s.get('name', 'N/A')}")
                self.stdout.write(f"     {s.get('description', 'N/A')}")
                keywords = s.get('keywords', [])
                if keywords:
                    self.stdout.write(f"     Ключевые слова: {', '.join(keywords)}")
        else:
            self.stdout.write(self.style.WARNING("\nПредложений не найдено"))

        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(
            "Для добавления предложенных критериев используйте "
            "страницу 'Критерии рейтинга' в HVAC-админке."
        )
