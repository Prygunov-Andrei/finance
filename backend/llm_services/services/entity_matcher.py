from typing import Optional, List, Dict
from fuzzywuzzy import fuzz
from accounting.models import Counterparty, LegalEntity


class CounterpartyMatcher:
    """Сервис для сопоставления контрагентов"""
    
    EXACT_THRESHOLD = 0.95
    SIMILAR_THRESHOLD = 0.8
    
    def find_by_inn(self, inn: str) -> Optional[Counterparty]:
        """Точный поиск по ИНН"""
        return Counterparty.objects.filter(inn=inn, is_active=True).first()
    
    def find_similar_by_name(
        self,
        name: str,
        limit: int = 5
    ) -> List[Dict]:
        """Fuzzy-поиск по названию"""
        counterparties = Counterparty.objects.filter(
            is_active=True
        ).values_list('id', 'name', 'short_name', 'inn')
        
        results = []
        name_lower = name.lower()
        
        for cp_id, cp_name, cp_short, cp_inn in counterparties:
            # Сравниваем с полным и коротким названием
            score_full = fuzz.token_set_ratio(name_lower, cp_name.lower()) / 100.0
            score_short = 0
            if cp_short:
                score_short = fuzz.token_set_ratio(name_lower, cp_short.lower()) / 100.0
            
            max_score = max(score_full, score_short)
            
            if max_score >= self.SIMILAR_THRESHOLD:
                results.append({
                    'id': cp_id,
                    'name': cp_name,
                    'short_name': cp_short,
                    'inn': cp_inn,
                    'score': max_score
                })
        
        results.sort(key=lambda x: x['score'], reverse=True)
        return results[:limit]
    
    def match(self, name: str, inn: str) -> Dict:
        """
        Полный поиск контрагента.
        
        Returns:
            {
                'match_type': 'exact' | 'similar' | 'not_found',
                'counterparty': Counterparty | None,
                'suggestions': [...]
            }
        """
        # 1. Точный поиск по ИНН
        if inn:
            exact = self.find_by_inn(inn)
            if exact:
                return {
                    'match_type': 'exact',
                    'counterparty': exact,
                    'suggestions': []
                }
        
        # 2. Fuzzy-поиск по названию
        similar = self.find_similar_by_name(name)
        if similar and similar[0]['score'] >= self.EXACT_THRESHOLD:
            counterparty = Counterparty.objects.get(pk=similar[0]['id'])
            return {
                'match_type': 'exact',
                'counterparty': counterparty,
                'suggestions': []
            }
        
        if similar:
            return {
                'match_type': 'similar',
                'counterparty': None,
                'suggestions': similar
            }
        
        return {
            'match_type': 'not_found',
            'counterparty': None,
            'suggestions': []
        }


class LegalEntityMatcher:
    """Сервис для сопоставления наших юрлиц"""
    
    def find_by_inn(self, inn: str) -> Optional[LegalEntity]:
        """Точный поиск по ИНН"""
        return LegalEntity.objects.filter(inn=inn, is_active=True).first()
    
    def match(self, name: str, inn: str) -> Dict:
        """
        Поиск нашего юрлица.
        
        Returns:
            {
                'match_type': 'exact' | 'not_found',
                'legal_entity': LegalEntity | None,
                'error': str | None
            }
        """
        if inn:
            entity = self.find_by_inn(inn)
            if entity:
                return {
                    'match_type': 'exact',
                    'legal_entity': entity,
                    'error': None
                }
        
        return {
            'match_type': 'not_found',
            'legal_entity': None,
            'error': f'Юридическое лицо с ИНН {inn} не найдено в системе'
        }
