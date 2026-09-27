'use client';

import Link from 'next/link';
import {
  Accessibility,
  ArrowRight,
  Building2,
  ChartNoAxesCombined,
  Check,
  CircleAlert,
  Database,
  Droplets,
  FlaskConical,
  GraduationCap,
  Library,
  MapPin,
  MonitorSmartphone,
  School,
  Sparkles,
  UsersRound,
  Wifi,
  X,
} from 'lucide-react';
import { AtlasShell } from '@/components/atlas-shell';
import { useAtlas } from '@/components/atlas-provider';
import {
  EnemPerformanceChart,
  HistoricalInfrastructureChart,
  HistoricalPerformanceChart,
  InfrastructureChart,
  SaebStateChart,
  TerritoryInfrastructureChart,
  TerritoryPerformanceChart,
} from '@/components/atlas-charts';
import {
  buildMunicipalityHistory,
  buildMunicipalityMetrics,
  buildStateHistory,
  buildStateMetrics,
  ENEM_AREA_KEYS,
  ENEM_AREA_SHORT_LABELS,
  getSaebState,
  INFRA_KEYS,
  INFRA_LABELS,
  type HistoricalPoint,
  type TerritoryIndicators,
  type TerritoryMetrics,
} from '@/lib/atlas-data';

function formatNumber(value: number, maximumFractionDigits = 0) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits });
}

function formatScore(value: number | null) {
  return value === null ? 'Sem dado' : formatNumber(value, 1);
}

function formatPercentage(value: number) {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function PanelHeader({
  eyebrow,
  title,
  description,
  trailing,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="atlas-panel-header">
      <div>
        <p className="atlas-eyebrow">{eyebrow}</p>
        <h2 className="atlas-section-title">{title}</h2>
        {description && <p className="atlas-section-copy">{description}</p>}
      </div>
      {trailing}
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
  children,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof School;
  tone: 'lavender' | 'sky' | 'mint' | 'peach';
  children?: React.ReactNode;
}) {
  const tones = {
    lavender: 'bg-[var(--lavender)]',
    sky: 'bg-[var(--sky)]',
    mint: 'bg-[var(--mint)]',
    peach: 'bg-[var(--peach)]',
  };
  return (
    <article
      className={`relative min-h-[156px] overflow-hidden rounded-[20px] border border-[var(--line)] p-5 ${tones[tone]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="atlas-metric-label">{label}</p>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface)]/70 text-[var(--ink)] shadow-sm">
          <Icon size={15} />
        </span>
      </div>
      <p className="atlas-metric-value mt-5">{value}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">{note}</p>
        {children}
      </div>
    </article>
  );
}

function TerritoryLegend({
  primary,
  secondary,
}: {
  primary: TerritoryMetrics;
  secondary?: TerritoryMetrics;
}) {
  return (
    <div className="atlas-chart-key" aria-label="Legenda do gráfico">
      <span>
        <i /> {primary.name}
      </span>
      {secondary && (
        <span>
          <i data-tone="secondary" /> {secondary.name}
        </span>
      )}
    </div>
  );
}

function SchoolLegend({ compare }: { compare: boolean }) {
  return (
    <div className="atlas-chart-key" aria-label="Legenda do gráfico">
      <span>
        <i /> Escola
      </span>
      {compare && (
        <span>
          <i data-tone="secondary" /> Média municipal
        </span>
      )}
    </div>
  );
}

const infrastructureRows: Array<{
  key: keyof TerritoryIndicators;
  label: string;
  icon: typeof School;
}> = [
  { key: 'water', label: 'Água potável', icon: Droplets },
  { key: 'publicSewage', label: 'Esgoto da rede pública', icon: Building2 },
  { key: 'wasteCollection', label: 'Coleta de lixo', icon: Building2 },
  { key: 'library', label: 'Biblioteca ou sala de leitura', icon: Library },
  { key: 'scienceLab', label: 'Laboratório de ciências', icon: FlaskConical },
  { key: 'internet', label: 'Internet', icon: Wifi },
  { key: 'broadband', label: 'Banda larga', icon: Wifi },
  { key: 'accessibleRooms', label: 'Salas acessíveis', icon: Accessibility },
];

function IndicatorRow({
  label,
  value,
  icon: Icon,
  secondary,
}: {
  label: string;
  value: number;
  icon: typeof School;
  secondary?: { name: string; value: number };
}) {
  return (
    <div className="grid gap-2.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <Icon size={14} className="shrink-0 text-[var(--muted)]" />
          <span className="truncate">{label}</span>
        </span>
        <span className="font-semibold tabular-nums">{formatPercentage(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--canvas-deep)]">
        <div
          className="h-full rounded-full bg-[var(--teal)]"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      {secondary && (
        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--canvas-deep)]">
            <div
              className="h-full rounded-full bg-[var(--ink)]/55"
              style={{
                width: `${Math.max(0, Math.min(100, secondary.value))}%`,
              }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-[var(--muted)]">
            {formatPercentage(secondary.value)}
          </span>
        </div>
      )}
    </div>
  );
}

function HistoricalOverview({
  history,
  selectedYear,
}: {
  history: HistoricalPoint[];
  selectedYear: number;
}) {
  if (history.length < 2) return null;
  const current = history.find((point) => point.year === selectedYear);
  const previous = [...history].reverse().find((point) => point.year < selectedYear);

  return (
    <section className="mt-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="atlas-eyebrow">Série histórica</p>
          <h2 className="atlas-section-title">Evolução entre os anos disponíveis</h2>
        </div>
        {current && previous && (
          <p className="hidden text-xs text-[var(--muted)] sm:block">
            {previous.year} → {current.year}
          </p>
        )}
      </div>

      {current && previous && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {ENEM_AREA_KEYS.map((key) => {
            const currentValue = current.averages[key];
            const previousValue = previous.averages[key];
            const delta =
              currentValue === null || previousValue === null
                ? null
                : currentValue - previousValue;
            return (
              <article key={key} className="atlas-card p-4">
                <p className="text-[10px] font-semibold text-[var(--muted)]">
                  {ENEM_AREA_SHORT_LABELS[key]}
                </p>
                <p className="mt-2 text-lg font-bold">
                  {delta === null
                    ? '—'
                    : `${delta > 0 ? '+' : ''}${formatNumber(delta, 1)} pts`}
                </p>
              </article>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="atlas-card min-w-0 p-5 sm:p-6">
          <PanelHeader eyebrow="ENEM" title="Notas ao longo do tempo" />
          <HistoricalPerformanceChart history={history} />
        </article>
        <article className="atlas-card min-w-0 p-5 sm:p-6">
          <PanelHeader eyebrow="Infraestrutura" title="Condições ao longo do tempo" />
          <HistoricalInfrastructureChart history={history} />
        </article>
      </div>
    </section>
  );
}

function TerritoryOverview({
  primary,
  secondary,
  saebYear,
}: {
  primary: TerritoryMetrics;
  secondary?: TerritoryMetrics;
  saebYear: number | null;
}) {
  const history =
    primary.kind === 'state'
      ? buildStateHistory()
      : buildMunicipalityHistory(primary.name);
  const ruralPercentage = primary.schoolCount
    ? (primary.ruralSchoolCount / primary.schoolCount) * 100
    : 0;
  const connectivityGap = Math.max(
    0,
    primary.indicators.internet - primary.indicators.studentInternet,
  );
  const deviceTotal =
    primary.devices.desktops + primary.devices.laptops + primary.devices.tablets;
  const title = secondary
    ? `${primary.name} × ${secondary.name}`
    : primary.kind === 'state'
      ? 'Educação pública no Maranhão'
      : `Panorama de ${primary.name}`;

  return (
    <div className="atlas-page">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-[var(--teal)]">
            <Sparkles size={14} />
            {secondary ? 'Comparativo municipal' : primary.eyebrow}
          </div>
          <h1 className="atlas-page-heading max-w-4xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
            {secondary
              ? 'Indicadores equivalentes lado a lado, com a mesma base e o mesmo ano de referência.'
              : 'Uma leitura objetiva de cobertura, infraestrutura e desempenho com os dados oficiais disponíveis.'}
          </p>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] font-medium text-[var(--muted)]">
          <Database size={13} className="text-[var(--teal)]" />
          Censo e ENEM · {primary.year}
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Escolas públicas"
          value={formatNumber(primary.schoolCount)}
          note={`${formatNumber(primary.highSchoolCount)} com Ensino Médio`}
          icon={School}
          tone="lavender"
        />
        <MetricCard
          label="Escolas rurais"
          value={formatPercentage(ruralPercentage)}
          note={`${formatNumber(primary.ruralSchoolCount)} escolas no recorte`}
          icon={MapPin}
          tone="sky"
        />
        <MetricCard
          label="Registros ENEM"
          value={formatNumber(primary.enemRecords)}
          note={`${formatNumber(primary.enemSchoolCount)} escolas com registros`}
          icon={UsersRound}
          tone="mint"
        />
        <MetricCard
          label="Cobertura identificada"
          value={formatPercentage(primary.linkedCoveragePercentage)}
          note={`${formatNumber(primary.linkedEnemSchoolCount)} escolas vinculadas ao Censo`}
          icon={ChartNoAxesCombined}
          tone="peach"
        />
      </section>

      {secondary && (
        <section className="mt-4 grid gap-3 sm:grid-cols-2">
          {[primary, secondary].map((territory, index) => (
            <article key={territory.name} className="atlas-card flex items-center gap-4 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--teal-soft)] text-xs font-bold text-[var(--teal)]">
                {index === 0 ? 'A' : 'B'}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{territory.name}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  {formatNumber(territory.schoolCount)} escolas ·{' '}
                  {formatNumber(territory.enemRecords)} registros ENEM
                </p>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="mt-5 grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,.75fr)]">
        <article className="atlas-card flex h-full min-w-0 flex-col p-5 sm:p-6">
          <PanelHeader
            eyebrow={`ENEM ${primary.year}`}
            title="Desempenho por área"
            description="Médias ponderadas pela quantidade de participantes presentes."
            trailing={
              <span className="hidden rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[10px] text-[var(--muted)] sm:inline-flex">
                Escala de 0 a 1.000
              </span>
            }
          />
          <div className="mt-2 min-w-0 flex-1">
            <TerritoryPerformanceChart primary={primary} secondary={secondary} />
          </div>
          <TerritoryLegend primary={primary} secondary={secondary} />
        </article>

        <article className="atlas-card relative flex h-full flex-col overflow-hidden p-5 sm:p-6 dark:bg-[var(--navy)] dark:text-white">
          <p className="relative text-sm font-semibold text-[var(--muted)] dark:text-white/65">
            Leitura em destaque
          </p>
          <div className="relative mt-8">
            <span className="grid size-10 place-items-center rounded-full bg-[var(--teal-soft)] text-[var(--teal)] dark:bg-white/10 dark:text-[var(--lime)]">
              <Wifi size={18} />
            </span>
            <p className="mt-5 text-3xl font-bold tracking-[-0.05em]">
              {formatNumber(connectivityGap, 1)} p.p.
            </p>
            <p className="mt-2 text-sm font-medium">de diferença no acesso</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)] dark:text-white/65">
              {formatPercentage(primary.indicators.internet)} das escolas têm
              internet, mas {formatPercentage(primary.indicators.studentInternet)}{' '}
              registram acesso para os alunos.
            </p>
          </div>
          <div className="relative mt-auto space-y-3 border-t border-[var(--line)] pt-5 dark:border-white/10">
            {[
              ['Internet', primary.indicators.internet],
              ['Uso pedagógico', primary.indicators.learningInternet],
              ['Acesso dos alunos', primary.indicators.studentInternet],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between text-sm">
                <span className="text-[var(--muted)] dark:text-white/65">{label}</span>
                <span className="font-semibold">{formatPercentage(Number(value))}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-4 grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,.75fr)]">
        <article className="atlas-card flex h-full flex-col p-5 sm:p-6">
          <PanelHeader
            eyebrow="Censo Escolar"
            title="Condições da rede"
            description="Percentual de escolas com cada recurso ou serviço."
          />
          <div className="mt-4 grid flex-1 content-center gap-x-8 gap-y-4 md:grid-cols-2">
            {infrastructureRows.map(({ key, label, icon }) => (
              <IndicatorRow
                key={key}
                label={label}
                value={primary.indicators[key]}
                icon={icon}
                secondary={
                  secondary
                    ? { name: secondary.name, value: secondary.indicators[key] }
                    : undefined
                }
              />
            ))}
          </div>
          {secondary && (
            <div className="mt-5 flex flex-wrap gap-4 border-t border-[var(--line)] pt-4 text-[10px] text-[var(--muted)]">
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-full bg-[var(--teal)]" /> {primary.name}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-full bg-[var(--ink)]/55" /> {secondary.name}
              </span>
            </div>
          )}
        </article>

        <article className="atlas-card flex h-full flex-col p-5 sm:p-6">
          <PanelHeader
            eyebrow="Recursos"
            title="Tecnologia e salas"
            description="Quantidades registradas no Censo Escolar."
          />
          <div className="mt-6 grid grid-cols-3 gap-2">
            {[
              ['Desktops', primary.devices.desktops],
              ['Portáteis', primary.devices.laptops],
              ['Tablets', primary.devices.tablets],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-[var(--surface-soft)] p-3">
                <p className="text-[10px] leading-tight text-[var(--muted)]">{label}</p>
                <p className="mt-2 text-lg font-bold tracking-[-0.04em]">
                  {formatNumber(Number(value))}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-[var(--muted)]">Dispositivos para alunos</p>
              <p className="mt-1 text-2xl font-bold tracking-[-0.04em]">
                {formatNumber(deviceTotal)}
              </p>
            </div>
            <span className="grid size-11 place-items-center rounded-full bg-[var(--teal-soft)] text-[var(--teal)]">
              <MonitorSmartphone size={19} />
            </span>
          </div>
          <div className="mt-auto grid gap-3 border-t border-[var(--line)] pt-4 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-[var(--muted)]">Salas climatizadas</span>
              <strong>{formatPercentage(primary.indicators.climateRooms)}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[var(--muted)]">Salas acessíveis</span>
              <strong>{formatPercentage(primary.indicators.accessibleRooms)}</strong>
            </div>
          </div>
        </article>
      </section>

      <section
        className={`mt-4 grid items-stretch gap-4 ${
          primary.kind === 'state'
            ? 'xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,.75fr)]'
            : ''
        }`}
      >
        <article className="atlas-card flex h-full min-w-0 flex-col p-5 sm:p-6">
          <PanelHeader
            eyebrow="Índices compostos"
            title="Visão geral da infraestrutura"
            description="Síntese das dimensões avaliadas para facilitar a leitura comparativa."
          />
          <div className="flex flex-1 flex-col justify-center pt-2">
            <TerritoryInfrastructureChart
              primary={primary}
              secondary={secondary}
            />
            <TerritoryLegend primary={primary} secondary={secondary} />
          </div>
        </article>

        {primary.kind === 'state' && saebYear !== null && (
          <article className="atlas-card min-w-0 p-5 sm:p-6">
            <PanelHeader
              eyebrow={`SAEB ${saebYear}`}
              title="Aprendizagem por etapa"
              description="Médias estaduais ponderadas pelos estudantes presentes."
            />
            <SaebStateChart year={saebYear} />
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--line)] pt-4">
              {getSaebState(saebYear).map((row) => (
                <div key={row.ETAPA} className="rounded-xl bg-[var(--surface-soft)] p-3 text-center">
                  <p className="truncate text-[10px] text-[var(--muted)]">
                    {row.ETAPA.startsWith('5º')
                      ? '5º ano'
                      : row.ETAPA.startsWith('9º')
                        ? '9º ano'
                        : 'Ensino Médio'}
                  </p>
                  <p className="mt-1 text-sm font-bold">
                    {row.TAXA_PARTICIPACAO_AGREGADA === null
                      ? '—'
                      : formatPercentage(row.TAXA_PARTICIPACAO_AGREGADA)}
                  </p>
                  <p className="mt-0.5 text-[9px] text-[var(--muted)]">participação</p>
                </div>
              ))}
            </div>
          </article>
        )}
      </section>

      <HistoricalOverview history={history} selectedYear={primary.year} />
    </div>
  );
}

function statusFor(score: number) {
  if (score < 3) return { label: 'Crítico', color: 'var(--danger)' };
  if (score < 6) return { label: 'Atenção', color: 'var(--warning)' };
  if (score < 8) return { label: 'Adequado', color: 'var(--teal)' };
  return { label: 'Favorável', color: 'var(--positive)' };
}

export default function OverviewPage() {
  const atlas = useAtlas();
  const context = atlas.schoolContext;

  if (atlas.analysisLevel !== 'school') {
    const primary =
      atlas.analysisLevel === 'state'
        ? buildStateMetrics(atlas.year)
        : buildMunicipalityMetrics(atlas.municipality, atlas.year);
    const secondary =
      atlas.analysisLevel === 'municipality' && atlas.compareMunicipalities
        ? buildMunicipalityMetrics(atlas.comparisonMunicipality, atlas.year)
        : undefined;

    return (
      <AtlasShell>
        <TerritoryOverview
          primary={primary}
          secondary={secondary}
          saebYear={atlas.saebYear}
        />
      </AtlasShell>
    );
  }

  const criticalPercentage =
    context.school.infrastructure[context.criticalFactor] * 10;
  const math = context.performanceAreas.find((area) => area.key === 'mt')!;
  const schoolResources = [
    ['Água potável', context.school.resources.water],
    ['Biblioteca', context.school.resources.library || context.school.resources.readingRoom],
    ['Coleta de lixo', context.school.resources.wasteCollection],
    ['Energia pública', context.school.resources.publicEnergy],
    ['Esgoto público', context.school.resources.publicSewage],
    ['Internet', context.school.resources.internet],
    ['Internet para alunos', context.school.resources.studentInternet],
    ['Lab. de ciências', context.school.resources.scienceLab],
    ['Lab. de informática', context.school.resources.computerLab],
    ['Quadra esportiva', context.school.resources.sportsCourt],
  ] as const;
  const orderedInfrastructureKeys = [...INFRA_KEYS].sort(
    (left, right) =>
      context.school.infrastructure[right] - context.school.infrastructure[left],
  );

  return (
    <AtlasShell>
      <div className="atlas-page">
        <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[var(--teal)]">
              <School size={14} /> Panorama da escola
              <span className="text-[var(--line-strong)]">·</span>
              <span className="text-[var(--muted)]">{context.school.municipality}</span>
            </div>
            <h1 className="atlas-page-heading max-w-4xl">{context.school.name}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[var(--muted)]">
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5">
                {context.school.dependency}
              </span>
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5">
                {context.school.location}
              </span>
            </div>
          </div>
          <div className="flex w-fit items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--muted)]">
            <Database size={13} className="text-[var(--teal)]" /> Dados de {context.school.year}
          </div>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Principal prioridade"
            value={formatPercentage(criticalPercentage)}
            note={context.criticalFactorName}
            icon={ChartNoAxesCombined}
            tone="lavender"
          />
          <MetricCard
            label="Registros ENEM"
            value={formatNumber(context.school.records)}
            note={
              context.lowSampleAreas.length
                ? `${context.lowSampleAreas.length} área(s) com amostra reduzida`
                : 'Amostra suficiente nas áreas'
            }
            icon={UsersRound}
            tone="sky"
          />
          <MetricCard
            label="Média em Matemática"
            value={formatScore(math.schoolAverage)}
            note={`${math.schoolParticipants} participantes · município ${formatScore(math.municipalAverage)}`}
            icon={GraduationCap}
            tone="mint"
          />
          <MetricCard
            label="Conectividade"
            value={formatPercentage(context.connectivityScore * 10)}
            note={`Índice composto · ${context.connectivityStatus.toLowerCase()}`}
            icon={Wifi}
            tone="peach"
          />
        </section>

        {context.lowSampleAreas.length > 0 && (
          <div className="mt-4 flex gap-3 rounded-2xl border border-[var(--line)] bg-[var(--peach)] p-4 text-sm leading-relaxed">
            <CircleAlert className="mt-0.5 shrink-0 text-[var(--warning)]" size={18} />
            <p>
              <strong className="font-semibold">Leitura com cautela.</strong>{' '}
              {context.lowSampleAreas
                .map((area) => `${area.label} (${area.schoolParticipants})`)
                .join(', ')}{' '}
              têm menos de 30 participantes.
            </p>
          </div>
        )}

        <section className="mt-5 grid gap-4 xl:grid-cols-2">
          <article className="atlas-card min-w-0 p-5 sm:p-6">
            <PanelHeader
              eyebrow="Infraestrutura"
              title="Escola e município"
              description="Índices compostos por dimensão, com referência municipal opcional."
            />
            <InfrastructureChart context={context} />
            <SchoolLegend compare={context.compareMunicipal} />
          </article>

          <article className="atlas-card min-w-0 p-5 sm:p-6">
            <PanelHeader
              eyebrow={`ENEM ${context.school.year}`}
              title="Desempenho por área"
              description="Médias acompanhadas da quantidade de participantes."
            />
            <EnemPerformanceChart context={context} />
            <SchoolLegend compare={context.compareMunicipal} />
          </article>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,.85fr)]">
          <article className="atlas-card p-5 sm:p-6">
            <PanelHeader
              eyebrow="Recursos declarados"
              title="O que a escola possui"
              description="Presença ou ausência dos recursos informados no Censo Escolar."
            />
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {schoolResources.map(([label, available]) => (
                <div
                  key={label}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-[var(--surface-soft)] px-3.5 py-2.5"
                >
                  <span className="text-xs font-medium">{label}</span>
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full ${
                      available
                        ? 'bg-[var(--mint)] text-[var(--positive)]'
                        : 'bg-[var(--peach)] text-[var(--danger)]'
                    }`}
                    aria-label={available ? 'Disponível' : 'Não disponível'}
                  >
                    {available ? <Check size={13} /> : <X size={13} />}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="atlas-card p-5 sm:p-6">
            <PanelHeader
              eyebrow="Diagnóstico"
              title="Composição da infraestrutura"
              description="Situação da escola em cada dimensão avaliada."
            />
            <div className="mt-6 space-y-5">
              {orderedInfrastructureKeys.map((key) => {
                const value = context.school.infrastructure[key] * 10;
                const status = statusFor(context.school.infrastructure[key]);
                return (
                  <div key={key}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium">{INFRA_LABELS[key]}</span>
                      <span className="text-[10px] font-semibold" style={{ color: status.color }}>
                        {status.label} · {formatPercentage(value)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--canvas-deep)]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${value}%`, background: status.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>

        <HistoricalOverview history={context.history} selectedYear={context.school.year} />

        <section className="relative mt-5 overflow-hidden rounded-[20px] bg-[var(--navy)] p-6 text-white sm:p-8">
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <p className="text-xl font-semibold tracking-[-0.035em]">
                Transforme a leitura em ação
              </p>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">
                Organize os principais sinais desta escola em um plano objetivo para a equipe.
              </p>
            </div>
            <Link
              href="/plano-de-acao"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--lime)] px-5 text-sm font-semibold text-[var(--navy)] transition hover:bg-white"
            >
              Abrir plano de ação <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </div>
    </AtlasShell>
  );
}
