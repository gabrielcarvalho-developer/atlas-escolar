'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Bot,
  Bolt,
  Construction,
  Database,
  HardDrive,
  LaptopMinimal,
  RotateCcw,
  SendHorizontal,
  UserRound,
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
  answerQuestionLocally,
  type AssistantAnswer,
  type AssistantConversationTurn,
  type AssistantVisualization,
  type AssistantVisualizationTarget,
} from '@/lib/assistant';
import {
  buildMunicipalityMetrics,
  buildSchoolContext,
  MUNICIPALITIES,
  SCHOOLS,
  STATE_METRICS,
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

const STORAGE_KEY = 'atlas-assistant-conversation-v2';
const MAX_STORED_MESSAGES = 80;

const SUGGESTIONS = [
  {
    label: 'Análise rápida',
    question:
      'Faça uma análise rápida dos principais indicadores desta escola.',
    icon: Bolt,
  },
  {
    label: 'Desempenho no ENEM',
    question: 'Compare as médias do ENEM da escola com o município.',
    icon: BarChart3,
  },
  {
    label: 'Gargalo de infraestrutura',
    question: 'Qual é o principal gargalo de infraestrutura desta escola?',
    icon: Construction,
  },
  {
    label: 'Recursos ausentes',
    question: 'Quais recursos estão ausentes nesta escola?',
    icon: LaptopMinimal,
  },
];

function welcomeMessage(context: SchoolContext): ChatMessage {
  return {
    id: `welcome-${crypto.randomUUID()}`,
    role: 'assistant',
    text: `Olá! Eu sou o Atlas. Agora posso consultar a base do **Maranhão**, seus **${MUNICIPALITIES.length} municípios** e as **${SCHOOLS.length} escolas identificadas**.\n\nPergunte por uma localidade ou escola específica.`,
    mode: 'contexto da base carregado',
    source: `Contexto atual: ${context.school.name}`,
    engine: 'local',
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

function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm leading-7">
      {text.split('\n\n').map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph.split(/(\*\*.*?\*\*)/g).map((part, partIndex) =>
            part.startsWith('**') && part.endsWith('**') ? (
              <strong key={partIndex} className="font-bold text-[var(--ink)]">
                {part.slice(2, -2)}
              </strong>
            ) : (
              <Fragment key={partIndex}>{part}</Fragment>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

function territoryFromTarget(
  target: AssistantVisualizationTarget,
): TerritoryMetrics | undefined {
  if (target.kind === 'state') return STATE_METRICS;
  if (target.kind === 'municipality') {
    return buildMunicipalityMetrics(target.municipality);
  }
  return undefined;
}

function MessageVisualization({
  visualization,
}: {
  visualization: AssistantVisualization;
}) {
  if (visualization.primary.kind === 'school') {
    const context = buildSchoolContext(visualization.primary.schoolCode, true);
    return visualization.type === 'infrastructure' ? (
      <InfrastructureChart context={context} />
    ) : (
      <EnemPerformanceChart context={context} />
    );
  }

  const primary = territoryFromTarget(visualization.primary);
  const secondary = visualization.secondary
    ? territoryFromTarget(visualization.secondary)
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
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    welcomeMessage(context),
  ]);
  const [storageReady, setStorageReady] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
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
    if (!storageReady) return;
    const stored: StoredConversation = {
      version: 2,
      messages: messages.slice(-MAX_STORED_MESSAGES),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [messages, storageReady]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, loading]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function send(question: string) {
    const clean = question.trim();
    if (!clean || loading) return;

    const history: AssistantConversationTurn[] = messages
      .slice(-12)
      .map((message) => ({ role: message.role, text: message.text }));
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: clean,
      mode: 'pergunta',
    };
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setLoading(true);

    const controller = new AbortController();
    activeRequest.current = controller;

    let answer: AssistantAnswer;
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
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      answer = (await response.json()) as AssistantAnswer;
    } catch {
      if (controller.signal.aborted) return;
      answer = answerQuestionLocally(clean, context, history, {
        analysisLevel: atlas.analysisLevel,
        municipality: atlas.municipality,
        comparisonMunicipality: atlas.comparisonMunicipality,
        compareMunicipalities: atlas.compareMunicipalities,
      });
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }

    if (controller.signal.aborted) return;
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'assistant', ...answer },
    ]);
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
  }

  return (
    <AtlasShell>
      <div className="atlas-page max-w-[1380px]">
        <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="atlas-eyebrow">Consulta inteligente da base</p>
            <h1 className="atlas-page-heading mt-3">Converse com o Atlas.</h1>
          </div>
          <Button
            variant="outline"
            onClick={reset}
            className="h-11 w-full rounded-xl border-[var(--line-strong)] bg-white px-4 font-bold shadow-sm sm:w-fit"
          >
            <RotateCcw size={15} /> Nova conversa
          </Button>
        </section>

        <section className="mt-7 overflow-hidden rounded-[12px] border border-[var(--line)] bg-white shadow-[0_20px_70px_rgb(18_47_56/7%)]">
          <header className="flex flex-col justify-between gap-3 border-b border-[var(--line)] bg-[#fbfcf9] px-4 py-4 sm:flex-row sm:items-center sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative grid size-11 shrink-0 place-items-center rounded-full bg-[var(--navy)] text-[var(--lime)]">
                <Bot size={20} />
                <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-[3px] border-white bg-[#62b782]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-extrabold">Atlas</p>
                <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                  Base estadual, municipal e escolar
                </p>
              </div>
            </div>
            <div className="flex w-fit items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[11px] font-bold text-[var(--muted)]">
              <HardDrive size={13} className="text-[var(--teal)]" />
              Conversa salva neste navegador
            </div>
          </header>

          <div className="grid lg:h-[700px] lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-h-0 min-w-0 flex-col">
              <div className="border-b border-[var(--line)] bg-white px-4 py-3 lg:hidden">
                <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Experimente perguntar
                </p>
                <div className="chart-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                  {SUGGESTIONS.map(({ label, question, icon: Icon }) => (
                    <button
                      key={label}
                      onClick={() => void send(question)}
                      disabled={loading}
                      className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--canvas)] px-3 text-xs font-bold text-[var(--ink)] disabled:opacity-50"
                    >
                      <Icon size={14} className="text-[var(--teal)]" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="soft-scroll flex min-h-[390px] flex-1 flex-col gap-5 overflow-y-auto px-3 py-5 sm:min-h-[460px] sm:px-6 sm:py-7 lg:min-h-0"
                aria-live="polite"
              >
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-2.5 sm:gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
                  >
                    {message.role === 'assistant' && (
                      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--navy)] text-[var(--lime)]">
                        <Bot size={15} />
                      </div>
                    )}
                    <div
                      className={`min-w-0 max-w-[calc(100%-42px)] rounded-2xl px-3.5 py-3 sm:max-w-[86%] sm:px-4 ${
                        message.role === 'user'
                          ? 'bg-[var(--navy)] text-white shadow-[0_8px_24px_rgb(18_47_56/12%)]'
                          : 'border border-[var(--line)] bg-[#fbfcf9]'
                      }`}
                    >
                      <RichText text={message.text} />
                      {message.visualization && (
                        <div className="mt-4 min-w-0 rounded-xl bg-white p-2 sm:p-3">
                          <MessageVisualization
                            visualization={message.visualization}
                          />
                        </div>
                      )}
                    </div>
                    {message.role === 'user' && (
                      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--teal-soft)] text-[var(--teal)]">
                        <UserRound size={15} />
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                    <div className="grid size-8 place-items-center rounded-full bg-[var(--navy)] text-[var(--lime)]">
                      <Database size={15} />
                    </div>
                    <span className="animate-pulse">
                      Consultando a base e calculando…
                    </span>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <form
                onSubmit={submit}
                className="border-t border-[var(--line)] bg-[#fbfcf9] p-3 sm:p-4"
              >
                <label
                  htmlFor="atlas-question"
                  className="mb-2 block text-xs font-extrabold text-[var(--ink)]"
                >
                  Faça sua pergunta ao Atlas
                </label>
                <div className="flex items-end gap-2 rounded-[18px] border border-[var(--line-strong)] bg-white p-2 shadow-[0_5px_18px_rgb(18_47_56/7%)] transition-colors focus-within:border-[var(--teal)] focus-within:ring-2 focus-within:ring-[var(--teal-soft)]">
                  <Textarea
                    id="atlas-question"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void send(draft);
                      }
                    }}
                    placeholder="Digite aqui..."
                    aria-label="Faça sua pergunta ao Atlas"
                    className="max-h-32 min-h-12 resize-none border-0 bg-transparent px-2 py-3 text-sm shadow-none focus-visible:outline-none focus-visible:ring-0 sm:px-3"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!draft.trim() || loading}
                    aria-label="Enviar pergunta"
                    className="size-12 shrink-0 rounded-full bg-[var(--teal)] text-white shadow-sm hover:bg-[var(--teal-strong)]"
                  >
                    <SendHorizontal size={18} />
                  </Button>
                </div>
                <p className="mt-2.5 px-1 text-center text-[11px] leading-relaxed text-[var(--muted)]">
                  Consulte informações importantes para sua análise.
                </p>
              </form>
            </div>

            <aside className="hidden border-l border-[var(--line)] bg-[#f8faf6] p-5 lg:block">
              <p className="mb-4 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">
                Perguntas sugeridas
              </p>
              <div className="space-y-2.5">
                {SUGGESTIONS.map(({ label, question, icon: Icon }) => (
                  <button
                    key={label}
                    onClick={() => void send(question)}
                    disabled={loading}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-white p-3 text-left text-xs font-bold transition hover:border-[var(--teal)] hover:shadow-sm disabled:opacity-50"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--teal-soft)] text-[var(--teal)]">
                      <Icon size={15} />
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            </aside>
          </div>
        </section>
      </div>
    </AtlasShell>
  );
}
