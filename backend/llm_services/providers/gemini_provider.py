import base64
import json
import time
from typing import Tuple

import httpx

from .base import BaseLLMProvider
from ..schemas import ParsedInvoice
from ..services.exceptions import RateLimitError


class GeminiProvider(BaseLLMProvider):
    """Провайдер Google Gemini (REST API)"""

    BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
    REQUEST_TIMEOUT = 120.0

    def __init__(self, api_key: str, model_name: str = "gemini-3-flash-preview"):
        super().__init__(api_key, model_name)

    def parse_invoice(self, file_content: bytes, file_type: str = 'pdf') -> Tuple[ParsedInvoice, int]:
        """
        Парсит счёт (PDF или изображение) через Gemini REST API

        Args:
            file_content: Содержимое файла в байтах
            file_type: Тип файла ('pdf', 'png', 'jpg', 'jpeg')
        """
        start_time = time.time()

        if file_type.lower() == 'pdf':
            images_b64 = self.pdf_to_images_base64(file_content)
        else:
            images_b64 = self.image_to_base64(file_content)

        # Формируем parts для Gemini API
        parts = [
            {"text": self.get_system_prompt() + "\n\nРаспарси этот счёт на оплату:"}
        ]
        for img_b64 in images_b64:
            parts.append({
                "inline_data": {
                    "mime_type": "image/png",
                    "data": img_b64,
                }
            })

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
        }

        url = f"{self.BASE_URL}/models/{self.model_name}:generateContent?key={self.api_key}"

        try:
            with httpx.Client(timeout=self.REQUEST_TIMEOUT) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise RateLimitError(str(e))
            raise
        except httpx.ReadTimeout as e:
            raise RateLimitError(f"Gemini timeout: {e}")

        processing_time = int((time.time() - start_time) * 1000)

        resp_data = response.json()
        candidates = resp_data.get("candidates", [])
        if not candidates:
            raise ValueError(f"Пустой ответ от Gemini API: {resp_data}")

        text = candidates[0]["content"]["parts"][0]["text"]
        data = json.loads(text)
        parsed = ParsedInvoice(**data)
        return parsed, processing_time
