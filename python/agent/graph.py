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
PRESENTATION_NOISE_PATTERN = re.compile(
    r"\s*\((?:CN|CH|LC|MT|Essay|escola|munic[iÃ­]pio|estado)\)",
    re.IGNORECASE,
)
PRESENTATION_NOISE_PATTERN = re.compile(
    r"\s*\((?:CN|CH|LC|MT|Essay|escola|munic[^)]*|estado)\)",
    re.IGNORECASE,
)
ENEM_CHANGE_LABELS = {
    "cn": "CiÃªncias da Natureza",
    "ch": "CiÃªncias Humanas",
    "lc": "Linguagens e CÃ³digos",
    "mt": "MatemÃ¡tica",
    "essay": "RedaÃ§Ã£o",
}
INFRA_CHANGE_LABELS = {
    "basicServices": "ServiÃ§os bÃ¡sicos",
    "learningSpaces": "EspaÃ§os escolares",
    "connectivity": "Conectividade",
    "accessibility": "Acessibilidade",
    "climate": "Salas climatizadas",
}
ENEM_CHANGE_LABELS.update({
    "cn": "Ci\u00eancias da Natureza",
    "ch": "Ci\u00eancias Humanas",
    "lc": "Linguagens e C\u00f3digos",
    "mt": "Matem\u00e1tica",
    "essay": "Reda\u00e7\u00e3o",
})
INFRA_CHANGE_LABELS.update({
    "basicServices": "Servi\u00e7os b\u00e1sicos",
    "learningSpaces": "Espa\u00e7os escolares",
    "accessibility": "Acessibilidade",
})


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


async def _stream_reflector_text(
    llm: Any, messages: list[Any], question: str = ""
) -> str:
    """Transmite resposta final, retendo o marcador interno REPLAN."""
    callback = _TOKEN_CALLBACK.get()
    if callback is None:
        response = await llm.ainvoke(messages)
        return _message_text(response.content)

    target = "REPLAN:"
    parts: list[str] = []
    pending = ""
    is_public_answer: bool | None = None
    public_buffer = ""
    seen_blocks: set[str] = set()
    emitted_blocks = 0
    first_block = True
    stream_stopped = False

    async def emit_block(block: str) -> None:
        nonlocal emitted_blocks, stream_stopped
        cleaned = PRESENTATION_NOISE_PATTERN.sub("", block).strip()
        if not cleaned or stream_stopped:
            return
        normalized = re.sub(r"\s+", " ", cleaned).strip().casefold()
        can_signal_loop = len(normalized) >= 60 or cleaned.startswith(("- ", "* "))
        if can_signal_loop and normalized in seen_blocks:
            stream_stopped = True
            logger.warning("Repeated streamed answer block detected; stopping public deltas.")
            return
        seen_blocks.add(normalized)
        prefix = "\n\n" if emitted_blocks else ""
        emitted_blocks += 1
        await callback(prefix + cleaned)

    async def emit_public(text: str, *, final: bool = False) -> None:
        nonlocal public_buffer, first_block, stream_stopped
        if stream_stopped:
            return
        if not question:
            if text:
                await callback(text)
            return

        public_buffer += text
        while True:
            separator = re.search(r"\r?\n\s*\r?\n", public_buffer)
            if separator is None:
                break
            block = public_buffer[: separator.start()]
            public_buffer = public_buffer[separator.end() :]
            if first_block and _is_redundant_question_heading(question, block):
                first_block = False
                continue
            first_block = False
            await emit_block(block)
            if stream_stopped:
                public_buffer = ""
                return

        if final and public_buffer:
            block = public_buffer
            public_buffer = ""
            if first_block and _is_redundant_question_heading(question, block):
                return
            first_block = False
            await emit_block(block)

    async for chunk in llm.astream(messages):
        text = _message_chunk_text(chunk.content)
        if not text:
            continue
        parts.append(text)

        if is_public_answer is True:
            await emit_public(text)
            if stream_stopped:
                break
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
        await emit_public(pending)
        pending = ""
        if stream_stopped:
            break

    if is_public_answer is None and pending:
        candidate = pending.lstrip().upper()
        if not candidate.startswith(target):
            await emit_public(pending)

    if is_public_answer is not False:
        await emit_public("", final=True)

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


def _known_unavailable_answer(question: str) -> str | None:
    """Answer schema-known gaps without inferring from unrelated fields."""
    folded = _fold_text(question)
    if "atlas" in folded or "projeto" in folded:
        return None
    asks_foundation = any(
        term in folded
        for term in (
            "fundada",
            "fundado",
            "fundacao",
            "inaugurada",
            "inaugurado",
            "criada",
            "criado",
            "ano de criacao",
            "inicio de funcionamento",
        )
    )
    if asks_foundation:
        return (
            "A base do Atlas n\u00e3o informa o ano de funda\u00e7\u00e3o da escola. "
            "Os anos exibidos indicam apenas a refer\u00eancia do Censo Escolar e do ENEM."
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


def _is_redundant_question_heading(question: str, opening: str) -> bool:
    """Return whether a short opening only rephrases the question."""
    opening = opening.strip()
    if (
        "\n" in opening
        or len(opening) > 120
        or opening.endswith((".", "!", ":"))
    ):
        return False
    if opening.startswith(("- ", "* ", "+ ")):
        return False

    plain_opening = re.sub(r"^(?:#{1,3}\s+)", "", opening)
    plain_opening = re.sub(r"^\*\*(.+)\*\*$", r"\1", plain_opening).strip()
    stop_words = {
        "a",
        "ao",
        "as",
        "com",
        "da",
        "das",
        "de",
        "desta",
        "deste",
        "do",
        "dos",
        "e",
        "em",
        "entre",
        "foi",
        "no",
        "o",
        "os",
        "para",
        "qual",
        "que",
        "um",
        "uma",
    }

    def meaningful_words(text: str) -> set[str]:
        return {
            word
            for word in re.findall(r"[a-z0-9]+", _fold_text(text))
            if word not in stop_words
        }

    heading_words = meaningful_words(plain_opening)
    question_words = meaningful_words(question)
    return len(heading_words) >= 2 and heading_words <= question_words


def _strip_redundant_question_heading(question: str, answer: str) -> str:
    """Remove a short opening block that only rephrases the question."""
    blocks = re.split(r"\n\s*\n", answer.strip())
    if len(blocks) < 2:
        return answer.strip()

    if _is_redundant_question_heading(question, blocks[0]):
        logger.info("Redundant question heading removed from final answer.")
        return "\n\n".join(blocks[1:]).strip()
    return answer.strip()


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


def _requested_infrastructure_dimensions(question: str) -> list[str]:
    folded = _fold_text(question)
    aliases = {
        "basicServices": ("servicos basicos",),
        "learningSpaces": ("espacos escolares", "espacos de aprendizagem"),
        "connectivity": ("conectividade",),
        "accessibility": ("acessibilidade",),
        "climate": ("climatizacao", "salas climatizadas"),
    }
    return [key for key, terms in aliases.items() if any(term in folded for term in terms)]


def _grounded_infrastructure_dimension_answer(
    question: str, evidence: list[dict[str, Any]]
) -> str | None:
    """Answer only the infrastructure dimension explicitly requested."""
    requested = _requested_infrastructure_dimensions(question)
    if len(requested) != 1:
        return None
    key = requested[0]

    tool_name = ""
    result: dict[str, Any] | None = None
    for step in reversed(evidence):
        for item in reversed(step.get("results", [])):
            candidate = item.get("result")
            if isinstance(candidate, dict) and isinstance(
                candidate.get("infrastructure"), dict
            ):
                tool_name = str(item.get("tool", ""))
                result = candidate
                break
        if result is not None:
            break
    if result is None:
        return None

    score = result["infrastructure"].get(key)
    year = result.get("year")
    if not isinstance(score, (int, float)) or not isinstance(year, int):
        return None

    subjects = {
        "basicServices": "Os servi\u00e7os b\u00e1sicos",
        "learningSpaces": "Os espa\u00e7os escolares",
        "connectivity": "A conectividade",
        "accessibility": "A acessibilidade",
        "climate": "A climatiza\u00e7\u00e3o das salas",
    }
    verb = "atingem" if key in {"basicServices", "learningSpaces"} else "atinge"
    if tool_name == "get_school_profile":
        scope = "da escola"
    elif tool_name == "get_municipality_metrics":
        name = str(result.get("name", "")).strip()
        scope = f"das escolas de **{name}**" if name else "das escolas do munic\u00edpio"
    else:
        scope = "das escolas do Maranh\u00e3o"
    percentage = _format_change_value(float(score) * 10)
    answer = f"{subjects[key]} {scope} {verb} **{percentage}%** em {year}."

    if key == "basicServices" and tool_name == "get_school_profile":
        resources = result.get("resources")
        if isinstance(resources, dict):
            labels = {
                "water": "\u00e1gua pot\u00e1vel",
                "publicEnergy": "energia da rede p\u00fablica",
                "publicSewage": "liga\u00e7\u00e3o \u00e0 rede p\u00fablica de esgoto",
                "wasteCollection": "coleta de lixo",
            }
            present = [label for resource, label in labels.items() if resources.get(resource) is True]
            missing = [label for resource, label in labels.items() if resources.get(resource) is False]
            details = []
            if present:
                details.append("H\u00e1 registro de " + ", ".join(present))
            if missing:
                details.append("n\u00e3o h\u00e1 registro de " + ", ".join(missing))
            if details:
                answer += " " + "; ".join(details).capitalize() + "."
    return answer


def _asks_best_enem_year(question: str) -> bool:
    """Identify requests to rank the available ENEM years."""
    folded = _fold_text(question)
    asks_year = "ano" in folded
    asks_performance = any(
        term in folded
        for term in ("enem", "desempenho", "media", "nota", "resultado")
    )
    asks_ranking = any(
        term in folded
        for term in (
            "foi melhor",
            "foi pior",
            "melhor ano",
            "pior ano",
            "maior desempenho",
            "menor desempenho",
            "maior nota",
            "menor nota",
            "melhor resultado",
            "pior resultado",
        )
    )
    return asks_year and asks_performance and asks_ranking


def _asks_temporal_comparison(question: str) -> bool:
    """Identify questions about change across years."""
    folded = _fold_text(question)
    years = re.findall(r"\b(?:19|20)\d{2}\b", question)
    return _asks_best_enem_year(question) or len(set(years)) >= 2 or any(
        term in folded
        for term in (
            "evolu",
            "melhorou",
            "piorou",
            "mudou",
            "mudanca",
            "avanco",
            "recuo",
            "ano anterior",
            "anos anteriores",
            "entre os anos",
        )
    )


def _asks_available_years(question: str) -> bool:
    """Identify questions about which annual datasets exist, not their metrics."""
    folded = _fold_text(question)
    if re.search(r"\b(?:escola|municipio|cidade)\b", folded):
        return False
    if any(
        term in folded
        for term in (
            "compare",
            "comparacao",
            "evolu",
            "melhorou",
            "piorou",
            "mudou",
            "mudanca",
        )
    ):
        return False

    asks_which_years = any(
        term in folded
        for term in (
            "quais anos",
            "que anos",
            "anos disponiveis",
            "ano disponivel",
            "anos anteriores",
            "dados de anos anteriores",
            "bases anteriores",
        )
    )
    if asks_which_years:
        return True

    mentioned_year = bool(re.search(r"\b(?:19|20)\d{2}\b", question))
    asks_if_exists = any(
        term in folded
        for term in (
            "ha dados",
            "ha base",
            "tem dados",
            "tem base",
            "existe dado",
            "existe base",
            "base de",
            "base de dados",
            "base do ano",
            "base em",
        )
    )
    return mentioned_year and asks_if_exists


def _grounded_available_years_answer(
    question: str,
    evidence: list[dict[str, Any]],
    selection: dict[str, Any] | None = None,
) -> str | None:
    """Answer dataset-year availability directly from the methodology contract."""
    if not _asks_available_years(question):
        return None

    available: dict[str, Any] | None = None
    for step in reversed(evidence):
        for item in reversed(step.get("results", [])):
            result = item.get("result")
            candidate = result.get("availableYears") if isinstance(result, dict) else None
            if isinstance(candidate, dict):
                available = candidate
                break
        if available is not None:
            break
    if available is None:
        return None

    census_enem = sorted(
        year for year in available.get("censusEnem", []) if isinstance(year, int)
    )
    saeb = sorted(year for year in available.get("saeb", []) if isinstance(year, int))
    folded = _fold_text(question)
    mentioned_years = sorted(
        {int(year) for year in re.findall(r"\b(?:19|20)\d{2}\b", question)}
    )

    def year_list(years: list[int]) -> str:
        if not years:
            return "nenhum ano"
        if len(years) == 1:
            return str(years[0])
        return ", ".join(str(year) for year in years[:-1]) + f" e {years[-1]}"

    asks_saeb = "saeb" in folded
    asks_census_enem = "enem" in folded or "censo" in folded

    if mentioned_years:
        sentences = []
        for year in mentioned_years:
            in_census_enem = year in census_enem
            in_saeb = year in saeb
            if asks_saeb:
                prefix = "Sim" if in_saeb else "N\u00e3o"
                availability = "possui" if in_saeb else "n\u00e3o possui"
                sentences.append(
                    f"{prefix}. O SAEB {availability} dados de {year}."
                )
            elif asks_census_enem:
                prefix = "Sim" if in_census_enem else "N\u00e3o"
                availability = "possui" if in_census_enem else "n\u00e3o possui"
                sentences.append(
                    f"{prefix}. A base integrada do Censo Escolar e do ENEM "
                    f"{availability} dados de {year}."
                )
            elif in_census_enem:
                sentences.append(
                    f"Sim. A base integrada do Censo Escolar e do ENEM possui dados de {year}."
                )
            elif in_saeb:
                sentences.append(f"Sim. H\u00e1 dados de {year} no contexto estadual do SAEB.")
            else:
                sentences.append(
                    f"N\u00e3o. N\u00e3o h\u00e1 dados de {year} nas bases anuais dispon\u00edveis."
                )
        return " ".join(sentences)

    selected_year = (selection or {}).get("year")
    if "anterior" in folded and isinstance(selected_year, int):
        previous_years = [year for year in census_enem if year < selected_year]
        if previous_years:
            return (
                f"Sim. Em rela\u00e7\u00e3o ao ano selecionado ({selected_year}), "
                "a base integrada do Censo Escolar e do ENEM tamb\u00e9m possui dados de "
                f"{year_list(previous_years)}."
            )
        return (
            f"N\u00e3o h\u00e1 ano anterior a {selected_year} na base integrada do "
            f"Censo Escolar e do ENEM. Os anos dispon\u00edveis s\u00e3o {year_list(census_enem)}."
        )

    if asks_saeb:
        return f"Os anos dispon\u00edveis para o SAEB s\u00e3o {year_list(saeb)}."
    if asks_census_enem:
        return (
            "A base integrada do Censo Escolar e do ENEM possui dados de "
            f"{year_list(census_enem)}."
        )
    return (
        "A base integrada do Censo Escolar e do ENEM possui dados de "
        f"{year_list(census_enem)}. Para o contexto estadual do SAEB, os anos "
        f"dispon\u00edveis s\u00e3o {year_list(saeb)}."
    )


def _format_change_value(value: float) -> str:
    text = f"{abs(value):.2f}".rstrip("0").rstrip(".")
    return text.replace(".", ",")


def _grounded_temporal_answer(
    question: str, evidence: list[dict[str, Any]]
) -> str | None:
    """Build a concise, grouped year-over-year answer from structured evidence."""
    if not _asks_temporal_comparison(question):
        return None

    result: dict[str, Any] | None = None
    for step in reversed(evidence):
        for item in reversed(step.get("results", [])):
            candidate = item.get("result")
            if isinstance(candidate, dict) and isinstance(
                candidate.get("comparisonWithPrevious"), dict
            ):
                result = candidate
                break
        if result is not None:
            break
    if result is None:
        return None

    comparison = result["comparisonWithPrevious"]
    from_year = comparison.get("fromYear")
    to_year = comparison.get("toYear")
    if not isinstance(from_year, int) or not isinstance(to_year, int):
        return None

    folded = _fold_text(question)
    aliases = {
        "cn": ("ciencias da natureza", "ciencias naturais", "natureza"),
        "ch": ("ciencias humanas", "humanas"),
        "lc": ("linguagens", "lingua portuguesa", "letras"),
        "mt": ("matematica",),
        "essay": ("redacao",),
        "basicServices": ("servicos basicos",),
        "learningSpaces": ("espacos escolares", "espacos de aprendizagem"),
        "connectivity": ("conectividade",),
        "accessibility": ("acessibilidade",),
        "climate": ("climatizacao", "salas climatizadas"),
    }
    requested_keys = {
        key for key, terms in aliases.items() if any(term in folded for term in terms)
    }
    asks_enem = any(
        term in folded for term in ("enem", "nota", "media", "desempenho")
    )
    asks_infrastructure = any(
        term in folded for term in ("infraestrutura", "estrutura", "recurso")
    )

    records: list[tuple[str, str, float, str]] = []
    groups = (
        (comparison.get("enem"), ENEM_CHANGE_LABELS, "pontos"),
        (
            comparison.get("infrastructure"),
            INFRA_CHANGE_LABELS,
            "pontos percentuais",
        ),
    )
    for values, labels, unit in groups:
        if not isinstance(values, dict):
            continue
        if requested_keys:
            allowed = requested_keys
        elif asks_enem and not asks_infrastructure:
            allowed = set(ENEM_CHANGE_LABELS)
        elif asks_infrastructure and not asks_enem:
            allowed = set(INFRA_CHANGE_LABELS)
        else:
            allowed = set(labels)
        for key, label in labels.items():
            if key not in allowed:
                continue
            change = values.get(key)
            if not isinstance(change, dict):
                continue
            value = change.get("change")
            direction = change.get("direction")
            if not isinstance(value, (int, float)) or direction not in {
                "improved",
                "worsened",
                "stable",
            }:
                continue
            records.append((label, unit, float(value), direction))

    if not records:
        return None

    improved = [record for record in records if record[3] == "improved"]
    worsened = [record for record in records if record[3] == "worsened"]
    stable = [record for record in records if record[3] == "stable"]

    asks_judgement = any(term in folded for term in ("evolu", "melhor", "pior"))
    if improved and worsened:
        opening = "Parcialmente." if asks_judgement else "O resultado foi misto."
    elif improved:
        opening = "Sim." if asks_judgement else "Houve melhora."
    elif worsened:
        opening = "N\u00e3o." if asks_judgement else "Houve queda."
    else:
        opening = "N\u00e3o houve mudan\u00e7a."

    count_specs: list[tuple[int, str, str]] = []
    if improved:
        count_specs.append((len(improved), "melhorou", "melhoraram"))
    if worsened:
        count_specs.append((len(worsened), "recuou", "recuaram"))
    if stable:
        count_specs.append(
            (len(stable), "permaneceu est\u00e1vel", "permaneceram est\u00e1veis")
        )
    counts = []
    for index, (count, singular, plural) in enumerate(count_specs):
        noun = " indicador" if count == 1 else " indicadores"
        counts.append(f"{count}{noun if index == 0 else ''} {singular if count == 1 else plural}")
    if len(counts) > 1:
        count_summary = ", ".join(counts[:-1]) + f" e {counts[-1]}"
    else:
        count_summary = counts[0]
    summary = (
        f"{opening} Entre {from_year} e {to_year}, "
        f"{count_summary}."
    )

    sections = [summary]

    def change_section(title: str, items: list[tuple[str, str, float, str]]) -> None:
        if not items:
            return
        bullets = []
        for label, unit, value, _ in items:
            sign = "+" if value > 0 else "\u2212"
            bullets.append(
                f"- **{label}:** {sign}{_format_change_value(value)} {unit}"
            )
        sections.append(f"### {title}\n\n" + "\n".join(bullets))

    most_relevant = sorted(
        [*improved, *worsened], key=lambda item: abs(item[2]), reverse=True
    )[:5]
    change_section(
        "Melhoras", [item for item in most_relevant if item[3] == "improved"]
    )
    change_section(
        "Quedas", [item for item in most_relevant if item[3] == "worsened"]
    )
    if stable and not most_relevant:
        stable_labels = ", ".join(record[0] for record in stable)
        sections.append(f"### Sem mudan\u00e7a\n\n{stable_labels}.")

    return "\n\n".join(sections)


def _asks_enem_record_count(question: str) -> bool:
    """Identify a direct request for the number of ENEM records."""
    folded = _fold_text(question)
    return (
        "enem" in folded
        and "registro" in folded
        and any(term in folded for term in ("quantos", "quantidade", "numero", "total"))
    )


def _grounded_enem_record_answer(
    question: str, evidence: list[dict[str, Any]]
) -> str | None:
    """Return only the requested ENEM record count."""
    if not _asks_enem_record_count(question):
        return None

    candidates: list[tuple[str, dict[str, Any], int]] = []
    for step in evidence:
        for item in step.get("results", []):
            result = item.get("result")
            if not isinstance(result, dict):
                continue
            tool_name = str(item.get("tool", ""))
            field = "records" if tool_name == "get_school_profile" else "enemRecords"
            value = result.get(field)
            if isinstance(value, int) and not isinstance(value, bool):
                candidates.append((tool_name, result, value))
    if len(candidates) != 1:
        return None

    tool_name, result, count = candidates[0]
    year = result.get("year")
    if not isinstance(year, int):
        return None
    if tool_name == "get_school_profile":
        subject = "A escola"
    elif tool_name == "get_municipality_metrics":
        name = str(result.get("name", "")).strip()
        subject = f"O munic\u00edpio de **{name}**" if name else "O munic\u00edpio"
    else:
        subject = "O Maranh\u00e3o"
    formatted_count = f"{count:,}".replace(",", ".")
    return f"{subject} tem **{formatted_count} registros do ENEM** em {year}."


def _asks_enem_comparison(question: str) -> bool:
    """Identify a direct comparison of ENEM scores across scopes."""
    folded = _fold_text(question)
    return (
        any(term in folded for term in ("compar", "versus", "diferenca"))
        and any(term in folded for term in ("enem", "media", "nota", "desempenho"))
        and not _asks_temporal_comparison(question)
    )


def _grounded_enem_comparison_answer(
    question: str, evidence: list[dict[str, Any]]
) -> str | None:
    """Summarize a school-to-territory ENEM comparison using only deltas."""
    if not _asks_enem_comparison(question):
        return None

    school: dict[str, Any] | None = None
    territory: dict[str, Any] | None = None
    territory_tool = ""
    for step in evidence:
        for item in step.get("results", []):
            result = item.get("result")
            if not isinstance(result, dict) or not isinstance(result.get("averages"), dict):
                continue
            tool_name = str(item.get("tool", ""))
            if tool_name == "get_school_profile":
                school = result
            elif tool_name in {"get_municipality_metrics", "get_state_metrics"}:
                territory = result
                territory_tool = tool_name
    if school is None or territory is None:
        return None

    school_year = school.get("year")
    territory_year = territory.get("year")
    if not isinstance(school_year, int) or school_year != territory_year:
        return None

    differences: list[tuple[str, float]] = []
    for key, label in ENEM_CHANGE_LABELS.items():
        school_value = school["averages"].get(key)
        territory_value = territory["averages"].get(key)
        if not isinstance(school_value, (int, float)) or not isinstance(
            territory_value, (int, float)
        ):
            continue
        differences.append((label, round(float(school_value) - float(territory_value), 2)))
    if not differences:
        return None

    territory_name = str(territory.get("name", "Maranh\u00e3o")).strip()
    reference = (
        f"m\u00e9dia de **{territory_name}**"
        if territory_tool == "get_municipality_metrics"
        else "m\u00e9dia do **Maranh\u00e3o**"
    )
    above = sum(delta > 0 for _, delta in differences)
    below = sum(delta < 0 for _, delta in differences)
    total = len(differences)
    if above == total:
        summary = f"acima da {reference} em todas as {total} \u00e1reas"
    elif below == total:
        summary = f"abaixo da {reference} nas {total} \u00e1reas"
    elif above:
        summary = f"acima da {reference} em {above} das {total} \u00e1reas"
    elif below:
        summary = f"abaixo da {reference} em {below} das {total} \u00e1reas"
    else:
        summary = f"no mesmo n\u00edvel da {reference} nas {total} \u00e1reas"

    bullets = []
    for label, delta in sorted(differences, key=lambda item: abs(item[1]), reverse=True):
        sign = "+" if delta > 0 else "\u2212" if delta < 0 else ""
        unit = "ponto" if abs(delta) == 1 else "pontos"
        bullets.append(f"- **{label}:** {sign}{_format_change_value(delta)} {unit}")
    return f"Em {school_year}, a escola ficou {summary}.\n\n" + "\n".join(bullets)


def _asks_enem_summary(question: str) -> bool:
    """Identify a non-comparative request for ENEM scores."""
    folded = _fold_text(question)
    has_subject = any(
        term in folded
        for term in (
            "enem",
            "ciencias da natureza",
            "ciencias humanas",
            "linguagens",
            "matematica",
            "redacao",
        )
    )
    has_measure = any(term in folded for term in ("media", "nota", "desempenho"))
    has_comparison = any(term in folded for term in ("compar", "versus", "diferenca"))
    generic_school_performance = (
        "desempenho" in folded
        and "saeb" not in folded
        and not any(
            term in folded
            for term in ("infraestrutura", "estrutura", "recurso", "gargalo")
        )
    )
    return (
        (has_subject or generic_school_performance)
        and has_measure
        and not has_comparison
        and not _asks_temporal_comparison(question)
    )


def _grounded_enem_answer(
    question: str, evidence: list[dict[str, Any]]
) -> str | None:
    """Format a direct ENEM answer with canonical area names."""
    if not _asks_enem_summary(question):
        return None

    candidates: list[tuple[str, dict[str, Any]]] = []
    for step in evidence:
        for item in step.get("results", []):
            result = item.get("result")
            if isinstance(result, dict) and isinstance(result.get("averages"), dict):
                candidates.append((str(item.get("tool", "")), result))
    if len(candidates) != 1:
        return None

    tool_name, result = candidates[0]
    year = result.get("year")
    averages = result["averages"]
    if not isinstance(year, int):
        return None

    folded = _fold_text(question)
    area_aliases = {
        "cn": ("ciencias da natureza", "ciencias naturais", "natureza"),
        "ch": ("ciencias humanas", "humanas"),
        "lc": ("linguagens", "lingua portuguesa", "letras"),
        "mt": ("matematica",),
        "essay": ("redacao",),
    }
    requested = [
        key
        for key, terms in area_aliases.items()
        if any(term in folded for term in terms)
    ]
    keys = requested or list(ENEM_CHANGE_LABELS)
    values = [
        (key, ENEM_CHANGE_LABELS[key], averages.get(key))
        for key in keys
        if key in ENEM_CHANGE_LABELS
    ]
    if not values:
        return None

    name = str(result.get("name", "")).strip()
    if tool_name == "get_school_profile":
        scope = "da escola"
    elif tool_name == "get_municipality_metrics":
        scope = f"do munic\u00edpio **{name}**" if name else "do munic\u00edpio"
    else:
        scope = "do Maranh\u00e3o"

    available = [item for item in values if isinstance(item[2], (int, float))]
    if len(values) == 1:
        _, label, value = values[0]
        if not isinstance(value, (int, float)):
            return f"A m\u00e9dia de **{label}** {scope} n\u00e3o est\u00e1 dispon\u00edvel em {year}."
        return (
            f"Em {year}, a m\u00e9dia de **{label}** {scope} foi de "
            f"**{_format_change_value(float(value))} pontos**."
        )

    if not available:
        return f"As m\u00e9dias do ENEM {scope} n\u00e3o est\u00e3o dispon\u00edveis em {year}."
    bullets = []
    for _, label, value in values:
        displayed = (
            f"**{_format_change_value(float(value))} pontos**"
            if isinstance(value, (int, float))
            else "n\u00e3o dispon\u00edvel"
        )
        bullets.append(f"- **{label}:** {displayed}")
    return (
        f"O ENEM n\u00e3o tem uma \u00fanica m\u00e9dia geral nessa consulta. "
        f"Em {year}, estas foram as m\u00e9dias por \u00e1rea {scope}:\n\n"
        + "\n".join(bullets)
    )


def _grounded_best_enem_year_answer(
    question: str, evidence: list[dict[str, Any]]
) -> str | None:
    """Compare only years present in the ENEM history, without inventing an aggregate."""
    if not _asks_best_enem_year(question):
        return None

    histories: list[list[dict[str, Any]]] = []
    for step in evidence:
        for item in step.get("results", []):
            result = item.get("result")
            history = result.get("history") if isinstance(result, dict) else None
            if isinstance(history, list):
                valid_points = [
                    point
                    for point in history
                    if isinstance(point, dict)
                    and isinstance(point.get("year"), int)
                    and isinstance(point.get("averages"), dict)
                ]
                if len(valid_points) >= 2:
                    histories.append(valid_points)
    if len(histories) != 1:
        return None

    history = histories[0]
    years = sorted({int(point["year"]) for point in history})
    winners_by_year: dict[int, list[tuple[str, float]]] = {year: [] for year in years}
    ties: list[tuple[str, float, list[int]]] = []

    for key, label in ENEM_CHANGE_LABELS.items():
        values = [
            (int(point["year"]), float(point["averages"][key]))
            for point in history
            if isinstance(point["averages"].get(key), (int, float))
        ]
        if len(values) < 2:
            continue
        best_value = max(value for _, value in values)
        winning_years = [year for year, value in values if value == best_value]
        if len(winning_years) > 1:
            ties.append((label, best_value, winning_years))
            continue
        winners_by_year[winning_years[0]].append((label, best_value))

    winners_by_year = {
        year: values for year, values in winners_by_year.items() if values
    }
    if not winners_by_year and not ties:
        return None

    year_range = " e ".join(str(year) for year in years)
    if len(winners_by_year) == 1 and not ties:
        winning_year = next(iter(winners_by_year))
        opening = (
            f"Em {winning_year}, a escola teve resultados mais altos em todas as "
            f"\u00e1reas compar\u00e1veis do ENEM entre {year_range}."
        )
    else:
        opening = (
            "N\u00e3o h\u00e1 um \u00fanico ano melhor em todas as \u00e1reas do ENEM. "
            f"Entre {year_range}, cada ano se destacou em componentes diferentes."
        )

    bullets = []
    for year, values in sorted(
        winners_by_year.items(),
        key=lambda item: (-len(item[1]), -item[0]),
    ):
        details = ", ".join(
            f"{label} ({_format_change_value(value)} pontos)"
            for label, value in values
        )
        bullets.append(f"- **{year}:** {details}")
    if ties:
        details = ", ".join(
            f"{label} ({_format_change_value(value)} pontos)"
            for label, value, _ in ties
        )
        bullets.append(f"- **Empate entre os anos:** {details}")

    return (
        opening
        + "\n\n"
        + "\n".join(bullets)
        + "\n\nO ENEM n\u00e3o fornece uma m\u00e9dia geral \u00fanica nesta consulta; "
        "por isso, a compara\u00e7\u00e3o deve ser feita por \u00e1rea."
    )


def _direct_enem_call(
    question: str,
    school_code: str | None,
    selection: dict[str, Any] | None,
) -> tuple[str, dict[str, Any]] | None:
    """Resolve consultas objetivas de desempenho sem depender do planejamento do LLM."""
    if not (_asks_enem_summary(question) or _asks_best_enem_year(question)):
        return None

    years = list(
        dict.fromkeys(int(year) for year in re.findall(r"\b(?:19|20)\d{2}\b", question))
    )
    if len(years) > 1:
        return None

    active_selection = selection or {}
    requested_year = years[0] if years else active_selection.get("year")
    folded = _fold_text(question)
    analysis_level = active_selection.get("analysisLevel")

    asks_school = any(term in folded for term in ("escola", "colegio"))
    asks_municipality = any(term in folded for term in ("municipio", "cidade"))
    asks_state = any(term in folded for term in ("estado", "maranhao"))

    if asks_school or (
        not asks_municipality and not asks_state and analysis_level == "school"
    ):
        if not school_code or not re.fullmatch(r"\d{8}", school_code):
            return None
        arguments: dict[str, Any] = {"school_code": school_code}
        tool_name = "get_school_profile"
    elif asks_municipality or analysis_level == "municipality":
        municipality = str(active_selection.get("municipality", "")).strip()
        if not municipality:
            return None
        arguments = {"municipality_name": municipality}
        tool_name = "get_municipality_metrics"
    else:
        arguments = {}
        tool_name = "get_state_metrics"

    if isinstance(requested_year, int):
        arguments["year"] = requested_year
    return tool_name, arguments


async def _direct_enem_response(
    question: str,
    school_code: str | None,
    selection: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Consulta o MCP e formata respostas diretas de desempenho por ano."""
    call = _direct_enem_call(question, school_code, selection)
    if call is None:
        return None

    tool_name, arguments = call
    methodology: dict[str, Any] | None = None
    async with create_mcp_client() as client:
        raw_result = await client.call_tool(tool_name, arguments)
        result = decode_tool_result(raw_result)
        if result.get("error") and isinstance(arguments.get("year"), int):
            raw_methodology = await client.call_tool("get_data_methodology", {})
            methodology = decode_tool_result(raw_methodology)

    requested_year = arguments.get("year")
    if result.get("error"):
        available = (
            methodology.get("availableYears", {}).get("censusEnem", [])
            if isinstance(methodology, dict)
            and isinstance(methodology.get("availableYears"), dict)
            else []
        )
        available = sorted(year for year in available if isinstance(year, int))
        if isinstance(requested_year, int) and available and requested_year not in available:
            listed = " e ".join(str(year) for year in available)
            answer = (
                f"N\u00e3o h\u00e1 dados de Censo Escolar e ENEM para {requested_year}. "
                f"Os anos dispon\u00edveis s\u00e3o {listed}."
            )
            return {
                "answer": answer,
                "source": "Dicion\u00e1rio de Dados ATLAS Escolar",
                "iterations": 0,
                "evidence_count": 2,
                "engine": "mcp-direct",
                "mode": "Consulta direta aos dados do Atlas",
            }
        available_years = result.get("availableYearsForSchool")
        if (
            tool_name == "get_school_profile"
            and isinstance(requested_year, int)
            and isinstance(available_years, list)
        ):
            available = sorted(year for year in available_years if isinstance(year, int))
            if available:
                listed = " e ".join(str(year) for year in available)
                answer = (
                    f"N\u00e3o h\u00e1 dados desta escola em {requested_year}. "
                    f"Os anos dispon\u00edveis para ela s\u00e3o {listed}."
                )
                return {
                    "answer": answer,
                    "source": "Atlas Escolar",
                    "iterations": 0,
                    "evidence_count": 1,
                    "engine": "mcp-direct",
                    "mode": "Consulta direta aos dados do Atlas",
                }
        return None

    evidence = [
        {
            "step_id": 1,
            "description": "Consultar desempenho no ano solicitado",
            "results": [{"tool": tool_name, "result": result}],
        }
    ]
    answer = _grounded_best_enem_year_answer(question, evidence)
    if answer is None:
        answer = _grounded_enem_answer(question, evidence)
    if answer is None:
        return None
    history = result.get("history")
    history_years = sorted(
        point["year"]
        for point in history
        if isinstance(point, dict) and isinstance(point.get("year"), int)
    ) if isinstance(history, list) else []
    source = str(result.get("source", "Atlas Escolar"))
    if _asks_best_enem_year(question) and history_years:
        source = (
            f"ENEM e Censo Escolar {history_years[0]}\u2013{history_years[-1]}"
        )
    return {
        "answer": answer,
        "source": source,
        "iterations": 0,
        "evidence_count": 1,
        "engine": "mcp-direct",
        "mode": "Consulta direta aos dados do Atlas",
    }


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
            "servicos basicos",
            "espacos escolares",
            "espacos de aprendizagem",
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
    temporal = _asks_temporal_comparison(question)
    requested_dimensions = _requested_infrastructure_dimensions(question)

    focused_evidence: list[dict[str, Any]] = []
    for step in evidence:
        focused_step = dict(step)
        results = []
        for item in step.get("results", []):
            focused_item = dict(item)
            result = item.get("result")
            if isinstance(result, dict):
                focused_result = _focus_result(result, focus) if focus else dict(result)
                if not temporal:
                    focused_result.pop("history", None)
                    focused_result.pop("comparisonWithPrevious", None)
                    focused_result.pop("availableYears", None)
                if _asks_enem_record_count(question):
                    focused_result = {
                        key: value
                        for key, value in focused_result.items()
                        if key
                        in {
                            "error",
                            "name",
                            "kind",
                            "year",
                            "records",
                            "enemRecords",
                            "source",
                        }
                    }
                if len(requested_dimensions) == 1:
                    dimension = requested_dimensions[0]
                    infrastructure = focused_result.get("infrastructure")
                    if isinstance(infrastructure, dict):
                        focused_result["infrastructure"] = {
                            dimension: infrastructure.get(dimension)
                        }
                    focused_result.pop("infrastructureScore", None)
                    focused_result.pop("criticalFactor", None)
                    resource_keys = {
                        "basicServices": {
                            "water",
                            "publicEnergy",
                            "publicSewage",
                            "wasteCollection",
                        },
                        "learningSpaces": {
                            "library",
                            "scienceLab",
                            "computerLab",
                            "sportsCourt",
                            "cafeteria",
                        },
                        "connectivity": {
                            "internet",
                            "studentInternet",
                            "broadband",
                            "totalDevices",
                        },
                        "accessibility": {"accessibleRooms"},
                        "climate": {"climateControlledRooms"},
                    }[dimension]
                    resources = focused_result.get("resources")
                    if isinstance(resources, dict):
                        focused_result["resources"] = {
                            key: value
                            for key, value in resources.items()
                            if key in resource_keys
                        }
                focused_item["result"] = focused_result
            results.append(focused_item)
        focused_step["results"] = results
        focused_evidence.append(focused_step)
    return focused_evidence


def _normalize_plan_for_context(steps: list[PlanStep], state: AgentState) -> list[PlanStep]:
    """Corrige comparações escola-município e bloqueia compare_schools inválido."""
    selected_year = state.selection.get("year")
    selected_saeb_year = state.selection.get("saebYear")
    mentioned_years = list(
        dict.fromkeys(int(year) for year in re.findall(r"\b(?:19|20)\d{2}\b", state.question))
    )
    explicit_year = (
        mentioned_years[0]
        if len(mentioned_years) == 1
        else max(mentioned_years)
        if _asks_temporal_comparison(state.question) and mentioned_years
        else None
    )
    requested_year = explicit_year or selected_year
    if _asks_available_years(state.question) and steps:
        return [
            steps[0].model_copy(
                update={
                    "tool_calls": [
                        ToolCall(
                            tool_name="get_data_methodology",
                            arguments={},
                            step_id=steps[0].id,
                        )
                    ]
                }
            )
        ]
    if (
        (
            _asks_for_missing_resources(state.question)
            or _asks_direct_resource_question(state.question)
        )
        and state.school_code
        and steps
    ):
        arguments: dict[str, Any] = {"school_code": state.school_code}
        if isinstance(requested_year, int):
            arguments["year"] = requested_year
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
            if tool_call.tool_name in {
                "get_school_profile",
                "get_municipality_metrics",
                "get_state_metrics",
                "compare_schools",
                "search_schools",
                "calculate_enem_statistics",
            }:
                if isinstance(explicit_year, int):
                    arguments["year"] = explicit_year
                elif isinstance(selected_year, int):
                    arguments["year"] = selected_year
            if tool_call.tool_name == "get_saeb_state_context":
                if isinstance(explicit_year, int):
                    arguments["year"] = explicit_year
                elif isinstance(selected_saeb_year, int):
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
        question=state.question,
    )

    return _interpret_reflector_output(
        content,
        question=state.question,
        iteration=state.iteration,
        max_iterations=state.max_iterations,
        evidence=state.evidence,
    )


def _interpret_reflector_output(
    content: str,
    *,
    question: str = "",
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
    answer = PRESENTATION_NOISE_PATTERN.sub("", answer)
    answer = _strip_redundant_question_heading(question, answer)

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

    unavailable_answer = _known_unavailable_answer(question)
    if unavailable_answer is not None:
        await emit(unavailable_answer)
        return {
            "answer": unavailable_answer,
            "iterations": 0,
            "evidence_count": 0,
            "engine": "atlas-schema",
            "mode": "Informa\u00e7\u00e3o n\u00e3o dispon\u00edvel",
            "source": "Dicion\u00e1rio de Dados ATLAS Escolar",
        }

    try:
        direct_enem_response = await _direct_enem_response(
            question,
            school_code,
            selection,
        )
    except Exception:
        logger.exception("Direct ENEM query failed; falling back to the agent graph")
        direct_enem_response = None
    if direct_enem_response is not None:
        await emit(str(direct_enem_response["answer"]))
        return direct_enem_response

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
            or _asks_temporal_comparison(question)
            or _asks_available_years(question)
            or bool(_requested_infrastructure_dimensions(question))
            or _asks_enem_record_count(question)
            or _asks_enem_comparison(question)
            or _asks_enem_summary(question)
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
        answer = _grounded_available_years_answer(
            question,
            final_state.evidence,
            final_state.selection,
        )
        if answer is None:
            answer = _grounded_resource_answer(question, final_state.evidence)
        if answer is None:
            answer = _grounded_best_enem_year_answer(
                question, final_state.evidence
            )
        if answer is None:
            answer = _grounded_infrastructure_dimension_answer(
                question, final_state.evidence
            )
        if answer is None:
            answer = _grounded_temporal_answer(question, final_state.evidence)
        if answer is None:
            answer = _grounded_enem_record_answer(question, final_state.evidence)
        if answer is None:
            answer = _grounded_enem_comparison_answer(question, final_state.evidence)
        if answer is None:
            answer = _grounded_enem_answer(question, final_state.evidence)
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
