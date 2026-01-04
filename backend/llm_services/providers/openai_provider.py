import json
import time
from typing import Tuple

from openai import OpenAI

from .base import BaseLLMProvider
from ..schemas import ParsedInvoice


class OpenAIProvider(BaseLLMProvider):
    """Провайдер OpenAI GPT-4 Vision"""
    
    # Таймаут на запрос (секунды)
    REQUEST_TIMEOUT = 120.0
    
    def __init__(self, api_key: str, model_name: str = "gpt-4o"):
        super().__init__(api_key, model_name)
        self.client = OpenAI(
            api_key=api_key,
            timeout=self.REQUEST_TIMEOUT,
            max_retries=2
        )
    
    def parse_invoice(self, file_content: bytes, file_type: str = 'pdf') -> Tuple[ParsedInvoice, int]:
        """
        Парсит счёт (PDF или изображение) через GPT-4 Vision.
        
        Args:
            file_content: Содержимое файла в байтах
            file_type: Тип файла ('pdf', 'png', 'jpg', 'jpeg')
        
        Returns:
            tuple: (ParsedInvoice, processing_time_ms)
        """
        start_time = time.time()
        
        # Конвертируем файл в изображения (используем общие методы из базового класса)
        if file_type.lower() == 'pdf':
            images = self.pdf_to_images_base64(file_content)
        else:
            images = self.image_to_base64(file_content)
        
        # Формируем сообщения с изображениями
        messages = [
            {"role": "system", "content": self.get_system_prompt()},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Распарси этот счёт на оплату:"},
                    *[
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{img}",
                                "detail": "high"
                            }
                        }
                        for img in images
                    ]
                ]
            }
        ]
        
        # GPT-5 модели имеют особенности:
        # - nano/mini: требуют max_completion_tokens и не поддерживают temperature (только default 1)
        # - другие GPT-5: требуют max_completion_tokens, но поддерживают temperature
        is_gpt5 = 'gpt-5' in self.model_name.lower()
        is_gpt5_nano_or_mini = 'gpt-5-nano' in self.model_name.lower() or 'gpt-5-mini' in self.model_name.lower()
        
        request_params = {
            "model": self.model_name,
            "messages": messages,
            "response_format": {"type": "json_object"}
        }
        
        if is_gpt5:
            request_params["max_completion_tokens"] = 4096
            # nano/mini не поддерживают temperature (только default 1)
            if not is_gpt5_nano_or_mini:
                request_params["temperature"] = 0.1
        else:
            request_params["max_tokens"] = 4096
            request_params["temperature"] = 0.1
        
        response = self.client.chat.completions.create(**request_params)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Парсим ответ
        content = response.choices[0].message.content
        data = json.loads(content)
        
        parsed = ParsedInvoice(**data)
        return parsed, processing_time