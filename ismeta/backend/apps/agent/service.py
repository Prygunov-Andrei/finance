"""AgentService — validate (одиночный вызов) и chat (ReAct loop)."""

import json
import logging
from decimal import Decimal

from apps.estimate.models import Estimate, EstimateItem
from apps.llm.service import LLMService, calc_cost

from .models import ChatMessage, ChatSession
from .prompts.system_v1 import SYSTEM_PROMPT, VALIDATE_USER_PROMPT
from .tools import TOOLS, execute_tool

logger = logging.getLogger(__name__)

MAX_REACT_STEPS = 5


class AgentService:
    @staticmethod
    def validate(estimate_id: str, workspace_id: str) -> dict:
        """Валидация сметы: одиночный LLM-вызов → список issues."""
        estimate = Estimate.objects.get(id=estimate_id, workspace_id=workspace_id)
        items = EstimateItem.objects.filter(
            estimate_id=estimate_id, workspace_id=workspace_id
        )

        items_text = "\n".join(
            f"- {i.name} ({i.unit}): кол-во {i.quantity}, оборуд. {i.equipment_price}₽, "
            f"мат. {i.material_price}₽, работы {i.work_price}₽, итого {i.total}₽"
            for i in items
        )

        user_prompt = VALIDATE_USER_PROMPT.format(
            estimate_name=estimate.name,
            count=items.count(),
            items_text=items_text or "(пусто)",
        )

        svc = LLMService(workspace_id=workspace_id, task_type="validation", estimate_id=estimate_id)
        resp = svc.complete_sync(messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ])

        try:
            data = json.loads(resp.content)
            issues = data.get("issues", [])
            summary = data.get("summary", "")
        except (json.JSONDecodeError, TypeError, KeyError) as e:
            logger.warning("Validate: failed to parse LLM response: %s", e)
            issues = []
            summary = "Не удалось проанализировать ответ ИИ"

        # Связать item_id если можем
        item_map = {i.name.lower(): str(i.id) for i in items}
        for issue in issues:
            name = issue.get("item_name", "").lower()
            issue["item_id"] = item_map.get(name)

        return {
            "issues": issues,
            "summary": summary,
            "tokens_used": resp.tokens_in + resp.tokens_out,
            "cost_usd": float(calc_cost(resp.model, resp.tokens_in, resp.tokens_out)),
        }

    @staticmethod
    def chat(estimate_id: str, workspace_id: str, user_message: str) -> dict:
        """Chat: ReAct loop с tools. Возвращает полный ответ (fake streaming для MVP)."""
        # Get or create session
        session, _ = ChatSession.objects.get_or_create(
            estimate_id=estimate_id, workspace_id=workspace_id,
        )

        # Save user message
        ChatMessage.objects.create(
            session=session, role="user", content=user_message,
        )

        # Build messages from history (last 20)
        history = ChatMessage.objects.filter(session=session).order_by("created_at")[:20]
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in history:
            messages.append({"role": msg.role, "content": msg.content})

        svc = LLMService(workspace_id=workspace_id, task_type="chat", estimate_id=estimate_id)

        # ReAct loop
        tool_calls_log = []
        tool_results_log = []
        total_tokens_in = 0
        total_tokens_out = 0

        for step in range(MAX_REACT_STEPS):
            resp = svc.complete_sync(messages=messages, tools=TOOLS)
            total_tokens_in += resp.tokens_in
            total_tokens_out += resp.tokens_out

            if not resp.tool_calls:
                # Final answer
                break

            # Execute tools
            for tc in resp.tool_calls:
                tool_calls_log.append({"name": tc.name, "arguments": tc.arguments})
                result = execute_tool(tc.name, tc.arguments, workspace_id, estimate_id)
                tool_results_log.append({"name": tc.name, "result": result})
                messages.append({"role": "assistant", "content": "", "tool_calls": [{"function": {"name": tc.name, "arguments": json.dumps(tc.arguments)}}]})
                messages.append({"role": "tool", "content": json.dumps(result)})

        cost = calc_cost(resp.model, total_tokens_in, total_tokens_out)

        assistant_msg = ChatMessage.objects.create(
            session=session,
            role="assistant",
            content=resp.content,
            tool_calls=tool_calls_log or None,
            tool_results=tool_results_log or None,
            tokens_in=total_tokens_in,
            tokens_out=total_tokens_out,
            cost_usd=cost,
        )

        return {
            "message_id": str(assistant_msg.id),
            "session_id": str(session.id),
            "content": resp.content,
            "tool_calls": tool_calls_log,
            "tool_results": tool_results_log,
            "tokens_in": total_tokens_in,
            "tokens_out": total_tokens_out,
            "cost_usd": float(cost),
        }
