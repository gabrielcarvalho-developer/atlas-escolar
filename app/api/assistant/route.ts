import { NextResponse } from 'next/server';
import type {
  AssistantConversationTurn,
  AssistantSelection,
} from '@/lib/assistant';

type AssistantRequest = {
  question?: unknown;
  schoolCode?: unknown;
  history?: unknown;
  selection?: unknown;
};

function parseHistory(value: unknown): AssistantConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is AssistantConversationTurn =>
        typeof item === 'object' &&
        item !== null &&
        ((item as { role?: unknown }).role === 'user' ||
          (item as { role?: unknown }).role === 'assistant') &&
        typeof (item as { text?: unknown }).text === 'string',
    )
    .map((item) => ({ role: item.role, text: item.text.slice(0, 2_000) }))
    .slice(-12);
}

function parseSelection(value: unknown): AssistantSelection {
  if (typeof value !== 'object' || value === null) return {};
  const candidate = value as Record<string, unknown>;
  const analysisLevel = ['state', 'municipality', 'school'].includes(
    String(candidate.analysisLevel),
  )
    ? (candidate.analysisLevel as AssistantSelection['analysisLevel'])
    : undefined;

  return {
    analysisLevel,
    municipality:
      typeof candidate.municipality === 'string'
        ? candidate.municipality.slice(0, 120)
        : undefined,
    comparisonMunicipality:
      typeof candidate.comparisonMunicipality === 'string'
        ? candidate.comparisonMunicipality.slice(0, 120)
        : undefined,
    compareMunicipalities: candidate.compareMunicipalities === true,
  };
}

function agentEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, '');
  return normalized.endsWith('/api/agent')
    ? normalized
    : `${normalized}/api/agent`;
}

function agentStreamEndpoint(baseUrl: string) {
  return `${agentEndpoint(baseUrl)}/stream`;
}

function agentTimeout() {
  const configured = Number(process.env.ATLAS_AGENT_TIMEOUT_MS ?? 90_000);
  if (!Number.isFinite(configured)) return 90_000;
  return Math.min(Math.max(configured, 5_000), 180_000);
}

export async function POST(request: Request) {
  let body: AssistantRequest;
  try {
    body = (await request.json()) as AssistantRequest;
  } catch {
    return NextResponse.json(
      { error: 'Corpo JSON inválido.' },
      { status: 400 },
    );
  }

  const question =
    typeof body.question === 'string' ? body.question.trim() : '';
  const schoolCode =
    typeof body.schoolCode === 'string' ? body.schoolCode.trim() : '';
  if (!question || question.length > 2_000 || !/^\d{8}$/.test(schoolCode)) {
    return NextResponse.json(
      { error: 'Pergunta ou código de escola inválido.' },
      { status: 400 },
    );
  }

  const agentUrl = process.env.ATLAS_AGENT_URL?.trim();
  if (!agentUrl) {
    console.error('ATLAS_AGENT_URL não está configurada.');
    return NextResponse.json(
      { error: 'Assistente MCP não configurado.' },
      { status: 503 },
    );
  }

  const history = parseHistory(body.history);
  const selection = parseSelection(body.selection);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), agentTimeout());

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const agentToken = process.env.ATLAS_AGENT_TOKEN?.trim();
    if (agentToken) headers.Authorization = `Bearer ${agentToken}`;

    const response = await fetch(agentStreamEndpoint(agentUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        question,
        history: history.map((turn) => ({
          role: turn.role,
          content: turn.text,
        })),
        school_code: schoolCode,
        selection,
      }),
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`Agente MCP respondeu com status ${response.status}.`);
      return NextResponse.json(
        { error: 'O agente MCP está temporariamente indisponível.' },
        { status: 502 },
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!response.body || !contentType.includes('text/event-stream')) {
      console.error('Agente MCP retornou um stream inválido.');
      return NextResponse.json(
        { error: 'O agente MCP retornou uma resposta inválida.' },
        { status: 502 },
      );
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Falha na comunicação com o agente MCP.', error);
    return NextResponse.json(
      { error: 'Não foi possível acessar o agente MCP.' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
