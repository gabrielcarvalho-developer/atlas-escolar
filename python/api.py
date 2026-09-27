"""FastAPI proxy for the Atlas Escolar LangGraph agent.
Receives requests from the Next.js frontend and delegates to the agent.
"""
from __future__ import annotations

import logging
import os
import secrets
from pathlib import Path
from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
    error: str | None = None


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
