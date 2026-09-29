"""FastAPI proxy for the Atlas Escolar LangGraph agent.
Receives requests from the Next.js frontend and delegates to the agent.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
from pathlib import Path
from typing import Annotated, Any, AsyncIterator

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agent.graph import run_agent
from agent.mcp_client import verify_mcp_tools

PYTHON_DIR = Path(__file__).resolve().parent
load_dotenv(PYTHON_DIR / ".env.local")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("atlas-api")

app = FastAPI(title="Atlas Escolar Agent API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3001").split(","),
    allow_credentials=True,
    allow_methods=["POST"],
    allow_headers=["*"],
)


class AgentRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    history: list[dict[str, str]] = Field(default_factory=list)
    school_code: str | None = None
    selection: dict[str, Any] = Field(default_factory=dict)


class AgentResponse(BaseModel):
    answer: str
    iterations: int = 0
    evidence_count: int = 0
    engine: str = "mcp-langgraph"
    mode: str = "Agente Atlas via MCP"
    source: str | None = None
    error: str | None = None


def _sse_event(event: str, payload: dict[str, Any]) -> str:
    """Serializa um evento SSE sem expor detalhes internos do agente."""
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {data}\n\n"


async def _stream_agent_response(
    agent_request: AgentRequest,
    http_request: Request,
) -> AsyncIterator[str]:
    yield _sse_event("status", {"message": "Analisando sua pergunta…"})
    chunks: asyncio.Queue[str] = asyncio.Queue()

    async def on_token(text: str) -> None:
        await chunks.put(text)

    task = asyncio.create_task(
        run_agent(
            question=agent_request.question,
            history=agent_request.history,
            school_code=agent_request.school_code,
            selection=agent_request.selection,
            on_token=on_token,
        )
    )
    last_keep_alive = asyncio.get_running_loop().time()

    try:
        while not task.done() or not chunks.empty():
            if await http_request.is_disconnected():
                task.cancel()
                return
            try:
                chunk = await asyncio.wait_for(chunks.get(), timeout=0.5)
                yield _sse_event("delta", {"text": chunk})
            except TimeoutError:
                now = asyncio.get_running_loop().time()
                if not task.done() and now - last_keep_alive >= 5:
                    yield ": keep-alive\n\n"
                    last_keep_alive = now
        result = await task
    except asyncio.CancelledError:
        task.cancel()
        raise
    except Exception:
        logger.exception("Agent stream failed")
        if not task.done():
            task.cancel()
        yield _sse_event(
            "error",
            {"message": "Não consegui responder agora. Tente novamente em instantes."},
        )
        return

    if result.get("error"):
        yield _sse_event(
            "error",
            {"message": "Não consegui responder agora. Tente novamente em instantes."},
        )
        return

    if not str(result.get("answer", "")).strip():
        yield _sse_event(
            "error",
            {"message": "Não consegui concluir a resposta. Tente novamente."},
        )
        return

    yield _sse_event(
        "done",
        {
            "text": result["answer"],
            "source": result.get("source", "Atlas Escolar"),
            "mode": result.get("mode", "Consulta aos dados do Atlas"),
            "engine": result.get("engine", "mcp-langgraph"),
            "iterations": result.get("iterations", 0),
            "evidenceCount": result.get("evidence_count", 0),
        },
    )


def authorize_agent(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    expected_token = os.environ.get("ATLAS_AGENT_TOKEN", "").strip()
    if not expected_token:
        return
    scheme, _, supplied_token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(supplied_token, expected_token):
        raise HTTPException(status_code=401, detail="Credencial do agente invalida.")


@app.post(
    "/api/agent",
    response_model=AgentResponse,
    dependencies=[Depends(authorize_agent)],
)
async def agent_endpoint(request: AgentRequest) -> AgentResponse:
    """Proxy request to the LangGraph plan/execute/reflect agent."""
    logger.info(
        "Agent request: question=%r school=%s history_len=%d",
        request.question[:80],
        request.school_code,
        len(request.history),
    )
    try:
        result = await run_agent(
            question=request.question,
            history=request.history,
            school_code=request.school_code,
            selection=request.selection,
        )
        if result.get("error"):
            raise HTTPException(status_code=502, detail="Falha ao executar o agente via MCP.")
        return AgentResponse(**result)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Agent endpoint failed")
        raise HTTPException(status_code=500, detail="Falha interna no agente.") from exc


@app.post(
    "/api/agent/stream",
    dependencies=[Depends(authorize_agent)],
)
async def agent_stream_endpoint(
    request: AgentRequest,
    http_request: Request,
) -> StreamingResponse:
    """Entrega status e resposta do agente como Server-Sent Events."""
    logger.info(
        "Agent stream request: question=%r school=%s history_len=%d",
        request.question[:80],
        request.school_code,
        len(request.history),
    )
    return StreamingResponse(
        _stream_agent_response(request, http_request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
async def health() -> dict[str, Any]:
    try:
        tools = await verify_mcp_tools()
    except Exception as exc:
        logger.exception("MCP health check failed")
        raise HTTPException(status_code=503, detail="Servidor MCP indisponivel.") from exc
    return {
        "status": "ok",
        "engine": "mcp-langgraph",
        "mcp_tools": sorted(tools),
        "llm_provider": os.environ.get("LLM_PROVIDER", "openai"),
    }


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("API_HOST", "0.0.0.0")
    port = int(os.environ.get("API_PORT", "8001"))
    uvicorn.run(app, host=host, port=port)
