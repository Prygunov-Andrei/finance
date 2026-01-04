from typing import List, Dict, Optional
from functools import lru_cache
from django.db.models import Q
from django.core.cache import cache
from fuzzywuzzy import fuzz
from .models import Product, ProductAlias


class ProductMatcher:
    """
    Сервис для поиска и сопоставления товаров.
    
    Оптимизации:
    - Предварительная фильтрация по первым словам для сокращения выборки
    - Кэширование списка товаров на уровне instance
    - Batch-обработка для find_duplicates
    """
    
    EXACT_THRESHOLD = 0.9
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
        payment=None
    ) -> tuple[Product, bool]:
        """
        Ищет товар по названию или создаёт новый.
        
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
        
        # 3. Fuzzy поиск
        similar = self.find_similar(normalized, threshold=self.EXACT_THRESHOLD, limit=1)
        if similar:
            product = Product.objects.get(pk=similar[0]['product_id'])
            # Создаём алиас
            ProductAlias.objects.create(
                product=product,
                alias_name=name,
                source_payment=payment
            )
            # Инвалидируем кэш так как добавился новый алиас
            self.invalidate_cache()
            return product, False
        
        # 4. Создаём новый
        product = Product.objects.create(
            name=name,
            default_unit=unit,
            status=Product.Status.NEW,
            created_from_payment=payment
        )
        # Инвалидируем кэш
        self.invalidate_cache()
        return product, True
    
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
