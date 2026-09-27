from __future__ import annotations

from mcp import Client

from agent.graph import (
    _collapse_repeated_blocks,
    _conversational_answer,
    _grounded_resource_answer,
    _interpret_reflector_output,
    _normalize_plan_for_context,
    _openai_compatible_base_url,
    _parse_json_response,
)
from agent.mcp_client import REQUIRED_TOOLS, create_mcp_client, decode_tool_result
from agent.state import AgentState, PlanStep, ToolCall
from api import _answer_chunks, _sse_event
from mcp_server import mcp


async def test_mcp_server_exposes_the_required_contract() -> None:
    async with Client(mcp, read_timeout_seconds=5) as client:
        response = await client.list_tools()

    assert {tool.name for tool in response.tools} == REQUIRED_TOOLS


def test_sse_event_preserves_unicode_and_protocol_boundaries() -> None:
    event = _sse_event("delta", {"text": "Análise do município"})

    assert event.startswith("event: delta\ndata: ")
    assert '"text":"Análise do município"' in event
    assert event.endswith("\n\n")


def test_answer_chunks_reconstruct_the_exact_markdown() -> None:
    answer = "**Análise**\n\n" + "Dados escolares. " * 20

    chunks = _answer_chunks(answer, size=37)

    assert len(chunks) > 1
    assert "".join(chunks) == answer


def test_short_greeting_receives_a_humanized_answer() -> None:
    answer = _conversational_answer("Oi!")

    assert answer is not None
    assert answer.startswith("Olá!")
    assert "indicadores" in answer
    assert "evidências" not in answer


def test_greeting_with_a_data_question_is_not_intercepted() -> None:
    answer = _conversational_answer("Oi, compare as médias da escola com o município")

    assert answer is None


def test_common_social_messages_have_direct_responses() -> None:
    assert _conversational_answer("Obrigado") is not None
    assert _conversational_answer("Quem é você?") is not None
    assert _conversational_answer("O que você pode fazer?") is not None
    assert _conversational_answer("Até mais") is not None


async def test_mcp_tool_returns_real_school_data() -> None:
    async with Client(mcp, read_timeout_seconds=5) as client:
        raw_result = await client.call_tool(
            "get_school_profile", {"school_code": "21288780"}
        )

    result = decode_tool_result(raw_result)
    assert result["code"] == "21288780"
    assert result["municipality"] == "Coelho Neto"
    assert result["source"] == "ENEM 2025 + Censo Escolar 2025"


async def test_mcp_municipality_lookup_is_accent_insensitive() -> None:
    async with Client(mcp, read_timeout_seconds=5) as client:
        raw_result = await client.call_tool(
            "get_municipality_metrics", {"municipality_name": "Sao Luis"}
        )

    result = decode_tool_result(raw_result)
    assert result["name"] == "São Luís"


async def test_saeb_is_exposed_with_its_state_only_limitation() -> None:
    async with Client(mcp, read_timeout_seconds=5) as client:
        raw_result = await client.call_tool("get_saeb_state_context", {})

    result = decode_tool_result(raw_result)
    assert result["scope"] == "state"
    assert len(result["rows"]) == 30
    assert result["limitations"]


async def test_stdio_client_reaches_the_real_mcp_process(monkeypatch) -> None:
    monkeypatch.delenv("MCP_SERVER_URL", raising=False)
    async with create_mcp_client() as client:
        raw_result = await client.call_tool("get_state_metrics", {})

    result = decode_tool_result(raw_result)
    assert result["kind"] == "state"
    assert result["schoolCount"] == 10_080


def test_cloudflare_account_url_is_normalized() -> None:
    base = "https://api.cloudflare.com/client/v4/accounts/account-id"
    assert _openai_compatible_base_url(base) == f"{base}/ai/v1"
    assert _openai_compatible_base_url(f"{base}/ai/v1/chat/completions") == f"{base}/ai/v1"


def test_model_json_parser_ignores_trailing_explanation() -> None:
    assert _parse_json_response('{"is_complete": true}\nExplicacao extra') == {
        "is_complete": True
    }


def test_reflector_accepts_multiline_markdown_without_json() -> None:
    markdown = "Análise rápida:\n\n- Indicador: **7,5/10**\n- Fonte auditável"
    result = _interpret_reflector_output(
        markdown, iteration=1, max_iterations=3, evidence=[]
    )

    assert result["is_complete"] is True
    assert result["final_answer"] == markdown


def test_reflector_replan_marker_preserves_evidence() -> None:
    evidence = [{"step_id": 1, "results": []}]
    result = _interpret_reflector_output(
        "REPLAN: falta consultar o perfil escolar",
        iteration=1,
        max_iterations=3,
        evidence=evidence,
    )

    assert result["is_complete"] is False
    assert result["reflection"] == "falta consultar o perfil escolar"
    assert result["evidence"] == evidence


def test_reflector_detects_replan_after_a_heading() -> None:
    result = _interpret_reflector_output(
        "Resposta insuficiente\n\nREPLAN: falta consultar o município",
        iteration=1,
        max_iterations=3,
        evidence=[],
    )

    assert result["is_complete"] is False
    assert result["reflection"] == "falta consultar o município"
    assert "final_answer" not in result


def test_reflector_hides_internal_reason_on_last_iteration() -> None:
    result = _interpret_reflector_output(
        'REPLAN: o campo "error" de compare_schools impediu a execução',
        iteration=3,
        max_iterations=3,
        evidence=[],
    )

    assert result["is_complete"] is True
    assert "compare_schools" not in result["final_answer"]
    assert "error" not in result["final_answer"]
    assert "REPLAN" not in result["final_answer"]


def test_school_municipality_comparison_is_normalized_to_valid_calls() -> None:
    state = AgentState(
        question="Compare as médias desta escola com o município.",
        school_code="21288780",
        selection={"municipality": "Coelho Neto"},
    )
    steps = [
        PlanStep(
            id=1,
            description="Comparar resultados",
            tool_calls=[
                ToolCall(
                    tool_name="compare_schools",
                    arguments={"school_codes": ["21288780"]},
                    step_id=1,
                )
            ],
        )
    ]

    normalized = _normalize_plan_for_context(steps, state)

    assert [call.tool_name for call in normalized[0].tool_calls] == [
        "get_school_profile",
        "get_municipality_metrics",
    ]
    assert normalized[0].tool_calls[1].arguments == {
        "municipality_name": "Coelho Neto"
    }


def test_invalid_tool_arguments_are_removed_before_execution() -> None:
    state = AgentState(
        question="Compare as médias desta escola com o município.",
        school_code="21288780",
        selection={"municipality": "Coelho Neto"},
    )
    steps = [
        PlanStep(
            id=1,
            description="Consultar médias",
            tool_calls=[
                ToolCall(
                    tool_name="get_school_profile",
                    arguments={"school_code": "21288780"},
                    step_id=1,
                ),
                ToolCall(
                    tool_name="calculate_enem_statistics",
                    arguments={"area": "escola", "scope": "média"},
                    step_id=1,
                ),
            ],
        )
    ]

    normalized = _normalize_plan_for_context(steps, state)

    assert [call.tool_name for call in normalized[0].tool_calls] == [
        "get_school_profile"
    ]


def test_single_school_question_replaces_invalid_comparison() -> None:
    state = AgentState(
        question="Quais recursos não estão registrados nesta escola?",
        school_code="21288780",
    )
    steps = [
        PlanStep(
            id=1,
            description="Consultar recursos",
            tool_calls=[
                ToolCall(
                    tool_name="compare_schools",
                    arguments={"school_codes": ["21288780"]},
                    step_id=1,
                ),
                ToolCall(
                    tool_name="get_data_methodology",
                    arguments={},
                    step_id=1,
                ),
            ],
        )
    ]

    normalized = _normalize_plan_for_context(steps, state)

    assert [call.tool_name for call in normalized[0].tool_calls] == [
        "get_school_profile"
    ]


def test_repeated_answer_blocks_are_truncated_before_the_loop() -> None:
    resource_list = "* Quadra de esportes\n* Internet para alunos\n* Banda larga"
    answer = (
        "Recursos não registrados\n\n"
        "A escola não registra estes recursos:\n\n"
        f"{resource_list}\n\n"
        "Além disso, a escola não tem registros de recursos como:\n\n"
        f"{resource_list}\n\n"
        f"{resource_list}"
    )

    cleaned = _collapse_repeated_blocks(answer)

    assert cleaned.count("* Quadra de esportes") == 1
    assert "Além disso" not in cleaned


def test_missing_resources_answer_uses_boolean_and_count_semantics() -> None:
    evidence = [
        {
            "step_id": 1,
            "results": [
                {
                    "tool": "get_school_profile",
                    "result": {
                        "name": "Escola Exemplo",
                        "resources": {
                            "publicSewage": False,
                            "sportsCourt": True,
                            "studentInternet": True,
                            "broadband": True,
                            "totalDevices": 23,
                            "climateControlledRooms": 12,
                            "accessibleRooms": 0,
                        },
                        "source": "Censo Escolar 2025",
                    },
                }
            ],
        }
    ]

    answer = _grounded_resource_answer(
        "Quais recursos não estão registrados nesta escola?", evidence
    )

    assert answer is not None
    assert "Ligação à rede pública de esgoto" in answer
    assert "Salas acessíveis: 0" in answer
    assert "quadra" not in answer.casefold()
    assert "sportsCourt" not in answer
    assert answer.count("Recurso não registrado") == 1
