"""
Общий LLM-клиент для news app.
Используется в discovery_service.py и rating_service.py.
Поддерживает Grok, Anthropic, Gemini, OpenAI с fallback chain.
"""
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)


class NewsLLMClient:
    """
    Клиент для вызова LLM API с поддержкой нескольких провайдеров и fallback chain.
    Трекинг токенов и стоимости через callback.
    """

    def __init__(
        self,
        primary_provider: str = 'grok',
        fallback_chain: Optional[List[str]] = None,
        temperature: float = 0.3,
        timeout: int = 120,
        grok_model: str = 'grok-4-1-fast',
        anthropic_model: str = 'claude-3-5-haiku-20241022',
        gemini_model: str = 'gemini-2.0-flash-exp',
        openai_model: str = 'gpt-4o',
        on_api_call: Optional[callable] = None,
    ):
        self.primary_provider = primary_provider
        self.fallback_chain = fallback_chain or []
        self.temperature = temperature
        self.timeout = timeout

        self.grok_model = grok_model
        self.anthropic_model = anthropic_model
        self.gemini_model = gemini_model
        self.openai_model = openai_model

        # API ключи из settings
        self.grok_api_key = getattr(settings, 'XAI_API_KEY', '')
        self.anthropic_api_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
        self.gemini_api_key = getattr(settings, 'GEMINI_API_KEY', '')
        self.openai_api_key = getattr(settings, 'TRANSLATION_API_KEY', '')

        # Callback для трекинга: on_api_call(provider, input_tokens, output_tokens, cost, success)
        self.on_api_call = on_api_call

    @classmethod
    def from_rating_config(cls, config, on_api_call=None) -> 'NewsLLMClient':
        """Создаёт клиент из RatingConfiguration."""
        return cls(
            primary_provider=config.primary_provider,
            fallback_chain=config.fallback_chain or [],
            temperature=config.temperature,
            timeout=config.timeout,
            grok_model=config.grok_model,
            anthropic_model=config.anthropic_model,
            gemini_model=config.gemini_model,
            openai_model=config.openai_model,
            on_api_call=on_api_call,
        )

    @classmethod
    def from_search_config(cls, config, on_api_call=None) -> 'NewsLLMClient':
        """Создаёт клиент из SearchConfiguration."""
        return cls(
            primary_provider=config.primary_provider,
            fallback_chain=config.fallback_chain or [],
            temperature=config.temperature,
            timeout=config.timeout,
            grok_model=config.grok_model,
            anthropic_model=config.anthropic_model,
            gemini_model=config.gemini_model,
            openai_model=config.openai_model,
            on_api_call=on_api_call,
        )

    # ========================================================================
    # Публичный API
    # ========================================================================

    def query(self, prompt: str) -> Optional[dict]:
        """
        Запрос к LLM с fallback chain.
        Возвращает распарсенный JSON или None.
        """
        providers = [self.primary_provider] + self.fallback_chain
        errors = []

        for provider in providers:
            try:
                if provider == 'grok' and self.grok_api_key:
                    return self._query_grok(prompt)
                elif provider == 'anthropic' and self.anthropic_api_key:
                    return self._query_anthropic(prompt)
                elif provider == 'gemini' and self.gemini_api_key:
                    return self._query_gemini(prompt)
                elif provider == 'openai' and self.openai_api_key:
                    return self._query_openai(prompt)
            except Exception as e:
                errors.append(f"{provider}: {str(e)}")
                logger.warning("LLM provider %s failed: %s", provider, str(e))
                continue

        logger.error("All LLM providers failed: %s", "; ".join(errors))
        return None

    def query_raw(self, prompt: str) -> Optional[str]:
        """
        Запрос к LLM, возвращает сырой текст ответа (без парсинга JSON).
        """
        providers = [self.primary_provider] + self.fallback_chain
        errors = []

        for provider in providers:
            try:
                if provider == 'grok' and self.grok_api_key:
                    return self._query_grok_raw(prompt)
                elif provider == 'anthropic' and self.anthropic_api_key:
                    return self._query_anthropic_raw(prompt)
                elif provider == 'gemini' and self.gemini_api_key:
                    return self._query_gemini_raw(prompt)
                elif provider == 'openai' and self.openai_api_key:
                    return self._query_openai_raw(prompt)
            except Exception as e:
                errors.append(f"{provider}: {str(e)}")
                logger.warning("LLM provider %s failed: %s", provider, str(e))
                continue

        logger.error("All LLM providers failed (raw): %s", "; ".join(errors))
        return None

    # ========================================================================
    # Провайдеры
    # ========================================================================

    def _query_grok(self, prompt: str) -> Optional[dict]:
        content = self._query_grok_raw(prompt)
        return self._parse_json_response(content) if content else None

    def _query_grok_raw(self, prompt: str) -> Optional[str]:
        start = time.monotonic()
        client = httpx.Client(timeout=self.timeout)
        response = client.post(
            'https://api.x.ai/v1/chat/completions',
            headers={'Authorization': f'Bearer {self.grok_api_key}', 'Content-Type': 'application/json'},
            json={'model': self.grok_model, 'messages': [{'role': 'user', 'content': prompt}], 'temperature': self.temperature},
        )
        response.raise_for_status()
        data = response.json()
        content = data['choices'][0]['message']['content']
        self._track('grok', data.get('usage', {}), time.monotonic() - start)
        return content

    def _query_anthropic(self, prompt: str) -> Optional[dict]:
        content = self._query_anthropic_raw(prompt)
        return self._parse_json_response(content) if content else None

    def _query_anthropic_raw(self, prompt: str) -> Optional[str]:
        start = time.monotonic()
        client = httpx.Client(timeout=self.timeout)
        response = client.post(
            'https://api.anthropic.com/v1/messages',
            headers={'x-api-key': self.anthropic_api_key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
            json={'model': self.anthropic_model, 'max_tokens': 4000, 'messages': [{'role': 'user', 'content': prompt}], 'temperature': self.temperature},
        )
        response.raise_for_status()
        data = response.json()
        content = data['content'][0]['text']
        usage = data.get('usage', {})
        self._track('anthropic', {'prompt_tokens': usage.get('input_tokens', 0), 'completion_tokens': usage.get('output_tokens', 0)}, time.monotonic() - start)
        return content

    def _query_gemini(self, prompt: str) -> Optional[dict]:
        content = self._query_gemini_raw(prompt)
        return self._parse_json_response(content) if content else None

    def _query_gemini_raw(self, prompt: str) -> Optional[str]:
        start = time.monotonic()
        client = httpx.Client(timeout=self.timeout)
        response = client.post(
            f'https://generativelanguage.googleapis.com/v1beta/models/{self.gemini_model}:generateContent',
            params={'key': self.gemini_api_key},
            json={'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'temperature': self.temperature}},
        )
        response.raise_for_status()
        data = response.json()
        content = data['candidates'][0]['content']['parts'][0]['text']
        usage = data.get('usageMetadata', {})
        self._track('gemini', {'prompt_tokens': usage.get('promptTokenCount', 0), 'completion_tokens': usage.get('candidatesTokenCount', 0)}, time.monotonic() - start)
        return content

    def _query_openai(self, prompt: str) -> Optional[dict]:
        content = self._query_openai_raw(prompt)
        return self._parse_json_response(content) if content else None

    def _query_openai_raw(self, prompt: str) -> Optional[str]:
        start = time.monotonic()
        client = httpx.Client(timeout=self.timeout)
        response = client.post(
            'https://api.openai.com/v1/chat/completions',
            headers={'Authorization': f'Bearer {self.openai_api_key}', 'Content-Type': 'application/json'},
            json={'model': self.openai_model, 'messages': [{'role': 'user', 'content': prompt}], 'temperature': self.temperature},
        )
        response.raise_for_status()
        data = response.json()
        content = data['choices'][0]['message']['content']
        self._track('openai', data.get('usage', {}), time.monotonic() - start)
        return content

    # ========================================================================
    # Утилиты
    # ========================================================================

    def _track(self, provider: str, usage: dict, duration: float):
        """Вызывает callback для трекинга API-вызова."""
        if self.on_api_call:
            input_tokens = usage.get('prompt_tokens', 0) or usage.get('input_tokens', 0)
            output_tokens = usage.get('completion_tokens', 0) or usage.get('output_tokens', 0)
            try:
                self.on_api_call(provider, input_tokens, output_tokens, True)
            except Exception as e:
                logger.warning("on_api_call callback failed: %s", str(e))

    @staticmethod
    def _parse_json_response(content: str) -> Optional[dict]:
        """Парсит JSON из ответа LLM (с обработкой markdown code blocks)."""
        if not content:
            return None

        content = content.strip()
        # Убираем markdown code blocks
        if content.startswith('```'):
            lines = content.split('\n')
            if lines[0].startswith('```'):
                lines = lines[1:]
            if lines and lines[-1].strip() == '```':
                lines = lines[:-1]
            content = '\n'.join(lines)

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        match = re.search(r'\{[\s\S]*\}', content)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass

        logger.warning("Failed to parse JSON from LLM response: %s", content[:200])
        return None
