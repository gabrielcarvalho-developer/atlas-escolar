"""Servidor MCP do Atlas Escolar.

As funcoes de dados ficam encapsuladas neste processo. O agente acessa os dados
exclusivamente pelo protocolo MCP, por stdio local ou Streamable HTTP remoto.
"""
from __future__ import annotations

import logging
from typing import Literal

from mcp.server import MCPServer

from tools.atlas_tools import (
    calculate_enem_statistics as calculate_enem_statistics_data,
)
from tools.atlas_tools import (
    compare_schools as compare_schools_data,
)
from tools.atlas_tools import (
    get_data_methodology as get_data_methodology_data,
)
from tools.atlas_tools import (
    get_municipality_metrics as get_municipality_metrics_data,
)
from tools.atlas_tools import (
    get_saeb_state_context as get_saeb_state_context_data,
)
from tools.atlas_tools import (
    get_school_profile as get_school_profile_data,
)
from tools.atlas_tools import (
    get_state_metrics as get_state_metrics_data,
)
from tools.atlas_tools import (
    search_schools as search_schools_data,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("atlas-mcp")

mcp = MCPServer(
    "atlas-escolar-mcp",
    title="Atlas Escolar",
    description="Ferramentas auditaveis para os dados educacionais do Maranhao.",
    instructions=(
        "Use estas ferramentas como unica fonte para responder sobre os dados do "
        "Atlas Escolar. Preserve fontes, unidades e limitacoes retornadas."
    ),
    version="0.2.0",
)


def _audit(tool_name: str, arguments: dict[str, object], result: dict[str, object]) -> None:
    logger.info("MCP tool=%s args=%s result_keys=%s", tool_name, arguments, list(result))


@mcp.tool()
def get_school_profile(school_code: str) -> dict[str, object]:
    """Retorna infraestrutura, desempenho ENEM, recursos e fonte de uma escola.

    Args:
        school_code: Codigo INEP da escola, por exemplo ``21288780``.
    """
    result = get_school_profile_data(school_code)
    _audit("get_school_profile", {"school_code": school_code}, result)
    return result


@mcp.tool()
def get_municipality_metrics(municipality_name: str) -> dict[str, object]:
    """Retorna metricas agregadas de um municipio do Maranhao.

    Args:
        municipality_name: Nome completo do municipio, por exemplo ``Sao Luis``.
    """
    result = get_municipality_metrics_data(municipality_name)
    _audit("get_municipality_metrics", {"municipality_name": municipality_name}, result)
    return result


@mcp.tool()
def get_state_metrics() -> dict[str, object]:
    """Retorna metricas consolidadas do estado do Maranhao."""
    result = get_state_metrics_data()
    _audit("get_state_metrics", {}, result)
    return result


@mcp.tool()
def compare_schools(school_codes: list[str]) -> dict[str, object]:
    """Compara de duas a cinco escolas pelos seus codigos INEP.

    Args:
        school_codes: Lista com dois a cinco codigos INEP.
    """
    result = compare_schools_data(school_codes)
    _audit("compare_schools", {"school_codes": school_codes}, result)
    return result


@mcp.tool()
def search_schools(
    query: str,
    state: str | None = None,
    municipality: str | None = None,
    limit: int = 10,
) -> dict[str, object]:
    """Busca escolas por nome e filtros territoriais opcionais.

    Args:
        query: Nome ou parte do nome da escola.
        state: UF opcional; o conjunto atual usa MA.
        municipality: Nome ou parte do nome do municipio.
        limit: Quantidade maxima de resultados, de 1 a 25.
    """
    safe_limit = min(max(limit, 1), 25)
    result = search_schools_data(query, state, municipality, safe_limit)
    _audit(
        "search_schools",
        {
            "query": query,
            "state": state,
            "municipality": municipality,
            "limit": safe_limit,
        },
        result,
    )
    return result


@mcp.tool()
def calculate_enem_statistics(
    area: Literal["cn", "ch", "lc", "mt", "essay"],
    scope: Literal["state", "municipality"] = "state",
    municipality_name: str | None = None,
) -> dict[str, object]:
    """Calcula estatisticas do ENEM por area e escopo.

    Args:
        area: Area do ENEM: cn, ch, lc, mt ou essay.
        scope: Escopo estadual ou municipal.
        municipality_name: Obrigatorio quando o escopo for municipal.
    """
    result = calculate_enem_statistics_data(area, scope, municipality_name)
    _audit(
        "calculate_enem_statistics",
        {"area": area, "scope": scope, "municipality_name": municipality_name},
        result,
    )
    return result


@mcp.tool()
def get_saeb_state_context() -> dict[str, object]:
    """Retorna resultados SAEB disponiveis e suas limitacoes de granularidade."""
    result = get_saeb_state_context_data()
    _audit("get_saeb_state_context", {}, result)
    return result


@mcp.tool()
def get_data_methodology() -> dict[str, object]:
    """Retorna limites metodologicos e de interpretacao da base Atlas."""
    result = get_data_methodology_data()
    _audit("get_data_methodology", {}, result)
    return result


if __name__ == "__main__":
    logger.info("Iniciando Atlas Escolar MCP por stdio")
    mcp.run()
