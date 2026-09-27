'use client';

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
        <XAxis dataKey="year" tickLine={false} axisLine={false} dy={9} />
        <YAxis
          domain={[0, 1000]}
          ticks={[0, 250, 500, 750, 1000]}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend
          content={
            <ChartLegendContent className="flex-wrap gap-x-3 gap-y-1 text-[10px]" />
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
        <XAxis dataKey="year" tickLine={false} axisLine={false} dy={9} />
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
