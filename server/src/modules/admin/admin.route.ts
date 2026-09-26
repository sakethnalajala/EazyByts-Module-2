import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  listAdminTradesQuerySchema,
  listUsersQuerySchema,
  updateUserStatusSchema,
  upsertInstrumentSchema,
  toMinor,
  type AdminTradeRow,
  type AdminUserRow,
  type Role,
  type UpsertInstrumentInput,
  type UserStatus,
} from '@smd/shared';
import { ApiError } from '../../utils/ApiError.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import {
  body,
  params,
  query,
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js';
import { User } from '../users/user.model.js';
import { Order } from '../orders/order.model.js';
import { Portfolio } from '../portfolios/portfolio.model.js';
import { Instrument } from '../instruments/instrument.model.js';
import { toInstrumentDto } from '../market/market.controller.js';
import { logoutAllSessions } from '../auth/auth.service.js';
import { recordAudit } from './audit.service.js';
import { getPlatformAnalytics } from './analytics.service.js';
import { toProviderSymbol } from '../../db/instruments.data.js';

export const adminRouter: Router = Router();

adminRouter.use(authenticate);

const idParam = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id.') });

// ---------------------------------------------------------------- user admin

adminRouter.get(
  '/users',
  requirePermission(PERMISSIONS.USER_READ),
  validateQuery(listUsersQuerySchema),
  async (req: Request, res: Response) => {
    const { page, limit, role, status, q } = query<{
      page: number;
      limit: number;
      role?: Role;
      status?: UserStatus;
      q?: string;
    }>(req);

    const filter: Record<string, unknown> = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (q) {
      const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ email: pattern }, { firstName: pattern }, { lastName: pattern }];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    // Aggregate per-user figures in two queries rather than 2N.
    const userIds = users.map((user) => user._id);
    const [orderCounts, portfolios] = await Promise.all([
      Order.aggregate<{ _id: (typeof userIds)[number]; count: number }>([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]),
      Portfolio.find({ userId: { $in: userIds } }).lean(),
    ]);

    const ordersByUser = new Map(orderCounts.map((row) => [row._id.toString(), row.count]));
    const walletsByUser = new Map<string, { inr: number; usd: number }>();
    for (const portfolio of portfolios) {
      const key = portfolio.userId.toString();
      const entry = walletsByUser.get(key) ?? { inr: 0, usd: 0 };
      if (portfolio.currency === 'INR')
        entry.inr += portfolio.cashAvailable + portfolio.cashBlocked;
      else entry.usd += portfolio.cashAvailable + portfolio.cashBlocked;
      walletsByUser.set(key, entry);
    }

    const rows: AdminUserRow[] = users.map((user) => {
      const wallets = walletsByUser.get(user.id) ?? { inr: 0, usd: 0 };
      return {
        id: user.id,
        email: user.email,
        fullName: `${user.firstName} ${user.lastName}`,
        role: user.role,
        status: user.status,
        isDemo: user.isDemo,
        emailVerified: user.emailVerifiedAt !== null,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        orderCount: ordersByUser.get(user.id) ?? 0,
        portfolioValueInr: wallets.inr,
        portfolioValueUsd: wallets.usd,
      };
    });

    sendPaginated(res, rows, { page, limit, total });
  },
);

adminRouter.patch(
  '/users/:id/status',
  requirePermission(PERMISSIONS.USER_MANAGE),
  validateParams(idParam),
  validateBody(updateUserStatusSchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { id } = params<{ id: string }>(req);
    const { status, reason } = body<{ status: UserStatus; reason?: string }>(req);

    const target = await User.findById(id);
    if (!target) throw ApiError.notFound('User not found.');

    // Guard rails that prevent an admin locking out the platform or themselves.
    if (target.id === auth.userId) {
      throw ApiError.badRequest('You cannot change your own account status.');
    }
    if (target.isDemo) {
      throw ApiError.badRequest('Demo accounts cannot be suspended; they are shared and public.');
    }
    if (target.role === 'super_admin' && auth.role !== 'super_admin') {
      throw ApiError.forbidden('Only a Super Admin can change another Super Admin.');
    }

    const before = target.status;
    target.status = status;
    await target.save();

    // A suspended user must lose access immediately, not at token expiry.
    if (status === 'suspended') await logoutAllSessions(target.id);

    await recordAudit(req, {
      action: 'user.status',
      targetType: 'User',
      targetId: target.id,
      summary: `Changed ${target.email} status from ${before} to ${status}${reason ? `: ${reason}` : ''}`,
      before: { status: before },
      after: { status },
    });

    sendSuccess(res, { id: target.id, email: target.email, status: target.status });
  },
);

// ------------------------------------------------------------ trade monitoring

adminRouter.get(
  '/orders',
  requirePermission(PERMISSIONS.TRADE_MONITOR),
  validateQuery(listAdminTradesQuerySchema),
  async (req: Request, res: Response) => {
    const { page, limit, status, market, userId } = query<{
      page: number;
      limit: number;
      status?: string;
      market?: 'IN' | 'US';
      userId?: string;
    }>(req);

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (market) filter.market = market;
    if (userId && /^[0-9a-fA-F]{24}$/.test(userId)) filter.userId = userId;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ placedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Order.countDocuments(filter),
    ]);

    const users = await User.find({ _id: { $in: orders.map((o) => o.userId) } }).lean();
    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    const rows: AdminTradeRow[] = orders.map((order) => {
      const user = userById.get(order.userId.toString());
      return {
        id: order._id.toString(),
        userEmail: user?.email ?? 'unknown',
        userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown user',
        symbol: order.symbol,
        exchange: order.exchange,
        side: order.side,
        type: order.type,
        status: order.status,
        quantity: order.quantity,
        price: order.averageFillPrice ?? order.limitPrice,
        netAmount: order.netAmount,
        currency: order.currency,
        placedAt: order.placedAt.toISOString(),
      };
    });

    sendPaginated(res, rows, { page, limit, total });
  },
);

// ------------------------------------------------------------------ analytics

adminRouter.get(
  '/analytics',
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  async (_req: Request, res: Response) => {
    sendSuccess(res, await getPlatformAnalytics());
  },
);

// ---------------------------------------------------------------- instruments

adminRouter.get(
  '/instruments',
  requirePermission(PERMISSIONS.INSTRUMENT_MANAGE),
  validateQuery(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      q: z.string().trim().max(60).optional(),
    }),
  ),
  async (req: Request, res: Response) => {
    const { page, limit, q } = query<{ page: number; limit: number; q?: string }>(req);

    const filter: Record<string, unknown> = {};
    if (q) {
      const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ symbol: pattern }, { name: pattern }];
    }

    const [instruments, total] = await Promise.all([
      Instrument.find(filter)
        .sort({ symbol: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Instrument.countDocuments(filter),
    ]);

    sendPaginated(res, instruments.map(toInstrumentDto), { page, limit, total });
  },
);

adminRouter.post(
  '/instruments',
  requirePermission(PERMISSIONS.INSTRUMENT_MANAGE),
  validateBody(upsertInstrumentSchema.extend({ referencePrice: z.coerce.number().positive() })),
  async (req: Request, res: Response) => {
    const input = body<UpsertInstrumentInput & { referencePrice: number }>(req);

    const exists = await Instrument.findOne({ symbol: input.symbol, exchange: input.exchange });
    if (exists) {
      throw ApiError.conflict('CONFLICT', `${input.symbol} already exists on ${input.exchange}.`);
    }

    const market = input.exchange === 'NSE' || input.exchange === 'BSE' ? 'IN' : 'US';

    const instrument = await Instrument.create({
      symbol: input.symbol,
      exchange: input.exchange,
      market,
      currency: market === 'IN' ? 'INR' : 'USD',
      name: input.name,
      sector: input.sector ?? null,
      industry: input.industry ?? null,
      providerSymbol: input.providerSymbol ?? toProviderSymbol(input.symbol, input.exchange),
      isActive: input.isActive,
      referencePrice: toMinor(input.referencePrice),
    });

    await recordAudit(req, {
      action: 'instrument.create',
      targetType: 'Instrument',
      targetId: instrument._id.toString(),
      summary: `Added ${instrument.symbol} on ${instrument.exchange}`,
    });

    sendSuccess(res, toInstrumentDto(instrument), 201);
  },
);

adminRouter.patch(
  '/instruments/:id',
  requirePermission(PERMISSIONS.INSTRUMENT_MANAGE),
  validateParams(idParam),
  validateBody(
    upsertInstrumentSchema
      .partial()
      .extend({ referencePrice: z.coerce.number().positive().optional() }),
  ),
  async (req: Request, res: Response) => {
    const { id } = params<{ id: string }>(req);
    const input = body<Partial<UpsertInstrumentInput> & { referencePrice?: number }>(req);

    const instrument = await Instrument.findById(id);
    if (!instrument) throw ApiError.notFound('Instrument not found.');

    const before = { name: instrument.name, isActive: instrument.isActive };

    if (input.name !== undefined) instrument.name = input.name;
    if (input.sector !== undefined) instrument.sector = input.sector;
    if (input.industry !== undefined) instrument.industry = input.industry;
    if (input.providerSymbol !== undefined) instrument.providerSymbol = input.providerSymbol;
    if (input.isActive !== undefined) instrument.isActive = input.isActive;
    if (input.referencePrice !== undefined)
      instrument.referencePrice = toMinor(input.referencePrice);

    await instrument.save();

    await recordAudit(req, {
      action: 'instrument.update',
      targetType: 'Instrument',
      targetId: id,
      summary: `Updated ${instrument.symbol} on ${instrument.exchange}`,
      before,
      after: { name: instrument.name, isActive: instrument.isActive },
    });

    sendSuccess(res, toInstrumentDto(instrument));
  },
);

adminRouter.delete(
  '/instruments/:id',
  requirePermission(PERMISSIONS.INSTRUMENT_MANAGE),
  validateParams(idParam),
  async (req: Request, res: Response) => {
    const { id } = params<{ id: string }>(req);

    const instrument = await Instrument.findById(id);
    if (!instrument) throw ApiError.notFound('Instrument not found.');

    // Deactivated rather than deleted: orders and holdings reference it, and
    // removing the row would orphan a user's trade history.
    instrument.isActive = false;
    await instrument.save();

    await recordAudit(req, {
      action: 'instrument.deactivate',
      targetType: 'Instrument',
      targetId: id,
      summary: `Deactivated ${instrument.symbol} on ${instrument.exchange}`,
    });

    sendSuccess(res, {
      deactivated: true,
      note: 'Instruments are deactivated rather than deleted so existing trade history stays intact.',
    });
  },
);
