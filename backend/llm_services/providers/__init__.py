from .base import BaseLLMProvider
from .openai_provider import OpenAIProvider
from .gemini_provider import GeminiProvider
from .grok_provider import GrokProvider
from ..models import LLMProvider


def get_provider(provider_model: LLMProvider = None) -> BaseLLMProvider:
    """
    Фабрика для создания LLM-провайдера.
    
    Args:
        provider_model: Модель провайдера из БД. Если None — берёт по умолчанию.
    
    Returns:
        Экземпляр провайдера
    """
    if provider_model is None:
        provider_model = LLMProvider.get_default()
    
    api_key = provider_model.get_api_key()
    
    providers_map = {
        LLMProvider.ProviderType.OPENAI: OpenAIProvider,
        LLMProvider.ProviderType.GEMINI: GeminiProvider,
        LLMProvider.ProviderType.GROK: GrokProvider,
    }
    
    provider_class = providers_map.get(provider_model.provider_type)
    if not provider_class:
        raise ValueError(f"Неизвестный тип провайдера: {provider_model.provider_type}")
    
    return provider_class(api_key=api_key, model_name=provider_model.model_name)
