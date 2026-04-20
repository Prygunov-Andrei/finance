"""Views для LLM-агента: validate + chat SSE (E8.1)."""

import json

from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import ChatMessage, ChatSession
from .service import AgentService


def _get_workspace_id(request):
    return request.META.get("HTTP_X_WORKSPACE_ID") or request.query_params.get("workspace_id")


@api_view(["POST"])
def validate_estimate(request, estimate_pk):
    """POST /api/v1/estimates/{id}/validate/ — ИИ-проверка сметы."""
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response({"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        result = AgentService.validate(str(estimate_pk), workspace_id)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error("Validate error: %s", e)
        return Response(
            {"issues": [], "summary": "ИИ временно недоступен. Попробуйте через минуту.", "pre_check_count": 0, "llm_count": 0, "tokens_used": 0, "cost_usd": 0},
            status=status.HTTP_200_OK,
        )
    return Response(result, status=status.HTTP_200_OK)


@api_view(["POST"])
def chat_message(request, estimate_pk):
    """POST /api/v1/estimates/{id}/chat/messages/ — отправить сообщение агенту.

    MVP: fake streaming — полный ответ, затем SSE events.
    Если Accept: text/event-stream → SSE. Иначе → JSON.
    """
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response({"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    content = request.data.get("content", "")
    if not content:
        return Response({"content": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        result = AgentService.chat(str(estimate_pk), workspace_id, content)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error("Chat error: %s", e)
        return Response(
            {"detail": "ИИ временно недоступен. Попробуйте через минуту."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    accept = request.META.get("HTTP_ACCEPT", "")
    if "text/event-stream" in accept:
        return _sse_response(result)

    return Response(result, status=status.HTTP_200_OK)


@api_view(["GET"])
def chat_history(request, estimate_pk):
    """GET /api/v1/estimates/{id}/chat/messages/ — история чата."""
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response({"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    session = ChatSession.objects.filter(
        estimate_id=estimate_pk, workspace_id=workspace_id
    ).first()
    if not session:
        return Response([], status=status.HTTP_200_OK)

    messages = ChatMessage.objects.filter(session=session).order_by("created_at")
    data = [
        {
            "id": str(m.id),
            "role": m.role,
            "content": m.content,
            "tool_calls": m.tool_calls,
            "tokens_in": m.tokens_in,
            "tokens_out": m.tokens_out,
            "cost_usd": float(m.cost_usd),
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]
    return Response(data)


def _sse_response(result: dict) -> StreamingHttpResponse:
    """Fake SSE: отдать полный ответ как event stream."""

    def event_stream():
        yield f"event: message-start\ndata: {json.dumps({'message_id': result['message_id'], 'role': 'assistant'})}\n\n"

        for tc in result.get("tool_calls", []):
            yield f"event: tool-call\ndata: {json.dumps(tc)}\n\n"

        for tr in result.get("tool_results", []):
            yield f"event: tool-result\ndata: {json.dumps(tr)}\n\n"

        # Emit tokens (split by words for fake streaming)
        for word in result["content"].split():
            yield f"event: token\ndata: {json.dumps({'delta': word + ' '})}\n\n"

        yield f"event: message-end\ndata: {json.dumps({'message_id': result['message_id'], 'tokens_in': result['tokens_in'], 'tokens_out': result['tokens_out'], 'cost_usd': result['cost_usd']})}\n\n"

    return StreamingHttpResponse(event_stream(), content_type="text/event-stream")
