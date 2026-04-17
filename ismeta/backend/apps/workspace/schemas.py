"""Pydantic-схемы для JSONB-полей Workspace (CONTRIBUTING §10.1)."""

from pydantic import BaseModel, Field


class WorkspaceSettings(BaseModel):
    """Настройки workspace, хранятся в Workspace.settings JSONB.

    Расширяется по мере эпиков. Сейчас — минимальный набор.
    """

    llm_provider_id: str | None = Field(
        default=None,
        description="ID LLM-провайдера по умолчанию для workspace.",
    )
    default_material_markup_percent: int = Field(
        default=30,
        ge=0,
        le=1000,
        description="Наценка на материалы по умолчанию, %.",
    )
    default_work_markup_percent: int = Field(
        default=300,
        ge=0,
        le=1000,
        description="Наценка на работы по умолчанию, %.",
    )
