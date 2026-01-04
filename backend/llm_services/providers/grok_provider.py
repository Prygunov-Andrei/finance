import json
import time
from typing import Tuple

import httpx
from httpx import HTTPStatusError

from .base import BaseLLMProvider
from ..schemas import ParsedInvoice
from ..services.exceptions import RateLimitError


class GrokProvider(BaseLLMProvider):
    """Провайдер xAI Grok"""
    
    BASE_URL = "https://api.x.ai/v1"
    REQUEST_TIMEOUT = 120.0  # Таймаут на запрос (секунды)
    
    def __init__(self, api_key: str, model_name: str = "grok-2-vision-1212"):
        super().__init__(api_key, model_name)
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def parse_invoice(self, file_content: bytes, file_type: str = 'pdf') -> Tuple[ParsedInvoice, int]:
        """
        Парсит счёт (PDF или изображение) через Grok Vision
        
        Args:
            file_content: Содержимое файла в байтах
            file_type: Тип файла ('pdf', 'png', 'jpg', 'jpeg')
        """
        start_time = time.time()
        
        # Используем общие методы из базового класса
        if file_type.lower() == 'pdf':
            images = self.pdf_to_images_base64(file_content)
        else:
            images = self.image_to_base64(file_content)
        
        # Формируем запрос в формате OpenAI-совместимого API
        content = [
            {"type": "text", "text": self.get_system_prompt() + "\n\nРаспарси этот счёт на оплату:"}
        ]
        for img_b64 in images:
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{img_b64}",
                    "detail": "high"
                }
            })
        
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": self.get_system_prompt()},
                {"role": "user", "content": content}
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }
        
        try:
            with httpx.Client(timeout=self.REQUEST_TIMEOUT) as client:
                response = client.post(
                    f"{self.BASE_URL}/chat/completions",
                    headers=self.headers,
                    json=payload
                )
                response.raise_for_status()
        except HTTPStatusError as e:
            if e.response.status_code == 429:
                raise RateLimitError(str(e))
            raise
        except httpx.ReadTimeout as e:
            raise RateLimitError(f"The read operation timed out: {e}")
        
        processing_time = int((time.time() - start_time) * 1000)
        
        data = response.json()
        
        # Проверяем структуру ответа
        if "choices" not in data or len(data["choices"]) == 0:
            raise ValueError(f"Неожиданный формат ответа от Grok API: {data}")
        
        content = data["choices"][0]["message"]["content"]
        
        # Если content пустой или не JSON, пытаемся найти JSON в тексте
        if not content or content.strip() == "":
            raise ValueError("Пустой ответ от Grok API")
        
        # Пробуем парсить как JSON
        try:
            parsed_data = json.loads(content)
        except json.JSONDecodeError:
            # Если не JSON, возможно ответ в markdown или тексте - пытаемся извлечь JSON
            import re
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                parsed_data = json.loads(json_match.group())
            else:
                raise ValueError(f"Не удалось распарсить JSON из ответа: {content[:200]}")
        
        parsed = ParsedInvoice(**parsed_data)
        return parsed, processing_time
