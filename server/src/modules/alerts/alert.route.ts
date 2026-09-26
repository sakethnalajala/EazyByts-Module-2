import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  createAlertSchema,
  listAlertsQuerySchema,
  toMinor,
  type CreateAlertInput,
  type PriceAlert,
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
import { Alert, type AlertDocument } from './alert.model.js';
import { Instrument } from '../instruments/instrument.model.js';

export const alertRouter: Router = Router();

alertRouter.use(authenticate, requirePermission(PERMISSIONS.ALERT_MANAGE));

const idParam = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid alert id.'),
});

const MAX_ACTIVE_ALERTS = 50;

function toDto(doc: AlertDocument, currency: 'INR' | 'USD'): PriceAlert {
  return {
    id: doc._id.toString(),
    symbol: doc.symbol,
    exchange: doc.exchange,
    instrumentName: doc.instrumentName,
    currency,
    condition: doc.condition,
    threshold: doc.threshold,
    status: doc.status,
    repeat: doc.repeat,
    note: doc.note,
    createdAt: doc.createdAt.toISOString(),
    triggeredAt: doc.triggeredAt?.toISOString() ?? null,
    triggeredPrice: doc.triggeredPrice,
    lastCheckedAt: doc.lastCheckedAt?.toISOString() ?? null,
  };
}

async function hydrateMany(docs: AlertDocument[]): Promise<PriceAlert[]> {
  const instruments = await Instrument.find({
    _id: { $in: docs.map((doc) => doc.instrumentId) },
  }).lean();
  const currencyById = new Map(instruments.map((i) => [i._id.toString(), i.currency]));

  return docs.map((doc) => toDto(doc, currencyById.get(doc.instrumentId.toString()) ?? 'INR'));
}

alertRouter.get('/', validateQuery(listAlertsQuerySchema), async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const { page, limit, status } = query<{ page: number; limit: number; status?: string }>(req);

  const filter: Record<string, unknown> = { userId: auth.user._id };
  if (status) filter.status = status;

  const [docs, total] = await Promise.all([
    Alert.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Alert.countDocuments(filter),
  ]);

  sendPaginated(res, await hydrateMany(docs), { page, limit, total });
});

alertRouter.post('/', validateBody(createAlertSchema), async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const input = body<CreateAlertInput>(req);

  const instrument = await Instrument.findOne({
    symbol: input.symbol,
    exchange: input.exchange,
    isActive: true,
  });
  if (!instrument) {
    throw ApiError.notFound(`${input.symbol} is not available on ${input.exchange}.`);
  }

  const activeCount = await Alert.countDocuments({ userId: auth.user._id, status: 'ACTIVE' });
  if (activeCount >= MAX_ACTIVE_ALERTS) {
    throw ApiError.badRequest(`You can have at most ${MAX_ACTIVE_ALERTS} active alerts.`);
  }

  // Price thresholds arrive in major units and are stored in minor units, like
  // every other price. Percentage thresholds are stored as-is.
  const threshold = input.condition.startsWith('PRICE_')
    ? toMinor(input.threshold)
    : input.threshold;

  const doc = await Alert.create({
    userId: auth.user._id,
    instrumentId: instrument._id,
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    instrumentName: instrument.name,
    condition: input.condition,
    threshold,
    repeat: input.repeat,
    note: input.note ?? null,
    status: 'ACTIVE',
  });

  sendSuccess(res, toDto(doc, instrument.currency), 201);
});

alertRouter.get('/:id', validateParams(idParam), async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const { id } = params<{ id: string }>(req);

  const doc = await Alert.findOne({ _id: id, userId: auth.user._id });
  if (!doc) throw ApiError.notFound('Alert not found.');

  const [dto] = await hydrateMany([doc]);
  sendSuccess(res, dto);
});

/** Cancels rather than deletes, so triggered history is preserved. */
alertRouter.post('/:id/cancel', validateParams(idParam), async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const { id } = params<{ id: string }>(req);

  const doc = await Alert.findOne({ _id: id, userId: auth.user._id });
  if (!doc) throw ApiError.notFound('Alert not found.');

  if (doc.status === 'CANCELLED') {
    throw ApiError.badRequest('This alert is already cancelled.');
  }

  doc.status = 'CANCELLED';
  await doc.save();

  const [dto] = await hydrateMany([doc]);
  sendSuccess(res, dto);
});

alertRouter.delete('/:id', validateParams(idParam), async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const { id } = params<{ id: string }>(req);

  const result = await Alert.deleteOne({ _id: id, userId: auth.user._id });
  if (result.deletedCount === 0) throw ApiError.notFound('Alert not found.');

  sendSuccess(res, { deleted: true });
});
