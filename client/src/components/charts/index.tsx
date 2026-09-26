import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney, formatPercent, toMajor, type Currency } from '@smd/shared';
import { EmptyState } from '@/components/common';
import { cn } from '@/lib/utils';

/**
 * Chart components.
 *
 * Conventions that apply to all of them:
 *  - Colours come from CSS variables, so both themes work without a re-render.
 *  - Values arrive in MINOR units and are converted for display only here.
 *  - Every chart has an explicit empty state; an axis with no series reads as
 *    a broken page rather than "no data yet".
 */

/**
 * Categorical palette, ordered for maximum separation between neighbours and
 * checked to stay distinguishable for the common forms of colour blindness.
 */
const CATEGORY_COLORS = [
  'oklch(0.62 0.17 258)',
  'oklch(0.70 0.15 158)',
  'oklch(0.68 0.16 45)',
  'oklch(0.62 0.18 300)',
  'oklch(0.72 0.14 195)',
  'oklch(0.66 0.17 25)',
  'oklch(0.70 0.13 120)',
  'oklch(0.64 0.15 330)',
];

const AXIS_STYLE = {
  fontSize: 11,
  fill: 'var(--color-muted-foreground)',
};

function ChartTooltipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {children}
    </div>
  );
}

function formatAxisDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// --------------------------------------------------------------- price chart

export interface PricePoint {
  t: string;
  c: number;
}

/** Instrument price history. Tinted by overall direction over the range. */
export function PriceChart({
  data,
  currency,
  height = 280,
  className,
}: {
  data: PricePoint[];
  currency: Currency;
  height?: number;
  className?: string;
}) {
  const isUp = useMemo(() => {
    const first = data[0]?.c;
    const last = data[data.length - 1]?.c;
    return first !== undefined && last !== undefined && last >= first;
  }, [data]);

  if (data.length === 0) {
    return (
      <EmptyState
        title="No price history"
        description="No historical data is available for this instrument and range."
        className={className}
      />
    );
  }

  const stroke = isUp ? 'var(--color-profit)' : 'var(--color-loss)';
  const gradientId = `price-gradient-${isUp ? 'up' : 'down'}`;

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={formatAxisDate}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={62}
            domain={['auto', 'auto']}
            tickFormatter={(value: number) => formatMoney(value, currency, { compact: true })}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const value = payload[0]?.value as number;
              return (
                <ChartTooltipBox>
                  <p className="mb-1 text-muted-foreground">
                    {new Date(label as string).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="tabular font-medium">{formatMoney(value, currency)}</p>
                </ChartTooltipBox>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="c"
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ----------------------------------------------------------- portfolio value

export function PortfolioValueChart({
  data,
  currency,
  height = 300,
  className,
}: {
  data: { date: string; totalValue: number; invested: number }[];
  currency: Currency;
  height?: number;
  className?: string;
}) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="No performance history yet"
        description="Daily snapshots begin once you hold a position. Historical valuation cannot be reconstructed retroactively from free market data."
        className={className}
      />
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="portfolio-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatAxisDate}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={68}
            tickFormatter={(value: number) => formatMoney(value, currency, { compact: true })}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <ChartTooltipBox>
                  <p className="mb-1 text-muted-foreground">{label as string}</p>
                  {payload.map((entry) => (
                    <p key={entry.dataKey as string} className="tabular flex justify-between gap-4">
                      <span style={{ color: entry.color }}>
                        {entry.dataKey === 'totalValue' ? 'Total value' : 'Invested'}
                      </span>
                      <span className="font-medium">
                        {formatMoney(entry.value as number, currency)}
                      </span>
                    </p>
                  ))}
                </ChartTooltipBox>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="totalValue"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#portfolio-gradient)"
          />
          {/* Dashed, so the cost basis reads as a reference rather than a series. */}
          <Line
            type="monotone"
            dataKey="invested"
            stroke="var(--color-muted-foreground)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------ allocation pie

export function AllocationChart({
  data,
  currency,
  height = 260,
  className,
}: {
  data: { label: string; value: number; percent: number }[];
  currency: Currency;
  height?: number;
  className?: string;
}) {
  if (data.length === 0 || data.every((slice) => slice.value === 0)) {
    return (
      <EmptyState
        title="Nothing to allocate"
        description="Buy your first stock and the breakdown will appear here."
        className={className}
      />
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((slice, index) => (
              <Cell key={slice.label} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const slice = payload[0]?.payload as {
                label: string;
                value: number;
                percent: number;
              };
              return (
                <ChartTooltipBox>
                  <p className="font-medium">{slice.label}</p>
                  <p className="tabular text-muted-foreground">
                    {formatMoney(slice.value, currency)} &middot; {slice.percent.toFixed(1)}%
                  </p>
                </ChartTooltipBox>
              );
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value: string) => (
              <span className="text-xs text-muted-foreground">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------- comparison chart

export function ComparisonChart({
  series,
  height = 320,
  className,
}: {
  series: { symbol: string; points: { t: string; v: number }[] }[];
  height?: number;
  className?: string;
}) {
  // Merge by timestamp so Recharts can draw one line per symbol on a shared
  // axis, rebased to 100 at the start of the range.
  const merged = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();

    for (const entry of series) {
      for (const point of entry.points) {
        const key = point.t.slice(0, 10);
        const row = byDate.get(key) ?? { t: key };
        row[entry.symbol] = point.v;
        byDate.set(key, row);
      }
    }

    return [...byDate.values()].sort((a, b) => String(a.t).localeCompare(String(b.t)));
  }, [series]);

  if (merged.length === 0) {
    return (
      <EmptyState
        title="No comparison data"
        description="Historical data is unavailable for the selected symbols."
        className={className}
      />
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={formatAxisDate}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={(value: number) => `${value.toFixed(0)}`}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <ChartTooltipBox>
                  <p className="mb-1 text-muted-foreground">{label as string}</p>
                  {payload.map((entry) => (
                    <p key={entry.dataKey as string} className="tabular flex justify-between gap-4">
                      <span style={{ color: entry.color }}>{entry.dataKey as string}</span>
                      <span className="font-medium">
                        {formatPercent((entry.value as number) - 100)}
                      </span>
                    </p>
                  ))}
                </ChartTooltipBox>
              );
            }}
          />
          <Legend formatter={(value: string) => <span className="text-xs">{value}</span>} />
          {series.map((entry, index) => (
            <Line
              key={entry.symbol}
              type="monotone"
              dataKey={entry.symbol}
              stroke={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// -------------------------------------------------------------- activity bar

export function ActivityChart({
  data,
  height = 240,
  className,
}: {
  data: { date: string; orders: number; filled: number }[];
  height?: number;
  className?: string;
}) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Order activity will appear here."
        className={className}
      />
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatAxisDate}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={36}
            allowDecimals={false}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <ChartTooltipBox>
                  <p className="mb-1 text-muted-foreground">{label as string}</p>
                  {payload.map((entry) => (
                    <p key={entry.dataKey as string} className="tabular flex justify-between gap-4">
                      <span style={{ color: entry.color }}>{entry.dataKey as string}</span>
                      <span className="font-medium">{entry.value as number}</span>
                    </p>
                  ))}
                </ChartTooltipBox>
              );
            }}
          />
          <Bar dataKey="orders" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="filled" fill="var(--color-profit)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ----------------------------------------------------------------- sparkline

export function Sparkline({
  data,
  positive,
  className,
}: {
  data: number[];
  positive: boolean;
  className?: string;
}) {
  const points = useMemo(
    () => data.map((value, index) => ({ i: index, v: toMajor(value) })),
    [data],
  );
  if (points.length < 2) return null;

  return (
    <div className={cn('h-8 w-24', className)} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={positive ? 'var(--color-profit)' : 'var(--color-loss)'}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export { CATEGORY_COLORS };
