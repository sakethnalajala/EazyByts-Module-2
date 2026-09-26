import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, TrendingUp } from 'lucide-react';
import { useSearch } from '@/lib/queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Badge, Input, Spinner } from '@/components/ui';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/overlays';
import { EmptyState } from '@/components/common';

/**
 * Command-palette style instrument search.
 *
 * The query is debounced before it reaches the server: typing "RELIANCE" would
 * otherwise fire eight requests, each hitting the database, for one intent.
 */
export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term);

  const { data, isFetching } = useSearch(debounced, open);
  const results = data?.results ?? [];

  /** Clearing on close keeps the next visit starting from an empty box. */
  const handleOpenChange = (next: boolean): void => {
    if (!next) setTerm('');
    onOpenChange(next);
  };

  const goTo = (symbol: string, exchange: string): void => {
    handleOpenChange(false);
    void navigate(`/app/stocks/${symbol}?exchange=${exchange}`);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="top-[15%] translate-y-0 gap-3 p-4 sm:max-w-xl">
        <DialogTitle className="sr-only">Search stocks</DialogTitle>
        <DialogDescription className="sr-only">
          Search by symbol or company name across NSE, BSE, NASDAQ and NYSE.
        </DialogDescription>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search by symbol or company name..."
            className="pl-9"
            aria-label="Search stocks"
          />
          {isFetching ? (
            <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          ) : null}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {debounced.length < 2 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Type at least two characters to search.
            </p>
          ) : results.length === 0 && !isFetching ? (
            <EmptyState
              icon={Search}
              title="No matches"
              description={`Nothing in the tradable universe matches "${debounced}". This platform covers a curated set of large-cap NSE, BSE, NASDAQ and NYSE symbols.`}
            />
          ) : (
            <ul className="space-y-1">
              {results.map((instrument) => (
                <li key={instrument.id}>
                  <button
                    type="button"
                    onClick={() => goTo(instrument.symbol, instrument.exchange)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
                      <TrendingUp className="size-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {instrument.symbol}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {instrument.name}
                      </span>
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {instrument.exchange}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
