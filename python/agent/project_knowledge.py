"""Recuperação local da base institucional do ATLAS Escolar.

O corpus é pequeno e versionado, então uma busca lexical normalizada oferece uma
recuperação mais previsível e barata do que manter um banco vetorial externo.
"""

from __future__ import annotations

import os
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

PYTHON_DIR = Path(__file__).resolve().parent.parent
DEFAULT_KNOWLEDGE_PATH = PYTHON_DIR / "knowledge" / "equipe_atlas.md"

STOP_WORDS = {
    "a",
    "ao",
    "aos",
    "as",
    "com",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "ela",
    "ele",
    "eles",
    "em",
    "essa",
    "esse",
    "esta",
    "este",
    "eu",
    "foi",
    "o",
    "os",
    "para",
    "por",
    "que",
    "se",
    "sobre",
    "um",
    "uma",
    "voce",
    "voces",
}

TEAM_PATTERNS = (
    "quem desenvolveu",
    "quem criou",
    "quem construiu",
    "quem fez voce",
    "quem te fez",
    "quem sao voces",
    "equipe do atlas",
    "equipe atlas",
    "equipe desenvolvedora",
    "desenvolvedores do atlas",
    "desenvolvedores de voce",
    "orientador do projeto",
    "orientadores do projeto",
    "professores orientadores",
    "quem sao os orientadores",
    "professores do projeto",
    "estudantes do projeto",
    "quem sao os estudantes",
    "equipe de ia e dados",
    "equipe de desenvolvimento",
    "quem esta por tras",
    "quem faz parte da equipe",
    "integrantes da equipe",
    "membros da equipe",
    "sobre a equipe",
    "sua equipe",
    "de onde e a equipe",
    "de onde voces sao",
    "escola de voces",
)

TEAM_NAMES = (
    "erick macgregor",
    "joao gabriel",
    "francisco william",
    "mairron lorran",
    "marcelo augusto",
    "luciely beatriz",
    "larissa thauana",
    "erick",
    "gabriel",
    "william",
    "mairron",
    "marcelo",
    "luciely",
    "larissa",
)

ANAPHORIC_TERMS = (
    "ele",
    "ela",
    "eles",
    "elas",
    "essa pessoa",
    "essas pessoas",
    "esse professor",
    "essa professora",
    "esses estudantes",
    "essa equipe",
    "e o que",
    "e quem",
    "e onde",
)


@dataclass(frozen=True)
class KnowledgeChunk:
    title: str
    content: str

    @property
    def text(self) -> str:
        return f"{self.title}\n{self.content}"


def _fold_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    without_accents = "".join(
        character for character in normalized if not unicodedata.combining(character)
    )
    return re.sub(r"[^a-z0-9\s]", " ", without_accents)


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in re.sub(r"\s+", " ", _fold_text(value)).strip().split(" ")
        if len(token) >= 3 and token not in STOP_WORDS
    }


def _knowledge_path() -> Path:
    configured = os.environ.get("ATLAS_PROJECT_KNOWLEDGE_PATH", "").strip()
    if not configured:
        return DEFAULT_KNOWLEDGE_PATH
    path = Path(configured).expanduser()
    return path if path.is_absolute() else PYTHON_DIR / path


@lru_cache(maxsize=4)
def _load_chunks(path_string: str, modified_at_ns: int) -> tuple[KnowledgeChunk, ...]:
    del modified_at_ns  # Participa da chave do cache para invalidar alterações locais.
    source = Path(path_string).read_text(encoding="utf-8")
    sections = re.split(r"(?m)^##\s+", source)
    chunks: list[KnowledgeChunk] = []

    for section in sections[1:]:
        title, separator, content = section.partition("\n")
        if separator and content.strip():
            chunks.append(KnowledgeChunk(title=title.strip(), content=content.strip()))

    if not chunks:
        raise RuntimeError("A base institucional não possui seções Markdown válidas.")
    return tuple(chunks)


def load_project_knowledge() -> tuple[KnowledgeChunk, ...]:
    path = _knowledge_path().resolve()
    return _load_chunks(str(path), path.stat().st_mtime_ns)


def _has_team_intent(question: str) -> bool:
    folded = re.sub(r"\s+", " ", _fold_text(question)).strip()
    if any(pattern in folded for pattern in TEAM_PATTERNS):
        return True
    if any(name in folded for name in TEAM_NAMES):
        return True
    if "atlas" in folded and any(
        term in folded
        for term in (
            "equipe",
            "desenvolv",
            "criou",
            "criador",
            "orientador",
            "professor",
            "estudante",
        )
    ):
        return True
    return ("voce" in folded or "te " in f"{folded} ") and any(
        term in folded for term in ("desenvolv", "criou", "criador", "construiu")
    )


def _is_short_follow_up(question: str) -> bool:
    folded = re.sub(r"\s+", " ", _fold_text(question)).strip()
    return len(folded.split()) <= 12 and any(term in folded for term in ANAPHORIC_TERMS)


def _last_user_question(history: list[dict[str, str]] | None) -> str:
    for message in reversed(history or []):
        if message.get("role") == "user":
            return str(message.get("content", "")).strip()
    return ""


def project_knowledge_query(
    question: str, history: list[dict[str, str]] | None = None
) -> str | None:
    """Retorna a consulta expandida somente quando a pergunta pertence ao domínio da equipe."""
    if _has_team_intent(question):
        return question

    previous_question = _last_user_question(history)
    if _is_short_follow_up(question) and _has_team_intent(previous_question):
        return f"{previous_question}\n{question}"
    return None


def _score_chunk(chunk: KnowledgeChunk, query: str) -> int:
    query_tokens = _tokens(query)
    title_tokens = _tokens(chunk.title)
    content_tokens = _tokens(chunk.content)
    score = 5 * len(query_tokens & title_tokens) + 2 * len(query_tokens & content_tokens)

    folded_query = _fold_text(query)
    folded_chunk = _fold_text(chunk.text)
    for name in TEAM_NAMES:
        if name in folded_query and name in folded_chunk:
            score += 20

    # Aproxima flexões como desenvolver/desenvolvido/desenvolvimento sem uma dependência de NLP.
    for token in query_tokens:
        if len(token) < 6:
            continue
        prefix = token[:6]
        if any(candidate.startswith(prefix) for candidate in title_tokens):
            score += 3
        elif any(candidate.startswith(prefix) for candidate in content_tokens):
            score += 1
    return score


def retrieve_project_knowledge(
    question: str,
    history: list[dict[str, str]] | None = None,
    *,
    limit: int = 5,
) -> list[KnowledgeChunk]:
    """Recupera os trechos mais relevantes da fonte institucional."""
    query = project_knowledge_query(question, history)
    if query is None:
        return []

    chunks = load_project_knowledge()
    folded = _fold_text(query)
    broad_question = any(
        pattern in folded
        for pattern in (
            "quem desenvolveu",
            "quem criou",
            "quem construiu",
            "quem fez voce",
            "quem te fez",
            "quem sao voces",
            "equipe do atlas",
            "equipe desenvolvedora",
        )
    )
    if broad_question:
        return list(chunks)

    ranked = sorted(
        ((_score_chunk(chunk, query), index, chunk) for index, chunk in enumerate(chunks)),
        key=lambda item: (-item[0], item[1]),
    )
    relevant = [chunk for score, _, chunk in ranked if score > 0]
    return relevant[:limit]


def format_knowledge_context(chunks: list[KnowledgeChunk]) -> str:
    return "\n\n".join(
        f"[Trecho {index}: {chunk.title}]\n{chunk.content}"
        for index, chunk in enumerate(chunks, start=1)
    )
