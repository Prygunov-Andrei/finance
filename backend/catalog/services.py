import json
import logging
from typing import List, Dict, Optional
from functools import lru_cache
from django.db.models import Q
from django.core.cache import cache
from fuzzywuzzy import fuzz
from .models import Product, ProductAlias

logger = logging.getLogger(__name__)


class ProductMatcher:
    """
    Сервис для поиска и сопоставления товаров.
    
    Двухуровневая стратегия:
    1. Exact / Alias / Fuzzy (>= 0.95) — автоматическое совпадение
    2. LLM-сравнение (0.60-0.95) — семантическая проверка для top-5 кандидатов
    
    Оптимизации:
    - Предварительная фильтрация по первым словам для сокращения выборки
    - Кэширование списка товаров на уровне instance
    - Batch-обработка для find_duplicates
    """
    
    EXACT_THRESHOLD = 0.95     # Точное совпадение (автоматически)
    FUZZY_THRESHOLD = 0.80     # Нечёткое, но вероятное
    LLM_THRESHOLD = 0.60       # Отправить в LLM для проверки
    LLM_CONFIDENCE_THRESHOLD = 0.8  # Минимальная уверенность LLM для подтверждения
    ALIAS_THRESHOLD = 0.7
    CACHE_KEY = 'product_matcher_products'
    CACHE_TIMEOUT = 300  # 5 минут
    
    def __init__(self):
        self._products_cache = None
    
    def _get_products_list(self, statuses=None, force_refresh: bool = False):
        """Получает список товаров с кэшированием"""
        if statuses is None:
            statuses = [Product.Status.NEW, Product.Status.VERIFIED]
        
        # Кэш на уровне instance для одного сеанса работы
        if self._products_cache is not None and not force_refresh:
            return self._products_cache
        
        # Пытаемся получить из Django cache
        cache_key = f"{self.CACHE_KEY}_{'-'.join(statuses)}"
        cached = cache.get(cache_key)
        
        if cached is not None and not force_refresh:
            self._products_cache = cached
            return cached
        
        # Загружаем из БД
        products = list(Product.objects.filter(
            status__in=statuses
        ).values_list('id', 'name', 'normalized_name'))
        
        # Сохраняем в кэш
        cache.set(cache_key, products, self.CACHE_TIMEOUT)
        self._products_cache = products
        
        return products
    
    def invalidate_cache(self):
        """Инвалидирует кэш товаров (вызывать после создания/изменения товаров)"""
        self._products_cache = None
        # Удаляем известные ключи кэша (delete_pattern только для Redis)
        for status in [Product.Status.NEW, Product.Status.VERIFIED]:
            cache.delete(f"{self.CACHE_KEY}_{status}")
        cache.delete(f"{self.CACHE_KEY}_NEW-VERIFIED")
    
    def _extract_first_word(self, normalized: str) -> str:
        """Извлекает первое слово для предварительной фильтрации"""
        words = normalized.split()
        return words[0] if words else ''
    
    def find_or_create_product(
        self,
        name: str,
        unit: str = 'шт',
        payment=None,
        use_llm: bool = True,
    ) -> tuple:
        """
        Ищет товар по названию или создаёт новый.
        
        Двухуровневая стратегия:
        1. Exact → Alias → High Fuzzy (>= 0.95) → автоматическое совпадение
        2. Medium Fuzzy (0.60-0.95) → LLM семантическое сравнение
        3. Создать новый товар
        
        Returns:
            tuple: (Product, created: bool)
        """
        normalized = Product.normalize_name(name)
        
        # 1. Точное совпадение по normalized_name (индексированный поиск)
        exact_match = Product.objects.filter(
            normalized_name=normalized,
            status__in=[Product.Status.NEW, Product.Status.VERIFIED]
        ).first()
        
        if exact_match:
            return exact_match, False
        
        # 2. Поиск в алиасах (индексированный поиск)
        alias_match = ProductAlias.objects.filter(
            normalized_alias=normalized,
            product__status__in=[Product.Status.NEW, Product.Status.VERIFIED]
        ).select_related('product').first()
        
        if alias_match:
            return alias_match.product, False
        
        # 3. Fuzzy поиск — высокая точность (>= 0.95)
        high_similar = self.find_similar(normalized, threshold=self.EXACT_THRESHOLD, limit=1)
        if high_similar:
            product = Product.objects.get(pk=high_similar[0]['product_id'])
            ProductAlias.objects.create(
                product=product,
                alias_name=name,
                source_payment=payment,
            )
            self.invalidate_cache()
            return product, False
        
        # 4. LLM-уровень — средняя точность (0.60-0.95)
        if use_llm:
            llm_match = self._try_llm_match(name, normalized, payment)
            if llm_match:
                return llm_match, False
        
        # 5. Создаём новый
        product = Product.objects.create(
            name=name,
            default_unit=unit,
            status=Product.Status.NEW,
            created_from_payment=payment,
        )
        self.invalidate_cache()
        return product, True
    
    def _try_llm_match(
        self, name: str, normalized: str, payment=None
    ) -> Optional[Product]:
        """
        Попытка LLM-сопоставления для неоднозначных случаев.
        
        Отправляет top-5 fuzzy-кандидатов (0.60-0.95) в LLM
        для семантического сравнения.
        
        Returns:
            Product если LLM подтвердил совпадение, иначе None
        """
        # Находим кандидатов в диапазоне 0.60-0.95
        candidates = self.find_similar(
            normalized,
            threshold=self.LLM_THRESHOLD,
            limit=5,
        )
        
        # Отсеиваем уже обработанные (score >= 0.95)
        candidates = [c for c in candidates if c['score'] < self.EXACT_THRESHOLD]
        
        if not candidates:
            return None
        
        try:
            results = compare_products_with_llm(
                product_name=name,
                candidates=[c['product_name'] for c in candidates],
            )
            
            for i, result in enumerate(results):
                if (
                    result.get('is_same', False)
                    and result.get('confidence', 0) >= self.LLM_CONFIDENCE_THRESHOLD
                    and i < len(candidates)
                ):
                    product = Product.objects.get(pk=candidates[i]['product_id'])
                    ProductAlias.objects.create(
                        product=product,
                        alias_name=name,
                        source_payment=payment,
                    )
                    self.invalidate_cache()
                    logger.info(
                        'LLM confirmed match: "%s" → "%s" (confidence=%.2f)',
                        name, product.name, result['confidence'],
                    )
                    return product
            
        except Exception as exc:
            logger.warning('LLM product comparison failed: %s', exc)
        
        return None
    
    def find_similar(
        self,
        name: str,
        threshold: float = 0.7,
        limit: int = 10,
        prefilter: bool = False  # Отключено по умолчанию для надежности
    ) -> List[Dict]:
        """
        Находит похожие товары по названию.
        
        Args:
            name: Название для поиска
            threshold: Минимальный порог схожести (0-1)
            limit: Максимальное количество результатов
            prefilter: Использовать предварительную фильтрацию по первому слову
        """
        normalized = Product.normalize_name(name) if not name.islower() else name
        
        # Получаем товары из кэша
        products = self._get_products_list()
        
        # Предварительная фильтрация по первому слову (опционально, для больших каталогов)
        if prefilter and len(products) > 1000 and len(normalized) > 3:
            first_word = self._extract_first_word(normalized)
            if len(first_word) >= 3:
                # Фильтруем только те, что начинаются с той же буквы или содержат первое слово
                filtered_products = [
                    (pid, pname, pnorm) for pid, pname, pnorm in products
                    if pnorm.startswith(first_word[:2]) or first_word in pnorm
                ]
                # Если после фильтрации осталось достаточно товаров, используем их
                if len(filtered_products) >= 10:
                    products = filtered_products
        
        results = []
        for prod_id, prod_name, prod_normalized in products:
            # Используем token_set_ratio для лучшего сравнения
            score = fuzz.token_set_ratio(normalized, prod_normalized) / 100.0
            
            if score >= threshold:
                results.append({
                    'product_id': prod_id,
                    'product_name': prod_name,
                    'score': score
                })
        
        # Сортируем по score и берём limit
        results.sort(key=lambda x: x['score'], reverse=True)
        return results[:limit]
    
    def find_duplicates(self, threshold: float = 0.8, limit: int = 50) -> List[Dict]:
        """
        Находит потенциальные дубликаты среди товаров.
        
        Оптимизации:
        - Использует кэшированный список товаров
        - Ранний выход при достижении лимита
        - Пропуск уже проверенных пар
        """
        products = self._get_products_list(statuses=[Product.Status.NEW])
        
        if not products:
            return []
        
        duplicates = []
        checked = set()
        
        # Группируем товары по первой букве для оптимизации
        by_first_letter = {}
        for prod_id, prod_name, prod_norm in products:
            first_letter = prod_norm[0] if prod_norm else ''
            if first_letter not in by_first_letter:
                by_first_letter[first_letter] = []
            by_first_letter[first_letter].append((prod_id, prod_name, prod_norm))
        
        for i, (id1, name1, norm1) in enumerate(products):
            if id1 in checked:
                continue
            
            if len(duplicates) >= limit:
                break
            
            similar = []
            first_letter = norm1[0] if norm1 else ''
            
            # Сначала проверяем товары с той же первой буквой
            candidates = by_first_letter.get(first_letter, [])
            
            for id2, name2, norm2 in candidates:
                if id2 <= id1 or id2 in checked:
                    continue
                
                score = fuzz.token_set_ratio(norm1, norm2) / 100.0
                if score >= threshold:
                    similar.append({
                        'id': id2,
                        'name': name2,
                        'score': score
                    })
                    checked.add(id2)
            
            if similar:
                checked.add(id1)
                duplicates.append({
                    'product': {'id': id1, 'name': name1},
                    'similar': similar
                })
        
        return duplicates


# =============================================================================
# LLM-сравнение товаров — вспомогательная функция
# =============================================================================

def compare_products_with_llm(
    product_name: str,
    candidates: List[str],
) -> List[Dict]:
    """
    Сравнивает товар с кандидатами через LLM.
    
    Отправляет маленький prompt с product_name и списком кандидатов,
    получает JSON-ответ: [{is_same: bool, confidence: float}]
    
    Args:
        product_name: Название товара из счёта
        candidates: Список названий кандидатов из каталога (макс 5)
        
    Returns:
        Список результатов: [{"is_same": bool, "confidence": float}, ...]
    """
    from llm_services.models import LLMProvider as LLMProviderModel
    from llm_services.providers.openai_provider import OpenAIProvider
    from llm_services.providers.gemini_provider import GeminiProvider
    from llm_services.providers.grok_provider import GrokProvider

    # Получить активного провайдера
    provider_record = LLMProviderModel.objects.filter(is_active=True).first()
    if not provider_record:
        raise RuntimeError('Нет активного LLM-провайдера')

    provider_map = {
        'openai': OpenAIProvider,
        'gemini': GeminiProvider,
        'grok': GrokProvider,
    }
    provider_cls = provider_map.get(provider_record.provider_type)
    if not provider_cls:
        raise RuntimeError(f'Неизвестный провайдер: {provider_record.provider_type}')

    # Формируем prompt
    candidates_text = '\n'.join(
        f'{i+1}. "{c}"' for i, c in enumerate(candidates)
    )
    prompt = f"""Сравни товар "{product_name}" с кандидатами из каталога.
Определи, является ли товар тем же самым (возможно записан немного по-другому).

Кандидаты:
{candidates_text}

Ответь строго в формате JSON — массив объектов:
[
  {{"candidate_index": 1, "is_same": true/false, "confidence": 0.0-1.0, "reason": "краткое пояснение"}}
]

Правила:
- is_same=true только если это ТОЧНО один и тот же товар/услуга
- confidence — уверенность от 0.0 до 1.0
- Учитывай: единицы измерения, размеры, бренд, тип
- "Болт М6х30" и "Болт М6х30 оцинк." — РАЗНЫЕ товары (разное покрытие)
- "Болт 6мм" и "Болт 6 мм" — ОДИНАКОВЫЕ товары (пробел)
- Ответь ТОЛЬКО JSON без markdown."""

    # Вызов LLM через низкоуровневый API
    try:
        import openai
        import httpx

        if provider_record.provider_type == 'openai':
            client = openai.OpenAI(api_key=provider_record.api_key)
            response = client.chat.completions.create(
                model=provider_record.model_name,
                messages=[
                    {'role': 'system', 'content': 'Ты эксперт по сопоставлению товаров. Отвечай только JSON.'},
                    {'role': 'user', 'content': prompt},
                ],
                temperature=0.1,
                max_tokens=500,
            )
            raw_text = response.choices[0].message.content.strip()

        elif provider_record.provider_type == 'grok':
            with httpx.Client(timeout=30) as client:
                resp = client.post(
                    'https://api.x.ai/v1/chat/completions',
                    headers={
                        'Authorization': f'Bearer {provider_record.api_key}',
                        'Content-Type': 'application/json',
                    },
                    json={
                        'model': provider_record.model_name,
                        'messages': [
                            {'role': 'system', 'content': 'Ты эксперт по сопоставлению товаров. Отвечай только JSON.'},
                            {'role': 'user', 'content': prompt},
                        ],
                        'temperature': 0.1,
                        'max_tokens': 500,
                    },
                )
                resp.raise_for_status()
                raw_text = resp.json()['choices'][0]['message']['content'].strip()

        elif provider_record.provider_type == 'gemini':
            import google.generativeai as genai
            genai.configure(api_key=provider_record.api_key)
            model = genai.GenerativeModel(provider_record.model_name)
            response = model.generate_content(prompt)
            raw_text = response.text.strip()

        else:
            raise RuntimeError(f'Unsupported provider: {provider_record.provider_type}')

        # Парсим JSON
        # Убираем markdown-обёртку если есть
        if raw_text.startswith('```'):
            raw_text = raw_text.strip('`').strip()
            if raw_text.startswith('json'):
                raw_text = raw_text[4:].strip()

        results = json.loads(raw_text)
        if not isinstance(results, list):
            results = [results]

        return results

    except json.JSONDecodeError as exc:
        logger.warning('LLM returned invalid JSON for product comparison: %s', exc)
        return []
    except Exception as exc:
        logger.warning('LLM product comparison error: %s', exc)
        return []
