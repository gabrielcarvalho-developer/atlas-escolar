import { NextResponse } from 'next/server';
import {
  answerQuestionLocally,
  buildAssistantGrounding,
  type AssistantConversationTurn,
  type AssistantSelection,
} from '@/lib/assistant';
import { buildSchoolContext, SCHOOLS } from '@/lib/atlas-data';

type AssistantRequest = {
  question?: unknown;
  schoolCode?: unknown;
  history?: unknown;
  selection?: unknown;
};

function endpointFrom(base: string) {
  const normalized = base.replace(/\/$/, '');
  if (normalized.endsWith('/chat/completions')) return normalized;

  try {
    const url = new URL(normalized);
    if (
      url.hostname === 'api.cloudflare.com' &&
      /^\/client\/v4\/accounts\/[^/]+$/.test(url.pathname)
    ) {
      url.pathname = `${url.pathname}/ai/v1/chat/completions`;
      return url.toString();
    }
  } catch {
    // O fetch produzirá o erro apropriado para URLs inválidas.
  }

  return `${normalized}/chat/completions`;
}

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
        ? candidate.municipality
        : undefined,
    comparisonMunicipality:
      typeof candidate.comparisonMunicipality === 'string'
        ? candidate.comparisonMunicipality
        : undefined,
    compareMunicipalities: candidate.compareMunicipalities === true,
  };
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
  const schoolCode = typeof body.schoolCode === 'string' ? body.schoolCode : '';
  if (
    !question ||
    question.length > 2_000 ||
    !SCHOOLS.some((school) => school.code === schoolCode)
  ) {
    return NextResponse.json(
      { error: 'Pergunta ou código de escola inválido.' },
      { status: 400 },
    );
  }

  const history = parseHistory(body.history);
  const selection = parseSelection(body.selection);
  const context = buildSchoolContext(schoolCode, true);
  const localAnswer = answerQuestionLocally(
    question,
    context,
    history,
    selection,
  );
  const apiUrl = process.env.LLAMA_API_URL;
  const apiKey = process.env.LLAMA_API_KEY;
  const model = process.env.LLAMA_MODEL;

  if (!apiUrl || !apiKey || !model) {
    return NextResponse.json(localAnswer);
  }

  const grounding = buildAssistantGrounding(
    context,
    question,
    history,
    selection,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(endpointFrom(apiUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 800,
        messages: [
          {
            role: 'system',
            content:
              'Você é o Assistente Atlas Escolar. Responda em português brasileiro somente com base nas evidências fornecidas. Considere o histórico para entender referências como “lá”, “nesse município” ou perguntas de continuação. Para preservar a auditabilidade, devolva exatamente a RESPOSTA AUDITÁVEL DE REFERÊNCIA, sem alterar números, entidades, ressalvas ou fontes. Preserve o Markdown simples.',
          },
          ...history.map((turn) => ({
            role: turn.role,
            content: turn.text,
          })),
          {
            role: 'user',
            content: [
              `PERGUNTA ATUAL:\n${question}`,
              `RESPOSTA AUDITÁVEL DE REFERÊNCIA (modo: ${localAnswer.mode}):\n${localAnswer.text}`,
              `EVIDÊNCIAS E RESSALVAS:\n${JSON.stringify(grounding)}`,
            ].join('\n\n'),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Llama respondeu com status ${response.status}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Resposta vazia do Llama.');
    if (text !== localAnswer.text.trim()) {
      return NextResponse.json(localAnswer);
    }

    return NextResponse.json({
      ...localAnswer,
      text,
      mode: 'IA + evidências estruturadas',
      engine: 'llama',
    });
  } catch (error) {
    console.error('Falha no provedor Llama; usando resposta local.', error);
    return NextResponse.json(localAnswer);
  } finally {
    clearTimeout(timeout);
  }
}
