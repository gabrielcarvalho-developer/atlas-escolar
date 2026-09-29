"""Ferramentas de dados multi-ano do Atlas Escolar."""

from __future__ import annotations

import json
import os
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

INFRA_KEYS = ("basicServices", "learningSpaces", "connectivity", "accessibility", "climate")
ENEM_AREA_KEYS = ("cn", "ch", "lc", "mt", "essay")

INFRA_LABELS: dict[str, str] = {
    "basicServices": "Serviços básicos",
    "learningSpaces": "Espaços escolares",
    "connectivity": "Conectividade",
    "accessibility": "Acessibilidade",
    "climate": "Salas climatizadas",
}

ENEM_AREA_LABELS: dict[str, str] = {
    "cn": "Ciências da Natureza",
    "ch": "Ciências Humanas",
    "lc": "Linguagens e Códigos",
    "mt": "Matemática",
    "essay": "Redação",
}

PARTICIPANT_FIELDS = {
    "cn": "QTD_PARTICIPANTES_CN",
    "ch": "QTD_PARTICIPANTES_CH",
    "lc": "QTD_PARTICIPANTES_LC",
    "mt": "QTD_PARTICIPANTES_MT",
    "essay": "QTD_PRESENTES_REDACAO",
}

AVERAGE_FIELDS = {
    "cn": "MEDIA_CN",
    "ch": "MEDIA_CH",
    "lc": "MEDIA_LC",
    "mt": "MEDIA_MT",
    "essay": "MEDIA_REDACAO_GERAL",
}


def _average(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    return "".join(
        char for char in decomposed if not unicodedata.combining(char)
    ).casefold().strip()


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
    with open(resolved, encoding="utf-8") as file:
        return json.load(file)


def _available_years() -> list[int]:
    return [int(year) for year in _load_data()["manifest"]["availableYears"]["atlas"]]


def _available_saeb_years() -> list[int]:
    return [int(year) for year in _load_data()["manifest"]["availableYears"]["saeb"]]


def _resolve_year(year: int | None) -> int:
    years = _available_years()
    selected = int(year) if year is not None else int(_load_data()["manifest"]["defaultYear"])
    if selected not in years:
        raise ValueError(
            f"Ano {selected} não disponível. Anos Censo/ENEM: {years}."
        )
    return selected


def _resolve_saeb_year(year: int | None) -> int:
    years = _available_saeb_years()
    default = _load_data()["manifest"].get("defaultSaebYear")
    selected = int(year) if year is not None else default
    if selected is None or int(selected) not in years:
        raise ValueError(f"Ano SAEB {selected} não disponível. Anos SAEB: {years}.")
    return int(selected)


def _get_schools(year: int | None = None) -> list[dict[str, Any]]:
    selected = _resolve_year(year)
    return _load_data()["years"][str(selected)]["schools"]


def _get_municipalities(year: int | None = None) -> list[dict[str, Any]]:
    selected = _resolve_year(year)
    return _load_data()["years"][str(selected)]["municipalities"]


def _get_saeb(year: int | None = None) -> list[dict[str, Any]]:
    selected = _resolve_saeb_year(year)
    return _load_data()["saebByYear"][str(selected)]


def _school_annual_point(row: dict[str, Any], year: int) -> dict[str, Any]:
    return {
        "year": year,
        "records": row.get("QTD_REGISTROS", 0),
        "participants": {
            key: row.get(PARTICIPANT_FIELDS[key], 0) for key in ENEM_AREA_KEYS
        },
        "averages": {
            key: row.get(AVERAGE_FIELDS[key]) for key in ENEM_AREA_KEYS
        },
        "infrastructure": {
            "basicServices": row.get("PERCENTUAL_SERVICOS_BASICOS", 0) / 10,
            "learningSpaces": row.get("PERCENTUAL_ESPACOS_ESCOLARES", 0) / 10,
            "connectivity": row.get("PERCENTUAL_RECURSOS_CONECTIVIDADE", 0) / 10,
            "accessibility": row.get("PERCENTUAL_RECURSOS_ACESSIBILIDADE", 0) / 10,
            "climate": row.get("PERCENTUAL_SALAS_CLIMATIZADAS", 0) / 10,
        },
    }


def _school_history(school_code: str) -> list[dict[str, Any]]:
    history = []
    for year in sorted(_available_years()):
        row = next(
            (school for school in _get_schools(year) if school["CO_ESCOLA"] == school_code),
            None,
        )
        if row:
            history.append(_school_annual_point(row, year))
    return history


def _comparison(current: dict[str, Any], previous: dict[str, Any]) -> dict[str, Any]:
    def change(now: float | None, before: float | None) -> dict[str, Any]:
        if now is None or before is None:
            return {"change": None, "direction": "unavailable"}
        delta = round(now - before, 2)
        return {
            "change": delta,
            "direction": "improved" if delta > 0 else "worsened" if delta < 0 else "stable",
        }

    return {
        "fromYear": previous["year"],
        "toYear": current["year"],
        "enem": {
            key: change(current["averages"][key], previous["averages"][key])
            for key in ENEM_AREA_KEYS
        },
        "infrastructure": {
            key: change(
                current["infrastructure"][key] * 10,
                previous["infrastructure"][key] * 10,
            )
            for key in INFRA_KEYS
        },
    }


def _build_school_profile(row: dict[str, Any], year: int) -> dict[str, Any]:
    annual = _school_annual_point(row, year)
    infra = annual["infrastructure"]
    history = _school_history(row["CO_ESCOLA"])
    previous = next(
        (point for point in reversed(history) if point["year"] < year),
        None,
    )
    return {
        "code": row["CO_ESCOLA"],
        "name": row["NO_ESCOLA"],
        "municipality": row["NO_MUNICIPIO"],
        "state": "MA",
        "dependency": {1: "Federal", 3: "Municipal"}.get(
            row.get("DEPENDENCIA"), "Estadual"
        ),
        "location": "Rural" if row.get("LOCALIZACAO") == 2 else "Urbana",
        "year": year,
        "records": annual["records"],
        "participants": annual["participants"],
        "averages": {
            **annual["averages"],
            "validEssay": row.get("MEDIA_REDACAO_SEM_PROBLEMAS"),
        },
        "infrastructure": infra,
        "infrastructureScore": _average(list(infra.values())),
        "criticalFactor": min(infra, key=lambda key: infra[key]),
        "resources": {
            "water": row.get("IN_AGUA_POTAVEL") == 1,
            "publicEnergy": row.get("IN_ENERGIA_REDE_PUBLICA") == 1,
            "publicSewage": row.get("IN_ESGOTO_REDE_PUBLICA") == 1,
            "wasteCollection": row.get("IN_LIXO_SERVICO_COLETA") == 1,
            "library": (
                row.get("TEM_BIBLIOTECA_OU_SALA_LEITURA") == 1
                or row.get("IN_BIBLIOTECA") == 1
                or row.get("IN_BIBLIOTECA_SALA_LEITURA") == 1
            ),
            "scienceLab": row.get("IN_LABORATORIO_CIENCIAS") == 1,
            "computerLab": row.get("IN_LABORATORIO_INFORMATICA") == 1,
            "sportsCourt": row.get("IN_QUADRA_ESPORTES") == 1,
            "cafeteria": row.get("IN_REFEITORIO") == 1,
            "internet": row.get("IN_INTERNET") == 1,
            "studentInternet": row.get("IN_INTERNET_ALUNOS") == 1,
            "broadband": (
                row.get("IN_BANDA_LARGA") == 1
                if row.get("IN_BANDA_LARGA") is not None
                else None
            ),
            "totalDevices": row.get("TOTAL_DISPOSITIVOS_ALUNOS", 0),
            "climateControlledRooms": row.get("QT_SALAS_UTILIZA_CLIMATIZADAS", 0),
            "accessibleRooms": row.get("QT_SALAS_UTILIZADAS_ACESSIVEIS", 0),
        },
        "availableYears": [point["year"] for point in history],
        "history": history,
        "comparisonWithPrevious": (
            _comparison(annual, previous) if previous is not None else None
        ),
        "source": f"ENEM {year} + Censo Escolar {year}",
    }


def get_school_profile(school_code: str, year: int | None = None) -> dict[str, Any]:
    """Retorna perfil e série histórica de uma escola."""
    try:
        selected = _resolve_year(year)
    except ValueError as error:
        return {"error": str(error)}
    row = next(
        (school for school in _get_schools(selected) if school["CO_ESCOLA"] == school_code),
        None,
    )
    if not row:
        years = [point["year"] for point in _school_history(school_code)]
        return {
            "error": f"Escola com código '{school_code}' não encontrada em {selected}.",
            "availableYearsForSchool": years,
        }
    return _build_school_profile(row, selected)


def _build_municipality_metrics(row: dict[str, Any], year: int) -> dict[str, Any]:
    infra = _municipality_infrastructure(row)
    return {
        "name": row["NO_MUNICIPIO"],
        "kind": "municipality",
        "year": year,
        "schoolCount": row.get("QTD_ESCOLAS", 0),
        "highSchoolCount": row.get("QTD_ESCOLAS_ENSINO_MEDIO", 0),
        "enemRecords": row.get("QTD_REGISTROS_ENEM", 0),
        "enemSchoolCount": row.get("QTD_ESCOLAS_ENEM_TOTAL", 0),
        "linkedCoveragePercentage": row.get(
            "PCT_ESCOLAS_ENSINO_MEDIO_IDENTIFICADAS_NO_ENEM", 0
        ),
        "participants": {
            key: row.get(PARTICIPANT_FIELDS[key], 0) for key in ENEM_AREA_KEYS
        },
        "averages": {
            key: row.get(AVERAGE_FIELDS[key], 0) for key in ENEM_AREA_KEYS
        },
        "infrastructure": infra,
        "source": f"Censo Escolar {year} + ENEM {year}",
    }


def _municipality_history(name: str) -> list[dict[str, Any]]:
    history = []
    for year in sorted(_available_years()):
        row = next(
            (
                item
                for item in _get_municipalities(year)
                if _normalize(item["NO_MUNICIPIO"]) == _normalize(name)
            ),
            None,
        )
        if row:
            metrics = _build_municipality_metrics(row, year)
            history.append({
                "year": year,
                "averages": metrics["averages"],
                "participants": metrics["participants"],
                "infrastructure": metrics["infrastructure"],
            })
    return history


def get_municipality_metrics(
    municipality_name: str, year: int | None = None
) -> dict[str, Any]:
    """Retorna métricas e série histórica de um município."""
    try:
        selected = _resolve_year(year)
    except ValueError as error:
        return {"error": str(error)}
    row = next(
        (
            item
            for item in _get_municipalities(selected)
            if _normalize(item["NO_MUNICIPIO"]) == _normalize(municipality_name)
        ),
        None,
    )
    if not row:
        return {
            "error": f"Município '{municipality_name}' não encontrado em {selected}.",
        }
    metrics = _build_municipality_metrics(row, selected)
    history = _municipality_history(row["NO_MUNICIPIO"])
    previous = next(
        (point for point in reversed(history) if point["year"] < selected), None
    )
    current = next(point for point in history if point["year"] == selected)
    metrics.update({
        "availableYears": [point["year"] for point in history],
        "history": history,
        "comparisonWithPrevious": (
            _comparison(current, previous) if previous is not None else None
        ),
    })
    return metrics


def _build_state_metrics(year: int) -> dict[str, Any]:
    municipalities = _get_municipalities(year)
    school_count = sum(item.get("QTD_ESCOLAS", 0) for item in municipalities)
    high_school_count = sum(
        item.get("QTD_ESCOLAS_ENSINO_MEDIO", 0) for item in municipalities
    )
    linked = sum(
        item.get("QTD_ESCOLAS_ENEM_IDENTIFICADAS_CENSO", 0)
        for item in municipalities
    )
    participants: dict[str, int] = {}
    averages: dict[str, float] = {}
    for key in ENEM_AREA_KEYS:
        participants[key] = sum(
            item.get(PARTICIPANT_FIELDS[key], 0) for item in municipalities
        )
        averages[key] = _weighted_average([
            {
                "value": item.get(AVERAGE_FIELDS[key], 0),
                "weight": item.get(PARTICIPANT_FIELDS[key], 0),
            }
            for item in municipalities
        ])

    infrastructure = {
        key: _weighted_average([
            {
                "value": _municipality_infrastructure(item)[key],
                "weight": item.get("QTD_ESCOLAS", 0),
            }
            for item in municipalities
        ])
        for key in INFRA_KEYS
    }
    return {
        "name": "Maranhão",
        "kind": "state",
        "year": year,
        "schoolCount": school_count,
        "highSchoolCount": high_school_count,
        "enemRecords": sum(
            item.get("QTD_REGISTROS_ENEM", 0) for item in municipalities
        ),
        "enemSchoolCount": sum(
            item.get("QTD_ESCOLAS_ENEM_TOTAL", 0) for item in municipalities
        ),
        "linkedCoveragePercentage": round(
            (linked / high_school_count * 100) if high_school_count else 0, 1
        ),
        "participants": participants,
        "averages": {key: round(value, 1) for key, value in averages.items()},
        "infrastructure": {
            key: round(value, 4) for key, value in infrastructure.items()
        },
        "source": f"Censo Escolar {year} + ENEM {year} · agregação estadual",
    }


def get_state_metrics(year: int | None = None) -> dict[str, Any]:
    """Retorna métricas e série histórica do Maranhão."""
    try:
        selected = _resolve_year(year)
    except ValueError as error:
        return {"error": str(error)}
    metrics = _build_state_metrics(selected)
    history = [
        {
            "year": candidate,
            "averages": annual["averages"],
            "participants": annual["participants"],
            "infrastructure": annual["infrastructure"],
        }
        for candidate in sorted(_available_years())
        for annual in [_build_state_metrics(candidate)]
    ]
    previous = next(
        (point for point in reversed(history) if point["year"] < selected), None
    )
    current = next(point for point in history if point["year"] == selected)
    metrics.update({
        "availableYears": [point["year"] for point in history],
        "history": history,
        "comparisonWithPrevious": (
            _comparison(current, previous) if previous is not None else None
        ),
    })
    return metrics


def compare_schools(
    school_codes: list[str], year: int | None = None
) -> dict[str, Any]:
    """Compara de duas a cinco escolas no mesmo ano."""
    if len(school_codes) < 2:
        return {"error": "Forneça pelo menos 2 códigos de escola para comparação."}
    if len(school_codes) > 5:
        return {"error": "Máximo de 5 escolas por comparação."}
    profiles = []
    missing = []
    for code in school_codes:
        result = get_school_profile(code, year)
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
    year: int | None = None,
) -> dict[str, Any]:
    """Busca escolas no ano solicitado."""
    try:
        selected = _resolve_year(year)
    except ValueError as error:
        return {"error": str(error)}
    normalized_query = _normalize(query)
    results = []
    for row in _get_schools(selected):
        if normalized_query not in _normalize(row.get("NO_ESCOLA", "")):
            continue
        if state and state.upper() != "MA":
            continue
        if municipality and _normalize(municipality) not in _normalize(
            row.get("NO_MUNICIPIO", "")
        ):
            continue
        results.append({
            "code": row["CO_ESCOLA"],
            "name": row["NO_ESCOLA"],
            "municipality": row["NO_MUNICIPIO"],
            "dependency": {1: "Federal", 3: "Municipal"}.get(
                row.get("DEPENDENCIA"), "Estadual"
            ),
            "location": "Rural" if row.get("LOCALIZACAO") == 2 else "Urbana",
            "year": selected,
        })
        if len(results) >= limit:
            break
    return {"query": query, "year": selected, "count": len(results), "results": results}


def calculate_enem_statistics(
    area: str,
    scope: str = "state",
    municipality_name: str | None = None,
    year: int | None = None,
) -> dict[str, Any]:
    """Calcula estatísticas do ENEM por área, escopo e ano."""
    area = area.lower().strip()
    if area not in ENEM_AREA_KEYS:
        return {"error": f"Área inválida '{area}'. Opções: {list(ENEM_AREA_KEYS)}"}
    scope = scope.lower().strip()
    if scope == "state":
        metrics = get_state_metrics(year)
    elif scope == "municipality" and municipality_name:
        metrics = get_municipality_metrics(municipality_name, year)
    elif scope == "municipality":
        return {"error": "Para scope='municipality', forneça municipality_name."}
    else:
        return {"error": f"Scope inválido '{scope}'. Opções: state, municipality."}
    if "error" in metrics:
        return metrics
    return {
        "area": area,
        "areaLabel": ENEM_AREA_LABELS[area],
        "scope": scope,
        "municipality": metrics.get("name") if scope == "municipality" else None,
        "year": metrics["year"],
        "average": metrics["averages"].get(area),
        "participants": metrics["participants"].get(area),
        "history": [
            {
                "year": point["year"],
                "average": point["averages"].get(area),
                "participants": point["participants"].get(area),
            }
            for point in metrics["history"]
        ],
        "source": metrics["source"],
    }


def get_saeb_state_context(year: int | None = None) -> dict[str, Any]:
    """Retorna o contexto SAEB estadual do ano solicitado."""
    try:
        selected = _resolve_saeb_year(year)
    except ValueError as error:
        return {"error": str(error), "availableYears": _available_saeb_years()}
    return {
        "state": "Maranhão",
        "scope": "state",
        "year": selected,
        "availableYears": _available_saeb_years(),
        "rows": _get_saeb(selected),
        "limitations": [
            "Os identificadores escolares e municipais estão mascarados na origem.",
            "Os resultados não podem ser atribuídos a uma escola ou município específico.",
        ],
        "source": f"SAEB {selected} · contexto estadual",
    }


def get_data_methodology() -> dict[str, Any]:
    """Retorna anos disponíveis e limites metodológicos."""
    return {
        "availableYears": {
            "censusEnem": _available_years(),
            "saeb": _available_saeb_years(),
        },
        "limitations": [
            "A entrega n\u00e3o cont\u00e9m ano ou data de funda\u00e7\u00e3o das escolas.",
            "QTD_REGISTROS representa candidatos/registros, não a soma de presenças por área.",
            "Médias do ENEM devem ser acompanhadas da contagem de participantes da área.",
            "Amostras abaixo de 30 participantes exigem cautela.",
            "O SAEB disponível é somente contexto estadual.",
            "Comparações históricas usam apenas anos realmente presentes, sem interpolação.",
            "QT_SALAS_UTILIZA_CLIMATIZADAS conta salas climatizadas, não aparelhos de ar-condicionado.",
            "A entrega não contém INSE escolar.",
            "Os dados não permitem inferir causalidade.",
        ],
        "source": "Dicionário de Dados ATLAS Escolar",
    }
