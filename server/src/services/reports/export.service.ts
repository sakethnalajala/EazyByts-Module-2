import PDFDocument from 'pdfkit';
import type { Types } from 'mongoose';
import { formatMoney, formatPercent, type ExportQuery } from '@smd/shared';
import {
  getHoldings,
  getPortfolioOverview,
  getTradeStatistics,
  getTransactions,
} from '../trading/portfolio.service.js';
import { Order } from '../../modules/orders/order.model.js';
import { toOrderDto } from '../trading/orders.service.js';

/**
 * CSV and PDF report generation.
 *
 * CSV is written by hand rather than with a library: the escaping rules are
 * four lines and a dependency for that is not worth the supply-chain surface.
 */

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  // Objects would stringify to "[object Object]", which silently corrupts a
  // column. Only primitives are meaningful in a CSV cell.
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
        ? value.toString()
        : JSON.stringify(value);
  // Quote when the value contains a delimiter, quote or newline; double any
  // embedded quotes.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  // CRLF and a UTF-8 BOM so Excel opens it correctly, which is where these
  // files actually get opened.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export interface ExportResult {
  filename: string;
  contentType: string;
  body: Buffer | string;
}

export async function buildExport(
  userId: Types.ObjectId,
  query: ExportQuery,
  userName: string,
): Promise<ExportResult> {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `smd-${query.report}-${stamp}`;

  if (query.format === 'csv') {
    return {
      filename: `${base}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: await buildCsv(userId, query),
    };
  }

  return {
    filename: `${base}.pdf`,
    contentType: 'application/pdf',
    body: await buildPdf(userId, query, userName),
  };
}

async function buildCsv(userId: Types.ObjectId, query: ExportQuery): Promise<string> {
  const market = query.market;

  if (query.report === 'holdings') {
    const holdings = await getHoldings(userId, market);
    return toCsv(
      [
        'Symbol',
        'Exchange',
        'Name',
        'Currency',
        'Quantity',
        'Avg Cost',
        'Invested',
        'Last Price',
        'Market Value',
        'Unrealised P&L',
        'Unrealised %',
        'Stale',
      ],
      holdings.map((h) => [
        h.symbol,
        h.exchange,
        h.instrumentName,
        h.currency,
        h.quantity,
        formatMoney(h.averageCost, h.currency, { symbol: false }),
        formatMoney(h.investedAmount, h.currency, { symbol: false }),
        h.lastPrice === null ? '' : formatMoney(h.lastPrice, h.currency, { symbol: false }),
        h.marketValue === null ? '' : formatMoney(h.marketValue, h.currency, { symbol: false }),
        h.unrealisedPnl === null ? '' : formatMoney(h.unrealisedPnl, h.currency, { symbol: false }),
        h.unrealisedPnlPercent === null ? '' : h.unrealisedPnlPercent,
        h.isStale ? 'yes' : 'no',
      ]),
    );
  }

  if (query.report === 'orders') {
    const filter: Record<string, unknown> = { userId };
    if (market) filter.market = market;
    const orders = (await Order.find(filter).sort({ placedAt: -1 }).limit(5000)).map(toOrderDto);

    return toCsv(
      [
        'Placed At',
        'Symbol',
        'Exchange',
        'Side',
        'Type',
        'Status',
        'Quantity',
        'Limit Price',
        'Fill Price',
        'Gross',
        'Fees',
        'Net',
        'Currency',
      ],
      orders.map((o) => [
        o.placedAt,
        o.symbol,
        o.exchange,
        o.side,
        o.type,
        o.status,
        o.quantity,
        o.limitPrice === null ? '' : formatMoney(o.limitPrice, o.currency, { symbol: false }),
        o.averageFillPrice === null
          ? ''
          : formatMoney(o.averageFillPrice, o.currency, { symbol: false }),
        o.grossAmount === null ? '' : formatMoney(o.grossAmount, o.currency, { symbol: false }),
        o.fees === null ? '' : formatMoney(o.fees.total, o.currency, { symbol: false }),
        o.netAmount === null ? '' : formatMoney(o.netAmount, o.currency, { symbol: false }),
        o.currency,
      ]),
    );
  }

  if (query.report === 'transactions') {
    const { records } = await getTransactions(userId, {
      page: 1,
      limit: 5000,
      ...(market ? { market } : {}),
    });

    return toCsv(
      [
        'Date',
        'Type',
        'Symbol',
        'Exchange',
        'Quantity',
        'Price',
        'Gross',
        'Brokerage',
        'STT',
        'Exchange Fee',
        'SEBI',
        'Stamp',
        'GST',
        'SEC Fee',
        'TAF',
        'Total Fees',
        'Net',
        'Cash After',
        'Realised P&L',
        'Currency',
      ],
      records.map((t) => [
        t.createdAt,
        t.type,
        t.symbol ?? '',
        t.exchange ?? '',
        t.quantity ?? '',
        t.price === null ? '' : formatMoney(t.price, t.currency, { symbol: false }),
        formatMoney(t.grossAmount, t.currency, { symbol: false }),
        formatMoney(t.fees.brokerage, t.currency, { symbol: false }),
        formatMoney(t.fees.stt, t.currency, { symbol: false }),
        formatMoney(t.fees.exchange, t.currency, { symbol: false }),
        formatMoney(t.fees.sebi, t.currency, { symbol: false }),
        formatMoney(t.fees.stamp, t.currency, { symbol: false }),
        formatMoney(t.fees.gst, t.currency, { symbol: false }),
        formatMoney(t.fees.secFee, t.currency, { symbol: false }),
        formatMoney(t.fees.taf, t.currency, { symbol: false }),
        formatMoney(t.fees.total, t.currency, { symbol: false }),
        formatMoney(t.netAmount, t.currency, { symbol: false }),
        formatMoney(t.cashAfter, t.currency, { symbol: false }),
        t.realisedPnl === null ? '' : formatMoney(t.realisedPnl, t.currency, { symbol: false }),
        t.currency,
      ]),
    );
  }

  // summary
  const overview = await getPortfolioOverview(userId, market);
  return toCsv(
    [
      'Market',
      'Currency',
      'Cash Available',
      'Cash Blocked',
      'Invested',
      'Holdings Value',
      'Total Value',
      'Unrealised P&L',
      'Realised P&L',
      'Fees Paid',
      'Day Change',
      'Overall Return',
      'Overall Return %',
    ],
    overview.wallets.map((w) => [
      w.market,
      w.currency,
      formatMoney(w.cashAvailable, w.currency, { symbol: false }),
      formatMoney(w.cashBlocked, w.currency, { symbol: false }),
      formatMoney(w.investedAmount, w.currency, { symbol: false }),
      formatMoney(w.holdingsValue, w.currency, { symbol: false }),
      formatMoney(w.totalValue, w.currency, { symbol: false }),
      formatMoney(w.unrealisedPnl, w.currency, { symbol: false }),
      formatMoney(w.realisedPnl, w.currency, { symbol: false }),
      formatMoney(w.totalFeesPaid, w.currency, { symbol: false }),
      formatMoney(w.dayChange, w.currency, { symbol: false }),
      formatMoney(w.overallReturn, w.currency, { symbol: false }),
      w.overallReturnPercent,
    ]),
  );
}

function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

async function buildPdf(
  userId: Types.ObjectId,
  query: ExportQuery,
  userName: string,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 44 });
  const overview = await getPortfolioOverview(userId, query.market);
  const stats = await getTradeStatistics(userId, query.market);

  doc.fontSize(18).text('Portfolio Report', { continued: false });
  doc.moveDown(0.2);
  doc.fontSize(9).fillColor('#666').text(`${userName}  |  Generated ${new Date().toUTCString()}`);
  doc.moveDown(0.6);

  // The disclaimer goes at the TOP, not buried in a footer: this document
  // could be printed or forwarded out of context.
  doc
    .fontSize(8)
    .fillColor('#a15c00')
    .text(
      'SIMULATED TRADING REPORT. All positions, prices, charges and profit figures are ' +
        'from a paper-trading simulation. No real money, real orders or real brokerage ' +
        'accounts are involved. Prices are delayed or simulated. Not investment or tax advice.',
      { width: 505 },
    );
  doc.moveDown(0.8);
  doc.fillColor('#000');

  for (const wallet of overview.wallets) {
    doc
      .fontSize(13)
      .text(`${wallet.market === 'IN' ? 'India' : 'United States'} wallet (${wallet.currency})`);
    doc.moveDown(0.3);
    doc.fontSize(9);

    const rows: [string, string][] = [
      ['Cash available', formatMoney(wallet.cashAvailable, wallet.currency)],
      ['Cash blocked (open orders)', formatMoney(wallet.cashBlocked, wallet.currency)],
      ['Invested', formatMoney(wallet.investedAmount, wallet.currency)],
      ['Holdings value', formatMoney(wallet.holdingsValue, wallet.currency)],
      ['Total value', formatMoney(wallet.totalValue, wallet.currency)],
      ['Unrealised P&L', formatMoney(wallet.unrealisedPnl, wallet.currency, { signed: true })],
      ['Realised P&L', formatMoney(wallet.realisedPnl, wallet.currency, { signed: true })],
      ['Charges paid', formatMoney(wallet.totalFeesPaid, wallet.currency)],
      [
        'Overall return',
        `${formatMoney(wallet.overallReturn, wallet.currency, { signed: true })} (${formatPercent(wallet.overallReturnPercent)})`,
      ],
    ];

    for (const [label, value] of rows) {
      doc.text(label, 50, doc.y, { continued: true, width: 300 });
      doc.text(value, { align: 'right', width: 200 });
    }

    if (wallet.hasStalePrices) {
      doc.moveDown(0.2);
      doc
        .fillColor('#a15c00')
        .fontSize(8)
        .text('Some holdings could not be priced; their values use the last known quote.');
      doc.fillColor('#000').fontSize(9);
    }

    doc.moveDown(0.8);
  }

  const holdings = await getHoldings(userId, query.market);
  if (holdings.length > 0) {
    doc.addPage();
    doc.fontSize(13).text('Holdings');
    doc.moveDown(0.4);
    doc.fontSize(8);

    const columns = [50, 115, 175, 235, 310, 385, 465];
    const headers = ['Symbol', 'Qty', 'Avg cost', 'Last price', 'Market value', 'Unrealised', '%'];
    headers.forEach((header, index) => {
      doc.text(header, columns[index] ?? 50, doc.y, { continued: index < headers.length - 1 });
    });
    doc.moveDown(0.3);

    for (const holding of holdings) {
      const y = doc.y;
      doc.text(holding.symbol, 50, y);
      doc.text(String(holding.quantity), 115, y);
      doc.text(formatMoney(holding.averageCost, holding.currency, { symbol: false }), 175, y);
      doc.text(
        holding.lastPrice === null
          ? 'stale'
          : formatMoney(holding.lastPrice, holding.currency, { symbol: false }),
        235,
        y,
      );
      doc.text(
        holding.marketValue === null
          ? '-'
          : formatMoney(holding.marketValue, holding.currency, { symbol: false }),
        310,
        y,
      );
      doc.text(
        holding.unrealisedPnl === null
          ? '-'
          : formatMoney(holding.unrealisedPnl, holding.currency, { signed: true, symbol: false }),
        385,
        y,
      );
      doc.text(
        holding.unrealisedPnlPercent === null ? '-' : formatPercent(holding.unrealisedPnlPercent),
        465,
        y,
      );
      doc.moveDown(0.25);

      if (doc.y > 760) doc.addPage();
    }
  }

  doc.addPage();
  doc.fontSize(13).text('Trading performance');
  doc.moveDown(0.4);
  doc.fontSize(9);

  const statRows: [string, string][] = [
    ['Total transactions', String(stats.totalTrades)],
    ['Buy / Sell', `${stats.buyTrades} / ${stats.sellTrades}`],
    ['Closed trades', String(stats.closedTrades)],
    ['Winning / Losing', `${stats.winningTrades} / ${stats.losingTrades}`],
    ['Win rate', formatPercent(stats.winRatePercent)],
    ['Profit factor', stats.profitFactor === null ? 'n/a' : String(stats.profitFactor)],
    ['Best trade', stats.bestTrade ? stats.bestTrade.symbol : 'n/a'],
    ['Worst trade', stats.worstTrade ? stats.worstTrade.symbol : 'n/a'],
  ];

  for (const [label, value] of statRows) {
    doc.text(label, 50, doc.y, { continued: true, width: 300 });
    doc.text(value, { align: 'right', width: 200 });
  }

  return pdfToBuffer(doc);
}
