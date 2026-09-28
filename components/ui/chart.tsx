'use client';

import { AxisBottom, AxisLeft } from '@visx/axis';
import { curveMonotoneX } from '@visx/curve';
import { GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear, scalePoint } from '@visx/scale';
import { BarRounded, LinePath } from '@visx/shape';
import { useTooltip } from '@visx/tooltip';
import { ArrowRight } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

const DEFAULT_DIMENSION = { width: 320, height: 200 };
const DEFAULT_MARGIN = { top: 18, right: 12, bottom: 38, left: 42 };
const TOOLTIP_WIDTH = 192;

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: { light: string; dark: string } }
  )
>;

export type ChartDatum = Record<string, string | number | null | undefined>;

export type ChartSeries = {
  key: string;
};

export type ChartLegendItem = {
  key: string;
  label: React.ReactNode;
  color: string;
  icon?: React.ComponentType;
};

type ChartMargin = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type ChartTooltipDatum = {
  label: string;
  items: Array<ChartLegendItem & { value: number; formattedValue?: string }>;
  index: number;
  xPosition?: number;
  variant?: 'default' | 'comparison';
  comparisonRange?: { previous: string; current: string };
};

type SharedChartProps = {
  config: ChartConfig;
  data: ChartDatum[];
  xKey: string;
  series: ChartSeries[];
  domain: [number, number];
  ticks: number[];
  className?: string;
  initialDimension?: { width: number; height: number };
  margin?: Partial<ChartMargin>;
  tickFormat?: (value: number) => string;
  accessibleLabel: string;
};

function getSeriesColor(config: ChartConfig, key: string) {
  const item = config[key];
  return item?.color ?? item?.theme?.light ?? 'currentColor';
}

function getSeriesItems(config: ChartConfig, series: ChartSeries[]) {
  return series.map(({ key }) => ({
    key,
    label: config[key]?.label ?? key,
    color: getSeriesColor(config, key),
    icon: config[key]?.icon,
  }));
}

function getNumericValue(datum: ChartDatum, key: string) {
  const value = datum[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function getLabel(datum: ChartDatum, key: string) {
  const value = datum[key];
  return value == null ? '' : String(value);
}

function formatCategoryTick(value: string, availableWidth: number) {
  const maxCharacters = Math.max(5, Math.floor((availableWidth - 8) / 5.5));

  return value.length > maxCharacters
    ? `${value.slice(0, maxCharacters - 1).trimEnd()}…`
    : value;
}

function getTooltipData(
  datum: ChartDatum,
  index: number,
  xKey: string,
  items: ChartLegendItem[],
): ChartTooltipDatum {
  return {
    label: getLabel(datum, xKey),
    index,
    items: items.flatMap((item) => {
      const value = getNumericValue(datum, item.key);
      return value === undefined ? [] : [{ ...item, value }];
    }),
  };
}

function getAriaLabel(data: ChartTooltipDatum) {
  const values = data.items
    .map((item) => {
      const label =
        typeof item.label === 'string' || typeof item.label === 'number'
          ? String(item.label)
          : item.key;
      return `${label}: ${item.formattedValue ?? item.value.toLocaleString('pt-BR')}`;
    })
    .join(', ');
  return `${data.label}. ${values}`;
}

function mergeMargin(margin?: Partial<ChartMargin>): ChartMargin {
  return { ...DEFAULT_MARGIN, ...margin };
}

function TooltipContent({
  data,
  indicator,
}: {
  data: ChartTooltipDatum;
  indicator: 'dot' | 'line';
}) {
  if (data.variant === 'comparison') {
    return (
      <div className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)]/95 p-2.5 shadow-lg backdrop-blur-md">
        <div className="text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--teal)]">
            Comparação
          </p>
          {data.comparisonRange ? (
            <p className="mt-1 flex items-center justify-center gap-2 text-xs font-semibold text-[var(--ink)]">
              <span>{data.comparisonRange.previous}</span>
              <ArrowRight aria-hidden="true" size={14} strokeWidth={1.8} />
              <span>{data.comparisonRange.current}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs font-semibold text-[var(--ink)]">
              {data.label}
            </p>
          )}
        </div>

        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {data.items.map((item) => (
            <div
              key={item.key}
              className="basis-[calc(33.333%-0.25rem)] rounded-lg bg-[var(--surface-soft)] px-1 py-1.5 text-center"
            >
              <div className="flex items-center justify-center gap-1 text-[9px] text-[var(--muted)]">
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.label}</span>
              </div>
              <p
                className={cn(
                  'mt-0.5 text-xs font-bold tabular-nums',
                  item.value > 0
                    ? 'text-[var(--positive)]'
                    : item.value < 0
                      ? 'text-[var(--danger)]'
                      : 'text-[var(--muted)]',
                )}
              >
                {item.formattedValue ?? item.value.toLocaleString('pt-BR')}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="border-border/50 bg-background grid min-w-48 gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{data.label}</div>
      <div className="grid gap-1.5">
        {data.items.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            {item.icon ? (
              <item.icon />
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  'shrink-0 rounded-[2px]',
                  indicator === 'dot' ? 'size-2.5' : 'h-3 w-1',
                )}
                style={{ backgroundColor: item.color }}
              />
            )}
            <span className="text-muted-foreground min-w-0 flex-1">
              {item.label}
            </span>
            <span className="text-foreground font-mono font-medium whitespace-nowrap tabular-nums">
              {item.formattedValue ?? item.value.toLocaleString('pt-BR')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartTooltip({
  data,
  left,
  top,
  width,
  indicator,
}: {
  data?: ChartTooltipDatum;
  left?: number;
  top?: number;
  width: number;
  indicator: 'dot' | 'line';
}) {
  if (!data || left === undefined || top === undefined) return null;

  if (data.variant === 'comparison') {
    return (
      <div
        className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
        style={{
          left,
          top,
          width: Math.min(270, width - 16),
        }}
      >
        <TooltipContent data={data} indicator={indicator} />
      </div>
    );
  }

  const boundedLeft = Math.max(
    8,
    Math.min(left - TOOLTIP_WIDTH / 2, width - TOOLTIP_WIDTH - 8),
  );
  const placeBelow = top < 88;
  const boundedTop = placeBelow ? top + 12 : top - 12;

  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{
        left: boundedLeft,
        top: boundedTop,
        transform: placeBelow ? undefined : 'translateY(-100%)',
      }}
    >
      <TooltipContent data={data} indicator={indicator} />
    </div>
  );
}

function ChartFrame({
  className,
  initialDimension = DEFAULT_DIMENSION,
  children,
}: {
  className?: string;
  initialDimension?: { width: number; height: number };
  children: (size: { width: number; height: number }) => React.ReactNode;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState(initialDimension);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };
    const bounds = container.getBoundingClientRect();
    updateSize(bounds.width, bounds.height);

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      data-slot="chart"
      className={cn('relative min-w-0 aspect-video text-xs', className)}
    >
      {children(size)}
    </div>
  );
}

const axisTickLabelProps = {
  fill: 'var(--muted)',
  fontSize: 11,
};

export function ChartLegend({
  items,
  className,
}: {
  items: ChartLegendItem[];
  className?: string;
}) {
  return (
    <div
      className={cn('flex items-center justify-center gap-4 pt-3', className)}
    >
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-1.5">
          {item.icon ? (
            <item.icon />
          ) : (
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: item.color }}
            />
          )}
          {item.label}
        </div>
      ))}
    </div>
  );
}

export function VisxBarChart({
  config,
  data,
  xKey,
  series,
  domain,
  ticks,
  className,
  initialDimension,
  margin: marginOverride,
  tickFormat = String,
  accessibleLabel,
  barGap = 2,
  maxBarSize = 32,
}: SharedChartProps & {
  barGap?: number;
  maxBarSize?: number;
}) {
  const margin = mergeMargin(marginOverride);
  const seriesItems = getSeriesItems(config, series);
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<ChartTooltipDatum>();

  return (
    <ChartFrame className={className} initialDimension={initialDimension}>
      {({ width, height }) => {
        const innerWidth = Math.max(0, width - margin.left - margin.right);
        const innerHeight = Math.max(0, height - margin.top - margin.bottom);
        const labels = data.map((datum) => getLabel(datum, xKey));
        const xScale = scaleBand<string>({
          domain: labels,
          range: [0, innerWidth],
          padding: 0.18,
        });
        const seriesScale = scaleBand<string>({
          domain: series.map(({ key }) => key),
          range: [0, xScale.bandwidth()],
          paddingInner:
            xScale.bandwidth() > 0 ? barGap / xScale.bandwidth() : 0,
        });
        const yScale = scaleLinear<number>({
          domain,
          range: [innerHeight, 0],
          nice: false,
        });

        const showDatumTooltip = (datum: ChartDatum, index: number) => {
          const label = getLabel(datum, xKey);
          const x = (xScale(label) ?? 0) + xScale.bandwidth() / 2;
          const values = series
            .map(({ key }) => getNumericValue(datum, key))
            .filter((value): value is number => value !== undefined);
          const highestValue = values.length ? Math.max(...values) : domain[0];

          showTooltip({
            tooltipData: getTooltipData(datum, index, xKey, seriesItems),
            tooltipLeft: margin.left + x,
            tooltipTop: margin.top + yScale(highestValue),
          });
        };

        return (
          <>
            <svg
              width={width}
              height={height}
              aria-label={accessibleLabel}
              className="block overflow-visible"
            >
              <Group left={margin.left} top={margin.top}>
                <GridRows
                  scale={yScale}
                  width={innerWidth}
                  tickValues={ticks}
                  stroke="var(--chart-grid)"
                />
                {tooltipOpen && tooltipData && (
                  <rect
                    aria-hidden="true"
                    x={xScale(labels[tooltipData.index]) ?? 0}
                    width={xScale.bandwidth()}
                    height={innerHeight}
                    fill="var(--surface-soft)"
                  />
                )}
                {data.flatMap((datum) => {
                  const label = getLabel(datum, xKey);
                  const categoryX = xScale(label) ?? 0;

                  return series.flatMap(({ key }) => {
                    const value = getNumericValue(datum, key);
                    const seriesX = seriesScale(key);
                    if (value === undefined || seriesX === undefined) return [];

                    const availableWidth = seriesScale.bandwidth();
                    const barWidth = Math.min(availableWidth, maxBarSize);
                    const y = yScale(value);

                    return (
                      <BarRounded
                        key={`${label}-${key}`}
                        x={
                          categoryX + seriesX + (availableWidth - barWidth) / 2
                        }
                        y={y}
                        width={barWidth}
                        height={Math.max(0, innerHeight - y)}
                        radius={6}
                        top
                        fill={getSeriesColor(config, key)}
                      />
                    );
                  });
                })}
                {data.map((datum, index) => {
                  const label = getLabel(datum, xKey);
                  const tooltipDatum = getTooltipData(
                    datum,
                    index,
                    xKey,
                    seriesItems,
                  );

                  return (
                    <rect
                      key={`hit-${label}`}
                      x={xScale(label) ?? 0}
                      width={xScale.bandwidth()}
                      height={innerHeight}
                      fill="transparent"
                      tabIndex={0}
                      role="graphics-symbol"
                      aria-label={getAriaLabel(tooltipDatum)}
                      className="outline-none"
                      onPointerMove={() => showDatumTooltip(datum, index)}
                      onPointerLeave={hideTooltip}
                      onFocus={() => showDatumTooltip(datum, index)}
                      onBlur={hideTooltip}
                    />
                  );
                })}
                <AxisBottom
                  scale={xScale}
                  top={innerHeight}
                  hideAxisLine
                  hideTicks
                  tickFormat={(value) =>
                    formatCategoryTick(String(value), xScale.step())
                  }
                  tickLabelProps={() => ({
                    ...axisTickLabelProps,
                    fontSize: innerWidth < 400 ? 9 : 11,
                    textAnchor: 'middle',
                    dy: 9,
                  })}
                />
                <AxisLeft
                  scale={yScale}
                  tickValues={ticks}
                  tickFormat={(value) => tickFormat(Number(value))}
                  hideAxisLine
                  hideTicks
                  tickLabelProps={() => ({
                    ...axisTickLabelProps,
                    textAnchor: 'end',
                    dx: -4,
                    dy: 3,
                  })}
                />
              </Group>
            </svg>
            {tooltipOpen && (
              <ChartTooltip
                data={tooltipData}
                left={tooltipLeft}
                top={tooltipTop}
                width={width}
                indicator="dot"
              />
            )}
          </>
        );
      }}
    </ChartFrame>
  );
}

export function VisxLineChart({
  config,
  data,
  xKey,
  series,
  domain,
  ticks,
  className,
  initialDimension,
  margin: marginOverride,
  tickFormat = String,
  accessibleLabel,
  legend,
  legendHeight = 42,
  segmentDeltaFormat,
}: SharedChartProps & {
  legend?: (items: ChartLegendItem[]) => React.ReactNode;
  legendHeight?: number | ((width: number) => number);
  segmentDeltaFormat?: (value: number) => string;
}) {
  const margin = mergeMargin(marginOverride);
  const seriesItems = getSeriesItems(config, series);
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<ChartTooltipDatum>();

  return (
    <ChartFrame className={className} initialDimension={initialDimension}>
      {({ width, height }) => {
        const resolvedLegendHeight =
          typeof legendHeight === 'function'
            ? legendHeight(width)
            : legendHeight;
        const svgHeight = Math.max(
          0,
          height - (legend ? resolvedLegendHeight : 0),
        );
        const innerWidth = Math.max(0, width - margin.left - margin.right);
        const innerHeight = Math.max(0, svgHeight - margin.top - margin.bottom);
        const labels = data.map((datum) => getLabel(datum, xKey));
        const xScale = scalePoint<string>({
          domain: labels,
          range: [0, innerWidth],
          padding: 0.25,
        });
        const yScale = scaleLinear<number>({
          domain,
          range: [innerHeight, 0],
          nice: false,
        });
        const step = xScale.step();

        const showDatumTooltip = (datum: ChartDatum, index: number) => {
          const label = getLabel(datum, xKey);
          const x = xScale(label) ?? 0;
          const values = series
            .map(({ key }) => getNumericValue(datum, key))
            .filter((value): value is number => value !== undefined);
          const highestValue = values.length ? Math.max(...values) : domain[0];

          showTooltip({
            tooltipData: getTooltipData(datum, index, xKey, seriesItems),
            tooltipLeft: margin.left + x,
            tooltipTop: margin.top + yScale(highestValue),
          });
        };

        const showSegmentTooltip = (index: number) => {
          const previousDatum = data[index];
          const currentDatum = data[index + 1];
          if (!previousDatum || !currentDatum || !segmentDeltaFormat) return;

          const previousLabel = getLabel(previousDatum, xKey);
          const currentLabel = getLabel(currentDatum, xKey);
          const previousX = xScale(previousLabel) ?? 0;
          const currentX = xScale(currentLabel) ?? 0;
          const items = seriesItems.flatMap((item) => {
            const previousValue = getNumericValue(previousDatum, item.key);
            const currentValue = getNumericValue(currentDatum, item.key);
            if (previousValue === undefined || currentValue === undefined)
              return [];

            const value = currentValue - previousValue;
            return [
              { ...item, value, formattedValue: segmentDeltaFormat(value) },
            ];
          });
          if (!items.length) return;

          showTooltip({
            tooltipData: {
              label: `Evolução ${previousLabel} → ${currentLabel}`,
              index,
              items,
              xPosition: (previousX + currentX) / 2,
              variant: 'comparison',
              comparisonRange: {
                previous: previousLabel,
                current: currentLabel,
              },
            },
            tooltipLeft: margin.left + innerWidth / 2,
            tooltipTop: margin.top + innerHeight / 2,
          });
        };

        return (
          <>
            <svg
              width={width}
              height={svgHeight}
              aria-label={accessibleLabel}
              className="block overflow-visible"
            >
              <Group left={margin.left} top={margin.top}>
                <GridRows
                  scale={yScale}
                  width={innerWidth}
                  tickValues={ticks}
                  stroke="var(--chart-grid)"
                />
                {tooltipOpen && tooltipData && (
                  <line
                    aria-hidden="true"
                    x1={
                      tooltipData.xPosition ??
                      (xScale(labels[tooltipData.index]) || 0)
                    }
                    x2={
                      tooltipData.xPosition ??
                      (xScale(labels[tooltipData.index]) || 0)
                    }
                    y1={0}
                    y2={innerHeight}
                    stroke="var(--chart-grid)"
                  />
                )}
                {series.map(({ key }) => (
                  <React.Fragment key={key}>
                    <LinePath<ChartDatum>
                      data={data}
                      x={(datum) => xScale(getLabel(datum, xKey)) ?? 0}
                      y={(datum) => yScale(getNumericValue(datum, key) ?? 0)}
                      defined={(datum) =>
                        getNumericValue(datum, key) !== undefined
                      }
                      curve={curveMonotoneX}
                      stroke={getSeriesColor(config, key)}
                      strokeWidth={2.25}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                    {data.map((datum, index) => {
                      const value = getNumericValue(datum, key);
                      if (value === undefined) return null;
                      const isActive =
                        tooltipOpen &&
                        tooltipData?.xPosition === undefined &&
                        tooltipData?.index === index;

                      return (
                        <circle
                          key={`${getLabel(datum, xKey)}-${key}`}
                          cx={xScale(getLabel(datum, xKey)) ?? 0}
                          cy={yScale(value)}
                          r={isActive ? 5 : 3}
                          fill={getSeriesColor(config, key)}
                        />
                      );
                    })}
                  </React.Fragment>
                ))}
                {segmentDeltaFormat &&
                  data.slice(0, -1).map((datum, index) => {
                    const currentLabel = getLabel(datum, xKey);
                    const nextLabel = getLabel(data[index + 1], xKey);
                    const currentX = xScale(currentLabel) ?? 0;
                    const nextX = xScale(nextLabel) ?? 0;
                    const inset = Math.min(12, (nextX - currentX) / 4);

                    return (
                      <rect
                        key={`segment-${currentLabel}-${nextLabel}`}
                        x={currentX + inset}
                        width={Math.max(0, nextX - currentX - inset * 2)}
                        height={innerHeight}
                        fill="transparent"
                        tabIndex={0}
                        role="graphics-symbol"
                        aria-label={`Ver evolução de ${currentLabel} para ${nextLabel}`}
                        className="cursor-crosshair outline-none"
                        onPointerEnter={() => showSegmentTooltip(index)}
                        onPointerMove={() => showSegmentTooltip(index)}
                        onPointerLeave={hideTooltip}
                        onFocus={() => showSegmentTooltip(index)}
                        onBlur={hideTooltip}
                      />
                    );
                  })}
                {data.map((datum, index) => {
                  const label = getLabel(datum, xKey);
                  const center = xScale(label) ?? 0;
                  const hitWidth = segmentDeltaFormat ? 24 : Math.max(step, 24);
                  const tooltipDatum = getTooltipData(
                    datum,
                    index,
                    xKey,
                    seriesItems,
                  );

                  return (
                    <rect
                      key={`hit-${label}`}
                      x={center - hitWidth / 2}
                      width={hitWidth}
                      height={innerHeight}
                      fill="transparent"
                      tabIndex={0}
                      role="graphics-symbol"
                      aria-label={getAriaLabel(tooltipDatum)}
                      className="outline-none"
                      onPointerMove={() => showDatumTooltip(datum, index)}
                      onPointerLeave={hideTooltip}
                      onFocus={() => showDatumTooltip(datum, index)}
                      onBlur={hideTooltip}
                    />
                  );
                })}
                <AxisBottom
                  scale={xScale}
                  top={innerHeight}
                  stroke="var(--chart-grid)"
                  hideTicks
                  tickLabelProps={() => ({
                    ...axisTickLabelProps,
                    textAnchor: 'middle',
                    dy: 10,
                  })}
                />
                <AxisLeft
                  scale={yScale}
                  tickValues={ticks}
                  tickFormat={(value) => tickFormat(Number(value))}
                  hideAxisLine
                  hideTicks
                  tickLabelProps={() => ({
                    ...axisTickLabelProps,
                    textAnchor: 'end',
                    dx: -4,
                    dy: 3,
                  })}
                />
              </Group>
            </svg>
            {legend && (
              <div
                className="absolute inset-x-0 bottom-0"
                style={{ height: resolvedLegendHeight }}
              >
                {legend(seriesItems)}
              </div>
            )}
            {tooltipOpen && (
              <ChartTooltip
                data={tooltipData}
                left={tooltipLeft}
                top={tooltipTop}
                width={width}
                indicator="line"
              />
            )}
          </>
        );
      }}
    </ChartFrame>
  );
}
