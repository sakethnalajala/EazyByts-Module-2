import type { Request, Response } from 'express';
import type { ListOrdersQuery, PlaceOrderInput } from '@smd/shared';
import { ApiError } from '../../utils/ApiError.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import { body, params, query } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { Order } from './order.model.js';
import {
  cancelOrder,
  placeOrder,
  previewOrder,
  toOrderDto,
} from '../../services/trading/orders.service.js';
import { notifyOrderEvent } from '../notifications/notification.service.js';
import { triggerOpportunisticMatch } from '../../workers/orderMatcher.js';

/** Header carrying the client's idempotency key. */
const IDEMPOTENCY_HEADER = 'idempotency-key';

function readIdempotencyKey(req: Request): string | undefined {
  const raw = req.headers[IDEMPOTENCY_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;

  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 100) {
    throw ApiError.badRequest('Idempotency-Key must be between 8 and 100 characters.');
  }
  return trimmed;
}

export async function previewOrderHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const preview = await previewOrder(auth.user._id, body<PlaceOrderInput>(req));
  sendSuccess(res, preview);
}

export async function placeOrderHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const idempotencyKey = readIdempotencyKey(req);

  const { order, duplicate } = await placeOrder(auth.user._id, body<PlaceOrderInput>(req), {
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });

  if (!duplicate && order.status === 'FILLED') {
    const doc = await Order.findById(order.id);
    if (doc) await notifyOrderEvent(doc, 'ORDER_FILLED');
  }

  // Settles any resting orders that became fillable while the free-tier host
  // was asleep. Fire-and-forget; it never delays this response.
  triggerOpportunisticMatch();

  // 200 rather than 201 on a replay: nothing new was created.
  sendSuccess(res, { order, duplicate }, duplicate ? 200 : 201);
}

export async function listOrdersHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { page, limit, status, side, market, symbol } = query<ListOrdersQuery>(req);

  const filter: Record<string, unknown> = { userId: auth.user._id };
  if (status) filter.status = status;
  if (side) filter.side = side;
  if (market) filter.market = market;
  if (symbol) filter.symbol = symbol;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ placedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);

  sendPaginated(res, orders.map(toOrderDto), { page, limit, total });
}

export async function getOrderHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { id } = params<{ id: string }>(req);

  // Scoped by userId, so one user can never read another's order by guessing
  // an id.
  const order = await Order.findOne({ _id: id, userId: auth.user._id });
  if (!order) throw ApiError.notFound('Order not found.');

  sendSuccess(res, toOrderDto(order));
}

export async function cancelOrderHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { id } = params<{ id: string }>(req);

  const order = await cancelOrder(auth.user._id, id);

  const doc = await Order.findById(order.id);
  if (doc) await notifyOrderEvent(doc, 'ORDER_CANCELLED');

  sendSuccess(res, order);
}
