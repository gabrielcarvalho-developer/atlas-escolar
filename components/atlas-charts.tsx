'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  ENEM_AREA_KEYS,
  ENEM_AREA_SHORT_LABELS,
  INFRA_KEYS,
  INFRA_SHORT_LABELS,
  SAEB_STATE,
  SchoolContext,
  TerritoryMetrics,
} from '@/lib/atlas-data';

const infrastructureConfig = {
  school: { label: 'Escola', color: '#087c70' },
  municipality: { label: 'Média municipal', color: '#d7d3c5' },
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
        <CartesianGrid vertical={false} stroke="#ecece7" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11, fill: '#627178' }}
          dy={9}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(value) => `${value}%`}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: '#7d878c' }}
        />
        <ChartTooltip
          cursor={{ fill: '#f2f5f1' }}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Bar
          dataKey="school"
          name="school"
          fill="var(--color-school)"
          radius={[6, 6, 2, 2]}
          maxBarSize={28}
        />
        {context.compareMunicipal && (
          <Bar
            dataKey="municipality"
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
  school: { label: 'Escola', color: '#087c70' },
  municipality: { label: 'Média municipal', color: '#d7d3c5' },
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
        <CartesianGrid vertical={false} stroke="#ecece7" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11, fill: '#627178' }}
          dy={9}
        />
        <YAxis
          domain={[0, 1000]}
          ticks={[0, 250, 500, 750, 1000]}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: '#7d878c' }}
        />
        <ChartTooltip
          cursor={{ fill: '#f2f5f1' }}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Bar
          dataKey="school"
          name="school"
          fill="var(--color-school)"
          radius={[6, 6, 2, 2]}
          maxBarSize={28}
        />
        {context.compareMunicipal && (
          <Bar
            dataKey="municipality"
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
    primary: { label: primary.name, color: '#087c70' },
    secondary: {
      label: secondary?.name ?? 'Comparação',
      color: '#203741',
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
        <CartesianGrid vertical={false} stroke="#ecece7" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11, fill: '#627178' }}
          dy={9}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(value) => `${value}%`}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: '#7d878c' }}
        />
        <ChartTooltip
          cursor={{ fill: '#f2f5f1' }}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Bar
          dataKey="primary"
          name="primary"
          fill="var(--color-primary)"
          radius={[6, 6, 2, 2]}
          maxBarSize={32}
        />
        {secondary && (
          <Bar
            dataKey="secondary"
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
    primary: { label: primary.name, color: '#087c70' },
    secondary: {
      label: secondary?.name ?? 'Comparação',
      color: '#203741',
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
        <CartesianGrid vertical={false} stroke="#ecece7" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11, fill: '#627178' }}
          dy={9}
        />
        <YAxis
          domain={[0, 1000]}
          ticks={[0, 250, 500, 750, 1000]}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: '#7d878c' }}
        />
        <ChartTooltip
          cursor={{ fill: '#f2f5f1' }}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Bar
          dataKey="primary"
          name="primary"
          fill="var(--color-primary)"
          radius={[6, 6, 2, 2]}
          maxBarSize={32}
        />
        {secondary && (
          <Bar
            dataKey="secondary"
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
  portuguese: { label: 'Língua Portuguesa', color: '#087c70' },
  mathematics: { label: 'Matemática', color: '#c8ec51' },
} satisfies ChartConfig;

export function SaebStateChart() {
  const data = SAEB_STATE.map((row) => ({
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
        <CartesianGrid vertical={false} stroke="#ecece7" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11, fill: '#627178' }}
          dy={9}
        />
        <YAxis
          domain={[0, 400]}
          ticks={[0, 100, 200, 300, 400]}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: '#7d878c' }}
        />
        <ChartTooltip
          cursor={{ fill: '#f2f5f1' }}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Bar
          dataKey="portuguese"
          name="portuguese"
          fill="var(--color-portuguese)"
          radius={[6, 6, 2, 2]}
          maxBarSize={34}
        />
        <Bar
          dataKey="mathematics"
          name="mathematics"
          fill="var(--color-mathematics)"
          radius={[6, 6, 2, 2]}
          maxBarSize={34}
        />
      </BarChart>
    </ChartContainer>
  );
}
