import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Info } from 'lucide-react';
import {
  FEE_LABELS,
  formatMoney,
  toMajor,
  type Exchange,
  type FeeBreakdown,
  type OrderPreview,
  type OrderSide,
  type OrderType,
  type Quote,
} from '@smd/shared';
import { useQuery } from '@tanstack/react-query';
import { api, ApiClientError } from '@/lib/apiClient';
import { usePlaceOrder } from '@/lib/queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Alert, AlertDescription, Badge, Button, Input, Label, Separator } from '@/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/overlays';
import { cn } from '@/lib/utils';

/**
 * Order entry.
 *
 * The live preview is not decoration: it is produced by the same server code
 * that later executes the order, so the charges a user agrees to are exactly
 * the charges they pay. Nothing is estimated client-side.
 */
export function OrderTicket({
  symbol,
  exchange,
  quote,
  marketOpen,
  onPlaced,
}: {
  symbol: string;
  exchange: Exchange;
  quote: Quote | undefined;
  marketOpen: boolean;
  onPlaced?: () => void;
}) {
  const [side, setSide] = useState<OrderSide>('BUY');
  const [type, setType] = useState<OrderType>('MARKET');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [validity, setValidity] = useState<'DAY' | 'GTC'>('DAY');
  const [queueIfClosed, setQueueIfClosed] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * A fresh key per attempt. Sent as Idempotency-Key so a double-click, or a
   * retry after a flaky connection, cannot create two positions.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const placeMutation = usePlaceOrder();

  /** Seeds the limit price from the live quote, in the handler rather than an
   *  effect, so switching order type does not trigger a cascading render. */
  const handleTypeChange = (next: OrderType): void => {
    setType(next);
    if (next === 'LIMIT' && limitPrice === '' && quote) {
      setLimitPrice(toMajor(quote.ltp).toFixed(2));
    }
  };

  const parsedQuantity = Number.parseInt(quantity, 10);
  const parsedLimit = Number.parseFloat(limitPrice);

  const inputValid =
    Number.isInteger(parsedQuantity) &&
    parsedQuantity > 0 &&
    (type === 'MARKET' || (Number.isFinite(parsedLimit) && parsedLimit > 0));

  const payload = useMemo(
    () => ({
      symbol,
      exchange,
      side,
      type,
      quantity: parsedQuantity,
      validity,
      queueIfClosed,
      ...(type === 'LIMIT' ? { limitPrice: parsedLimit } : {}),
    }),
    [symbol, exchange, side, type, parsedQuantity, parsedLimit, validity, queueIfClosed],
  );

  /**
   * The preview is a query rather than a mutation so TanStack Query owns the
   * debounced request lifecycle - no effect, no manual setState, and an
   * in-flight request is discarded automatically when the inputs change again.
   */
  const debouncedPayload = useDebouncedValue(payload, 350);

  const previewQuery = useQuery({
    queryKey: ['order-preview', debouncedPayload],
    queryFn: () => api.post<OrderPreview>('/orders/preview', debouncedPayload),
    enabled: inputValid,
    retry: false,
    staleTime: 10_000,
  });

  const preview = inputValid ? (previewQuery.data ?? null) : null;
  const previewError =
    previewQuery.error instanceof ApiClientError ? previewQuery.error.message : null;

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!inputValid) return;

    setError(null);

    try {
      const result = await placeMutation.mutateAsync({ input: payload, idempotencyKey });

      if (result.duplicate) {
        toast.info('That order was already submitted.');
      } else if (result.order.status === 'FILLED') {
        toast.success(
          `${side === 'BUY' ? 'Bought' : 'Sold'} ${result.order.quantity} ${symbol} at ${formatMoney(
            result.order.averageFillPrice ?? 0,
            result.order.currency,
          )}`,
        );
      } else {
        toast.success(
          `Order placed. It will rest until ${
            type === 'LIMIT' ? 'your limit price is reached' : 'the market opens'
          }.`,
        );
      }

      // New key for the next order; this one is now spent.
      setIdempotencyKey(crypto.randomUUID());
      setQuantity('1');
      onPlaced?.();
    } catch (submitError) {
      setError(
        submitError instanceof ApiClientError ? submitError.message : 'Could not place this order.',
      );
    }
  };

  const currency = quote?.currency ?? 'INR';
  const canSubmit = inputValid && preview?.canAfford === true && !placeMutation.isPending;

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <Tabs value={side} onValueChange={(value) => setSide(value as OrderSide)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger
            value="BUY"
            className="data-[state=active]:bg-profit data-[state=active]:text-profit-foreground"
          >
            Buy
          </TabsTrigger>
          <TabsTrigger
            value="SELL"
            className="data-[state=active]:bg-loss data-[state=active]:text-loss-foreground"
          >
            Sell
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {!marketOpen ? (
        <Alert variant="warning" className="flex items-start gap-2 py-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <AlertDescription className="text-xs">
            This market is closed. Orders can be queued for the next session.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="order-type">Order type</Label>
          <Select value={type} onValueChange={(value) => handleTypeChange(value as OrderType)}>
            <SelectTrigger id="order-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MARKET">Market</SelectItem>
              <SelectItem value="LIMIT">Limit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="order-qty">Quantity</Label>
          <Input
            id="order-qty"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="tabular"
          />
        </div>
      </div>

      {type === 'LIMIT' ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="order-limit">Limit price</Label>
            <Input
              id="order-limit"
              type="number"
              min={0.01}
              step={0.05}
              inputMode="decimal"
              value={limitPrice}
              onChange={(event) => setLimitPrice(event.target.value)}
              className="tabular"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-validity">Validity</Label>
            <Select value={validity} onValueChange={(value) => setValidity(value as 'DAY' | 'GTC')}>
              <SelectTrigger id="order-validity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAY">Day</SelectItem>
                <SelectItem value="GTC">Good till cancelled (7d)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {!marketOpen ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
          <Label htmlFor="queue-order" className="text-xs font-normal">
            Queue for next market open
          </Label>
          <Switch id="queue-order" checked={queueIfClosed} onCheckedChange={setQueueIfClosed} />
        </div>
      ) : null}

      <Separator />

      {/* ------------------------------------------------- cost breakdown */}
      {preview ? (
        <div className="space-y-2 text-sm">
          <Row label="Estimated price" value={formatMoney(preview.estimatedPrice, currency)} />
          <Row label="Order value" value={formatMoney(preview.grossAmount, currency)} />
          <FeeRows fees={preview.fees} currency={currency} />
          <Separator />
          <Row
            label={side === 'BUY' ? 'Total debit' : 'Net credit'}
            value={formatMoney(preview.netAmount, currency)}
            emphasis
          />
          <Row label="Available cash" value={formatMoney(preview.cashAvailable, currency)} muted />
        </div>
      ) : inputValid && previewQuery.isFetching ? (
        <p className="text-sm text-muted-foreground">Pricing order...</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Enter a quantity to see the full cost, including all charges.
        </p>
      )}

      {preview?.warnings?.length ? (
        <div className="space-y-1.5">
          {preview.warnings.map((warning) => (
            <Alert key={warning} variant="warning" className="py-2">
              <AlertDescription className="text-xs">{warning}</AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}

      {(error ?? previewError) ? (
        <Alert variant="destructive" className="flex items-start gap-2 py-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <AlertDescription className="text-xs">{error ?? previewError}</AlertDescription>
        </Alert>
      ) : null}

      <Button
        type="submit"
        className="w-full"
        variant={side === 'BUY' ? 'profit' : 'loss'}
        disabled={!canSubmit}
        loading={placeMutation.isPending}
      >
        {side === 'BUY' ? 'Buy' : 'Sell'} {inputValid ? parsedQuantity : ''} {symbol}
      </Button>

      <p className="text-center text-[11px] text-muted-foreground">
        Simulated order. Charges are educational approximations, not tax advice.
      </p>
    </form>
  );
}

function Row({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3',
        emphasis && 'font-semibold',
        muted && 'text-muted-foreground',
      )}
    >
      <span className={emphasis ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

/** Lists only the charges that actually applied, so the panel stays readable. */
function FeeRows({ fees, currency }: { fees: FeeBreakdown; currency: 'INR' | 'USD' }) {
  const applied = (Object.keys(FEE_LABELS) as (keyof typeof FEE_LABELS)[]).filter(
    (key) => fees[key] > 0,
  );

  if (applied.length === 0) {
    return <Row label="Charges" value={formatMoney(0, currency)} muted />;
  }

  return (
    <>
      {applied.map((key) => (
        <div
          key={key}
          className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
        >
          <span>{FEE_LABELS[key]}</span>
          <span className="tabular">{formatMoney(fees[key], currency)}</span>
        </div>
      ))}
      <Row label="Total charges" value={formatMoney(fees.total, currency)} muted />
    </>
  );
}

export { Badge };
