"""Cliente MCP usado pelo agente para acessar todas as ferramentas de dados."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from mcp import Client
from mcp.client.stdio import StdioServerParameters
from mcp.types import TextContent

PYTHON_DIR = Path(__file__).resolve().parent.parent
REQUIRED_TOOLS = {
    "get_school_profile",
    "get_municipality_metrics",
    "get_state_metrics",
    "compare_schools",
    "search_schools",
    "calculate_enem_statistics",
    "get_saeb_state_context",
    "get_data_methodology",
}


class MCPToolError(RuntimeError):
    """Erro de transporte, contrato ou execucao de uma ferramenta MCP."""


def create_mcp_client() -> Client:
    """Cria um cliente para MCP remoto ou para o subprocesso stdio local."""
    server_url = os.environ.get("MCP_SERVER_URL", "").strip()
    timeout = float(os.environ.get("MCP_READ_TIMEOUT_SECONDS", "30"))
    if server_url:
        return Client(server_url, read_timeout_seconds=timeout)

    child_env: dict[str, str] = {}
    data_path = os.environ.get("ATLAS_DATA_PATH", "").strip()
    if data_path:
        child_env["ATLAS_DATA_PATH"] = data_path

    params = StdioServerParameters(
        command=sys.executable,
        args=[str(PYTHON_DIR / "mcp_server.py")],
        env=child_env or None,
        cwd=PYTHON_DIR,
    )
    return Client(params, read_timeout_seconds=timeout)


def decode_tool_result(result: Any) -> dict[str, Any]:
    """Converte um resultado MCP estruturado em um dicionario do agente."""
    if result.is_error:
        message = "Ferramenta MCP retornou erro."
        for block in result.content:
            if isinstance(block, TextContent):
                message = block.text
                break
        raise MCPToolError(message)

    if isinstance(result.structured_content, dict):
        return result.structured_content

    for block in result.content:
        if not isinstance(block, TextContent):
            continue
        try:
            decoded = json.loads(block.text)
        except json.JSONDecodeError:
            continue
        if isinstance(decoded, dict):
            return decoded

    raise MCPToolError("Ferramenta MCP retornou um formato nao estruturado.")


async def list_mcp_tool_names() -> set[str]:
    """Abre uma sessao MCP e devolve os nomes das ferramentas anunciadas."""
    async with create_mcp_client() as client:
        response = await client.list_tools()
        return {tool.name for tool in response.tools}


async def verify_mcp_tools() -> set[str]:
    """Valida se o servidor anuncia o contrato minimo exigido pelo agente."""
    available = await list_mcp_tool_names()
    missing = REQUIRED_TOOLS - available
    if missing:
        raise MCPToolError(
            "Servidor MCP sem ferramentas obrigatorias: " + ", ".join(sorted(missing))
        )
    return available
