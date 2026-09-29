"""LangGraph plan/execute/reflect agent for Atlas Escolar."""

from __future__ import annotations

import json
import logging
import os
import re
import unicodedata
from contextvars import ContextVar
from pathlib import Path
from typing import Any, Awaitable, Callable

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from agent.mcp_client import REQUIRED_TOOLS, MCPToolError, create_mcp_client, decode_tool_result
from agent.project_knowledge import format_knowledge_context, retrieve_project_knowledge
from agent.prompts import (
    ANSWER_FORMAT_INSTRUCTIONS,
    PLANNER_SYSTEM_PROMPT,
    PROJECT_KNOWLEDGE_SYSTEM_PROMPT,
    REFLECTOR_SYSTEM_PROMPT,
)
from agent.state import AgentState, PlanStep, ToolCall

PYTHON_DIR = Path(__file__).resolve().parent.parent
load_dotenv(PYTHON_DIR / ".env.local")

logger = logging.getLogger("atlas-agent")

TokenCallback = Callable[[str], Awaitable[None]]
_TOKEN_CALLBACK: ContextVar[TokenCallback | None] = ContextVar(
    "atlas_token_callback", default=None
)

REPLAN_PATTERN = re.compile(r"(?im)^\s*(?:#{1,6}\s*)?(?:\*\*)?REPLAN:\s*(?P<reason>[^\r\n]*)")
INTERNAL_LANGUAGE_PATTERN = re.compile(
    r"(?i)(?:\bMCP\b|\bLangGraph\b|\bPlanner\b|\bReflector\b|"
    r"\bREPLAN\b|\bcompare_schools\b|\bget_[a-z_]+\b|"
    r"campo\s+[\"']?error[\"']?)"
)
RESOURCE_BOOLEAN_LABELS = {
    "water": "água potável",
    "publicEnergy": "energia da rede pública",
    "publicSewage": "ligação à rede pública de esgoto",
    "wasteCollection": "coleta de lixo",
    "library": "biblioteca ou sala de leitura",
    "scienceLab": "laboratório de ciências",
    "computerLab": "laboratório de informática",
    "sportsCourt": "quadra de esportes",
    "cafeteria": "refeitório",
    "internet": "acesso à internet",
    "studentInternet": "acesso à internet para alunos",
    "broadband": "banda larga",
}
RESOURCE_COUNT_LABELS = {
    "totalDevices": "dispositivos para uso dos alunos",
    "climateControlledRooms": "salas climatizadas",
    "accessibleRooms": "salas acessíveis",
}
RESOURCE_COUNT_SINGULAR_LABELS = {
    "totalDevices": "dispositivo para uso dos alunos",
    "climateControlledRooms": "sala climatizada",
    "accessibleRooms": "sala acessível",
}
RESOURCE_ALIASES = {
    "water": ("agua potavel",),
    "publicEnergy": ("energia eletrica", "energia da rede publica", "energia publica"),
    "publicSewage": ("rede publica de esgoto", "rede de esgoto", "esgoto"),
    "wasteCollection": ("coleta de lixo",),
    "library": ("biblioteca",),
    "scienceLab": ("laboratorio de ciencias", "laboratorio cientifico"),
    "computerLab": ("laboratorio de informatica", "laboratorio de computadores"),
    "sportsCourt": ("quadra de esportes", "quadra esportiva", "quadra"),
    "cafeteria": ("refeitorio",),
    "studentInternet": ("internet para alunos", "internet para estudantes"),
    "broadband": ("banda larga",),
    "internet": ("acesso a internet", "internet"),
    "totalDevices": ("dispositivos", "computadores", "tablets"),
    "climateControlledRooms": ("salas climatizadas", "sala climatizada"),
    "accessibleRooms": ("salas acessiveis", "sala acessivel"),
}
RESOURCE_KEY_PATTERN = re.compile(
    r"\s*\((?:" + "|".join([*RESOURCE_BOOLEAN_LABELS, *RESOURCE_COUNT_LABELS]) + r")\)",
    re.IGNORECASE,
)


def _required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Variavel obrigatoria ausente: {name}")
    return value


def _openai_compatible_base_url(raw_url: str) -> str:
    """Normaliza URLs base, inclusive a forma curta de conta da Cloudflare."""
    base_url = raw_url.rstrip("/")
    base_url = re.sub(r"/chat/completions$", "", base_url)
    if re.match(r"^https://api\.cloudflare\.com/client/v4/accounts/[^/]+$", base_url):
        return f"{base_url}/ai/v1"
    return base_url


def _get_llm() -> Any:
    """Create LLM instance based on configured provider."""
    provider = os.environ.get("LLM_PROVIDER", "openai").lower()

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
            api_key=_required_env("ANTHROPIC_API_KEY"),
            temperature=0,
            max_tokens=1200,
            max_retries=1,
        )
    if provider == "llama":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=_required_env("LLAMA_MODEL"),
            api_key=_required_env("LLAMA_API_KEY"),
            base_url=_openai_compatible_base_url(_required_env("LLAMA_API_URL")),
            temperature=0,
            max_tokens=1200,
            max_retries=1,
            # Some OpenAI-compatible Llama gateways encode numeric-only deltas
            # as JSON numbers (for example, `content: 445`). LangChain rejects
            # those malformed streaming chunks after part of the answer has
            # already reached the browser. Use the regular completion endpoint;
            # the API still delivers the completed answer through SSE.
            disable_streaming=True,
        )
    if provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=os.environ.get("OPENAI_MODEL", "gpt-4o"),
            api_key=_required_env("OPENAI_API_KEY"),
            temperature=0,
            max_tokens=1200,
            max_retries=1,
        )
    raise RuntimeError(f"LLM_PROVIDER nao suportado: {provider}")


def _message_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [item.get("text", "") for item in content if isinstance(item, dict)]
        return "".join(parts).strip()
    return str(content).strip()


def _message_chunk_text(content: Any) -> str:
    """Extrai texto de um chunk sem remover espaços entre tokens."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(item.get("text", "")) for item in content if isinstance(item, dict)
        )
    return "" if content is None else str(content)


async def _stream_llm_text(llm: Any, messages: list[Any]) -> str:
    """Transmite chunks públicos do modelo e devolve a resposta reconstruída."""
    callback = _TOKEN_CALLBACK.get()
    if callback is None:
        response = await llm.ainvoke(messages)
        return _message_text(response.content)

    parts: list[str] = []
    async for chunk in llm.astream(messages):
        text = _message_chunk_text(chunk.content)
        if not text:
            continue
        parts.append(text)
        await callback(text)
    return "".join(parts).strip()


async def _stream_reflector_text(llm: Any, messages: list[Any]) -> str:
    """Transmite resposta final, retendo o marcador interno REPLAN."""
    callback = _TOKEN_CALLBACK.get()
    if callback is None:
        response = await llm.ainvoke(messages)
        return _message_text(response.content)

    target = "REPLAN:"
    parts: list[str] = []
    pending = ""
    is_public_answer: bool | None = None

    async for chunk in llm.astream(messages):
        text = _message_chunk_text(chunk.content)
        if not text:
            continue
        parts.append(text)

        if is_public_answer is True:
            await callback(text)
            continue
        if is_public_answer is False:
            continue

        pending += text
        candidate = pending.lstrip().upper()
        if target.startswith(candidate):
            continue
        if candidate.startswith(target):
            is_public_answer = False
            continue

        is_public_answer = True
        await callback(pending)
        pending = ""

    if is_public_answer is None and pending:
        candidate = pending.lstrip().upper()
        if not candidate.startswith(target):
            await callback(pending)

    return "".join(parts).strip()


def _parse_json_response(content: Any) -> dict[str, Any]:
    text = _message_text(content)
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    object_start = text.find("{")
    if object_start < 0:
        raise ValueError("A resposta do modelo nao contem um objeto JSON.")
    decoded, _ = json.JSONDecoder().raw_decode(text, object_start)
    if not isinstance(decoded, dict):
        raise ValueError("A resposta do modelo nao e um objeto JSON.")
    return decoded


def _fold_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    return "".join(character for character in normalized if not unicodedata.combining(character))


def _conversational_answer(question: str) -> str | None:
    """Responde interações sociais curtas sem acionar o fluxo analítico."""
    normalized = re.sub(r"[^a-z0-9\s]", " ", _fold_text(question))
    normalized = re.sub(r"\s+", " ", normalized).strip()

    greetings = {
        "oi",
        "ola",
        "ola atlas",
        "oi atlas",
        "bom dia",
        "bom dia atlas",
        "boa tarde",
        "boa tarde atlas",
        "boa noite",
        "boa noite atlas",
        "e ai",
        "e ai atlas",
        "oi tudo bem",
        "ola tudo bem",
        "tudo bem",
    }
    thanks = {"obrigado", "obrigada", "muito obrigado", "muito obrigada", "valeu"}
    farewells = {"tchau", "ate mais", "ate logo", "falou"}
    identity_questions = {
        "quem e voce",
        "quem e o atlas",
        "o que e o atlas",
        "se apresente",
    }
    help_questions = {
        "ajuda",
        "me ajude",
        "o que voce faz",
        "o que voce pode fazer",
        "como voce pode me ajudar",
    }

    if normalized in greetings:
        return (
            "Olá! Que bom ter você por aqui. Posso ajudar a entender os indicadores da "
            "escola selecionada, comparar resultados ou identificar pontos de atenção. "
            "O que você gostaria de saber?"
        )
    if normalized in thanks:
        return (
            "Por nada! Se quiser, posso continuar a análise ou ajudar com outra pergunta "
            "sobre a escola."
        )
    if normalized in farewells:
        return "Até mais! Quando precisar analisar os dados da escola, estarei por aqui."
    if normalized in identity_questions:
        return (
            "Sou o Atlas, um assistente para explorar os dados educacionais disponíveis. "
            "Posso explicar indicadores, comparar resultados e destacar pontos que merecem atenção."
        )
    if normalized in help_questions:
        return (
            "Posso analisar o desempenho no ENEM, infraestrutura e recursos da escola, além "
            "de fazer comparações com o município. Experimente perguntar: “Quais são os "
            "principais pontos de atenção desta escola?”"
        )
    return None


async def _project_knowledge_answer(
    question: str, history: list[dict[str, str]] | None = None
) -> str | None:
    """Recupera contexto institucional e pede ao modelo uma resposta fundamentada."""
    chunks = retrieve_project_knowledge(question, history)
    if not chunks:
        return None

    recent_history = ""
    if history:
        recent_messages = history[-4:]
        recent_history = "\n".join(
            f"{message.get('role', 'user')}: {str(message.get('content', ''))[:1000]}"
            for message in recent_messages
        )

    user_parts = []
    if recent_history:
        user_parts.append(f"Histórico recente para resolver referências:\n{recent_history}")
    user_parts.extend(
        [
            f"Pergunta atual: {question}",
            f"Base institucional recuperada:\n{format_knowledge_context(chunks)}",
        ]
    )
    answer = await _stream_llm_text(
        _get_llm(),
        [
            SystemMessage(content=PROJECT_KNOWLEDGE_SYSTEM_PROMPT),
            HumanMessage(content="\n\n".join(user_parts)),
        ],
    )
    answer = _collapse_repeated_blocks(answer)
    if not answer:
        raise RuntimeError("O modelo retornou uma resposta institucional vazia.")
    return answer


def _asks_for_missing_resources(question: str) -> bool:
    folded_question = _fold_text(question)
    return "recurso" in folded_question and any(
        term in folded_question
        for term in ("ausente", "nao tem", "nao estao registrado", "nao registrado")
    )


def _requested_resource_keys(question: str) -> list[str]:
    """Identifica recursos citados pelo nome comum usado pelo público."""
    folded_question = _fold_text(question)
    keys = [
        key
        for key, aliases in RESOURCE_ALIASES.items()
        if any(alias in folded_question for alias in aliases)
    ]
    if "studentInternet" in keys and "internet" in keys:
        keys.remove("internet")
    if "computerLab" in keys and "totalDevices" in keys:
        keys.remove("totalDevices")
    return keys


def _asks_direct_resource_question(question: str) -> bool:
    """Distingue perguntas objetivas de pedidos amplos sobre infraestrutura."""
    folded_question = re.sub(r"[^a-z0-9]+", " ", _fold_text(question)).strip()
    if any(
        term in folded_question
        for term in (
            "compare",
            "comparacao",
            "desempenho",
            "enem",
            "media",
            "nota",
            "municipio",
            "estado",
            "infraestrutura",
        )
    ):
        return False
    direct_terms = (
        " tem ",
        " possui ",
        " ha ",
        " existe ",
        " existem ",
        " conta com ",
        " quantos ",
        " quantas ",
    )
    return bool(_requested_resource_keys(question)) and any(
        term in f" {folded_question} " for term in direct_terms
    )


def _collapse_repeated_blocks(answer: str) -> str:
    """Interrompe respostas quando o modelo começa a repetir blocos longos."""
    paragraphs = re.split(r"\n\s*\n", answer.strip())
    seen: set[str] = set()
    kept: list[str] = []

    for paragraph in paragraphs:
        normalized = re.sub(r"\s+", " ", paragraph).strip().casefold()
        can_signal_loop = len(normalized) >= 60 or paragraph.lstrip().startswith(("- ", "* "))
        if can_signal_loop and normalized in seen:
            if kept:
                bridge = _fold_text(kept[-1])
                if kept[-1].rstrip().endswith(":") and (
                    "alem disso" in bridge or "tambem" in bridge
                ):
                    kept.pop()
            logger.warning("Repeated answer block detected; truncating duplicated content.")
            break
        seen.add(normalized)
        kept.append(paragraph.strip())

    return "\n\n".join(kept).strip()


def _grounded_resource_answer(question: str, evidence: list[dict[str, Any]]) -> str | None:
    """Formata perguntas sobre recursos diretamente da evidência escolar do MCP."""
    asks_for_missing = _asks_for_missing_resources(question)
    requested_keys = _requested_resource_keys(question)
    if not asks_for_missing and not _asks_direct_resource_question(question):
        return None

    profile: dict[str, Any] | None = None
    for step in reversed(evidence):
        for item in reversed(step.get("results", [])):
            result = item.get("result")
            if item.get("tool") == "get_school_profile" and isinstance(result, dict):
                profile = result
                break
        if profile is not None:
            break
    if profile is None or not isinstance(profile.get("resources"), dict):
        return None

    resources = profile["resources"]

    if not asks_for_missing:
        statements = []
        for key in requested_keys:
            value = resources.get(key)
            label = RESOURCE_BOOLEAN_LABELS.get(key) or RESOURCE_COUNT_LABELS.get(key)
            if label is None or value is None:
                continue
            if isinstance(value, bool):
                if value:
                    statements.append(f"Sim. A escola possui {label}.")
                else:
                    statements.append(
                        f"Não. Nos dados disponíveis, não há registro de {label} nessa escola."
                    )
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                display_label = RESOURCE_COUNT_SINGULAR_LABELS[key] if value == 1 else label
                if value == 0:
                    statements.append(
                        f"Nos dados disponíveis, não há {label} registrados nessa escola."
                    )
                else:
                    statements.append(f"A escola tem {value:g} {display_label}.")

        if not statements:
            return None
        return " ".join(statements)

    missing = [
        label for key, label in RESOURCE_BOOLEAN_LABELS.items() if resources.get(key) is False
    ]
    zero_counts = [
        label
        for key, label in RESOURCE_COUNT_LABELS.items()
        if not isinstance(resources.get(key), bool) and resources.get(key) == 0
    ]
    school_name = str(profile.get("name", "a escola"))

    sections = [
        f"Na base consultada, a escola **{school_name}** apresenta as informações a seguir."
    ]
    if missing:
        missing_title = (
            "Recurso não registrado" if len(missing) == 1 else "Recursos não registrados"
        )
        sections.append(
            f"**{missing_title}**\n\n" + "\n".join(f"- {label.capitalize()}" for label in missing)
        )
    else:
        sections.append("Não há recursos booleanos marcados como ausentes.")
    if zero_counts:
        sections.append(
            "**Outras informações**\n\n"
            + "\n".join(f"- {label.capitalize()}: 0" for label in zero_counts)
            + "\n\nEsses valores indicam quantidades registradas na base."
        )

    return "\n\n".join(sections)


def _question_data_focus(question: str) -> str | None:
    """Identifica quando a pergunta atual está restrita a um domínio de dados."""
    folded = _fold_text(question)
    asks_enem = any(
        term in folded
        for term in (
            "enem",
            "redacao",
            "matematica",
            "ciencias da natureza",
            "ciencias humanas",
            "linguagens",
        )
    )
    asks_infrastructure = any(
        term in folded
        for term in (
            "infraestrutura",
            "recurso",
            "gargalo",
            "climatiz",
            "acessib",
            "biblioteca",
            "laboratorio",
            "internet",
            "quadra",
        )
    )
    if asks_enem and not asks_infrastructure:
        return "enem"
    if asks_infrastructure and not asks_enem:
        return "infrastructure"
    return None


def _focus_result(result: dict[str, Any], focus: str) -> dict[str, Any]:
    """Remove do contexto do redator campos de um domínio não solicitado."""
    focused = dict(result)
    if focus == "enem":
        for key in (
            "infrastructure",
            "infrastructureScore",
            "criticalFactor",
            "resources",
        ):
            focused.pop(key, None)
    else:
        for key in (
            "records",
            "participants",
            "averages",
            "enemRecords",
            "enemSchoolCount",
            "linkedEnemSchoolCount",
            "unlinkedEnemSchoolCount",
            "linkedCoveragePercentage",
            "unlinkedPercentage",
        ):
            focused.pop(key, None)

    history = focused.get("history")
    if isinstance(history, list):
        focused["history"] = [
            _focus_result(point, focus) if isinstance(point, dict) else point for point in history
        ]

    comparison = focused.get("comparisonWithPrevious")
    if isinstance(comparison, dict):
        comparison = dict(comparison)
        comparison.pop("infrastructure" if focus == "enem" else "enem", None)
        focused["comparisonWithPrevious"] = comparison

    schools = focused.get("schools")
    if isinstance(schools, list):
        focused["schools"] = [
            _focus_result(school, focus) if isinstance(school, dict) else school
            for school in schools
        ]
    return focused


def _focused_evidence(question: str, evidence: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Entrega ao redator apenas o domínio pedido quando o recorte é inequívoco."""
    focus = _question_data_focus(question)
    if focus is None:
        return evidence

    focused_evidence: list[dict[str, Any]] = []
    for step in evidence:
        focused_step = dict(step)
        results = []
        for item in step.get("results", []):
            focused_item = dict(item)
            result = item.get("result")
            if isinstance(result, dict):
                focused_item["result"] = _focus_result(result, focus)
            results.append(focused_item)
        focused_step["results"] = results
        focused_evidence.append(focused_step)
    return focused_evidence


def _normalize_plan_for_context(steps: list[PlanStep], state: AgentState) -> list[PlanStep]:
    """Corrige comparações escola-município e bloqueia compare_schools inválido."""
    selected_year = state.selection.get("year")
    selected_saeb_year = state.selection.get("saebYear")
    if (
        (
            _asks_for_missing_resources(state.question)
            or _asks_direct_resource_question(state.question)
        )
        and state.school_code
        and steps
    ):
        arguments: dict[str, Any] = {"school_code": state.school_code}
        if isinstance(selected_year, int):
            arguments["year"] = selected_year
        return [
            steps[0].model_copy(
                update={
                    "tool_calls": [
                        ToolCall(
                            tool_name="get_school_profile",
                            arguments=arguments,
                            step_id=steps[0].id,
                        )
                    ]
                }
            )
        ]

    question = state.question.casefold()
    asks_for_municipality = any(term in question for term in ("município", "municipio", "cidade"))
    asks_for_comparison = any(
        term in question for term in ("compare", "comparar", "comparação", "comparacao")
    )
    asks_for_state = "estado" in question or "maranhão" in question or "maranhao" in question
    municipality = state.selection.get("municipality")
    can_compare_with_municipality = (
        asks_for_municipality
        and bool(state.school_code)
        and isinstance(municipality, str)
        and bool(municipality.strip())
    )

    normalized_steps: list[PlanStep] = []
    for step in steps:
        calls: list[ToolCall] = []
        for tool_call in step.tool_calls:
            if tool_call.tool_name != "compare_schools":
                calls.append(tool_call)
                continue

            school_codes = tool_call.arguments.get("school_codes")
            if isinstance(school_codes, list) and 2 <= len(school_codes) <= 5:
                calls.append(tool_call)
                continue

            if not can_compare_with_municipality:
                if state.school_code and not asks_for_comparison:
                    logger.warning(
                        "Planner selected compare_schools for a single-school question; "
                        "normalizing the plan."
                    )
                    calls.append(
                        ToolCall(
                            tool_name="get_school_profile",
                            arguments={"school_code": state.school_code},
                            step_id=step.id,
                        )
                    )
                    continue
                if state.school_code and asks_for_state:
                    calls.extend(
                        [
                            ToolCall(
                                tool_name="get_school_profile",
                                arguments={"school_code": state.school_code},
                                step_id=step.id,
                            ),
                            ToolCall(
                                tool_name="get_state_metrics",
                                arguments={},
                                step_id=step.id,
                            ),
                        ]
                    )
                    continue
                raise ValueError("compare_schools exige de 2 a 5 códigos de escola.")

            logger.warning(
                "Planner selected compare_schools for a school-municipality comparison; "
                "normalizing the plan."
            )
            calls.extend(
                [
                    ToolCall(
                        tool_name="get_school_profile",
                        arguments={"school_code": state.school_code},
                        step_id=step.id,
                    ),
                    ToolCall(
                        tool_name="get_municipality_metrics",
                        arguments={"municipality_name": municipality.strip()},
                        step_id=step.id,
                    ),
                ]
            )
        year_aware_calls = []
        for tool_call in calls:
            arguments = dict(tool_call.arguments)
            if (
                isinstance(selected_year, int)
                and tool_call.tool_name
                in {
                    "get_school_profile",
                    "get_municipality_metrics",
                    "get_state_metrics",
                    "compare_schools",
                    "search_schools",
                    "calculate_enem_statistics",
                }
                and "year" not in arguments
            ):
                arguments["year"] = selected_year
            if (
                isinstance(selected_saeb_year, int)
                and tool_call.tool_name == "get_saeb_state_context"
                and "year" not in arguments
            ):
                arguments["year"] = selected_saeb_year
            year_aware_calls.append(tool_call.model_copy(update={"arguments": arguments}))

        valid_calls = []
        for tool_call in year_aware_calls:
            if _is_valid_tool_call(tool_call):
                valid_calls.append(tool_call)
            else:
                logger.warning(
                    "Planner produced invalid arguments for %s; dropping the call.",
                    tool_call.tool_name,
                )
        normalized_steps.append(step.model_copy(update={"tool_calls": valid_calls}))
    return normalized_steps


def _is_valid_tool_call(tool_call: ToolCall) -> bool:
    """Valida os argumentos essenciais antes de qualquer chamada ao MCP."""
    name = tool_call.tool_name
    arguments = tool_call.arguments

    if name not in REQUIRED_TOOLS:
        return False
    if name == "get_school_profile":
        return bool(re.fullmatch(r"\d{8}", str(arguments.get("school_code", ""))))
    if name == "get_municipality_metrics":
        return bool(str(arguments.get("municipality_name", "")).strip())
    if name == "compare_schools":
        school_codes = arguments.get("school_codes")
        if not isinstance(school_codes, list):
            return False
        distinct_codes = {str(code) for code in school_codes}
        return (
            2 <= len(school_codes) <= 5
            and len(distinct_codes) == len(school_codes)
            and all(re.fullmatch(r"\d{8}", code) for code in distinct_codes)
        )
    if name == "search_schools":
        return bool(str(arguments.get("query", "")).strip())
    if name == "calculate_enem_statistics":
        area = arguments.get("area")
        scope = arguments.get("scope")
        if area not in {"cn", "ch", "lc", "mt", "essay"}:
            return False
        if scope == "state":
            return True
        return scope == "municipality" and bool(str(arguments.get("municipality_name", "")).strip())
    return name in {
        "get_state_metrics",
        "get_saeb_state_context",
        "get_data_methodology",
    }


# --- Graph Nodes ---


async def planner_node(state: AgentState) -> dict[str, Any]:
    """Planner: analyzes question and produces execution plan."""
    llm = _get_llm()

    history_context = ""
    if state.history:
        recent = state.history[-6:]
        history_context = "\n".join(
            f"{msg.get('role', 'user')}: {msg.get('content', '')}" for msg in recent
        )

    context_parts = []
    if state.school_code:
        context_parts.append(f"Escola selecionada na interface (codigo INEP): {state.school_code}")
    if state.selection:
        context_parts.append(
            "Filtros selecionados na interface: " + json.dumps(state.selection, ensure_ascii=False)
        )
    if history_context:
        context_parts.append(f"Historico recente:\n{history_context}")
    if state.reflection:
        context_parts.append(f"Motivo do replanejamento anterior: {state.reflection}")
    context_parts.append(f"Pergunta atual: {state.question}")
    user_message = "\n\n".join(context_parts)

    response = await llm.ainvoke(
        [
            SystemMessage(content=PLANNER_SYSTEM_PROMPT),
            HumanMessage(content=user_message),
        ]
    )

    try:
        parsed = _parse_json_response(response.content)
        steps = [
            PlanStep(
                id=s["id"],
                description=s["description"],
                tool_calls=[
                    ToolCall(tool_name=tc["tool_name"], arguments=tc["arguments"], step_id=s["id"])
                    for tc in s.get("tool_calls", [])
                ],
            )
            for s in parsed.get("steps", [])
        ]
        steps = _normalize_plan_for_context(steps, state)
        seen_calls: set[str] = set()
        for step in steps:
            unique_calls = []
            for tool_call in step.tool_calls:
                signature = json.dumps(
                    [tool_call.tool_name, tool_call.arguments],
                    ensure_ascii=False,
                    sort_keys=True,
                )
                if signature in seen_calls:
                    continue
                seen_calls.add(signature)
                unique_calls.append(tool_call)
            step.tool_calls = unique_calls
        steps = [step for step in steps if step.tool_calls]
        if not steps or not any(step.tool_calls for step in steps):
            raise ValueError("O planner nao selecionou nenhuma ferramenta MCP.")
        logger.info("Planner produced %d steps", len(steps))
        return {"plan": steps, "current_step": 0, "iteration": state.iteration + 1}
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        logger.error("Planner failed to parse plan: %s", exc)
        return {
            "plan": [],
            "error": f"Planner error: {exc}",
            "is_complete": True,
            "final_answer": "Desculpe, não consegui planejar uma resposta adequada. Tente reformular sua pergunta.",
        }


async def executor_node(state: AgentState) -> dict[str, Any]:
    """Executa o plano somente por chamadas ao servidor MCP."""
    evidence = list(state.evidence)
    updated_plan = list(state.plan)

    async with create_mcp_client() as client:
        listed_tools = await client.list_tools()
        available_tools = {tool.name for tool in listed_tools.tools}
        missing_tools = REQUIRED_TOOLS - available_tools
        if missing_tools:
            raise MCPToolError(
                "Servidor MCP sem ferramentas obrigatorias: " + ", ".join(sorted(missing_tools))
            )

        for i, step in enumerate(updated_plan):
            if step.completed:
                continue

            step_results = []
            for tc in step.tool_calls:
                if tc.tool_name not in available_tools:
                    step_results.append(
                        {"tool": tc.tool_name, "error": "Ferramenta nao anunciada pelo MCP."}
                    )
                    continue
                try:
                    raw_result = await client.call_tool(tc.tool_name, tc.arguments)
                    result = decode_tool_result(raw_result)
                    step_results.append({"tool": tc.tool_name, "result": result})
                    logger.info("Executed MCP tool %s successfully", tc.tool_name)
                except Exception as exc:
                    step_results.append({"tool": tc.tool_name, "error": str(exc)})
                    logger.exception("MCP tool %s failed", tc.tool_name)

            updated_plan[i] = step.model_copy(
                update={"completed": True, "result": {"calls": step_results}}
            )
            evidence.append(
                {"step_id": step.id, "description": step.description, "results": step_results}
            )

    return {"evidence": evidence, "plan": updated_plan, "current_step": len(updated_plan)}


async def reflector_node(state: AgentState) -> dict[str, Any]:
    """Reflector: evaluates evidence sufficiency and produces answer or replan."""
    llm = _get_llm()

    evidence_summary = json.dumps(
        _focused_evidence(state.question, state.evidence),
        ensure_ascii=False,
        default=str,
    )[:8000]
    plan_summary = json.dumps(
        [{"id": s.id, "description": s.description, "completed": s.completed} for s in state.plan],
        ensure_ascii=False,
    )

    prompt = f"""\
Pergunta original: {state.question}

Plano executado: {plan_summary}

Evidências coletadas:
{evidence_summary}

Iteração atual: {state.iteration}/{state.max_iterations}

{ANSWER_FORMAT_INSTRUCTIONS}
"""

    content = await _stream_reflector_text(
        llm,
        [
            SystemMessage(content=REFLECTOR_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ],
    )

    return _interpret_reflector_output(
        content,
        iteration=state.iteration,
        max_iterations=state.max_iterations,
        evidence=state.evidence,
    )


def _interpret_reflector_output(
    content: str,
    *,
    iteration: int,
    max_iterations: int,
    evidence: list[dict[str, Any]],
) -> dict[str, Any]:
    """Interpreta Markdown final ou o marcador simples de replanejamento."""
    answer = content.strip()
    if not answer:
        raise RuntimeError("O modelo retornou uma resposta final vazia.")

    replan_match = REPLAN_PATTERN.search(answer)
    if replan_match:
        reason = replan_match.group("reason").strip() or "Evidências insuficientes."
        if iteration < max_iterations:
            logger.info("Reflector requested replan: %s", reason)
            return {
                "is_complete": False,
                "reflection": reason,
                "plan": [],
                "evidence": evidence,
                "current_step": 0,
            }
        answer = (
            "Não consegui encontrar todas as informações necessárias para responder com "
            "segurança. Tente fazer a pergunta de outra forma ou escolha outra escola."
        )

    answer = RESOURCE_KEY_PATTERN.sub("", _collapse_repeated_blocks(answer))

    if INTERNAL_LANGUAGE_PATTERN.search(answer):
        logger.warning("Internal terminology detected in the final answer; using public fallback.")
        answer = (
            "Não consegui concluir essa consulta com segurança. "
            "Tente novamente ou faça a pergunta de outra forma."
        )

    return {"is_complete": True, "final_answer": answer, "reflection": "complete"}


# --- Conditional Edges ---


def should_continue(state: AgentState) -> str:
    """Route after reflector: end if complete, otherwise replan via planner."""
    if state.is_complete:
        return END
    if state.iteration >= state.max_iterations:
        return END
    if state.error:
        return END
    return "planner"


def after_planner(state: AgentState) -> str:
    """Interrompe cedo quando o planner nao consegue produzir um plano valido."""
    if state.error or state.is_complete:
        return END
    return "executor"


def _evidence_sources(evidence: list[dict[str, Any]]) -> list[str]:
    sources: list[str] = []
    for step in evidence:
        for item in step.get("results", []):
            result = item.get("result")
            if not isinstance(result, dict):
                continue
            source = result.get("source")
            if isinstance(source, str) and source not in sources:
                sources.append(source)
            schools = result.get("schools")
            if isinstance(schools, list):
                for school in schools:
                    nested_source = school.get("source") if isinstance(school, dict) else None
                    if isinstance(nested_source, str) and nested_source not in sources:
                        sources.append(nested_source)
    return sources


# --- Build Graph ---


def build_agent_graph() -> StateGraph:
    """Construct and compile the plan/execute/reflect agent graph."""
    graph = StateGraph(AgentState)

    graph.add_node("planner", planner_node)
    graph.add_node("executor", executor_node)
    graph.add_node("reflector", reflector_node)

    graph.set_entry_point("planner")
    graph.add_conditional_edges("planner", after_planner, {"executor": "executor", END: END})
    graph.add_edge("executor", "reflector")
    graph.add_conditional_edges("reflector", should_continue, {"planner": "planner", END: END})

    return graph.compile()


async def run_agent(
    question: str,
    history: list[dict[str, str]] | None = None,
    school_code: str | None = None,
    selection: dict[str, Any] | None = None,
    on_token: TokenCallback | None = None,
) -> dict[str, Any]:
    """Run the agent end-to-end and return the final answer with metadata."""
    emitted_text = False

    async def emit(text: str) -> None:
        nonlocal emitted_text
        if not text or on_token is None:
            return
        emitted_text = True
        await on_token(text)

    conversational_answer = _conversational_answer(question)
    if conversational_answer is not None:
        await emit(conversational_answer)
        return {
            "answer": conversational_answer,
            "iterations": 0,
            "evidence_count": 0,
            "engine": "atlas-conversation",
            "mode": "Conversa com o Atlas",
        }

    try:
        token = _TOKEN_CALLBACK.set(emit if on_token is not None else None)
        try:
            knowledge_answer = await _project_knowledge_answer(question, history)
        finally:
            _TOKEN_CALLBACK.reset(token)
    except Exception as exc:
        logger.exception("Project knowledge retrieval failed")
        return {
            "answer": "Não consegui consultar as informações da equipe agora. Tente novamente em instantes.",
            "error": str(exc),
            "engine": "project-knowledge-error",
            "mode": "Base institucional indisponível",
        }
    if knowledge_answer is not None:
        return {
            "answer": knowledge_answer,
            "iterations": 1,
            "evidence_count": 1,
            "engine": "project-knowledge-rag",
            "mode": "Informações sobre a equipe",
            "source": "Equipe do ATLAS Escolar",
        }

    app = build_agent_graph()

    initial_state = AgentState(
        question=question,
        history=history or [],
        school_code=school_code,
        selection=selection or {},
    )

    try:
        stream_reflector = not (
            _asks_for_missing_resources(question) or _asks_direct_resource_question(question)
        )
        token = _TOKEN_CALLBACK.set(
            emit if on_token is not None and stream_reflector else None
        )
        try:
            final_state = AgentState.model_validate(await app.ainvoke(initial_state))
        finally:
            _TOKEN_CALLBACK.reset(token)
        if final_state.error:
            raise RuntimeError(final_state.error)
        answer = _grounded_resource_answer(question, final_state.evidence)
        if answer is None:
            answer = final_state.final_answer.strip()
        if not answer:
            raise RuntimeError("O agente terminou sem produzir uma resposta.")
        if not emitted_text:
            await emit(answer)
        sources = _evidence_sources(final_state.evidence)
        return {
            "answer": answer,
            "source": "; ".join(sources) if sources else "Atlas Escolar",
            "iterations": final_state.iteration,
            "evidence_count": len(final_state.evidence),
            "engine": "mcp-langgraph",
            "mode": "Agente Atlas via MCP",
        }
    except Exception as exc:
        logger.exception("Agent execution failed")
        return {
            "answer": "Não consegui responder agora. Tente novamente em instantes.",
            "error": str(exc),
            "engine": "mcp-error",
            "mode": "Temporariamente indisponível",
        }
