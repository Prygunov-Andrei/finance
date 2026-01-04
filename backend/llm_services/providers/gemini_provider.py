import json
import time
from typing import Tuple

import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted

from .base import BaseLLMProvider
from ..schemas import ParsedInvoice
from ..services.exceptions import RateLimitError


class GeminiProvider(BaseLLMProvider):
    """Провайдер Google Gemini"""
    
    REQUEST_TIMEOUT = 120  # Таймаут на запрос (секунды)
    
    def __init__(self, api_key: str, model_name: str = "gemini-3-flash-preview"):
        super().__init__(api_key, model_name)
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
    
    def parse_invoice(self, file_content: bytes, file_type: str = 'pdf') -> Tuple[ParsedInvoice, int]:
        """
        Парсит счёт (PDF или изображение) через Gemini
        
        Args:
            file_content: Содержимое файла в байтах
            file_type: Тип файла ('pdf', 'png', 'jpg', 'jpeg')
        """
        start_time = time.time()
        
        # Конвертируем файл в изображения PIL (используем общие методы из базового класса)
        if file_type.lower() == 'pdf':
            images = self.pdf_to_images_pil(file_content)
        else:
            images = self.image_to_pil(file_content)
        
        # Формируем контент
        content_parts = [self.get_system_prompt() + "\n\nРаспарси этот счёт на оплату:"]
        for img in images:
            content_parts.append(img)
        
        try:
            response = self.model.generate_content(
                content_parts,
                generation_config=genai.GenerationConfig(
                    temperature=0.1,
                    response_mime_type="application/json"
                ),
                request_options={"timeout": self.REQUEST_TIMEOUT}
            )
        except ResourceExhausted as e:
            raise RateLimitError(str(e))
        
        processing_time = int((time.time() - start_time) * 1000)
        
        data = json.loads(response.text)
        parsed = ParsedInvoice(**data)
        return parsed, processing_time