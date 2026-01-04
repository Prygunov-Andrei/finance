import base64
import hashlib
from abc import ABC, abstractmethod
from io import BytesIO
from typing import List, Tuple, Union

import fitz  # PyMuPDF
from PIL import Image

from ..schemas import ParsedInvoice


class BaseLLMProvider(ABC):
    """Базовый класс для LLM-провайдеров"""
    
    def __init__(self, api_key: str, model_name: str):
        self.api_key = api_key
        self.model_name = model_name
    
    @abstractmethod
    def parse_invoice(self, file_content: bytes, file_type: str = 'pdf') -> Tuple[ParsedInvoice, int]:
        """
        Парсит счёт (PDF или изображение) и возвращает структурированные данные.
        
        Args:
            file_content: Содержимое файла в байтах (PDF, PNG, JPG)
            file_type: Тип файла ('pdf', 'png', 'jpg', 'jpeg')
            
        Returns:
            tuple: (ParsedInvoice, processing_time_ms)
        """
        pass
    
    # ========== Утилиты для конвертации файлов ==========
    
    @staticmethod
    def pdf_to_images_base64(pdf_content: bytes, dpi: int = 150) -> List[str]:
        """
        Конвертирует PDF в base64-изображения.
        Используется OpenAI и Grok провайдерами.
        
        Args:
            pdf_content: Содержимое PDF в байтах
            dpi: Разрешение рендеринга (по умолчанию 150)
        
        Returns:
            Список base64-encoded PNG изображений
        """
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        images = []
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            images.append(base64.b64encode(img_bytes).decode())
        
        doc.close()
        return images
    
    @staticmethod
    def pdf_to_images_pil(pdf_content: bytes, dpi: int = 150) -> List[Image.Image]:
        """
        Конвертирует PDF в PIL Images.
        Используется Gemini провайдером.
        
        Args:
            pdf_content: Содержимое PDF в байтах
            dpi: Разрешение рендеринга (по умолчанию 150)
        
        Returns:
            Список PIL Image объектов
        """
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        images = []
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            img = Image.open(BytesIO(img_bytes))
            images.append(img)
        
        doc.close()
        return images
    
    @staticmethod
    def image_to_base64(image_content: bytes) -> List[str]:
        """
        Конвертирует изображение (PNG/JPG) в base64.
        
        Args:
            image_content: Содержимое изображения в байтах
        
        Returns:
            Список с одним base64-encoded изображением
        """
        return [base64.b64encode(image_content).decode()]
    
    @staticmethod
    def image_to_pil(image_content: bytes) -> List[Image.Image]:
        """
        Конвертирует изображение (PNG/JPG) в PIL Image.
        
        Args:
            image_content: Содержимое изображения в байтах
        
        Returns:
            Список с одним PIL Image объектом
        """
        return [Image.open(BytesIO(image_content))]
    
    def get_system_prompt(self) -> str:
        """Системный промпт для LLM"""
        return """Ты — эксперт по распознаванию российских счетов на оплату.
        
Твоя задача — извлечь все данные из счёта и вернуть их в формате JSON.

Обязательные поля:
- vendor: информация о поставщике (name, inn, kpp)
- buyer: информация о покупателе (name, inn)  
- invoice: номер и дата счёта (number, date в формате YYYY-MM-DD)
- totals: итоговые суммы (amount_gross — сумма с НДС, vat_amount — сумма НДС)
- items: массив позиций (name, quantity, unit, price_per_unit)
- confidence: твоя уверенность в корректности данных от 0.0 до 1.0

Правила:
1. Если не можешь определить значение — используй null
2. ИНН должен быть строкой из 10 или 12 цифр
3. Цены и суммы — десятичные числа
4. Единицы измерения: шт, м, м², м³, кг, т, л, компл, ч, усл, ед
5. Дата в формате YYYY-MM-DD

Верни ТОЛЬКО валидный JSON без markdown-форматирования."""
    
    @staticmethod
    def calculate_file_hash(content: bytes) -> str:
        """Вычисляет SHA256 хэш файла"""
        return hashlib.sha256(content).hexdigest()
