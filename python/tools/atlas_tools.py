"""Atlas Escolar data tools for MCP Server.

Ports the aggregation logic from lib/atlas-data.ts to Python,
exposing educational data (Censo + ENEM) as structured tool functions.
"""

from __future__ import annotations

import json
import os
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

INFRA_KEYS = ("basicServices", "learningSpaces", "connectivity", "accessibility", "climate")

INFRA_LABELS: dict[str, str] = {
    "basicServices": "Serviços básicos",
    "learningSpaces": "Espaços escolares",
    "connectivity": "Conectividade",
    "accessibility": "Acessibilidade",
    "climate": "Salas climatizadas",
}

ENEM_AREA_KEYS = ("cn", "ch", "lc", "mt", "essay")

ENEM_AREA_LABELS: dict[str, str] = {
    "cn": "Ciências da Natureza",
    "ch": "Ciências Humanas",
    "lc": "Linguagens e Códigos",
    "mt": "Matemática",
    "essay": "Redação",
}


def _average(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).casefold().strip()


def _weighted_average(items: list[dict[str, float]]) -> float:
    total_weight = sum(item["weight"] for item in items)
    if not total_weight:
        return 0.0
    return sum(item["value"] * item["weight"] for item in items) / total_weight


def _municipality_infrastructure(row: dict[str, Any]) -> dict[str, float]:
    return {
        "basicServices": _average([
            row.get("PCT_ESCOLAS_AGUA_POTAVEL", 0),
            row.get("PCT_ESCOLAS_ENERGIA_REDE_PUBLICA", 0),
            row.get("PCT_ESCOLAS_ESGOTO_REDE_PUBLICA", 0),
            row.get("PCT_ESCOLAS_COLETA_LIXO", 0),
        ]) / 10,
        "learningSpaces": _average([
            row.get("PCT_ESCOLAS_BIBLIOTECA_LEITURA", 0),
            row.get("PCT_ESCOLAS_LAB_CIENCIAS", 0),
            row.get("PCT_ESCOLAS_LAB_INFORMATICA", 0),
            row.get("PCT_ESCOLAS_QUADRA", 0),
            row.get("PCT_ESCOLAS_REFEITORIO", 0),
        ]) / 10,
        "connectivity": _average([
            row.get("PCT_ESCOLAS_INTERNET", 0),
            row.get("PCT_ESCOLAS_INTERNET_ALUNOS", 0),
            row.get("PCT_ESCOLAS_INTERNET_APRENDIZAGEM", 0),
            row.get("PCT_ESCOLAS_BANDA_LARGA", 0),
        ]) / 10,
        "accessibility": _average([
            row.get("PCT_ESCOLAS_BANHEIRO_PNE", 0),
            row.get("PCT_ESCOLAS_SALA_ATENDIMENTO_ESPECIAL", 0),
            row.get("PCT_ESCOLAS_RAMPAS", 0),
            row.get("PCT_ESCOLAS_PISOS_TATEIS", 0),
            row.get("PCT_ESCOLAS_SINALIZACAO_ACESSIVEL", 0),
        ]) / 10,
        "climate": row.get("PCT_SALAS_CLIMATIZADAS", 0) / 10,
    }


@lru_cache(maxsize=1)
def _load_data() -> dict[str, Any]:
    data_path = os.environ.get("ATLAS_DATA_PATH", "../lib/generated/atlas-real-data.json")
    resolved = Path(data_path)
    if not resolved.is_absolute():
        resolved = Path(__file__).resolve().parent.parent / resolved
    with open(resolved, encoding="utf-8") as f:
        return json.load(f)


def _get_schools() -> list[dict[str, Any]]:
    return _load_data()["schools"]


def _get_municipalities() -> list[dict[str, Any]]:
    return _load_data()["municipalities"]


def _get_saeb() -> list[dict[str, Any]]:
    return _load_data()["saeb"]


def _build_school_profile(row: dict[str, Any]) -> dict[str, Any]:
    infra = {
        "basicServices": row.get("PERCENTUAL_SERVICOS_BASICOS", 0) / 10,
        "learningSpaces": row.get("PERCENTUAL_ESPACOS_ESCOLARES", 0) / 10,
        "connectivity": row.get("PERCENTUAL_RECURSOS_CONECTIVIDADE", 0) / 10,
        "accessibility": row.get("PERCENTUAL_RECURSOS_ACESSIBILIDADE", 0) / 10,
        "climate": row.get("PERCENTUAL_SALAS_CLIMATIZADAS", 0) / 10,
    }
    return {
        "code": row["CO_ESCOLA"],
        "name": row["NO_ESCOLA"],
        "municipality": row["NO_MUNICIPIO"],
        "state": "MA",
        "dependency": {1: "Federal", 3: "Municipal"}.get(row.get("DEPENDENCIA"), "Estadual"),
        "location": "Rural" if row.get("LOCALIZACAO") == 2 else "Urbana",
        "year": 2025,
        "records": row.get("QTD_REGISTROS", 0),
        "participants": {
            "cn": row.get("QTD_PARTICIPANTES_CN", 0),
            "ch": row.get("QTD_PARTICIPANTES_CH", 0),
            "lc": row.get("QTD_PARTICIPANTES_LC", 0),
            "mt": row.get("QTD_PARTICIPANTES_MT", 0),
            "essay": row.get("QTD_PRESENTES_REDACAO", 0),
        },
        "averages": {
            "cn": row.get("MEDIA_CN"),
            "ch": row.get("MEDIA_CH"),
            "lc": row.get("MEDIA_LC"),
            "mt": row.get("MEDIA_MT"),
            "essay": row.get("MEDIA_REDACAO_GERAL"),
            "validEssay": row.get("MEDIA_REDACAO_SEM_PROBLEMAS"),
        },
        "infrastructure": infra,
        "infrastructureScore": _average(list(infra.values())),
        "criticalFactor": min(infra, key=lambda k: infra[k]),
        "resources": {
            "water": row.get("IN_AGUA_POTAVEL") == 1,
            "publicEnergy": row.get("IN_ENERGIA_REDE_PUBLICA") == 1,
            "publicSewage": row.get("IN_ESGOTO_REDE_PUBLICA") == 1,
            "wasteCollection": row.get("IN_LIXO_SERVICO_COLETA") == 1,
            "library": row.get("IN_BIBLIOTECA") == 1,
            "scienceLab": row.get("IN_LABORATORIO_CIENCIAS") == 1,
            "computerLab": row.get("IN_LABORATORIO_INFORMATICA") == 1,
            "sportsCourt": row.get("IN_QUADRA_ESPORTES") == 1,
            "cafeteria": row.get("IN_REFEITORIO") == 1,
            "internet": row.get("IN_INTERNET") == 1,
            "studentInternet": row.get("IN_INTERNET_ALUNOS") == 1,
            "broadband": row.get("IN_BANDA_LARGA") == 1 if row.get("IN_BANDA_LARGA") is not None else None,
            "totalDevices": row.get("TOTAL_DISPOSITIVOS_ALUNOS", 0),
            "climateControlledRooms": row.get("QT_SALAS_UTILIZA_CLIMATIZADAS", 0),
            "accessibleRooms": row.get("QT_SALAS_UTILIZADAS_ACESSIVEIS", 0),
        },
        "source": "ENEM 2025 + Censo Escolar 2025",
    }


# --- Public Tool Functions ---


def get_school_profile(school_code: str) -> dict[str, Any]:
    """Retorna o perfil completo de uma escola (infraestrutura, ENEM, recursos)."""
    schools = _get_schools()
    row = next((s for s in schools if s["CO_ESCOLA"] == school_code), None)
    if not row:
        return {"error": f"Escola com código '{school_code}' não encontrada."}
    return _build_school_profile(row)


def get_municipality_metrics(municipality_name: str) -> dict[str, Any]:
    """Retorna métricas agregadas de um município (infraestrutura + ENEM)."""
    municipalities = _get_municipalities()
    row = next(
        (m for m in municipalities if _normalize(m["NO_MUNICIPIO"]) == _normalize(municipality_name)),
        None,
    )
    if not row:
        available = sorted(set(m["NO_MUNICIPIO"] for m in municipalities))[:20]
        return {
            "error": f"Município '{municipality_name}' não encontrado.",
            "suggestion": f"Disponíveis (primeiros 20): {available}",
        }
    infra = _municipality_infrastructure(row)
    return {
        "name": row["NO_MUNICIPIO"],
        "kind": "municipality",
        "schoolCount": row.get("QTD_ESCOLAS", 0),
        "highSchoolCount": row.get("QTD_ESCOLAS_ENSINO_MEDIO", 0),
        "enemRecords": row.get("QTD_REGISTROS_ENEM", 0),
        "enemSchoolCount": row.get("QTD_ESCOLAS_ENEM_TOTAL", 0),
        "linkedCoveragePercentage": row.get("PCT_ESCOLAS_ENSINO_MEDIO_IDENTIFICADAS_NO_ENEM", 0),
        "participants": {
            "cn": row.get("QTD_PARTICIPANTES_CN", 0),
            "ch": row.get("QTD_PARTICIPANTES_CH", 0),
            "lc": row.get("QTD_PARTICIPANTES_LC", 0),
            "mt": row.get("QTD_PARTICIPANTES_MT", 0),
            "essay": row.get("QTD_PRESENTES_REDACAO", 0),
        },
        "averages": {
            "cn": row.get("MEDIA_CN", 0),
            "ch": row.get("MEDIA_CH", 0),
            "lc": row.get("MEDIA_LC", 0),
            "mt": row.get("MEDIA_MT", 0),
            "essay": row.get("MEDIA_REDACAO_GERAL", 0),
        },
        "infrastructure": infra,
        "source": "Censo Escolar 2025 + ENEM 2025",
    }


def get_state_metrics() -> dict[str, Any]:
    """Retorna métricas consolidadas do estado do Maranhão."""
    municipalities = _get_municipalities()
    if not municipalities:
        return {"error": "Dados de municípios não disponíveis."}

    school_count = sum(m.get("QTD_ESCOLAS", 0) for m in municipalities)
    high_school_count = sum(m.get("QTD_ESCOLAS_ENSINO_MEDIO", 0) for m in municipalities)
    enem_records = sum(m.get("QTD_REGISTROS_ENEM", 0) for m in municipalities)
    enem_school_count = sum(m.get("QTD_ESCOLAS_ENEM_TOTAL", 0) for m in municipalities)
    linked = sum(m.get("QTD_ESCOLAS_ENEM_IDENTIFICADAS_CENSO", 0) for m in municipalities)
    linked_pct = (linked / high_school_count * 100) if high_school_count else 0

    participants = {}
    averages = {}
    for key in ENEM_AREA_KEYS:
        p_key = {
            "cn": "QTD_PARTICIPANTES_CN", "ch": "QTD_PARTICIPANTES_CH",
            "lc": "QTD_PARTICIPANTES_LC", "mt": "QTD_PARTICIPANTES_MT",
            "essay": "QTD_PRESENTES_REDACAO",
        }[key]
        a_key = {
            "cn": "MEDIA_CN", "ch": "MEDIA_CH", "lc": "MEDIA_LC",
            "mt": "MEDIA_MT", "essay": "MEDIA_REDACAO_GERAL",
        }[key]
        participants[key] = sum(m.get(p_key, 0) for m in municipalities)
        averages[key] = _weighted_average([
            {"value": m.get(a_key, 0), "weight": m.get(p_key, 0)}
            for m in municipalities
        ])

    infra_keys_map = {
        "basicServices": [
            "PCT_ESCOLAS_AGUA_POTAVEL", "PCT_ESCOLAS_ENERGIA_REDE_PUBLICA",
            "PCT_ESCOLAS_ESGOTO_REDE_PUBLICA", "PCT_ESCOLAS_COLETA_LIXO",
        ],
        "learningSpaces": [
            "PCT_ESCOLAS_BIBLIOTECA_LEITURA", "PCT_ESCOLAS_LAB_CIENCIAS",
            "PCT_ESCOLAS_LAB_INFORMATICA", "PCT_ESCOLAS_QUADRA", "PCT_ESCOLAS_REFEITORIO",
        ],
        "connectivity": [
            "PCT_ESCOLAS_INTERNET", "PCT_ESCOLAS_INTERNET_ALUNOS",
            "PCT_ESCOLAS_INTERNET_APRENDIZAGEM", "PCT_ESCOLAS_BANDA_LARGA",
        ],
        "accessibility": [
            "PCT_ESCOLAS_BANHEIRO_PNE", "PCT_ESCOLAS_SALA_ATENDIMENTO_ESPECIAL",
            "PCT_ESCOLAS_RAMPAS", "PCT_ESCOLAS_PISOS_TATEIS",
            "PCT_ESCOLAS_SINALIZACAO_ACESSIVEL",
        ],
        "climate": ["PCT_SALAS_CLIMATIZADAS"],
    }
    infrastructure = {}
    for infra_key, raw_keys in infra_keys_map.items():
        infrastructure[infra_key] = _weighted_average([
            {
                "value": _average([m.get(k, 0) for k in raw_keys]) / 10,
                "weight": m.get("QTD_ESCOLAS", 0),
            }
            for m in municipalities
        ])

    return {
        "name": "Maranhão",
        "kind": "state",
        "schoolCount": school_count,
        "highSchoolCount": high_school_count,
        "enemRecords": enem_records,
        "enemSchoolCount": enem_school_count,
        "linkedCoveragePercentage": round(linked_pct, 1),
        "participants": participants,
        "averages": {k: round(v, 1) for k, v in averages.items()},
        "infrastructure": {k: round(v, 4) for k, v in infrastructure.items()},
        "source": "Censo Escolar 2025 + ENEM 2025 · agregação estadual",
    }


def compare_schools(school_codes: list[str]) -> dict[str, Any]:
    """Compara lado a lado o perfil de múltiplas escolas."""
    if len(school_codes) < 2:
        return {"error": "Forneça pelo menos 2 códigos de escola para comparação."}
    if len(school_codes) > 5:
        return {"error": "Máximo de 5 escolas por comparação."}
    profiles = []
    missing = []
    for code in school_codes:
        result = get_school_profile(code)
        if "error" in result:
            missing.append(code)
        else:
            profiles.append(result)
    response: dict[str, Any] = {"schools": profiles}
    if missing:
        response["missingCodes"] = missing
    return response


def search_schools(
    query: str,
    state: str | None = None,
    municipality: str | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """Busca escolas por nome (substring case-insensitive), com filtros opcionais."""
    schools = _get_schools()
    q = _normalize(query)
    results = []
    for row in schools:
        if q not in _normalize(row.get("NO_ESCOLA", "")):
            continue
        if state and row.get("state", "MA") != state.upper():
            continue
        if municipality and _normalize(municipality) not in _normalize(row.get("NO_MUNICIPIO", "")):
            continue
        results.append({
            "code": row["CO_ESCOLA"],
            "name": row["NO_ESCOLA"],
            "municipality": row["NO_MUNICIPIO"],
            "dependency": {1: "Federal", 3: "Municipal"}.get(row.get("DEPENDENCIA"), "Estadual"),
            "location": "Rural" if row.get("LOCALIZACAO") == 2 else "Urbana",
        })
        if len(results) >= limit:
            break
    return {
        "query": query,
        "count": len(results),
        "results": results,
    }


def calculate_enem_statistics(
    area: str,
    scope: str = "state",
    municipality_name: str | None = None,
) -> dict[str, Any]:
    """Calcula estatísticas do ENEM por área, escopo (state/municipality/school)."""
    area = area.lower().strip()
    if area not in ENEM_AREA_KEYS:
        return {"error": f"Área inválida '{area}'. Opções: {list(ENEM_AREA_KEYS)}"}

    scope = scope.lower().strip()
    if scope == "state":
        metrics = get_state_metrics()
        if "error" in metrics:
            return metrics
        return {
            "area": area,
            "areaLabel": ENEM_AREA_LABELS[area],
            "scope": "state",
            "average": metrics["averages"].get(area),
            "participants": metrics["participants"].get(area),
            "source": metrics["source"],
        }
    elif scope == "municipality":
        if not municipality_name:
            return {"error": "Para scope='municipality', forneça municipality_name."}
        metrics = get_municipality_metrics(municipality_name)
        if "error" in metrics:
            return metrics
        return {
            "area": area,
            "areaLabel": ENEM_AREA_LABELS[area],
            "scope": "municipality",
            "municipality": metrics["name"],
            "average": metrics["averages"].get(area),
            "participants": metrics["participants"].get(area),
            "source": metrics["source"],
        }
    else:
        return {"error": f"Scope inválido '{scope}'. Opções: state, municipality."}


def get_saeb_state_context() -> dict[str, Any]:
    """Retorna o contexto SAEB disponivel, que possui apenas granularidade estadual."""
    return {
        "state": "Maranhão",
        "scope": "state",
        "rows": _get_saeb(),
        "limitations": [
            "Os identificadores escolares e municipais estão mascarados na origem.",
            "Os resultados não podem ser atribuídos a uma escola ou município específico.",
        ],
        "source": "SAEB 2023 · contexto estadual",
    }


def get_data_methodology() -> dict[str, Any]:
    """Retorna limites metodologicos que devem ser preservados nas respostas."""
    return {
        "limitations": [
            "QTD_REGISTROS representa candidatos/registros, não a soma de presenças por área.",
            "Médias do ENEM devem ser acompanhadas da contagem de participantes da área.",
            "Amostras abaixo de 30 participantes exigem cautela.",
            "O SAEB disponível é somente contexto estadual.",
            "QT_SALAS_UTILIZA_CLIMATIZADAS conta salas climatizadas, não aparelhos de ar-condicionado.",
            "A entrega não contém INSE escolar.",
            "Os dados não permitem inferir causalidade.",
        ],
        "source": "Dicionário de Dados ATLAS Escolar",
    }
