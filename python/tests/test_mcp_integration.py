from __future__ import annotations

from mcp import Client

from agent import graph as agent_graph
from agent import mcp_client
from agent.graph import (
    _TOKEN_CALLBACK,
    _collapse_repeated_blocks,
    _conversational_answer,
    _focused_evidence,
    _grounded_resource_answer,
    _interpret_reflector_output,
    _normalize_plan_for_context,
    _openai_compatible_base_url,
    _parse_json_response,
    _stream_reflector_text,
)
from agent.mcp_client import REQUIRED_TOOLS, create_mcp_client, decode_tool_result
from agent.project_knowledge import (
    project_knowledge_query,
    retrieve_project_knowledge,
)
from agent.state import AgentState, PlanStep, ToolCall
from api import _sse_event
from mcp_server import mcp
from tools import atlas_tools


async def test_mcp_server_exposes_the_required_contract() -> None:
    async with Client(mcp, read_timeout_seconds=5) as client:
        response = await client.list_tools()

    assert {tool.name for tool in response.tools} == REQUIRED_TOOLS


def test_mcp_server_exposes_native_sse_routes() -> None:
    app = mcp.sse_app(sse_path="/sse", message_path="/messages/")

    routes = {
        (route.path, tuple(sorted(getattr(route, "methods", None) or [])))
        for route in app.routes
    }
    assert ("/sse", ("GET", "HEAD")) in routes
    assert any(path == "/messages" for path, _ in routes)


def test_remote_sse_url_uses_the_native_sse_transport(monkeypatch) -> None:
    sentinel_transport = object()
    captured: dict[str, object] = {}

    def fake_sse_client(url: str, **kwargs):
        captured.update(url=url, **kwargs)
        return sentinel_transport

    class FakeClient:
        def __init__(self, server, **kwargs):
            captured["server"] = server
            captured["client_kwargs"] = kwargs

    monkeypatch.setenv("MCP_SERVER_URL", "https://mcp.example.test/sse")
    monkeypatch.setenv("MCP_REMOTE_TRANSPORT", "auto")
    monkeypatch.setenv("MCP_READ_TIMEOUT_SECONDS", "42")
    monkeypatch.setattr(mcp_client, "sse_client", fake_sse_client)
    monkeypatch.setattr(mcp_client, "Client", FakeClient)

    client = create_mcp_client()

    assert isinstance(client, FakeClient)
    assert captured == {
        "url": "https://mcp.example.test/sse",
        "timeout": 42.0,
        "sse_read_timeout": 42.0,
        "server": sentinel_transport,
        "client_kwargs": {},
    }


def test_sse_event_preserves_unicode_and_protocol_boundaries() -> None:
    event = _sse_event("delta", {"text": "Análise do município"})

    assert event.startswith("event: delta\ndata: ")
    assert '"text":"Análise do município"' in event
    assert event.endswith("\n\n")


async def test_reflector_stream_forwards_native_public_chunks() -> None:
    class Chunk:
        def __init__(self, content: str):
            self.content = content

    class FakeLlm:
        async def astream(self, messages):
            assert messages == ["prompt"]
            for content in ("A escola ", "possui ", "internet."):
                yield Chunk(content)

    received: list[str] = []

    async def on_token(text: str) -> None:
        received.append(text)

    token = _TOKEN_CALLBACK.set(on_token)
    try:
        answer = await _stream_reflector_text(FakeLlm(), ["prompt"])
    finally:
        _TOKEN_CALLBACK.reset(token)

    assert answer == "A escola possui internet."
    assert received == ["A escola ", "possui ", "internet."]


async def test_reflector_stream_does_not_expose_replan_message() -> None:
    class Chunk:
        def __init__(self, content: str):
            self.content = content

    class FakeLlm:
        async def astream(self, messages):
            for content in ("REP", "LAN:", " falta consultar o município"):
                yield Chunk(content)

    received: list[str] = []

    async def on_token(text: str) -> None:
        received.append(text)

    token = _TOKEN_CALLBACK.set(on_token)
    try:
        answer = await _stream_reflector_text(FakeLlm(), [])
    finally:
        _TOKEN_CALLBACK.reset(token)

    assert answer == "REPLAN: falta consultar o município"
    assert received == []


async def test_conversational_answer_is_emitted_without_artificial_chunks() -> None:
    received: list[str] = []

    async def on_token(text: str) -> None:
        received.append(text)

    result = await agent_graph.run_agent("Oi!", on_token=on_token)

    assert received == [result["answer"]]


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


def test_team_question_retrieves_the_complete_project_corpus() -> None:
    chunks = retrieve_project_knowledge("Quem desenvolveu você?")

    titles = {chunk.title for chunk in chunks}
    assert "Professores orientadores" in titles
    assert "Estudantes" in titles
    assert "Equipe de IA e Dados" in titles
    assert "Equipe de Desenvolvimento do Sistema" in titles


def test_team_member_question_prioritizes_relevant_responsibilities() -> None:
    chunks = retrieve_project_knowledge("Qual é a função de Luciely no projeto?")

    assert chunks
    assert any(chunk.title == "Equipe de Desenvolvimento do Sistema" for chunk in chunks)
    assert any("Luciely Beatriz" in chunk.content for chunk in chunks)


def test_orientation_question_is_recognized_without_naming_atlas() -> None:
    chunks = retrieve_project_knowledge("Quem são os professores orientadores?")

    assert chunks[0].title == "Professores orientadores"


def test_unrelated_data_question_does_not_use_project_knowledge() -> None:
    chunks = retrieve_project_knowledge("Compare a média do ENEM desta escola com o município.")

    assert chunks == []


def test_short_follow_up_uses_the_previous_team_question() -> None:
    history = [{"role": "user", "content": "Quem é o professor Erick?"}]

    query = project_knowledge_query("E do que ele gosta?", history)
    chunks = retrieve_project_knowledge("E do que ele gosta?", history)

    assert query is not None
    assert chunks[0].title == "Professores orientadores"


async def test_team_rag_returns_grounded_metadata_without_running_mcp(monkeypatch) -> None:
    class FakeResponse:
        content = "O ATLAS Escolar foi desenvolvido coletivamente pela equipe do projeto."

    class FakeLlm:
        async def ainvoke(self, messages):
            assert "Marcelo Augusto" in messages[-1].content
            assert "Erick MacGregor" in messages[-1].content
            return FakeResponse()

    monkeypatch.setattr(agent_graph, "_get_llm", lambda: FakeLlm())

    result = await agent_graph.run_agent("Quem desenvolveu você?")

    assert result["engine"] == "project-knowledge-rag"
    assert result["source"] == "Equipe do ATLAS Escolar"
    assert result["evidence_count"] == 1


async def test_mcp_tool_returns_real_school_data() -> None:
    async with Client(mcp, read_timeout_seconds=5) as client:
        raw_result = await client.call_tool("get_school_profile", {"school_code": "21288780"})

    result = decode_tool_result(raw_result)
    assert result["code"] == "21288780"
    assert result["municipality"] == "Coelho Neto"
    assert result["source"] == "ENEM 2025 + Censo Escolar 2025"


def test_school_profile_matches_dashboard_library_or_reading_room_indicator() -> None:
    result = atlas_tools.get_school_profile("21272689", 2025)

    assert result["resources"]["library"] is True


def test_school_profile_compares_all_available_years(monkeypatch) -> None:
    def school_row(year: int, math_average: float, connectivity: float) -> dict:
        return {
            "CO_ESCOLA": "21000000",
            "NO_ESCOLA": "Escola Histórica",
            "CO_MUNICIPIO": "2100000",
            "NO_MUNICIPIO": "Município",
            "DEPENDENCIA": 2,
            "LOCALIZACAO": 1,
            "QTD_REGISTROS": 40,
            "QTD_PARTICIPANTES_MT": 35,
            "MEDIA_MT": math_average,
            "PERCENTUAL_RECURSOS_CONECTIVIDADE": connectivity,
        }

    runtime = {
        "manifest": {
            "defaultYear": 2025,
            "defaultSaebYear": None,
            "availableYears": {"atlas": [2025, 2024], "saeb": []},
        },
        "years": {
            "2024": {
                "schools": [school_row(2024, 500, 50)],
                "municipalities": [],
            },
            "2025": {
                "schools": [school_row(2025, 520, 60)],
                "municipalities": [],
            },
        },
        "saebByYear": {},
    }
    monkeypatch.setattr(atlas_tools, "_load_data", lambda: runtime)

    result = atlas_tools.get_school_profile("21000000", 2025)

    assert result["availableYears"] == [2024, 2025]
    assert [point["year"] for point in result["history"]] == [2024, 2025]
    comparison = result["comparisonWithPrevious"]
    assert comparison["fromYear"] == 2024
    assert comparison["toYear"] == 2025
    assert comparison["enem"]["mt"] == {"change": 20, "direction": "improved"}
    assert comparison["infrastructure"]["connectivity"] == {
        "change": 10,
        "direction": "improved",
    }


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
    assert _parse_json_response('{"is_complete": true}\nExplicacao extra') == {"is_complete": True}


def test_reflector_accepts_multiline_markdown_without_json() -> None:
    markdown = "Análise rápida:\n\n- Indicador: **7,5/10**\n- Fonte auditável"
    result = _interpret_reflector_output(markdown, iteration=1, max_iterations=3, evidence=[])

    assert result["is_complete"] is True
    assert result["final_answer"] == markdown


def test_enem_question_hides_unrequested_infrastructure_evidence() -> None:
    evidence = [
        {
            "step_id": 1,
            "results": [
                {
                    "tool": "get_school_profile",
                    "result": {
                        "name": "Escola Teste",
                        "averages": {"mt": 500},
                        "participants": {"mt": 40},
                        "infrastructure": {"connectivity": 7.5},
                        "resources": {"internet": True},
                        "history": [
                            {
                                "year": 2025,
                                "averages": {"mt": 500},
                                "infrastructure": {"connectivity": 7.5},
                            }
                        ],
                    },
                }
            ],
        }
    ]

    focused = _focused_evidence("Quais são as médias do ENEM?", evidence)
    result = focused[0]["results"][0]["result"]

    assert result["averages"] == {"mt": 500}
    assert "infrastructure" not in result
    assert "resources" not in result
    assert "infrastructure" not in result["history"][0]


def test_infrastructure_question_hides_unrequested_enem_evidence() -> None:
    evidence = [
        {
            "step_id": 1,
            "results": [
                {
                    "tool": "get_school_profile",
                    "result": {
                        "name": "Escola Teste",
                        "averages": {"mt": 500},
                        "participants": {"mt": 40},
                        "infrastructure": {"connectivity": 7.5},
                        "resources": {"internet": True},
                    },
                }
            ],
        }
    ]

    focused = _focused_evidence("Qual é o gargalo de infraestrutura?", evidence)
    result = focused[0]["results"][0]["result"]

    assert result["infrastructure"] == {"connectivity": 7.5}
    assert result["resources"] == {"internet": True}
    assert "averages" not in result
    assert "participants" not in result


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
    assert normalized[0].tool_calls[1].arguments == {"municipality_name": "Coelho Neto"}


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

    assert [call.tool_name for call in normalized[0].tool_calls] == ["get_school_profile"]


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

    assert [call.tool_name for call in normalized[0].tool_calls] == ["get_school_profile"]


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


def test_direct_resource_answer_is_short_natural_and_scoped() -> None:
    evidence = [
        {
            "step_id": 1,
            "results": [
                {
                    "tool": "get_school_profile",
                    "result": {
                        "name": "Escola Exemplo",
                        "resources": {
                            "scienceLab": False,
                            "library": False,
                            "internet": True,
                            "totalDevices": 8,
                            "climateControlledRooms": 12,
                        },
                        "source": "ENEM 2025 + Censo Escolar 2025",
                    },
                }
            ],
        }
    ]

    answer = _grounded_resource_answer("A escola tem laboratório de ciências?", evidence)

    assert answer == (
        "Não. Nos dados disponíveis, não há registro de laboratório de ciências nessa escola."
    )
    assert "scienceLab" not in answer
    assert "false" not in answer.casefold()
    assert "biblioteca" not in answer.casefold()
    assert "internet" not in answer.casefold()
    assert "dispositivos" not in answer.casefold()
    assert "salas" not in answer.casefold()


def test_direct_resource_answer_handles_positive_and_count_questions() -> None:
    evidence = [
        {
            "step_id": 1,
            "results": [
                {
                    "tool": "get_school_profile",
                    "result": {
                        "resources": {
                            "studentInternet": True,
                            "internet": True,
                            "climateControlledRooms": 12,
                        }
                    },
                }
            ],
        }
    ]

    internet_answer = _grounded_resource_answer("A escola possui internet para alunos?", evidence)
    rooms_answer = _grounded_resource_answer("Quantas salas climatizadas a escola tem?", evidence)

    assert internet_answer == "Sim. A escola possui acesso à internet para alunos."
    assert rooms_answer == "A escola tem 12 salas climatizadas."


def test_library_answer_uses_the_same_combined_indicator_as_the_dashboard() -> None:
    evidence = [
        {
            "step_id": 1,
            "results": [
                {
                    "tool": "get_school_profile",
                    "result": {
                        "resources": {"library": True},
                        "source": "Censo Escolar 2025",
                    },
                }
            ],
        }
    ]

    answer = _grounded_resource_answer("A escola tem biblioteca?", evidence)

    assert answer == "Sim. A escola possui biblioteca ou sala de leitura."


def test_direct_resource_question_normalizes_plan_to_school_profile() -> None:
    state = AgentState(
        question="Há laboratório de ciências?",
        school_code="21288780",
        selection={"year": 2025},
    )
    steps = [
        PlanStep(
            id=1,
            description="Consultar dados",
            tool_calls=[
                ToolCall(
                    tool_name="get_data_methodology",
                    arguments={},
                    step_id=1,
                )
            ],
        )
    ]

    normalized = _normalize_plan_for_context(steps, state)

    assert normalized[0].tool_calls == [
        ToolCall(
            tool_name="get_school_profile",
            arguments={"school_code": "21288780", "year": 2025},
            step_id=1,
        )
    ]
