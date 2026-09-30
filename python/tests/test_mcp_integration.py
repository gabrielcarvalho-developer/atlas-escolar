from __future__ import annotations

from mcp import Client

from agent import graph as agent_graph
from agent import mcp_client
from agent.graph import (
    _TOKEN_CALLBACK,
    _collapse_repeated_blocks,
    _conversational_answer,
    _focused_evidence,
    _get_llm,
    _grounded_available_years_answer,
    _grounded_enem_answer,
    _grounded_enem_comparison_answer,
    _grounded_enem_record_answer,
    _grounded_infrastructure_dimension_answer,
    _grounded_resource_answer,
    _grounded_temporal_answer,
    _interpret_reflector_output,
    _known_unavailable_answer,
    _normalize_plan_for_context,
    _openai_compatible_base_url,
    _parse_json_response,
    _stream_reflector_text,
    _strip_redundant_question_heading,
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


async def test_reflector_stream_does_not_emit_redundant_question_heading() -> None:
    class Chunk:
        def __init__(self, content: str):
            self.content = content

    class FakeLlm:
        async def astream(self, messages):
            for content in (
                "Media do ENEM no ano de 2024",
                "\n\n",
                "A media de Linguagens foi de 489,89 pontos.",
            ):
                yield Chunk(content)

    received: list[str] = []

    async def on_token(text: str) -> None:
        received.append(text)

    token = _TOKEN_CALLBACK.set(on_token)
    try:
        answer = await _stream_reflector_text(
            FakeLlm(),
            [],
            question="Qual foi a media do ENEM no ano de 2024?",
        )
    finally:
        _TOKEN_CALLBACK.reset(token)

    assert answer.startswith("Media do ENEM no ano de 2024")
    assert received == ["A media de Linguagens foi de 489,89 pontos."]


async def test_reflector_stream_stops_before_repeated_paragraph_loop() -> None:
    class Chunk:
        def __init__(self, content: str):
            self.content = content

    repeated = "A media de Letras foi de 489,89 pontos e a redacao foi de 651,4 pontos."

    class FakeLlm:
        async def astream(self, messages):
            for content in (
                "A resposta direta vem primeiro.\n\n",
                f"{repeated}\n\n",
                "A escola participou com 132 registros.\n\n",
                f"{repeated}\n\n",
                "Este trecho nao deve ser exibido.",
            ):
                yield Chunk(content)

    received: list[str] = []

    async def on_token(text: str) -> None:
        received.append(text)

    token = _TOKEN_CALLBACK.set(on_token)
    try:
        await _stream_reflector_text(
            FakeLlm(),
            [],
            question="Quais foram as medias do ENEM em 2024?",
        )
    finally:
        _TOKEN_CALLBACK.reset(token)

    streamed = "".join(received)
    assert streamed.count(repeated) == 1
    assert "Este trecho nao deve ser exibido" not in streamed


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


def test_school_foundation_is_reported_as_unavailable() -> None:
    answer = _known_unavailable_answer("Quando ela foi fundada?")

    assert answer is not None
    assert "n\u00e3o informa o ano de funda\u00e7\u00e3o" in answer
    assert "refer\u00eancia do Censo Escolar e do ENEM" in answer
    assert "2025" not in answer


def test_project_creation_question_is_not_treated_as_school_foundation() -> None:
    assert _known_unavailable_answer("Quando o projeto Atlas foi criado?") is None


async def test_foundation_question_bypasses_the_analytical_agent(monkeypatch) -> None:
    monkeypatch.setattr(agent_graph, "retrieve_project_knowledge", lambda *args: [])

    def fail_if_graph_runs():
        raise AssertionError("The analytical graph must not run for a known schema gap.")

    monkeypatch.setattr(agent_graph, "build_agent_graph", fail_if_graph_runs)

    result = await agent_graph.run_agent("Quando essa escola foi fundada?")

    assert result["engine"] == "atlas-schema"
    assert result["iterations"] == 0
    assert "n\u00e3o informa" in result["answer"]


def test_methodology_declares_that_school_foundation_is_absent() -> None:
    result = atlas_tools.get_data_methodology()

    assert any("funda\u00e7\u00e3o" in limitation for limitation in result["limitations"])


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


def test_llama_provider_uses_non_streaming_completion_for_compatible_gateways(
    monkeypatch,
) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "llama")
    monkeypatch.setenv("LLAMA_MODEL", "test-model")
    monkeypatch.setenv("LLAMA_API_KEY", "test-key")
    monkeypatch.setenv("LLAMA_API_URL", "https://gateway.example.test/v1")

    llm = _get_llm()

    assert llm.disable_streaming is True


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
    assert "history" not in result
    assert "comparisonWithPrevious" not in result


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


def test_redundant_question_heading_is_removed() -> None:
    answer = (
        "Qual foi a media do ENEM no ano de 2024?\n\n"
        "A media de Linguagens foi de 489,89 pontos."
    )

    cleaned = _strip_redundant_question_heading(
        "Qual foi a media do ENEM no ano de 2024?", answer
    )

    assert cleaned == "A media de Linguagens foi de 489,89 pontos."


def test_temporal_answer_groups_changes_without_static_resources() -> None:
    evidence = [
        {
            "step_id": 1,
            "results": [
                {
                    "tool": "get_school_profile",
                    "result": {
                        "resources": {"library": True, "scienceLab": True},
                        "comparisonWithPrevious": {
                            "fromYear": 2024,
                            "toYear": 2025,
                            "enem": {
                                "cn": {"change": 8.15, "direction": "improved"},
                                "ch": {"change": 10.7, "direction": "improved"},
                                "lc": {"change": 10.51, "direction": "improved"},
                                "mt": {"change": -14.43, "direction": "worsened"},
                                "essay": {"change": -62.53, "direction": "worsened"},
                            },
                            "infrastructure": {
                                "basicServices": {"change": 0, "direction": "stable"},
                                "learningSpaces": {"change": 0, "direction": "stable"},
                                "connectivity": {"change": 0, "direction": "stable"},
                                "accessibility": {
                                    "change": 20,
                                    "direction": "improved",
                                },
                                "climate": {"change": 0, "direction": "stable"},
                            },
                        },
                    },
                }
            ],
        }
    ]

    answer = _grounded_temporal_answer(
        "A escola evoluiu entre os anos de 2024 e 2025?", evidence
    )

    assert answer is not None
    assert answer.startswith("Parcialmente. Entre 2024 e 2025")
    assert "### Melhoras" in answer
    assert "### Quedas" in answer
    assert answer.count("\n- ") <= 5
    assert "biblioteca" not in answer
    assert answer.count("2024") == 1
    assert answer.count("2025") == 1
    assert "Acessibilidade" in answer
    assert "Letras" not in answer


def test_enem_summary_uses_canonical_areas_and_one_year_reference() -> None:
    evidence = [
        {
            "step_id": 1,
            "results": [
                {
                    "tool": "get_school_profile",
                    "result": {
                        "name": "Escola Exemplo",
                        "year": 2024,
                        "averages": {
                            "cn": 445.24,
                            "ch": 469.64,
                            "lc": 489.89,
                            "mt": 467.27,
                            "essay": 651.4,
                            "validEssay": 703.75,
                        },
                    },
                }
            ],
        }
    ]

    answer = _grounded_enem_answer(
        "Qual foi a media do ENEM no ano de 2024?", evidence
    )

    assert answer is not None
    assert answer.count("2024") == 1
    assert "uma \u00fanica m\u00e9dia geral" in answer
    assert "**Ci\u00eancias da Natureza:** **445,24 pontos**" in answer
    assert "**Linguagens e C\u00f3digos:** **489,89 pontos**" in answer
    assert "Letras" not in answer
    assert "validEssay" not in answer


def test_enem_record_count_returns_only_the_requested_fact() -> None:
    evidence = [
        {
            "results": [
                {
                    "tool": "get_school_profile",
                    "result": {
                        "name": "Escola Exemplo",
                        "year": 2025,
                        "records": 128,
                        "averages": {"cn": 453.39},
                        "comparisonWithPrevious": {
                            "fromYear": 2024,
                            "toYear": 2025,
                        },
                    },
                }
            ]
        }
    ]

    answer = _grounded_enem_record_answer(
        "Quantos registros do ENEM existem para essa escola?", evidence
    )

    assert answer == "A escola tem **128 registros do ENEM** em 2025."
    assert "m\u00e9dia" not in answer
    assert "melhora" not in answer
    focused = _focused_evidence(
        "Quantos registros do ENEM existem para essa escola?", evidence
    )
    focused_result = focused[0]["results"][0]["result"]
    assert focused_result["records"] == 128
    assert "averages" not in focused_result
    assert "comparisonWithPrevious" not in focused_result


def test_specific_infrastructure_dimension_excludes_other_resources() -> None:
    evidence = [
        {
            "results": [
                {
                    "tool": "get_school_profile",
                    "result": {
                        "name": "Escola Exemplo",
                        "year": 2025,
                        "infrastructure": {
                            "basicServices": 7.5,
                            "learningSpaces": 10,
                            "connectivity": 10,
                            "accessibility": 10,
                            "climate": 10,
                        },
                        "infrastructureScore": 9.5,
                        "criticalFactor": "basicServices",
                        "resources": {
                            "water": True,
                            "publicEnergy": True,
                            "publicSewage": False,
                            "wasteCollection": True,
                            "library": True,
                            "scienceLab": True,
                            "internet": True,
                            "accessibleRooms": 0,
                        },
                        "averages": {"cn": 453.39},
                    },
                }
            ]
        }
    ]

    question = "Como estao os servicos basicos?"
    answer = _grounded_infrastructure_dimension_answer(question, evidence)

    assert answer is not None
    assert answer.startswith("Os servi\u00e7os b\u00e1sicos da escola atingem **75%** em 2025.")
    assert "rede p\u00fablica de esgoto" in answer
    assert "biblioteca" not in answer
    assert "internet" not in answer
    assert "acessibilidade" not in answer

    focused = _focused_evidence(question, evidence)
    focused_result = focused[0]["results"][0]["result"]
    assert focused_result["infrastructure"] == {"basicServices": 7.5}
    assert set(focused_result["resources"]) == {
        "water",
        "publicEnergy",
        "publicSewage",
        "wasteCollection",
    }
    assert "averages" not in focused_result
    assert "infrastructureScore" not in focused_result


def test_enem_comparison_is_short_and_has_no_parenthetical_labels() -> None:
    evidence = [
        {
            "results": [
                {
                    "tool": "get_school_profile",
                    "result": {
                        "year": 2025,
                        "averages": {
                            "cn": 453.39,
                            "ch": 480.34,
                            "lc": 500.4,
                            "mt": 452.84,
                            "essay": 588.87,
                        },
                    },
                },
                {
                    "tool": "get_municipality_metrics",
                    "result": {
                        "name": "Coelho Neto",
                        "year": 2025,
                        "averages": {
                            "cn": 453.82,
                            "ch": 469.75,
                            "lc": 482.27,
                            "mt": 452.71,
                            "essay": 526.72,
                        },
                    },
                },
            ]
        }
    ]

    answer = _grounded_enem_comparison_answer(
        "Compare as medias do ENEM da escola com o municipio.", evidence
    )

    assert answer is not None
    assert answer.startswith(
        "Em 2025, a escola ficou acima da m\u00e9dia de **Coelho Neto** em 4 das 5 \u00e1reas."
    )
    assert answer.count("\n- ") == 5
    assert "(" not in answer
    assert "**Reda\u00e7\u00e3o:** +62,15 pontos" in answer
    assert "**Ci\u00eancias da Natureza:** \u22120,43 pontos" in answer


def test_enem_specific_area_answer_is_a_single_direct_sentence() -> None:
    evidence = [
        {
            "results": [
                {
                    "tool": "get_state_metrics",
                    "result": {
                        "name": "Maranhao",
                        "year": 2025,
                        "averages": {"mt": 472.5},
                    },
                }
            ]
        }
    ]

    answer = _grounded_enem_answer(
        "Qual foi a media de matematica no ENEM?", evidence
    )

    assert answer == (
        "Em 2025, a m\u00e9dia de **Matem\u00e1tica** do Maranh\u00e3o foi de "
        "**472,5 pontos**."
    )


def test_meaningful_answer_opening_is_preserved() -> None:
    answer = "A media foi de 489,89 pontos.\n\nO resultado se refere a Linguagens."

    cleaned = _strip_redundant_question_heading(
        "Qual foi a media do ENEM no ano de 2024?", answer
    )

    assert cleaned == answer


def test_explicit_year_overrides_selected_year_in_plan() -> None:
    state = AgentState(
        question="Qual foi a media do ENEM em 2024?",
        selection={"year": 2025},
    )
    steps = [
        PlanStep(
            id=1,
            description="Consultar medias",
            tool_calls=[
                ToolCall(
                    tool_name="get_state_metrics",
                    arguments={"year": 2025},
                    step_id=1,
                )
            ],
        )
    ]

    normalized = _normalize_plan_for_context(steps, state)

    assert normalized[0].tool_calls[0].arguments["year"] == 2024


def test_selected_year_replaces_planner_invented_year() -> None:
    state = AgentState(
        question="Compare os dados desta escola com os anos anteriores.",
        school_code="21288780",
        selection={"year": 2025},
    )
    steps = [
        PlanStep(
            id=1,
            description="Consultar a s\u00e9rie hist\u00f3rica",
            tool_calls=[
                ToolCall(
                    tool_name="get_school_profile",
                    arguments={"school_code": "21288780", "year": 2023},
                    step_id=1,
                )
            ],
        )
    ]

    normalized = _normalize_plan_for_context(steps, state)

    assert normalized[0].tool_calls[0].arguments["year"] == 2025


def test_available_years_question_uses_methodology_contract() -> None:
    state = AgentState(
        question="Quais anos anteriores est\u00e3o dispon\u00edveis na base?",
        school_code="21288780",
        selection={"year": 2025},
    )
    steps = [
        PlanStep(
            id=1,
            description="Consultar os anos",
            tool_calls=[
                ToolCall(
                    tool_name="get_school_profile",
                    arguments={"school_code": "21288780"},
                    step_id=1,
                )
            ],
        )
    ]

    normalized = _normalize_plan_for_context(steps, state)

    assert [call.tool_name for call in normalized[0].tool_calls] == [
        "get_data_methodology"
    ]
    assert normalized[0].tool_calls[0].arguments == {}


def test_school_year_availability_keeps_the_school_scope() -> None:
    state = AgentState(
        question="H\u00e1 dados desta escola em 2024?",
        school_code="21288780",
        selection={"year": 2025},
    )
    steps = [
        PlanStep(
            id=1,
            description="Consultar a escola",
            tool_calls=[
                ToolCall(
                    tool_name="get_school_profile",
                    arguments={"school_code": "21288780"},
                    step_id=1,
                )
            ],
        )
    ]

    normalized = _normalize_plan_for_context(steps, state)

    assert normalized[0].tool_calls[0].tool_name == "get_school_profile"
    assert normalized[0].tool_calls[0].arguments["year"] == 2024


def test_available_previous_years_answer_is_grounded_in_manifest() -> None:
    evidence = [
        {
            "step_id": 1,
            "results": [
                {
                    "tool": "get_data_methodology",
                    "result": {
                        "availableYears": {
                            "censusEnem": [2025, 2024],
                            "saeb": [2023, 2021],
                        }
                    },
                }
            ],
        }
    ]

    answer = _grounded_available_years_answer(
        "Quais anos anteriores est\u00e3o dispon\u00edveis na base?",
        evidence,
        {"year": 2025},
    )

    assert answer == (
        "Sim. Em rela\u00e7\u00e3o ao ano selecionado (2025), a base integrada do "
        "Censo Escolar e do ENEM tamb\u00e9m possui dados de 2024."
    )


def test_explicit_available_year_answer_confirms_2024() -> None:
    evidence = [
        {
            "step_id": 1,
            "results": [
                {
                    "tool": "get_data_methodology",
                    "result": {
                        "availableYears": {
                            "censusEnem": [2025, 2024],
                            "saeb": [2023, 2021],
                        }
                    },
                }
            ],
        }
    ]

    answer = _grounded_available_years_answer("H\u00e1 dados de 2024?", evidence)

    assert answer == (
        "Sim. A base integrada do Censo Escolar e do ENEM possui dados de 2024."
    )


def test_temporal_comparison_queries_the_latest_mentioned_year() -> None:
    state = AgentState(
        question="A escola evoluiu entre 2024 e 2025?",
        school_code="21288780",
        selection={"year": 2024},
    )
    steps = [
        PlanStep(
            id=1,
            description="Comparar anos",
            tool_calls=[
                ToolCall(
                    tool_name="get_school_profile",
                    arguments={"school_code": "21288780", "year": 2024},
                    step_id=1,
                )
            ],
        )
    ]

    normalized = _normalize_plan_for_context(steps, state)

    assert normalized[0].tool_calls[0].arguments["year"] == 2025


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
