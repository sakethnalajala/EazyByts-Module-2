import { Router, type Request, type Response } from 'express';
import {
  PERMISSIONS,
  exportQuerySchema,
  listTransactionsQuerySchema,
  performanceQuerySchema,
  portfolioQuerySchema,
  type ExportQuery,
  type ListTransactionsQuery,
  type Market,
  type PerformanceQuery,
} from '@smd/shared';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { query, validateQuery } from '../../middleware/validate.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import {
  getAllocation,
  getHoldings,
  getPortfolioOverview,
  getTradeStatistics,
  getTransactions,
} from '../../services/trading/portfolio.service.js';
import { getPerformanceSeries } from '../../services/trading/snapshots.service.js';
import { buildExport } from '../../services/reports/export.service.js';

export const portfolioRouter: Router = Router();

portfolioRouter.use(authenticate, requirePermission(PERMISSIONS.PORTFOLIO_READ));

/** Both wallets, valued live, plus the indicative combined figure. */
portfolioRouter.get(
  '/',
  validateQuery(portfolioQuerySchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { market } = query<{ market?: Market }>(req);
    sendSuccess(res, await getPortfolioOverview(auth.user._id, market));
  },
);

portfolioRouter.get(
  '/holdings',
  validateQuery(portfolioQuerySchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { market } = query<{ market?: Market }>(req);
    sendSuccess(res, { holdings: await getHoldings(auth.user._id, market) });
  },
);

portfolioRouter.get(
  '/transactions',
  validateQuery(listTransactionsQuerySchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const q = query<ListTransactionsQuery>(req);
    const { records, total } = await getTransactions(auth.user._id, q);
    sendPaginated(res, records, { page: q.page, limit: q.limit, total });
  },
);

portfolioRouter.get(
  '/analytics/summary',
  validateQuery(portfolioQuerySchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { market } = query<{ market?: Market }>(req);

    const [overview, statistics] = await Promise.all([
      getPortfolioOverview(auth.user._id, market),
      getTradeStatistics(auth.user._id, market),
    ]);

    sendSuccess(res, { overview, statistics });
  },
);

portfolioRouter.get(
  '/analytics/allocation',
  validateQuery(portfolioQuerySchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { market } = query<{ market?: Market }>(req);
    sendSuccess(res, await getAllocation(auth.user._id, market));
  },
);

portfolioRouter.get(
  '/analytics/performance',
  validateQuery(performanceQuerySchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { market, range } = query<PerformanceQuery>(req);
    const series = await getPerformanceSeries(auth.user._id, range, market);

    sendSuccess(res, {
      series,
      range,
      note:
        'Daily points are recorded as they occur; historical valuation cannot be ' +
        'reconstructed retroactively from free market data.',
    });
  },
);

portfolioRouter.get(
  '/analytics/trades',
  validateQuery(portfolioQuerySchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { market } = query<{ market?: Market }>(req);
    sendSuccess(res, await getTradeStatistics(auth.user._id, market));
  },
);

/** CSV or PDF download. Streams as an attachment. */
portfolioRouter.get(
  '/export',
  validateQuery(exportQuerySchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const q = query<ExportQuery>(req);

    const result = await buildExport(
      auth.user._id,
      q,
      `${auth.user.firstName} ${auth.user.lastName}`,
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.body);
  },
);
