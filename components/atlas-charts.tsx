'use client';

import {
  ChartLegend,
  ChartConfig,
  VisxBarChart,
  VisxLineChart,
} from '@/components/ui/chart';
import {
  ENEM_AREA_KEYS,
  ENEM_AREA_SHORT_LABELS,
  INFRA_KEYS,
  INFRA_SHORT_LABELS,
  getSaebState,
  type HistoricalPoint,
  SchoolContext,
  TerritoryMetrics,
} from '@/lib/atlas-data';

const infrastructureConfig = {
  school: { label: 'Escola', color: 'var(--teal)' },
  municipality: { label: 'Média municipal', color: 'var(--chart-muted)' },
} satisfies ChartConfig;

export function InfrastructureChart({ context }: { context: SchoolContext }) {
  const data = INFRA_KEYS.map((key) => ({
    label: INFRA_SHORT_LABELS[key],
    school: Number((context.school.infrastructure[key] * 10).toFixed(2)),
    municipality: Number(
      (context.municipalInfrastructure[key] * 10).toFixed(2),
    ),
  }));

  return (
    <VisxBarChart
      config={infrastructureConfig}
      data={data}
      xKey="label"
      series={[
        { key: 'school' },
        ...(context.compareMunicipal ? [{ key: 'municipality' }] : []),
      ]}
      domain={[0, 100]}
      ticks={[0, 25, 50, 75, 100]}
      tickFormat={(value) => `${value}%`}
      accessibleLabel="Infraestrutura da escola comparada à média municipal"
      className="h-[270px] w-full sm:h-[310px]"
      initialDimension={{ width: 660, height: 310 }}
      maxBarSize={28}
      barGap={2}
    />
  );
}

const performanceConfig = {
  school: { label: 'Escola', color: 'var(--teal)' },
  municipality: { label: 'Média municipal', color: 'var(--chart-muted)' },
} satisfies ChartConfig;

export function EnemPerformanceChart({ context }: { context: SchoolContext }) {
  const data = context.performanceAreas.map((area) => ({
    label: ENEM_AREA_SHORT_LABELS[area.key],
    school:
      area.schoolAverage === null
        ? undefined
        : Number(area.schoolAverage.toFixed(2)),
    municipality: Number(area.municipalAverage.toFixed(2)),
  }));

  return (
    <VisxBarChart
      config={performanceConfig}
      data={data}
      xKey="label"
      series={[
        { key: 'school' },
        ...(context.compareMunicipal ? [{ key: 'municipality' }] : []),
      ]}
      domain={[0, 1000]}
      ticks={[0, 250, 500, 750, 1000]}
      accessibleLabel="Desempenho da escola no ENEM comparado à média municipal"
      className="h-[270px] w-full sm:h-[310px]"
      initialDimension={{ width: 660, height: 310 }}
      maxBarSize={28}
      barGap={2}
    />
  );
}

export function TerritoryInfrastructureChart({
  primary,
  secondary,
}: {
  primary: TerritoryMetrics;
  secondary?: TerritoryMetrics;
}) {
  const config = {
    primary: { label: primary.name, color: 'var(--teal)' },
    secondary: {
      label: secondary?.name ?? 'Comparação',
      color: 'var(--ink)',
    },
  } satisfies ChartConfig;
  const data = INFRA_KEYS.map((key) => ({
    label: INFRA_SHORT_LABELS[key],
    primary: Number((primary.infrastructure[key] * 10).toFixed(2)),
    secondary: secondary
      ? Number((secondary.infrastructure[key] * 10).toFixed(2))
      : undefined,
  }));

  return (
    <VisxBarChart
      config={config}
      data={data}
      xKey="label"
      series={[
        { key: 'primary' },
        ...(secondary ? [{ key: 'secondary' }] : []),
      ]}
      domain={[0, 100]}
      ticks={[0, 25, 50, 75, 100]}
      tickFormat={(value) => `${value}%`}
      accessibleLabel="Comparação da infraestrutura dos territórios"
      className="h-[270px] w-full sm:h-[310px]"
      initialDimension={{ width: 660, height: 310 }}
      maxBarSize={32}
      barGap={3}
    />
  );
}

export function TerritoryPerformanceChart({
  primary,
  secondary,
}: {
  primary: TerritoryMetrics;
  secondary?: TerritoryMetrics;
}) {
  const config = {
    primary: { label: primary.name, color: 'var(--teal)' },
    secondary: {
      label: secondary?.name ?? 'Comparação',
      color: 'var(--ink)',
    },
  } satisfies ChartConfig;
  const data = ENEM_AREA_KEYS.map((key) => ({
    label: ENEM_AREA_SHORT_LABELS[key],
    primary: Number(primary.averages[key].toFixed(2)),
    secondary: secondary
      ? Number(secondary.averages[key].toFixed(2))
      : undefined,
  }));

  return (
    <VisxBarChart
      config={config}
      data={data}
      xKey="label"
      series={[
        { key: 'primary' },
        ...(secondary ? [{ key: 'secondary' }] : []),
      ]}
      domain={[0, 1000]}
      ticks={[0, 250, 500, 750, 1000]}
      accessibleLabel="Comparação do desempenho no ENEM entre os territórios"
      className="h-[270px] w-full sm:h-[310px]"
      initialDimension={{ width: 660, height: 310 }}
      maxBarSize={32}
      barGap={3}
    />
  );
}

const saebConfig = {
  portuguese: { label: 'Língua Portuguesa', color: 'var(--teal)' },
  mathematics: { label: 'Matemática', color: 'var(--lime)' },
} satisfies ChartConfig;

export function SaebStateChart({ year }: { year: number }) {
  const data = getSaebState(year).map((row) => ({
    label: row.ETAPA.startsWith('5º')
      ? '5º ano'
      : row.ETAPA.startsWith('9º')
        ? '9º ano'
        : 'Ens. médio',
    portuguese: row.MEDIA_LP_PONDERADA_PRESENTES ?? undefined,
    mathematics: row.MEDIA_MT_PONDERADA_PRESENTES ?? undefined,
  }));

  return (
    <VisxBarChart
      config={saebConfig}
      data={data}
      xKey="label"
      series={[{ key: 'portuguese' }, { key: 'mathematics' }]}
      domain={[0, 400]}
      ticks={[0, 100, 200, 300, 400]}
      accessibleLabel={`Desempenho da rede estadual no SAEB em ${year}`}
      className="h-[270px] w-full sm:h-[300px]"
      initialDimension={{ width: 720, height: 300 }}
      maxBarSize={34}
      barGap={2}
    />
  );
}

const historicalPerformanceConfig = {
  cn: { label: ENEM_AREA_SHORT_LABELS.cn, color: '#7c83f4' },
  ch: { label: ENEM_AREA_SHORT_LABELS.ch, color: '#54a7db' },
  lc: { label: ENEM_AREA_SHORT_LABELS.lc, color: '#63bb95' },
  mt: { label: ENEM_AREA_SHORT_LABELS.mt, color: '#e59a5b' },
  essay: { label: ENEM_AREA_SHORT_LABELS.essay, color: '#b17ad0' },
} satisfies ChartConfig;

function getPerformanceScale(values: Array<number | null>) {
  const scores = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );

  if (scores.length === 0) {
    return {
      domain: [0, 1000] as [number, number],
      ticks: [0, 250, 500, 750, 1000],
    };
  }

  const lowestScore = Math.min(...scores);
  const highestScore = Math.max(...scores);
  const scoreSpan = highestScore - lowestScore;
  const visibleSpan = Math.max(scoreSpan * 1.25, 100);
  const roughStep = visibleSpan / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const niceStep =
    [1, 2, 2.5, 5, 10].find((step) => step >= normalizedStep)! * magnitude;
  const padding = Math.max((visibleSpan - scoreSpan) / 2, niceStep / 2);
  let lowerBound = Math.max(
    0,
    Math.floor((lowestScore - padding) / niceStep) * niceStep,
  );
  let upperBound = Math.min(
    1000,
    Math.ceil((highestScore + padding) / niceStep) * niceStep,
  );

  if (upperBound - lowerBound < niceStep * 2) {
    lowerBound = Math.max(0, lowerBound - niceStep);
    upperBound = Math.min(1000, upperBound + niceStep);
  }

  const ticks = Array.from(
    { length: Math.round((upperBound - lowerBound) / niceStep) + 1 },
    (_, index) => lowerBound + index * niceStep,
  );

  return {
    domain: [lowerBound, upperBound] as [number, number],
    ticks,
  };
}

function formatPerformanceDelta(delta: number) {
  const roundedDelta = Math.abs(delta) < 0.05 ? 0 : delta;
  return `${roundedDelta > 0 ? '+' : ''}${roundedDelta.toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })} pts`;
}

export function HistoricalPerformanceChart({
  history,
}: {
  history: HistoricalPoint[];
}) {
  const data = history.map((point) => ({
    year: String(point.year),
    ...Object.fromEntries(
      ENEM_AREA_KEYS.map((key) => [key, point.averages[key] ?? undefined]),
    ),
  }));
  const performanceScale = getPerformanceScale(
    history.flatMap((point) =>
      ENEM_AREA_KEYS.map((key) => point.averages[key]),
    ),
  );
  return (
    <VisxLineChart
      config={historicalPerformanceConfig}
      data={data}
      xKey="year"
      series={ENEM_AREA_KEYS.map((key) => ({ key }))}
      domain={performanceScale.domain}
      ticks={performanceScale.ticks}
      accessibleLabel="Evolução histórica das notas do ENEM por área"
      className="h-[320px] w-full sm:h-[330px] lg:h-[320px] xl:h-[330px]"
      initialDimension={{ width: 720, height: 330 }}
      legendHeight={(width) => (width < 520 ? 92 : 58)}
      segmentDeltaFormat={formatPerformanceDelta}
      legend={(items) => (
        <ChartLegend
          items={items}
          className="flex-wrap gap-x-5 gap-y-4 pt-5 text-[10px]"
        />
      )}
    />
  );
}

const historicalInfrastructureConfig = {
  basicServices: { label: INFRA_SHORT_LABELS.basicServices, color: '#7c83f4' },
  learningSpaces: {
    label: INFRA_SHORT_LABELS.learningSpaces,
    color: '#54a7db',
  },
  connectivity: { label: INFRA_SHORT_LABELS.connectivity, color: '#63bb95' },
  accessibility: { label: INFRA_SHORT_LABELS.accessibility, color: '#e59a5b' },
  climate: { label: INFRA_SHORT_LABELS.climate, color: '#b17ad0' },
} satisfies ChartConfig;

export function HistoricalInfrastructureChart({
  history,
}: {
  history: HistoricalPoint[];
}) {
  const data = history.map((point) => ({
    year: String(point.year),
    ...Object.fromEntries(
      INFRA_KEYS.map((key) => [
        key,
        Number((point.infrastructure[key] * 10).toFixed(2)),
      ]),
    ),
  }));

  return (
    <VisxLineChart
      config={historicalInfrastructureConfig}
      data={data}
      xKey="year"
      series={INFRA_KEYS.map((key) => ({ key }))}
      domain={[0, 100]}
      ticks={[0, 25, 50, 75, 100]}
      tickFormat={(value) => `${value}%`}
      accessibleLabel="Evolução histórica da infraestrutura escolar"
      className="h-[320px] w-full sm:h-[330px] lg:h-[320px] xl:h-[330px]"
      initialDimension={{ width: 720, height: 330 }}
      legendHeight={(width) => (width < 520 ? 92 : 58)}
      legend={(items) => (
        <ChartLegend
          items={items}
          className="flex-wrap gap-x-5 gap-y-4 pt-5 text-[10px]"
        />
      )}
    />
  );
}
