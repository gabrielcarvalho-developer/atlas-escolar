'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BarChart3,
  Bot,
  Bolt,
  Database,
  HardDrive,
  RotateCcw,
  SendHorizontal,
  UserRound,
  Users,
} from 'lucide-react';
import { AtlasShell } from '@/components/atlas-shell';
import { useAtlas } from '@/components/atlas-provider';
import {
  EnemPerformanceChart,
  InfrastructureChart,
  TerritoryInfrastructureChart,
  TerritoryPerformanceChart,
} from '@/components/atlas-charts';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  readAssistantStream,
  type AssistantAnswer,
  type AssistantConversationTurn,
  type AssistantVisualization,
  type AssistantVisualizationTarget,
} from '@/lib/assistant';
import {
  AVAILABLE_YEARS,
  buildMunicipalityMetrics,
  buildSchoolContext,
  buildStateMetrics,
  getMunicipalities,
  getSchools,
  type SchoolContext,
  type TerritoryMetrics,
} from '@/lib/atlas-data';

type ChatMessage = AssistantAnswer & {
  id: string;
  role: 'assistant' | 'user';
};

type StoredConversation = {
  version: 2;
  messages: ChatMessage[];
  updatedAt: string;
};

function mentionedYears(text: string) {
  return [
    ...new Set(
      Array.from(text.matchAll(/\b(?:19|20)\d{2}\b/g), (match) =>
        Number(match[0]),
      ),
    ),
  ];
}

function messageVisualizationYear(message: ChatMessage, fallback: number) {
  if (message.visualization?.year) return message.visualization.year;
  const supportedYears = mentionedYears(message.text).filter((year) =>
    AVAILABLE_YEARS.includes(year),
  );
  return supportedYears.length === 1 ? supportedYears[0] : fallback;
}

const STORAGE_KEY = 'atlas-assistant-conversation-v2';
const MAX_STORED_MESSAGES = 80;
const VISUALIZATION_ONLY_COPY = {
  text: 'Aqui est\u00e1 o gr\u00e1fico que voc\u00ea pediu.',
  mode: 'Visualiza\u00e7\u00e3o dos dados',
};

function buildSuggestions(context: SchoolContext) {
  return [
    {
      label: 'Análise rápida',
      question:
        'Faça uma análise rápida dos principais indicadores desta escola.',
      icon: Bolt,
    },
    {
      label: 'Desempenho no ENEM',
      question: `Compare as médias do ENEM desta escola com as médias do município de ${context.school.municipality}.`,
      icon: BarChart3,
    },
    {
      label: 'Quem desenvolveu o Atlas?',
      question: 'Quem desenvolveu você?',
      icon: Users,
    },
  ];
}

function welcomeMessage(context: SchoolContext): ChatMessage {
  const municipalities = getMunicipalities(context.school.year);
  const schools = getSchools(context.school.year);
  return {
    id: `welcome-${crypto.randomUUID()}`,
    role: 'assistant',
    text: `Olá! Eu sou o Atlas. Estou consultando **${context.school.year}**, com **${municipalities.length} municípios** e **${schools.length} escolas identificadas**. Também consigo comparar esta escola entre os anos disponíveis.\n\nPergunte por uma localidade ou escola específica.`,
    mode: 'contexto da base carregado',
    engine: 'system',
  };
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ChatMessage>;
  return (
    typeof candidate.id === 'string' &&
    (candidate.role === 'assistant' || candidate.role === 'user') &&
    typeof candidate.text === 'string' &&
    typeof candidate.mode === 'string'
  );
}

function loadStoredMessages() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return undefined;
    const parsed = JSON.parse(stored) as Partial<StoredConversation>;
    if (parsed.version !== 2 || !Array.isArray(parsed.messages)) {
      return undefined;
    }
    const messages = parsed.messages.filter(isChatMessage);
    return messages.length ? messages.slice(-MAX_STORED_MESSAGES) : undefined;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return undefined;
  }
}

const STREAM_CHARACTERS_PER_FRAME = 2;
const STREAM_FRAME_DELAY = 30;

function waitForTypingFrame() {
  return new Promise<void>((resolve) =>
    window.setTimeout(resolve, STREAM_FRAME_DELAY),
  );
}

const SOURCE_FOOTER_PATTERN =
  /(?:^|\n)\s*(?:[-*+•]\s*)?(?:\*\*)?Fonte:(?:\*\*)?\s*(?:Fonte:\s*)?([^\n]+)\s*$/i;
const SOURCE_LABEL_PATTERN =
  /(?:^|\n)\s*(?:#{1,3}\s+)?(?:\*\*)?Fonte(?:\*\*)?\s*:?[ \t]*$/i;

function sourceFromAnswer(text: string) {
  return text.match(SOURCE_FOOTER_PATTERN)?.[1]?.replace(/\*\*$/, '').trim();
}

function collapseRepeatedAnswerBlocks(text: string) {
  const blocks = text.trim().split(/\n\s*\n/);
  if (blocks.length > 1 && blocks[0].trim().endsWith('?')) {
    blocks.shift();
  }
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const block of blocks) {
    const normalized = block.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
    const canSignalLoop =
      normalized.length >= 60 || /^\s*[-*]\s/.test(block);
    if (canSignalLoop && seen.has(normalized)) break;
    seen.add(normalized);
    kept.push(block.trim());
  }
  return kept.join('\n\n');
}

function answerWithoutSource(text: string) {
  return collapseRepeatedAnswerBlocks(
    text
      .replace(SOURCE_FOOTER_PATTERN, '')
      .replace(SOURCE_LABEL_PATTERN, '')
      .replace(
        /\s*\((?:CN|CH|LC|MT|Essay|escola|munic[^)]*|estado)\)/gi,
        '',
      )
      .trimEnd(),
  );
}

function RichText({
  text,
  typing = false,
}: {
  text: string;
  typing?: boolean;
}) {
  type TextBlock =
    | { type: 'paragraph'; content: string }
    | { type: 'heading'; content: string; level: number }
    | { type: 'quote'; content: string }
    | {
        type: 'list';
        items: Array<{ content: string; children: string[] }>;
        ordered: boolean;
      };

  const blocks: TextBlock[] = [];
  let paragraphLines: string[] = [];
  let activeList: Extract<TextBlock, { type: 'list' }> | undefined;

  function flushParagraph() {
    const content = paragraphLines.join('\n').trim();
    if (content) blocks.push({ type: 'paragraph', content });
    paragraphLines = [];
  }

  function flushList() {
    if (activeList) blocks.push(activeList);
    activeList = undefined;
  }

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const unorderedItem = rawLine.match(/^(\s*)([-*+•])\s+(.+)$/);
    const orderedItem = rawLine.match(/^(\s*)\d+[.)]\s+(.+)$/);
    const quote = line.match(/^>\s?(.+)$/);

    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: 'heading',
        content: heading[2],
        level: heading[1].length,
      });
      continue;
    }

    const listItem = unorderedItem ?? orderedItem;
    if (listItem) {
      flushParagraph();
      const ordered = Boolean(orderedItem);
      const content = orderedItem ? listItem[2] : listItem[3];
      const indentation = listItem[1].replace(/\t/g, '  ').length;
      const nested = Boolean(
        unorderedItem && (indentation >= 2 || unorderedItem[2] === '+'),
      );

      if (
        nested &&
        activeList &&
        !activeList.ordered &&
        activeList.items.length
      ) {
        activeList.items.at(-1)?.children.push(content);
        continue;
      }

      if (!activeList || activeList.ordered !== ordered) {
        flushList();
        activeList = { type: 'list', ordered, items: [] };
      }
      activeList.items.push({ content, children: [] });
      continue;
    }

    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'quote', content: quote[1] });
      continue;
    }

    if (activeList && /^\s{2,}\S/.test(rawLine)) {
      const lastItem = activeList.items.length - 1;
      const item = activeList.items[lastItem];
      const lastChild = item.children.length - 1;
      if (lastChild >= 0) {
        item.children[lastChild] += ` ${line.trim()}`;
      } else {
        item.content += ` ${line.trim()}`;
      }
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }
  flushParagraph();
  flushList();

  function inlineMarkdown(content: string, keyPrefix: string): ReactNode[] {
    return content
      .split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g)
      .filter(Boolean)
      .map((part, index) => {
        const key = `${keyPrefix}-${index}`;
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={key} className="font-semibold text-[inherit]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={key} className="atlas-rich-text-code">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <Fragment key={key}>{part}</Fragment>;
      });
  }

  function cursor(show: boolean) {
    return show ? (
      <span className="atlas-typing-cursor" aria-hidden="true" />
    ) : null;
  }

  return (
    <div className="atlas-rich-text text-sm">
      {blocks.map((block, index) => {
        const isLast = index === blocks.length - 1;
        if (block.type === 'heading') {
          return (
            <h3 key={index} data-level={block.level}>
              {inlineMarkdown(block.content, `heading-${index}`)}
              {cursor(typing && isLast)}
            </h3>
          );
        }
        if (block.type === 'quote') {
          return (
            <blockquote key={index}>
              {inlineMarkdown(block.content, `quote-${index}`)}
              {cursor(typing && isLast)}
            </blockquote>
          );
        }
        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <span>
                    {inlineMarkdown(item.content, `list-${index}-${itemIndex}`)}
                    {cursor(
                      typing &&
                        isLast &&
                        itemIndex === block.items.length - 1 &&
                        !item.children.length,
                    )}
                  </span>
                  {item.children.length > 0 && (
                    <ul>
                      {item.children.map((child, childIndex) => (
                        <li key={childIndex}>
                          <span>
                            {inlineMarkdown(
                              child,
                              `list-${index}-${itemIndex}-${childIndex}`,
                            )}
                            {cursor(
                              typing &&
                                isLast &&
                                itemIndex === block.items.length - 1 &&
                                childIndex === item.children.length - 1,
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={index} className="whitespace-pre-line">
            {inlineMarkdown(block.content, `paragraph-${index}`)}
            {cursor(typing && isLast)}
          </p>
        );
      })}
      {!blocks.length && cursor(typing)}
    </div>
  );
}

function visualizationForQuestion(
  question: string,
  previousContext: string,
  selection: {
    analysisLevel: 'state' | 'municipality' | 'school';
    municipality: string;
    comparisonMunicipality: string;
    compareMunicipalities: boolean;
    schoolCode: string;
    year: number;
  },
): AssistantVisualization | undefined {
  const normalized = question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const explicitlyRequested = /\b(?:graficos?|visualiz\w*|chart)\b/.test(
    normalized,
  );
  const quantitativeQuestion =
    explicitlyRequested ||
    /\b(?:compar\w*|evolu\w*|histor\w*|panorama|indicadores?|medias?|notas?|desempenho|gargalos?)\b/.test(
      normalized,
    );
  if (!quantitativeQuestion) return undefined;

  const normalizedContext = previousContext
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  function visualizationType(subject: string) {
    if (
      /\b(?:infraestrutura|gargalos?|climatiz\w*|acessib\w*|biblioteca|laboratorio|internet|quadra)\b/.test(
        subject,
      )
    ) {
      return 'infrastructure' as const;
    }
    if (
      /\b(?:enem|desempenho|notas?|medias?|redacao|matematica|linguagens|humanas|natureza)\b/.test(
        subject,
      )
    ) {
      return 'performance' as const;
    }
    return undefined;
  }

  // A pergunta atual sempre tem prioridade. O histórico só resolve pedidos
  // sem assunto explícito, como "mostre isso em um gráfico".
  const type =
    visualizationType(normalized) ??
    (explicitlyRequested ? visualizationType(normalizedContext) : undefined);
  if (!type) return undefined;

  // The question takes precedence over the UI filter. A follow-up asking for
  // a chart inherits the year from the recent conversation context.
  const currentYears = mentionedYears(question);
  const contextYears = explicitlyRequested
    ? mentionedYears(previousContext)
    : [];
  const requestedYears = currentYears.length ? currentYears : contextYears;
  if (
    requestedYears.length > 1 ||
    (requestedYears.length === 1 &&
      !AVAILABLE_YEARS.includes(requestedYears[0]))
  ) {
    // Current charts represent one year. Avoid presenting the selected year
    // as though it answered a different or multi-year request.
    return undefined;
  }
  const year = requestedYears[0] ?? selection.year;

  if (selection.analysisLevel === 'school') {
    if (!getSchools(year).some((school) => school.code === selection.schoolCode)) {
      return undefined;
    }
    return {
      type,
      year,
      primary: { kind: 'school', schoolCode: selection.schoolCode },
    };
  }
  if (selection.analysisLevel === 'municipality') {
    const availableMunicipalities = new Set(
      getMunicipalities(year).map((municipality) => municipality.name),
    );
    if (!availableMunicipalities.has(selection.municipality)) return undefined;
    return {
      type,
      year,
      primary: {
        kind: 'municipality',
        municipality: selection.municipality,
      },
      secondary:
        selection.compareMunicipalities &&
        selection.comparisonMunicipality &&
        availableMunicipalities.has(selection.comparisonMunicipality)
          ? {
              kind: 'municipality',
              municipality: selection.comparisonMunicipality,
            }
          : undefined,
    };
  }
  return { type, year, primary: { kind: 'state' } };
}

function isVisualizationOnlyRequest(question: string) {
  const normalized = question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (!/\b(?:graficos?|visualiz\w*|chart)\b/.test(normalized)) return false;
  return !/\b(?:analis\w*|explic\w*|interpret\w*|coment\w*|resum\w*|conclu\w*|recomend\w*|diagnostic\w*|diga|informe|saber|qual|quais|quanto|por que|porque)\b/.test(
    normalized,
  );
}

function ThinkingIndicator({ status }: { status: string }) {
  return (
    <output
      className="atlas-thinking-dots"
      aria-live="polite"
      aria-label={status}
    >
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span className="sr-only">{status}</span>
    </output>
  );
}

function territoryFromTarget(
  target: AssistantVisualizationTarget,
  year: number,
): TerritoryMetrics | undefined {
  if (target.kind === 'state') return buildStateMetrics(year);
  if (target.kind === 'municipality') {
    return buildMunicipalityMetrics(target.municipality, year);
  }
  return undefined;
}

function MessageVisualization({
  visualization,
  year,
}: {
  visualization: AssistantVisualization;
  year: number;
}) {
  if (visualization.primary.kind === 'school') {
    const context = buildSchoolContext(
      visualization.primary.schoolCode,
      true,
      year,
    );
    return visualization.type === 'infrastructure' ? (
      <InfrastructureChart context={context} />
    ) : (
      <EnemPerformanceChart context={context} />
    );
  }

  const primary = territoryFromTarget(visualization.primary, year);
  const secondary = visualization.secondary
    ? territoryFromTarget(visualization.secondary, year)
    : undefined;
  if (!primary) return null;
  return visualization.type === 'infrastructure' ? (
    <TerritoryInfrastructureChart primary={primary} secondary={secondary} />
  ) : (
    <TerritoryPerformanceChart primary={primary} secondary={secondary} />
  );
}

export default function AssistantPage() {
  const atlas = useAtlas();
  const context = atlas.schoolContext;
  const suggestions = buildSuggestions(context);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    welcomeMessage(context),
  ]);
  const [storageReady, setStorageReady] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string>();
  const [statusMessage, setStatusMessage] = useState(
    'Analisando sua pergunta…',
  );
  const messagesRef = useRef<HTMLDivElement>(null);
  const shouldFollowMessagesRef = useRef(true);
  const pendingScrollFrameRef = useRef<number | undefined>(undefined);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedMessages = loadStoredMessages();
      if (storedMessages) setMessages(storedMessages);
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady || loading) return;
    const stored: StoredConversation = {
      version: 2,
      messages: messages.slice(-MAX_STORED_MESSAGES),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [loading, messages, storageReady]);

  useEffect(() => {
    const messagesElement = messagesRef.current;
    if (!messagesElement || !shouldFollowMessagesRef.current) return;

    pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingScrollFrameRef.current = undefined;
      if (!shouldFollowMessagesRef.current) return;
      messagesElement.scrollTop = messagesElement.scrollHeight;
    });
    return () => {
      if (pendingScrollFrameRef.current !== undefined) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current);
        pendingScrollFrameRef.current = undefined;
      }
    };
  }, [messages]);

  useEffect(
    () => () => {
      activeRequest.current?.abort();
      if (pendingScrollFrameRef.current !== undefined) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current);
      }
    },
    [],
  );

  function stopFollowingMessages() {
    shouldFollowMessagesRef.current = false;
    if (pendingScrollFrameRef.current !== undefined) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
      pendingScrollFrameRef.current = undefined;
    }
  }

  async function send(question: string) {
    const clean = question.trim();
    if (!clean || loading) return;

    shouldFollowMessagesRef.current = true;

    const history: AssistantConversationTurn[] = messages
      .slice(-12)
      .map((message) => ({ role: message.role, text: message.text }));
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: clean,
      mode: 'pergunta',
    };
    const visualization = visualizationForQuestion(
      clean,
      history
        .slice(-2)
        .map((turn) => turn.text)
        .join(' '),
      {
        analysisLevel: atlas.analysisLevel,
        municipality: atlas.municipality,
        comparisonMunicipality: atlas.comparisonMunicipality,
        compareMunicipalities: atlas.compareMunicipalities,
        schoolCode: context.school.code,
        year: atlas.year,
      },
    );

    if (visualization && isVisualizationOnlyRequest(clean)) {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        ...VISUALIZATION_ONLY_COPY,
        engine: 'system',
        visualization,
      };
      setMessages((current) => [
        ...current,
        userMessage,
        assistantMessage,
      ]);
      setDraft('');
      return;
    }

    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setLoading(true);
    setStatusMessage('Analisando sua pergunta…');

    const controller = new AbortController();
    activeRequest.current = controller;
    const assistantId = crypto.randomUUID();
    let receivedText = '';
    let answerAdded = false;
    let completed = false;
    let publicError = '';

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: clean,
          schoolCode: context.school.code,
          history,
          selection: {
            analysisLevel: atlas.analysisLevel,
            municipality: atlas.municipality,
            comparisonMunicipality: atlas.comparisonMunicipality,
            compareMunicipalities: atlas.compareMunicipalities,
            year: atlas.year,
            saebYear: atlas.saebYear,
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);

      await readAssistantStream(response, async (event) => {
        if (event.type === 'status') {
          setStatusMessage(event.message);
          return;
        }
        if (event.type === 'error') {
          publicError = event.message;
          return;
        }
        if (event.type === 'done') {
          completed = true;
          if (event.text) receivedText = event.text;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    text: event.text ?? message.text,
                    source: event.source,
                    mode: event.mode ?? 'Consulta aos dados do Atlas',
                    engine: event.engine,
                    iterations: event.iterations,
                    evidenceCount: event.evidenceCount,
                    visualization,
                  }
                : message,
            ),
          );
          return;
        }

        const incomingCharacters = Array.from(event.text);
        const reduceMotion = window.matchMedia(
          '(prefers-reduced-motion: reduce)',
        ).matches;

        if (!answerAdded) {
          answerAdded = true;
          setStreamingMessageId(assistantId);
          setMessages((current) => [
            ...current,
            {
              id: assistantId,
              role: 'assistant',
              text: '',
              mode: 'Consulta aos dados do Atlas',
              engine: 'mcp-langgraph',
            },
          ]);
        }

        const step = reduceMotion
          ? incomingCharacters.length || 1
          : STREAM_CHARACTERS_PER_FRAME;
        for (let index = 0; index < incomingCharacters.length; index += step) {
          if (controller.signal.aborted) return;
          receivedText += incomingCharacters
            .slice(index, index + step)
            .join('');
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, text: receivedText }
                : message,
            ),
          );
          if (!reduceMotion) await waitForTypingFrame();
        }
      });

      if (publicError || !answerAdded || !completed) {
        throw new Error(publicError || 'Stream interrompido.');
      }
    } catch {
      if (controller.signal.aborted) return;
      setMessages((current) => {
        if (!answerAdded) {
          return [
            ...current,
            {
              id: assistantId,
              role: 'assistant',
              text: 'Não consegui responder agora. Tente novamente em instantes.',
              mode: 'Temporariamente indisponível',
              engine: 'system',
            },
          ];
        }
        return current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                text: 'Não consegui responder agora. Tente novamente em instantes.',
                mode: 'Temporariamente indisponível',
                engine: 'system',
              }
            : message,
        );
      });
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
        setStreamingMessageId(undefined);
        setStatusMessage('Analisando sua pergunta…');
      }
    }
  }

  function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    void send(draft);
  }

  function reset() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    window.localStorage.removeItem(STORAGE_KEY);
    setMessages([welcomeMessage(context)]);
    setDraft('');
    setLoading(false);
    setStreamingMessageId(undefined);
    setStatusMessage('Analisando sua pergunta…');
  }

  return (
    <AtlasShell>
      <div className="flex h-[calc(100dvh-142px-env(safe-area-inset-bottom))] w-full flex-col lg:h-[calc(100dvh-64px)]">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface)]">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3.5 sm:px-6 sm:py-4 lg:h-16 lg:py-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative grid size-10 shrink-0 place-items-center rounded-full bg-[var(--navy)] text-[var(--lime)] sm:size-11">
                <Bot size={19} />
                <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-[3px] border-[var(--surface)] bg-[#62b782]" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold sm:text-base">
                  Assistente Atlas
                </h1>
                <p className="mt-0.5 truncate text-[11px] text-[var(--muted)] sm:text-xs">
                  Consulta inteligente da base educacional
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2 text-[11px] font-semibold text-[var(--muted)] md:flex">
                <HardDrive size={13} className="text-[var(--teal)]" />
                Salva neste navegador
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={reset}
                aria-label="Iniciar nova conversa"
                title="Nova conversa"
                className="size-10 rounded-full border-[var(--line-strong)] bg-[var(--surface)] text-[var(--muted)] shadow-none hover:text-[var(--ink)]"
              >
                <RotateCcw size={16} />
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <div
              ref={messagesRef}
              className="soft-scroll min-h-0 flex-1 overflow-y-auto px-3 py-6 [overflow-anchor:none] sm:px-6 sm:py-8"
              aria-live="polite"
              onScroll={(event) => {
                const element = event.currentTarget;
                const distanceFromBottom =
                  element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight;
                shouldFollowMessagesRef.current = distanceFromBottom <= 1;
              }}
              onWheel={(event) => {
                if (event.deltaY < 0) stopFollowingMessages();
              }}
              onTouchMove={stopFollowingMessages}
            >
              <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 sm:gap-7">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    aria-label={
                      message.role === 'user'
                        ? 'Mensagem enviada por você'
                        : 'Resposta do Assistente Atlas'
                    }
                    className={`atlas-chat-message flex w-full items-start gap-2.5 sm:gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
                  >
                    {message.role === 'assistant' && (
                      <div className="grid size-9 shrink-0 place-items-center rounded-full border border-[color-mix(in_srgb,var(--teal)_18%,transparent)] bg-[var(--teal-soft)] text-[var(--teal)] shadow-[0_4px_12px_rgb(18_47_56/8%)] sm:size-10">
                        <Bot size={17} />
                      </div>
                    )}
                    <div
                      className={`flex min-w-0 max-w-[calc(100%-46px)] flex-col sm:max-w-[86%] ${message.role === 'user' ? 'items-end' : 'w-full items-start'}`}
                    >
                      <div
                        className={`mb-1.5 flex min-w-0 items-baseline gap-2 px-1 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                      >
                        <span className="text-xs font-semibold text-[var(--ink)]">
                          {message.role === 'user' ? 'Você' : 'Atlas'}
                        </span>
                        {message.role === 'assistant' && (
                          <span className="truncate text-[11px] text-[var(--muted)]">
                            {message.mode}
                          </span>
                        )}
                      </div>
                      <div
                        data-role={message.role}
                        className="atlas-chat-bubble min-w-0 max-w-full px-4 py-3.5 sm:px-5 sm:py-4"
                      >
                        <RichText
                          text={
                            message.role === 'assistant'
                              ? answerWithoutSource(message.text)
                              : message.text
                          }
                          typing={message.id === streamingMessageId}
                        />
                        {message.visualization && (
                          <figure className="atlas-answer-chart">
                            <figcaption>
                              <BarChart3 size={15} aria-hidden="true" />
                              {message.visualization.type === 'infrastructure'
                                ? 'Indicadores de infraestrutura'
                                : 'Desempenho por área'}
                              <span className="ml-auto tabular-nums">
                                Ano {messageVisualizationYear(message, atlas.year)}
                              </span>
                            </figcaption>
                            <div className="atlas-answer-chart-scroll soft-scroll">
                              <MessageVisualization
                                visualization={message.visualization}
                                year={messageVisualizationYear(message, atlas.year)}
                              />
                            </div>
                          </figure>
                        )}
                      </div>
                      {message.role === 'assistant' &&
                        message.engine !== 'system' &&
                        (sourceFromAnswer(message.text) ?? message.source) && (
                          <p className="mt-2 flex max-w-full items-center gap-1.5 px-1 text-[11px] leading-relaxed text-[var(--muted)]">
                            <Database
                              size={12}
                              className="shrink-0 text-[var(--teal)]"
                            />
                            <span>
                              {sourceFromAnswer(message.text) ?? message.source}
                            </span>
                          </p>
                        )}
                    </div>
                    {message.role === 'user' && (
                      <div className="grid size-9 shrink-0 place-items-center rounded-full border border-[color-mix(in_srgb,var(--navy)_78%,white)] bg-[var(--navy)] text-[var(--primary-foreground)] shadow-[0_4px_12px_rgb(18_47_56/10%)] sm:size-10">
                        <UserRound size={17} />
                      </div>
                    )}
                  </article>
                ))}
                {loading && !streamingMessageId && (
                  <div className="atlas-chat-message flex items-start gap-2.5 sm:gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-full border border-[color-mix(in_srgb,var(--teal)_18%,transparent)] bg-[var(--teal-soft)] text-[var(--teal)] shadow-[0_4px_12px_rgb(18_47_56/8%)] sm:size-10">
                      <Bot size={17} />
                    </div>
                    <div className="flex min-w-0 flex-col items-start">
                      <div className="mb-1.5 flex min-w-0 items-baseline gap-2 px-1">
                        <span className="text-xs font-semibold text-[var(--ink)]">
                          Atlas
                        </span>
                        <span className="truncate text-[11px] text-[var(--muted)]">
                          pensando
                        </span>
                      </div>
                      <div
                        data-role="assistant"
                        className="atlas-chat-bubble px-4 py-3.5"
                      >
                        <ThinkingIndicator status={statusMessage} />
                      </div>
                    </div>
                  </div>
                )}

                {messages.length === 1 && !loading && (
                  <div className="ml-0 border-t border-[var(--line)] pt-5 sm:ml-[52px]">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Experimente perguntar
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map(({ label, question, icon: Icon }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => void send(question)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--teal)] hover:bg-[var(--teal-soft)]"
                        >
                          <Icon size={14} className="text-[var(--teal)]" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] px-3 pb-3 pt-3 sm:px-6 sm:pb-4 sm:pt-4 lg:pb-[18px]">
              <form onSubmit={submit} className="mx-auto w-full max-w-[900px]">
                <label htmlFor="atlas-question" className="sr-only">
                  Faça sua pergunta ao Atlas
                </label>
                <div className="flex items-end gap-2 rounded-[22px] border border-[var(--line-strong)] bg-[var(--surface)] p-1.5 pl-2 shadow-[0_5px_20px_rgb(18_47_56/8%)] transition-colors focus-within:border-[var(--teal)] focus-within:ring-2 focus-within:ring-[var(--teal-soft)] sm:p-2 sm:pl-3">
                  <Textarea
                    id="atlas-question"
                    rows={1}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void send(draft);
                      }
                    }}
                    placeholder="Pergunte ao Atlas..."
                    aria-label="Faça sua pergunta ao Atlas"
                    className="max-h-32 min-h-11 resize-none border-0 bg-transparent px-2 py-2.5 text-sm leading-6 shadow-none focus-visible:outline-none focus-visible:ring-0 dark:bg-transparent"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!draft.trim() || loading}
                    aria-label="Enviar pergunta"
                    className="size-11 shrink-0 rounded-full bg-transparent text-[var(--teal)] shadow-none hover:bg-transparent hover:text-[var(--teal-strong)]"
                  >
                    <SendHorizontal className="size-6" />
                  </Button>
                </div>
                <p className="mt-2 px-1 text-center text-[11px] leading-relaxed text-[var(--muted)]">
                  O Atlas pode errar. Confira dados importantes na base.
                </p>
              </form>
            </div>
          </div>
        </section>
      </div>
    </AtlasShell>
  );
}
