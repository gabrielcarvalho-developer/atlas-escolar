'use client';

import type { ComponentProps } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  ENEM_AREA_KEYS,
  ENEM_AREA_SHORT_LABELS,
  INFRA_KEYS,
  INFRA_SHORT_LABELS,
  getSaebState,
  type EnemAreaKey,
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
    <ChartContainer
      config={infrastructureConfig}
      className="h-[270px] w-full sm:h-[310px]"
      initialDimension={{ width: 660, height: 310 }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        margin={{ top: 18, right: 0, left: -20, bottom: 10 }}
        barGap={2}
      >
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11, fill: 'var(--muted)' }}
          dy={9}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(value) => `${value}%`}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted)' }}
        />
        <ChartTooltip
          cursor={{ fill: 'var(--surface-soft)' }}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Bar
          dataKey="school"
          isAnimationActive={false}
          name="school"
          fill="var(--color-school)"
          radius={[6, 6, 2, 2]}
          maxBarSize={28}
        />
        {context.compareMunicipal && (
          <Bar
            dataKey="municipality"
            isAnimationActive={false}
            name="municipality"
            fill="var(--color-municipality)"
            radius={[6, 6, 2, 2]}
            maxBarSize={28}
          />
        )}
      </BarChart>
    </ChartContainer>
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
    <ChartContainer
      config={performanceConfig}
      className="h-[270px] w-full sm:h-[310px]"
      initialDimension={{ width: 660, height: 310 }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        margin={{ top: 18, right: 0, left: -19, bottom: 10 }}
        barGap={2}
      >
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11, fill: 'var(--muted)' }}
          dy={9}
        />
        <YAxis
          domain={[0, 1000]}
          ticks={[0, 250, 500, 750, 1000]}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted)' }}
        />
        <ChartTooltip
          cursor={{ fill: 'var(--surface-soft)' }}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Bar
          dataKey="school"
          isAnimationActive={false}
          name="school"
          fill="var(--color-school)"
          radius={[6, 6, 2, 2]}
          maxBarSize={28}
        />
        {context.compareMunicipal && (
          <Bar
            dataKey="municipality"
            isAnimationActive={false}
            name="municipality"
            fill="var(--color-municipality)"
            radius={[6, 6, 2, 2]}
            maxBarSize={28}
          />
        )}
      </BarChart>
    </ChartContainer>
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
    <ChartContainer
      config={config}
      className="h-[270px] w-full sm:h-[310px]"
      initialDimension={{ width: 660, height: 310 }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        margin={{ top: 18, right: 0, left: -20, bottom: 10 }}
        barGap={3}
      >
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11, fill: 'var(--muted)' }}
          dy={9}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(value) => `${value}%`}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted)' }}
        />
        <ChartTooltip
          cursor={{ fill: 'var(--surface-soft)' }}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Bar
          dataKey="primary"
          isAnimationActive={false}
          name="primary"
          fill="var(--color-primary)"
          radius={[6, 6, 2, 2]}
          maxBarSize={32}
        />
        {secondary && (
          <Bar
            dataKey="secondary"
            isAnimationActive={false}
            name="secondary"
            fill="var(--color-secondary)"
            radius={[6, 6, 2, 2]}
            maxBarSize={32}
          />
        )}
      </BarChart>
    </ChartContainer>
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
    <ChartContainer
      config={config}
      className="h-[270px] w-full sm:h-[310px]"
      initialDimension={{ width: 660, height: 310 }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        margin={{ top: 18, right: 0, left: -19, bottom: 10 }}
        barGap={3}
      >
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11, fill: 'var(--muted)' }}
          dy={9}
        />
        <YAxis
          domain={[0, 1000]}
          ticks={[0, 250, 500, 750, 1000]}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted)' }}
        />
        <ChartTooltip
          cursor={{ fill: 'var(--surface-soft)' }}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Bar
          dataKey="primary"
          isAnimationActive={false}
          name="primary"
          fill="var(--color-primary)"
          radius={[6, 6, 2, 2]}
          maxBarSize={32}
        />
        {secondary && (
          <Bar
            dataKey="secondary"
            isAnimationActive={false}
            name="secondary"
            fill="var(--color-secondary)"
            radius={[6, 6, 2, 2]}
            maxBarSize={32}
          />
        )}
      </BarChart>
    </ChartContainer>
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
    <ChartContainer
      config={saebConfig}
      className="h-[270px] w-full sm:h-[300px]"
      initialDimension={{ width: 720, height: 300 }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        margin={{ top: 18, right: 0, left: -19, bottom: 10 }}
        barGap={2}
      >
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11, fill: 'var(--muted)' }}
          dy={9}
        />
        <YAxis
          domain={[0, 400]}
          ticks={[0, 100, 200, 300, 400]}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted)' }}
        />
        <ChartTooltip
          cursor={{ fill: 'var(--surface-soft)' }}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Bar
          dataKey="portuguese"
          isAnimationActive={false}
          name="portuguese"
          fill="var(--color-portuguese)"
          radius={[6, 6, 2, 2]}
          maxBarSize={34}
        />
        <Bar
          dataKey="mathematics"
          isAnimationActive={false}
          name="mathematics"
          fill="var(--color-mathematics)"
          radius={[6, 6, 2, 2]}
          maxBarSize={34}
        />
      </BarChart>
    </ChartContainer>
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

type PerformanceDeltas = Record<EnemAreaKey, number | null>;

function formatPerformanceDelta(delta: number | null) {
  if (delta === null) return '—';

  const roundedDelta = Math.abs(delta) < 0.05 ? 0 : delta;
  return `${roundedDelta > 0 ? '+' : ''}${roundedDelta.toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })} pts`;
}

function HistoricalPerformanceLegend({
  payload,
  deltas,
  comparisonYears,
}: ComponentProps<typeof ChartLegendContent> & {
  deltas: PerformanceDeltas;
  comparisonYears?: { previous: number; current: number };
}) {
  if (!payload?.length) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 pt-3 text-[10px]">
      {comparisonYears && (
        <span className="w-full text-center font-medium text-[var(--muted)]">
          Variação {comparisonYears.previous} → {comparisonYears.current}
        </span>
      )}
      {payload
        .filter((item) => item.type !== 'none')
        .map((item) => {
          const key = String(item.dataKey ?? item.value) as EnemAreaKey;
          const delta = deltas[key];

          return (
            <div key={key} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color }}
              />
              <span>{ENEM_AREA_SHORT_LABELS[key]}</span>
              <span
                className={`font-semibold tabular-nums ${
                  delta === null || delta === 0
                    ? 'text-[var(--muted)]'
                    : delta > 0
                      ? 'text-[var(--positive)]'
                      : 'text-[var(--danger)]'
                }`}
              >
                {formatPerformanceDelta(delta)}
              </span>
            </div>
          );
        })}
    </div>
  );
}

export function HistoricalPerformanceChart({
  history,
  selectedYear,
}: {
  history: HistoricalPoint[];
  selectedYear: number;
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
  const currentIndex = history.findIndex(
    (point) => point.year === selectedYear,
  );
  const current = currentIndex >= 0 ? history[currentIndex] : undefined;
  const previous = currentIndex > 0 ? history[currentIndex - 1] : undefined;
  const deltas = Object.fromEntries(
    ENEM_AREA_KEYS.map((key) => {
      const currentValue = current?.averages[key];
      const previousValue = previous?.averages[key];

      return [
        key,
        currentValue == null || previousValue == null
          ? null
          : currentValue - previousValue,
      ];
    }),
  ) as PerformanceDeltas;

  return (
    <ChartContainer
      config={historicalPerformanceConfig}
      className="h-[290px] w-full sm:h-[330px]"
      initialDimension={{ width: 720, height: 330 }}
    >
      <LineChart
        data={data}
        margin={{ top: 18, right: 12, left: -12, bottom: 8 }}
      >
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="year"
          tickLine={false}
          axisLine={{ stroke: 'var(--chart-grid)' }}
          tickMargin={12}
        />
        <YAxis
          domain={performanceScale.domain}
          ticks={performanceScale.ticks}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend
          content={
            <HistoricalPerformanceLegend
              deltas={deltas}
              comparisonYears={
                current && previous
                  ? { previous: previous.year, current: current.year }
                  : undefined
              }
            />
          }
        />
        {ENEM_AREA_KEYS.map((key) => (
          <Line
            key={key}
            dataKey={key}
            name={key}
            type="monotone"
            stroke={`var(--color-${key})`}
            strokeWidth={2.25}
            dot={{ r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
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
    <ChartContainer
      config={historicalInfrastructureConfig}
      className="h-[290px] w-full sm:h-[330px]"
      initialDimension={{ width: 720, height: 330 }}
    >
      <LineChart
        data={data}
        margin={{ top: 18, right: 12, left: -12, bottom: 8 }}
      >
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="year"
          tickLine={false}
          axisLine={{ stroke: 'var(--chart-grid)' }}
          tickMargin={12}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(value) => `${value}%`}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend
          content={
            <ChartLegendContent className="flex-wrap gap-x-3 gap-y-1 text-[10px]" />
          }
        />
        {INFRA_KEYS.map((key) => (
          <Line
            key={key}
            dataKey={key}
            name={key}
            type="monotone"
            stroke={`var(--color-${key})`}
            strokeWidth={2.25}
            dot={{ r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
