/** Contratos compartilhados pela interface e pela rota do assistente MCP. */

export type AssistantConversationTurn = {
  role: 'user' | 'assistant';
  text: string;
};

export type AssistantSelection = {
  analysisLevel?: 'state' | 'municipality' | 'school';
  municipality?: string;
  comparisonMunicipality?: string;
  compareMunicipalities?: boolean;
};

export type AssistantVisualizationTarget =
  | { kind: 'state' }
  | { kind: 'municipality'; municipality: string }
  | { kind: 'school'; schoolCode: string };

export type AssistantVisualization = {
  type: 'infrastructure' | 'performance';
  primary: AssistantVisualizationTarget;
  secondary?: AssistantVisualizationTarget;
};

export type AssistantAnswer = {
  text: string;
  source?: string;
  mode: string;
  visualization?: AssistantVisualization;
  engine?: string;
  iterations?: number;
  evidenceCount?: number;
};

export type AssistantStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      source?: string;
      mode?: string;
      engine?: string;
      iterations?: number;
      evidenceCount?: number;
    }
  | { type: 'error'; message: string };

function parseStreamEvent(block: string): AssistantStreamEvent | undefined {
  let eventName = '';
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }

  if (!eventName || !dataLines.length) return undefined;

  let payload: unknown;
  try {
    payload = JSON.parse(dataLines.join('\n'));
  } catch {
    return undefined;
  }
  if (typeof payload !== 'object' || payload === null) return undefined;
  const data = payload as Record<string, unknown>;

  if (eventName === 'status' && typeof data.message === 'string') {
    return { type: 'status', message: data.message };
  }
  if (eventName === 'delta' && typeof data.text === 'string') {
    return { type: 'delta', text: data.text };
  }
  if (eventName === 'error' && typeof data.message === 'string') {
    return { type: 'error', message: data.message };
  }
  if (eventName === 'done') {
    return {
      type: 'done',
      source: typeof data.source === 'string' ? data.source : undefined,
      mode: typeof data.mode === 'string' ? data.mode : undefined,
      engine: typeof data.engine === 'string' ? data.engine : undefined,
      iterations:
        typeof data.iterations === 'number' ? data.iterations : undefined,
      evidenceCount:
        typeof data.evidenceCount === 'number' ? data.evidenceCount : undefined,
    };
  }
  return undefined;
}

export async function readAssistantStream(
  response: Response,
  onEvent: (event: AssistantStreamEvent) => void | Promise<void>,
) {
  if (!response.body) throw new Error('Resposta sem stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let separator = buffer.search(/\r?\n\r?\n/);
    while (separator >= 0) {
      const block = buffer.slice(0, separator);
      const separatorLength = buffer.slice(separator).startsWith('\r\n')
        ? 4
        : 2;
      buffer = buffer.slice(separator + separatorLength);
      const event = parseStreamEvent(block);
      if (event) await onEvent(event);
      separator = buffer.search(/\r?\n\r?\n/);
    }

    if (done) break;
  }

  const finalEvent = parseStreamEvent(buffer.trim());
  if (finalEvent) await onEvent(finalEvent);
}
