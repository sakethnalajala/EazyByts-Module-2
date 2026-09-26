import type { Types } from 'mongoose';
import {
  formatMoney,
  type Notification as NotificationDto,
  type NotificationType,
} from '@smd/shared';
import { logger } from '../../config/logger.js';
import { Notification, type NotificationDocument } from './notification.model.js';
import type { OrderDocument } from '../orders/order.model.js';
import type { AlertDocument } from '../alerts/alert.model.js';
import { emitToUser } from '../../services/realtime/gateway.js';

export function toNotificationDto(doc: NotificationDocument): NotificationDto {
  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title,
    body: doc.body,
    data: doc.data,
    read: doc.readAt !== null,
    readAt: doc.readAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}

export interface CreateNotificationInput {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Persists a notification and pushes it over Socket.IO.
 *
 * Persist-then-push, in that order: the in-app feed is the source of truth and
 * the socket is best-effort delivery. A disconnected user must still find the
 * notification waiting when they return.
 */
export async function createNotification(input: CreateNotificationInput): Promise<NotificationDto> {
  const doc = await Notification.create({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    data: input.data ?? {},
  });

  const dto = toNotificationDto(doc);

  try {
    emitToUser(input.userId.toString(), 'notification:new', dto);
  } catch (error) {
    // Push failure is not a data failure; the row is already stored.
    logger.debug({ err: error }, 'Realtime notification push failed');
  }

  return dto;
}

/** Order lifecycle notification, with the money formatted for display. */
export async function notifyOrderEvent(
  order: OrderDocument,
  type: Extract<
    NotificationType,
    'ORDER_FILLED' | 'ORDER_REJECTED' | 'ORDER_CANCELLED' | 'ORDER_EXPIRED'
  >,
): Promise<void> {
  const quantity = order.quantity;
  const verb = order.side === 'BUY' ? 'Buy' : 'Sell';

  const titles: Record<typeof type, string> = {
    ORDER_FILLED: `${verb} order filled: ${order.symbol}`,
    ORDER_REJECTED: `${verb} order rejected: ${order.symbol}`,
    ORDER_CANCELLED: `${verb} order cancelled: ${order.symbol}`,
    ORDER_EXPIRED: `${verb} order expired: ${order.symbol}`,
  };

  let body: string;
  if (type === 'ORDER_FILLED' && order.averageFillPrice !== null) {
    body =
      `${quantity} share(s) of ${order.symbol} at ` +
      `${formatMoney(order.averageFillPrice, order.currency)} ` +
      `(net ${formatMoney(order.netAmount ?? 0, order.currency)}, charges included).`;
  } else if (type === 'ORDER_REJECTED') {
    body = order.rejectReason ?? `Your ${order.side.toLowerCase()} order could not be placed.`;
  } else if (type === 'ORDER_EXPIRED') {
    body = `Your ${order.validity} order for ${quantity} ${order.symbol} expired before it could fill. Reserved funds have been returned.`;
  } else {
    body = `Your order for ${quantity} ${order.symbol} was cancelled and any reserved funds released.`;
  }

  await createNotification({
    userId: order.userId,
    type,
    title: titles[type],
    body,
    data: {
      orderId: order._id.toString(),
      symbol: order.symbol,
      exchange: order.exchange,
      side: order.side,
      status: order.status,
    },
  });

  // Lets an open Orders page refresh itself without polling.
  emitToUser(order.userId.toString(), 'order:updated', {
    orderId: order._id.toString(),
    status: order.status,
    symbol: order.symbol,
  });
}

/** Price-alert notification. */
export async function notifyAlertTriggered(
  alert: AlertDocument,
  price: number,
  currency: 'INR' | 'USD',
): Promise<void> {
  const conditionText: Record<string, string> = {
    PRICE_ABOVE: `rose above ${formatMoney(alert.threshold, currency)}`,
    PRICE_BELOW: `fell below ${formatMoney(alert.threshold, currency)}`,
    PCT_CHANGE_UP: `gained more than ${alert.threshold}% today`,
    PCT_CHANGE_DOWN: `dropped more than ${Math.abs(alert.threshold)}% today`,
  };

  await createNotification({
    userId: alert.userId,
    type: 'ALERT_TRIGGERED',
    title: `Price alert: ${alert.symbol}`,
    body: `${alert.instrumentName} ${conditionText[alert.condition] ?? 'met your condition'}. Now trading at ${formatMoney(price, currency)}.`,
    data: {
      alertId: alert._id.toString(),
      symbol: alert.symbol,
      exchange: alert.exchange,
      price,
      condition: alert.condition,
    },
  });

  emitToUser(alert.userId.toString(), 'alert:triggered', {
    alertId: alert._id.toString(),
    symbol: alert.symbol,
    price,
  });
}
