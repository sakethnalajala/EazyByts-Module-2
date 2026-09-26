import type { EducationCategory, EducationLevel } from '@smd/shared';

export interface EducationSeed {
  title: string;
  slug: string;
  summary: string;
  category: EducationCategory;
  level: EducationLevel;
  readMinutes: number;
  tags: string[];
  content: string;
}

/**
 * Seeded learning library.
 *
 * Real articles, not lorem ipsum: the education section is a graded feature and
 * a reviewer will open one. Content is Markdown, rendered client-side.
 */
export const EDUCATION_SEED: EducationSeed[] = [
  {
    title: 'What a stock actually is',
    slug: 'what-a-stock-actually-is',
    summary:
      'A share is a slice of ownership in a real business, not a number on a screen. Here is what you own and what it entitles you to.',
    category: 'basics',
    level: 'beginner',
    readMinutes: 4,
    tags: ['shares', 'ownership', 'fundamentals'],
    content: `## Ownership, not a ticker

When you buy one share of Reliance Industries, you own a genuine fraction of that company. Reliance has roughly 676 crore shares outstanding, so one share is about one 6.76-billionth of the business: its refineries, its telecom subscribers, its retail stores, its debts.

That fraction is tiny, but the nature of the claim matters. You are not betting on a price. You are a part-owner with two real entitlements:

1. **A claim on future profits**, paid out as dividends when the board declares them.
2. **A vote** on certain corporate matters, proportional to your holding.

## Why prices move

A share price is the market's live estimate of the present value of all the cash that business will ever return to its owners. Every price move is someone revising that estimate.

This is why prices react to earnings reports, interest-rate decisions and management changes: each one alters the expected future cash, or the rate at which we discount it.

It also explains something beginners find baffling. A company can report record profits and see its stock fall 8% the same morning. If the market already expected even better profits, the new information is *disappointing* relative to expectations, even though it is good in absolute terms. **Prices respond to surprises, not to news.**

## Common shares versus preference shares

Almost everything traded on NSE, BSE, NASDAQ and NYSE is *common* (or *equity*) stock. Preference shares sit ahead of common shares for dividends and in liquidation, but usually carry no vote. This platform simulates common stock only.

## What this platform simulates

You trade with virtual money at delayed market prices. You will not receive dividends here, and you cannot vote. What you *can* practise is the decision-making: what to buy, how much, when to sell, and how fees erode returns.`,
  },
  {
    title: 'Market orders versus limit orders',
    slug: 'market-orders-versus-limit-orders',
    summary:
      'The single most consequential choice on the order form. One guarantees execution, the other guarantees price - you never get both.',
    category: 'basics',
    level: 'beginner',
    readMinutes: 5,
    tags: ['orders', 'execution', 'trading'],
    content: `## The trade-off

Every order type is a position on one question: **would you rather be certain you trade, or certain what you pay?**

| | Market order | Limit order |
| --- | --- | --- |
| Execution | Essentially guaranteed | Only if your price is reached |
| Price | Whatever the market gives you | Never worse than your limit |
| Best for | Liquid stocks, urgent exits | Precise entries, illiquid stocks |

## Market orders

A market order says: *fill me now, at the best available price*. In a liquid stock like HDFC Bank or Apple, the price you get is within a paisa or a cent of what you saw.

The danger is **slippage**. In a thin stock, or seconds after a major announcement, the best available price can be far from the last traded price. A market order to buy a stock with a wide spread can fill several percent above where you expected, and you have already agreed to it.

## Limit orders

A limit order names your worst acceptable price. A limit BUY at ₹2,900 fills at ₹2,900 or lower, never higher. A limit SELL at ₹3,000 fills at ₹3,000 or higher, never lower.

The cost is **execution risk**. If the stock never reaches your price, nothing happens. Traders routinely watch a stock run away from a limit order set fifty paise too aggressively.

## How this platform executes them

- **Market orders** fill immediately at the last cached price, provided that quote is under 15 minutes old. A staler quote is rejected rather than filled at a price that may no longer exist.
- **Limit orders** rest until the matching engine sees a price that satisfies them. BUY fills when the last price is at or below your limit; SELL when it is at or above.
- When a limit order fills, it fills **at your limit price**. Real exchanges often do better than this, so treat simulated results as slightly conservative.

## Validity

**DAY** orders expire at the session close. **GTC** ("good till cancelled") orders survive for 7 days here. Either way, funds or shares stay reserved while the order is open - which is why placing a large limit order reduces the buying power shown in your wallet.`,
  },
  {
    title: 'Reading a candlestick chart',
    slug: 'reading-a-candlestick-chart',
    summary:
      'Four numbers per bar - open, high, low, close - and what the shape of a candle does and does not tell you.',
    category: 'analysis',
    level: 'beginner',
    readMinutes: 5,
    tags: ['charts', 'technical analysis', 'candlesticks'],
    content: `## Four numbers

Each candle summarises one period of trading with four values:

- **Open** - the first traded price of the period
- **High** - the highest price reached
- **Low** - the lowest price reached
- **Close** - the final traded price

The thick **body** spans open to close. The thin **wicks** reach out to the high and the low. A body drawn in green (or hollow) means the close was above the open; red (or filled) means it closed below.

## What the shape suggests

- **A long body** - one side dominated for the whole period.
- **Short body, long wicks** - a genuine fight, ending roughly where it started. Indecision.
- **A long lower wick** - sellers pushed the price down and buyers pushed it all the way back. Often read as demand appearing at that level.
- **A long upper wick** - the mirror image: a rally that could not hold.

## An essential caution

Candlestick patterns are widely taught and widely over-trusted. A "hammer" or an "engulfing" pattern is a description of what already happened, not a prediction of what comes next. Academic tests of candlestick patterns in isolation find weak and inconsistent predictive value.

They are most useful as **context**: a long lower wick at a level a stock has bounced from three times before means considerably more than the same candle in the middle of nowhere.

## Volume belongs on the chart

Price alone is half the picture. A 4% move on five times the usual volume reflects broad participation. The same move on thin volume may be one large order pushing a quiet book around, and is far more likely to reverse.

## Timeframes

A daily candle compresses a full session into one bar. Switch to weekly and you see the trend without the noise; switch to intraday and you see the noise in full. Neither is more "real" - they answer different questions. Pick the one that matches how long you intend to hold.`,
  },
  {
    title: 'How fees and taxes quietly erode returns',
    slug: 'how-fees-and-taxes-erode-returns',
    summary:
      'Indian STT, stamp duty, GST and US SEC fees are individually small and collectively decisive for anyone who trades often.',
    category: 'risk',
    level: 'intermediate',
    readMinutes: 6,
    tags: ['fees', 'taxes', 'costs', 'STT'],
    content: `## Why this matters more than it looks

A round trip that costs 0.25% needs a 0.25% gain just to break even. Do that twice a week for a year and you have handed over roughly 26% of your capital in costs before a single rupee of profit.

This platform simulates the real charge structure so that your P&L is honest about it.

## Indian equity delivery charges

| Charge | Rate | Applies to |
| --- | --- | --- |
| Brokerage | ₹0 | Delivery trades at most discount brokers |
| STT | 0.1% | Buy **and** sell |
| Exchange transaction | 0.00297% | Both sides |
| SEBI turnover | ₹10 per crore | Both sides |
| Stamp duty | 0.015% | Buy only |
| GST | 18% | On brokerage + exchange + SEBI |

STT dominates. On a ₹1,00,000 round trip you pay roughly ₹100 buying and ₹100 selling in STT alone.

## US charges

US brokers largely removed commissions, leaving two small regulatory fees on the **sell** side only:

- **SEC fee** - about $0.0000278 of sale proceeds
- **FINRA TAF** - $0.000166 per share, capped at $8.30

A $10,000 US round trip costs well under a dollar. This is a genuine structural difference between the two markets, and it changes what strategies are viable in each.

## The compounding effect

Consider ₹5,00,000 growing at 12% a year for 20 years.

- Untouched: about ₹48.2 lakh
- Losing 1% a year to costs: about ₹40.1 lakh

That one percentage point costs roughly ₹8 lakh. Nothing about the strategy changed.

## What to take from this

1. Fees scale with **activity**, not with returns. Trading twice as often doubles the cost and does not double the edge.
2. In India, STT makes short holding periods materially expensive.
3. Always judge a strategy on returns **after** costs. A backtest that ignores fees is not a backtest.

> These figures are simulated approximations for education. They are not tax advice - consult a qualified professional for your actual liabilities.`,
  },
  {
    title: 'Diversification: the one free lunch',
    slug: 'diversification-the-one-free-lunch',
    summary:
      'Why spreading holdings reduces risk without necessarily reducing expected return, and where the benefit stops.',
    category: 'risk',
    level: 'intermediate',
    readMinutes: 5,
    tags: ['diversification', 'risk', 'portfolio'],
    content: `## Two kinds of risk

**Unsystematic risk** is specific to one company: a failed drug trial, a fraud, a fire at the main plant. It can be diversified away, because these events are largely uncorrelated across companies.

**Systematic risk** is market-wide: interest rates, recessions, currency shocks. No amount of diversification within a market removes it.

Harry Markowitz called diversification "the only free lunch in finance" because it reduces the first kind of risk without requiring you to accept lower expected returns.

## How fast it works

Moving from 1 stock to 10 removes most company-specific risk. From 10 to 30 removes a good deal more. Beyond roughly 30 holdings, each addition contributes very little - and every position you add is one more you must actually follow.

## Correlation is what matters, not the count

Twenty Indian bank stocks is not a diversified portfolio. They share the same rate cycle, the same regulator, the same credit environment. When one falls on an RBI announcement, most fall together.

Real diversification means holdings that respond differently to the same event. Consider spreading across:

- **Sectors** - IT, banking, FMCG, pharma, energy
- **Market caps** - large, mid, small
- **Geographies** - this platform's separate INR and USD wallets make this concrete

## Over-diversification

Holding 80 stocks in a ₹2,00,000 portfolio means positions too small for any winner to matter, and a research burden no individual can carry. At that point you have built an expensive, unmanaged index fund - buy the index instead.

## Concentration is a deliberate choice

Some successful investors concentrate heavily, arguing that diversification protects against ignorance. That is a coherent position, but it requires genuine conviction backed by genuine work. For most people beginning out, breadth is the safer default.`,
  },
  {
    title: 'Understanding the P/E ratio',
    slug: 'understanding-the-pe-ratio',
    summary:
      'The most quoted and most misused valuation number in investing. What it measures, and the three traps it sets.',
    category: 'analysis',
    level: 'intermediate',
    readMinutes: 5,
    tags: ['valuation', 'fundamentals', 'PE ratio'],
    content: `## The calculation

\`\`\`
P/E = Share price / Earnings per share
\`\`\`

A stock at ₹1,200 earning ₹40 per share trades at a P/E of 30. You are paying ₹30 for each ₹1 of current annual profit.

An intuitive reading: at unchanged earnings, it takes 30 years of profit to repay your purchase price.

## What a high P/E actually means

A high P/E is not "expensive" and a low P/E is not "cheap". The ratio reflects **expected growth**.

A company growing earnings 30% a year justifies a far higher multiple than one growing 3%, because the earnings you are buying will be much larger in a few years. This is why an IT company might trade at 35x while a commodity producer trades at 9x, with both fairly valued.

## Three traps

**1. The value trap.** A P/E of 5 often means the market expects earnings to collapse. Cyclical businesses look cheapest exactly at their peak profits, right before the cycle turns.

**2. Negative or near-zero earnings.** A loss-making company has no meaningful P/E. A company that earned ₹1 crore by accident shows an absurd multiple. The ratio breaks near zero.

**3. Comparing across sectors.** Banks, utilities and software companies have structurally different multiples. Comparing a bank's P/E to a software company's tells you almost nothing.

## Using it well

- Compare a company to **its own history** and to **direct competitors**.
- Check whether it is **trailing** (past 12 months, factual) or **forward** (estimated, optimistic).
- Pair it with growth. The PEG ratio (P/E divided by growth rate) is a crude attempt at this.
- Never decide on one ratio. Look at debt, cash generation and return on capital too.

## The honest summary

P/E is a fast way to ask "what is the market assuming here?" It is a starting question, never an answer.`,
  },
  {
    title: 'Stop-losses and position sizing',
    slug: 'stop-losses-and-position-sizing',
    summary:
      'How much to buy is a more important question than what to buy, and most beginners never ask it.',
    category: 'risk',
    level: 'intermediate',
    readMinutes: 6,
    tags: ['risk management', 'position sizing', 'stop loss'],
    content: `## The question nobody asks

Beginners spend weeks choosing *what* to buy and seconds deciding *how much*. The second decision determines whether a bad run is a setback or an ending.

## The 1% rule

A widely used discipline: risk no more than 1% of total capital on any single position.

On ₹5,00,000, that is ₹5,000 at risk per trade. Note this is the amount you lose **if your exit level is hit** - not the position size.

## Working the size out

\`\`\`
Position size = Risk per trade / (Entry price - Stop price)
\`\`\`

Buying at ₹2,000 with an exit at ₹1,900 means ₹100 of risk per share. With ₹5,000 at risk:

\`\`\`
5,000 / 100 = 50 shares  (a ₹1,00,000 position)
\`\`\`

Move the stop to ₹1,950 and risk per share halves, so the same rupee risk supports 100 shares. **A tighter stop permits a larger position, not a smaller one** - this surprises people.

## Why it works

With 1% at risk per position, ten consecutive losses cost about 10% of capital. Painful, survivable, recoverable.

Risk 10% per position and those same ten losses take roughly 65% of your capital. Recovering from that requires a 186% gain. Most accounts that reach this point do not come back.

## Setting the level

Place your exit where your reason for buying is **proven wrong** - below a support level, below a breakout base, below a moving average you were trading on.

Do not place it at a round percentage because it feels tidy. A 5% stop on a stock that routinely moves 6% in a day will be hit by noise alone, repeatedly.

## In this simulation

This platform does not yet execute automatic stop-loss orders. You can replicate the discipline with a **price alert** at your exit level, then place the sell order manually when it fires. Practising the sizing arithmetic is the part that transfers to real money.`,
  },
  {
    title: 'How the Indian markets are structured',
    slug: 'how-the-indian-markets-are-structured',
    summary:
      'NSE, BSE, SEBI, settlement cycles and the trading session - the machinery underneath an Indian equity trade.',
    category: 'markets-india',
    level: 'beginner',
    readMinutes: 6,
    tags: ['NSE', 'BSE', 'SEBI', 'India'],
    content: `## Two exchanges

**NSE** (National Stock Exchange), founded 1992, carries the large majority of Indian equity volume. Its benchmark is the **NIFTY 50**.

**BSE** (Bombay Stock Exchange), established 1875, is Asia's oldest exchange. Its benchmark is the **SENSEX**, 30 companies.

Most large companies list on both. Prices track each other closely - arbitrage sees to that - but they are not identical, which is why this platform treats \`RELIANCE\` on NSE and on BSE as separate instruments.

## The regulator

**SEBI** (Securities and Exchange Board of India) regulates the exchanges, brokers and listed companies. It sets disclosure rules, polices insider trading and manages circuit limits.

## The trading session

| Segment | Time (IST) |
| --- | --- |
| Pre-open | 09:00 - 09:15 |
| Normal trading | 09:15 - 15:30 |
| Post-close | 15:40 - 16:00 |

Monday to Friday, excluding exchange holidays. India observes a substantial holiday calendar - Diwali, Holi, Independence Day and more - and this platform ships that calendar.

## Settlement

India runs **T+1** settlement: shares and money change hands one working day after the trade. India was among the first major markets to move to T+1, ahead of the US.

Until settlement completes, delivery shares are not fully yours to re-sell without restriction. This simulation credits holdings immediately, which is a simplification.

## Circuit limits

Individual stocks carry price bands (commonly 5%, 10% or 20%) beyond which trading halts for the day. Index-level circuit breakers pause the entire market after sharp moves. These exist to interrupt panic and give participants time to reassess.

## Demat accounts

Indian shares are held electronically in a **demat account** with CDSL or NSDL, linked to your trading account. The certificate era is long gone.`,
  },
  {
    title: 'How the US markets differ',
    slug: 'how-the-us-markets-differ',
    summary:
      'NASDAQ, NYSE, session times, settlement and the practical differences an Indian investor meets first.',
    category: 'markets-us',
    level: 'beginner',
    readMinutes: 5,
    tags: ['NASDAQ', 'NYSE', 'US markets'],
    content: `## Two main venues

**NYSE** - the older, auction-based exchange, historically home to large industrials and financials. It still uses Designated Market Makers on a physical floor alongside electronic matching.

**NASDAQ** - fully electronic since 1971, dealer-based, and where most large technology companies list.

The distinction matters much less than it once did. Both are fast, electronic and deeply liquid.

## Session times

Regular trading runs **09:30 to 16:00 Eastern**, Monday to Friday. In Indian time that is roughly **19:00 to 02:30 IST** (shifting by an hour when US daylight saving changes and India does not).

US markets also support meaningful pre-market and after-hours sessions, where liquidity is thin and spreads are wide. This platform simulates the regular session only.

## Settlement

The US moved to **T+1** in May 2024, aligning with India.

## Practical differences

| | India | US |
| --- | --- | --- |
| Transaction taxes | STT, stamp duty, GST | Minimal SEC/FINRA fees |
| Circuit limits | Per-stock daily bands | Market-wide halts only |
| Lot size | 1 share | 1 share |
| Currency | INR | USD |

The tax difference is the big one. US round trips cost a fraction of Indian ones, which makes frequent trading structurally more viable there.

## Currency in this platform

Your INR wallet and your USD wallet are entirely separate. INR cash trades NSE and BSE; USD cash trades NASDAQ and NYSE. There is no conversion between them.

This is deliberate. Mixing currencies in one ledger introduces FX gains and losses that obscure whether your *stock* decisions were any good. Keeping them apart means each wallet's P&L reflects your trading, and nothing else.`,
  },
  {
    title: 'Realised versus unrealised P&L',
    slug: 'realised-versus-unrealised-pnl',
    summary:
      'Why your portfolio shows two different profit numbers, and which one is actually money.',
    category: 'platform',
    level: 'beginner',
    readMinutes: 4,
    tags: ['P&L', 'portfolio', 'accounting'],
    content: `## Two numbers, two meanings

**Unrealised P&L** is the paper gain or loss on positions you still hold:

\`\`\`
Unrealised = (Current price - Average cost) x Quantity
\`\`\`

It changes every time the price moves. It is not money. It becomes money only when you sell.

**Realised P&L** is locked in. When you sell, the difference between proceeds and cost basis is booked permanently:

\`\`\`
Realised = (Sell price x Qty - Sell fees) - (Average cost x Qty)
\`\`\`

## Average cost

This platform uses **weighted average cost**, the standard Indian broker convention, with buy fees capitalised into the cost:

\`\`\`
Average cost = Total (quantity x price + buy fees) / Total quantity
\`\`\`

Buy 10 shares at ₹100 and 10 more at ₹120, and your average cost is ₹110 plus a little for fees. Selling does **not** change your average cost - it only reduces the quantity.

## A worked example

1. Buy 100 TCS at ₹4,000 → invested ₹4,00,000, average cost ₹4,000
2. Price rises to ₹4,200 → unrealised P&L = **+₹20,000**, realised = ₹0
3. Sell 50 at ₹4,200 → realised = **+₹10,000** (less fees), remaining unrealised = **+₹10,000**
4. Price falls to ₹3,900 → realised stays **+₹10,000**, unrealised becomes **-₹5,000**

Realised P&L never moves once booked. That is exactly why it is the more honest measure of past decisions.

## Which to watch

Unrealised P&L answers "what are my current positions worth?". Realised P&L answers "was I any good?".

Beginners often anchor on unrealised gains and refuse to sell a loser because "it isn't a loss until I sell". The market does not care about your cost basis. A position is worth what it is worth today.`,
  },
  {
    title: 'Building and using a watchlist',
    slug: 'building-and-using-a-watchlist',
    summary:
      'A watchlist is a research queue, not a wishlist. How to keep one small enough to be useful.',
    category: 'platform',
    level: 'beginner',
    readMinutes: 4,
    tags: ['watchlist', 'workflow', 'research'],
    content: `## What it is for

A watchlist holds companies you have decided are **worth understanding**, whether or not you intend to buy today. It separates "interesting" from "acted on", which stops you buying on first impression.

## Keep it small

The most common mistake is a watchlist of ninety symbols. Nobody follows ninety companies. Somewhere between 10 and 25 is where a list stays reviewable.

If adding something means you will never look at it again, do not add it.

## Organise by intent

This platform supports multiple lists. Useful splits:

- **Core** - quality businesses you would own at the right price
- **Earnings this week** - short-term attention
- **Post-mortem** - things you sold, kept to learn from
- **Sector research** - a theme you are working through

## Use the note field

Every entry takes a note. Write **why** you added it and **what would make you act**:

> "Added at ₹1,250. Waiting for Q3 margin recovery. Buy interest below ₹1,100."

Three months later, that note is the difference between a considered decision and a guess. Your memory of why you liked something is less reliable than you think.

## Pair with alerts

A watchlist is passive; an alert is active. When a note says "interested below ₹1,100", set a PRICE_BELOW alert at ₹1,100. You stop staring at screens and the platform tells you when your condition is met.

## Prune regularly

Once a month, delete anything you have not looked at and cannot justify. A watchlist that is never pruned becomes noise, and noise is worse than nothing - it buries the entries that matter.`,
  },
  {
    title: 'Common psychological traps in trading',
    slug: 'common-psychological-traps-in-trading',
    summary:
      'Loss aversion, anchoring, confirmation bias and recency - the four that cost retail investors the most.',
    category: 'strategy',
    level: 'advanced',
    readMinutes: 7,
    tags: ['psychology', 'behavioural finance', 'bias'],
    content: `## Why this matters

Most retail underperformance is not caused by bad stock picking. It is caused by predictable behaviour under uncertainty. These patterns are well documented and, unhelpfully, knowing about them does not make you immune.

## Loss aversion

Losses hurt roughly twice as much as equivalent gains feel good (Kahneman and Tversky). The consequence is the **disposition effect**: investors sell winners too early to bank the good feeling, and hold losers too long to avoid confirming the bad one.

The result is a portfolio that systematically keeps its worst holdings and discards its best.

*Counter:* decide your exit **before** you enter, when nothing is at stake. Write it down.

## Anchoring

Your purchase price is burned into your thinking and has no economic meaning whatsoever. "I'll sell when it gets back to what I paid" is anchoring - the market has no knowledge of your cost basis.

*Counter:* ask yourself the clean question: *would I buy this today at this price?* If not, why are you holding it?

## Confirmation bias

Having bought, you begin reading bullish coverage and dismissing bearish arguments. Ownership quietly converts analysis into advocacy.

*Counter:* before buying, write the strongest bear case you can honestly construct. Revisit it when the position moves against you.

## Recency bias

Recent events feel more probable than they are. After three green weeks, a crash feels impossible. After a crash, recovery feels impossible.

*Counter:* look at long-horizon data. Corrections of 10% happen roughly yearly; they feel unprecedented each time.

## Overconfidence and overtrading

Barber and Odean's study of US retail accounts found the most active traders underperformed the least active by several percentage points a year, almost entirely due to costs. Men traded 45% more than women and earned correspondingly less.

*Counter:* track every decision, including the ones you talked yourself out of. Honest records are humbling and useful.

## A practical habit

Keep a trading journal with four fields: **what** you did, **why**, **what would prove you wrong**, and **what actually happened**. Review it monthly.

You will find your reasoning fails in the same two or three ways repeatedly. That is the most valuable thing you can learn about yourself as an investor.`,
  },
];
