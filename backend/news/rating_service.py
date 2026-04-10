"""
Сервис для AI-рейтинга новостей HVAC.
Оценивает черновики новостей по настраиваемым критериям (0-5 звёзд),
обнаруживает дубликаты и объединяет тексты.
"""
import logging
from difflib import SequenceMatcher
from typing import Dict, List, Optional

from django.db.models import Q
from django.utils import timezone

from .llm_client import NewsLLMClient
from .models import (
    NewsDuplicateGroup,
    NewsPost,
    RatingConfiguration,
    RatingCriterion,
    RatingRun,
)

logger = logging.getLogger(__name__)


class NewsRatingService:
    """
    Сервис для AI-рейтинга новостей.
    Загружает конфигурацию из БД, использует общий NewsLLMClient.
    """

    def __init__(self, config: Optional[RatingConfiguration] = None):
        self.config = config or RatingConfiguration.get_active()
        self.batch_size = self.config.batch_size
        self.duplicate_threshold = self.config.duplicate_similarity_threshold
        self.current_run: Optional[RatingRun] = None

        # LLM-клиент с callback для трекинга
        self.llm = NewsLLMClient.from_rating_config(
            self.config,
            on_api_call=self._on_api_call,
        )

    def _on_api_call(self, provider: str, input_tokens: int, output_tokens: int, success: bool):
        """Callback для трекинга API-вызовов в RatingRun."""
        if self.current_run:
            cost = self._calculate_cost(provider, input_tokens, output_tokens)
            self.current_run.add_api_call(provider, input_tokens, output_tokens, cost, success)

    def _calculate_cost(self, provider: str, input_tokens: int, output_tokens: int) -> float:
        input_price = self.config.get_price(provider, 'input')
        output_price = self.config.get_price(provider, 'output')
        return (input_tokens * input_price + output_tokens * output_price) / 1_000_000

    # ========================================================================
    # Основные методы
    # ========================================================================

    def rate_unrated_news(self, discovery_run=None) -> dict:
        """
        Оценивает все неоценённые новости.
        Возвращает статистику: {rated, skipped, errors, distribution}
        """
        self.current_run = RatingRun.start_new_run(
            config=self.config, discovery_run=discovery_run
        )

        try:
            # Считаем общее количество для прогресса
            total_unrated = NewsPost.objects.filter(
                star_rating__isnull=True, is_deleted=False
            ).count()
            self.current_run.update_progress(0, total_unrated, 'quick_rules')

            # 1. Быстрые правила БЕЗ LLM
            quick_rated = self._apply_quick_rules()
            self.current_run.update_progress(quick_rated, total_unrated, 'quick_rules_done')

            # 2. Получаем оставшиеся неоценённые
            unrated = NewsPost.objects.filter(
                star_rating__isnull=True,
                is_deleted=False,
                is_no_news_found=False,
            ).select_related('manufacturer')

            if not unrated.exists():
                self.current_run.total_news_rated = quick_rated
                self.current_run.finish()
                return {
                    'rated': quick_rated,
                    'llm_rated': 0,
                    'errors': 0,
                    'distribution': self._get_distribution(),
                }

            # 3. Загружаем критерии
            criteria = RatingCriterion.objects.filter(
                is_active=True, parent__isnull=True
            ).prefetch_related('children')

            if not criteria.exists():
                logger.warning("Нет активных критериев для рейтинга")
                self.current_run.finish()
                return {
                    'rated': quick_rated,
                    'llm_rated': 0,
                    'errors': 0,
                    'distribution': self._get_distribution(),
                }

            # 4. Батч-обработка через LLM
            llm_rated = 0
            llm_errors = 0
            news_list = list(unrated)
            total_for_llm = len(news_list)
            self.current_run.update_progress(quick_rated, total_unrated, f'llm_rating (0/{total_for_llm})')

            for i in range(0, len(news_list), self.batch_size):
                batch = news_list[i:i + self.batch_size]
                batch_num = i // self.batch_size + 1
                total_batches = (total_for_llm + self.batch_size - 1) // self.batch_size
                self.current_run.update_progress(
                    quick_rated + i, total_unrated,
                    f'llm_rating (батч {batch_num}/{total_batches})'
                )
                try:
                    rated_count = self._rate_batch(batch, criteria)
                    llm_rated += rated_count
                except Exception as e:
                    logger.error("Ошибка при рейтинге батча %d-%d: %s",
                                 i, i + len(batch), str(e), exc_info=True)
                    llm_errors += len(batch)

            # 5. Финализация
            self.current_run.total_news_rated = quick_rated + llm_rated
            self.current_run.rating_distribution = self._get_distribution()
            self.current_run.finish()

            return {
                'rated': quick_rated + llm_rated,
                'llm_rated': llm_rated,
                'errors': llm_errors,
                'distribution': self.current_run.rating_distribution,
            }

        except Exception as e:
            logger.error("Rating run failed: %s", str(e), exc_info=True)
            if self.current_run:
                self.current_run.finish(error_message=str(e))
            raise

    def detect_duplicates(self, news_ids: Optional[List[int]] = None) -> dict:
        """
        Обнаружение дубликатов через сравнение заголовков (difflib).
        Дубликаты получают рейтинг >= 4.
        """
        qs = NewsPost.objects.filter(
            is_deleted=False, is_no_news_found=False, status='draft'
        )
        if news_ids:
            qs = qs.filter(id__in=news_ids)

        news_list = list(qs.values('id', 'title', 'body'))
        if len(news_list) < 2:
            return {'groups_found': 0, 'news_affected': 0}

        # Находим группы дубликатов
        groups = self._find_duplicate_groups(news_list)

        groups_created = 0
        news_affected = 0

        for group_titles in groups:
            group_ids = [n['id'] for n in group_titles]
            if len(group_ids) < 2:
                continue

            # Создаём группу
            dup_group = NewsDuplicateGroup.objects.create(
                merged_title=group_titles[0]['title'],
                source_count=len(group_ids),
            )

            # Обновляем новости: привязываем к группе, ставим минимум 4 звезды
            NewsPost.objects.filter(id__in=group_ids).update(
                duplicate_group=dup_group,
            )
            # Повышаем рейтинг до минимум 4 для дубликатов
            NewsPost.objects.filter(
                id__in=group_ids
            ).filter(
                Q(star_rating__isnull=True) | Q(star_rating__lt=4)
            ).update(star_rating=4)

            groups_created += 1
            news_affected += len(group_ids)

        if self.current_run:
            self.current_run.duplicates_found = groups_created
            self.current_run.save()

        return {'groups_found': groups_created, 'news_affected': news_affected}

    def analyze_published_news(self) -> dict:
        """
        Анализ опубликованных новостей для выявления паттернов.
        Возвращает предложения по новым критериям.
        """
        published = NewsPost.objects.filter(
            status='published', is_deleted=False
        ).values_list('title', 'body')[:100]

        if not published:
            return {'suggestions': [], 'analyzed': 0}

        # Формируем промпт для анализа
        news_texts = []
        for title, body in published:
            preview = (body or '')[:300]
            news_texts.append(f"- {title}: {preview}")

        prompt = (
            "Проанализируй эти опубликованные HVAC-новости. Они все были отобраны как интересные.\n\n"
            "Новости:\n" + "\n".join(news_texts[:50]) + "\n\n"
            "Задача:\n"
            "1. Выяви паттерны — что делает эти новости интересными?\n"
            "2. Предложи дополнительные критерии для автоматической оценки новостей.\n"
            "3. Каждый критерий: {name, description, star_rating (2-5), keywords[]}\n\n"
            "Верни JSON: {\"suggestions\": [{\"name\": \"...\", \"description\": \"...\", "
            "\"star_rating\": 4, \"keywords\": [\"...\"]}]}"
        )

        response = self.llm.query(prompt)
        if not response:
            return {'suggestions': [], 'analyzed': len(published)}

        suggestions = []
        if isinstance(response, dict) and 'suggestions' in response:
            suggestions = response['suggestions']

        return {'suggestions': suggestions, 'analyzed': len(published)}

    # ========================================================================
    # Быстрые правила (без LLM)
    # ========================================================================

    def _apply_quick_rules(self) -> int:
        """Применяет правила, не требующие LLM. Возвращает количество оценённых."""
        rated = 0

        # is_no_news_found → 1 звезда
        count = NewsPost.objects.filter(
            is_no_news_found=True, star_rating__isnull=True
        ).update(star_rating=1, rating_explanation='Автоматически: новостей не найдено')
        rated += count

        # manufacturer.is_kmp → минимум 4 звезды
        count = NewsPost.objects.filter(
            manufacturer__is_kmp=True,
            star_rating__isnull=True,
            is_deleted=False,
        ).update(
            star_rating=4,
            rating_explanation='Автоматически: новость от КМП (крупного мирового производителя)'
        )
        rated += count

        # source_language='ru' → 5 звёзд
        count = NewsPost.objects.filter(
            source_language='ru',
            star_rating__isnull=True,
            is_deleted=False,
            is_no_news_found=False,
        ).update(
            star_rating=5,
            rating_explanation='Автоматически: российский источник'
        )
        rated += count

        logger.info("Quick rules applied: %d news rated", rated)
        return rated

    # ========================================================================
    # Батч-рейтинг через LLM
    # ========================================================================

    def _rate_batch(self, batch: List[NewsPost], criteria) -> int:
        """Оценивает батч новостей через LLM. Возвращает количество оценённых."""
        prompt = self._build_rating_prompt(batch, criteria)
        response = self.llm.query(prompt)

        if not response:
            logger.warning("LLM не вернул ответ для батча из %d новостей", len(batch))
            return 0

        # Парсим рейтинги из ответа
        ratings = []
        if isinstance(response, dict) and 'ratings' in response:
            ratings = response['ratings']
        elif isinstance(response, list):
            ratings = response

        rated = 0
        news_by_id = {n.id: n for n in batch}

        for rating_item in ratings:
            try:
                news_id = rating_item.get('news_id')
                star_rating = rating_item.get('star_rating')
                explanation = rating_item.get('explanation', '')
                matched = rating_item.get('matched_criteria', [])

                if news_id is None or star_rating is None:
                    continue

                news_id = int(news_id)
                star_rating = max(0, min(5, int(star_rating)))

                if news_id in news_by_id:
                    news = news_by_id[news_id]
                    news.star_rating = star_rating
                    news.rating_explanation = explanation
                    news.matched_criteria = matched
                    news.save(update_fields=[
                        'star_rating', 'rating_explanation', 'matched_criteria'
                    ])
                    rated += 1
            except (TypeError, ValueError) as e:
                logger.warning("Ошибка парсинга рейтинга: %s", str(e))
                continue

        return rated

    def _build_rating_prompt(self, batch: List[NewsPost], criteria) -> str:
        """Строит промпт для рейтинга батча новостей."""
        # Формируем секцию критериев
        criteria_text = self._format_criteria(criteria)

        # Формируем список новостей
        news_items = []
        for news in batch:
            manufacturer_name = news.manufacturer.name if news.manufacturer else "Не указан"
            preview = (news.body or '')[:500]
            news_items.append(
                f"  {{\"news_id\": {news.id}, \"title\": \"{news.title}\", "
                f"\"manufacturer\": \"{manufacturer_name}\", "
                f"\"language\": \"{news.source_language}\", "
                f"\"preview\": \"{preview}\"}}"
            )

        custom_prompts = self.config.prompts or {}
        system_prompt = custom_prompts.get('system_prompt', '')
        rating_prompt = custom_prompts.get('rating_prompt', '')

        if not system_prompt:
            system_prompt = (
                "Ты — эксперт по HVAC-индустрии (вентиляция, кондиционирование, холодоснабжение, "
                "тепловые насосы). Твоя задача — оценить новости по шкале 0-5 звёзд."
            )

        if not rating_prompt:
            rating_prompt = (
                "Оцени каждую новость по следующим критериям.\n\n"
                "КРИТЕРИИ ОЦЕНКИ:\n{criteria}\n\n"
                "ВАЖНЫЕ ПРАВИЛА:\n"
                "- Если новость не подходит ни под один критерий → 0 звёзд\n"
                "- Если подходит под несколько критериев разных уровней, "
                "используй НАИВЫСШИЙ рейтинг\n"
                "- Если есть дочерний критерий с override — используй его рейтинг\n\n"
                "НОВОСТИ ДЛЯ ОЦЕНКИ:\n[\n{news_items}\n]\n\n"
                "Верни СТРОГО JSON:\n"
                "{{\"ratings\": [\n"
                "  {{\"news_id\": <id>, \"star_rating\": <0-5>, "
                "\"explanation\": \"<почему>\", \"matched_criteria\": [<ids>]}}\n"
                "]}}\n\n"
                "Верни ТОЛЬКО JSON, без комментариев."
            )

        prompt = f"{system_prompt}\n\n{rating_prompt}".format(
            criteria=criteria_text,
            news_items=",\n".join(news_items),
        )

        return prompt

    def _format_criteria(self, criteria) -> str:
        """Форматирует критерии для промпта."""
        lines = []
        for c in criteria:
            stars = '★' * c.star_rating
            lines.append(f"{stars} (ID:{c.id}) {c.name}: {c.description}")
            if c.keywords:
                lines.append(f"  Ключевые слова: {', '.join(c.keywords)}")
            # Дочерние критерии
            for child in c.children.filter(is_active=True):
                override = f" → {child.override_star_rating}★" if child.override_star_rating else ""
                lines.append(f"  ↳ (ID:{child.id}) {child.name}: {child.description}{override}")
                if child.keywords:
                    lines.append(f"    Ключевые слова: {', '.join(child.keywords)}")
        return "\n".join(lines)

    # ========================================================================
    # Обнаружение дубликатов
    # ========================================================================

    def _find_duplicate_groups(self, news_list: List[dict]) -> List[List[dict]]:
        """Находит группы дубликатов по схожести заголовков."""
        used = set()
        groups = []

        for i, a in enumerate(news_list):
            if a['id'] in used:
                continue
            group = [a]
            for j, b in enumerate(news_list):
                if j <= i or b['id'] in used:
                    continue
                ratio = SequenceMatcher(
                    None, a['title'].lower(), b['title'].lower()
                ).ratio()
                if ratio >= self.duplicate_threshold:
                    group.append(b)
                    used.add(b['id'])
            if len(group) >= 2:
                used.add(a['id'])
                groups.append(group)

        return groups

    # ========================================================================
    # Вспомогательные методы
    # ========================================================================

    def _get_distribution(self) -> dict:
        """Возвращает распределение рейтингов по звёздам."""
        from django.db.models import Count
        dist = (
            NewsPost.objects
            .filter(is_deleted=False, star_rating__isnull=False)
            .values('star_rating')
            .annotate(count=Count('id'))
        )
        return {str(d['star_rating']): d['count'] for d in dist}
