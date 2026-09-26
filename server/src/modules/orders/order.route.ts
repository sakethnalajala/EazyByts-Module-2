import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS, listOrdersQuerySchema, placeOrderSchema } from '@smd/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { tradingLimiter } from '../../middleware/rateLimit.js';
import * as controller from './order.controller.js';

export const orderRouter: Router = Router();

const objectIdParam = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid order id.'),
});

orderRouter.use(authenticate);

/** Costs an order without placing it. Read-only, so no trading limit. */
orderRouter.post(
  '/preview',
  requirePermission(PERMISSIONS.ORDER_CREATE),
  validateBody(placeOrderSchema),
  controller.previewOrderHandler,
);

/**
 * Places an order.
 *
 * Send an `Idempotency-Key` header: a repeated submission with the same key
 * returns the original order instead of creating a second one.
 */
orderRouter.post(
  '/',
  tradingLimiter,
  requirePermission(PERMISSIONS.ORDER_CREATE),
  validateBody(placeOrderSchema),
  controller.placeOrderHandler,
);

orderRouter.get(
  '/',
  requirePermission(PERMISSIONS.ORDER_READ),
  validateQuery(listOrdersQuerySchema),
  controller.listOrdersHandler,
);

orderRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.ORDER_READ),
  validateParams(objectIdParam),
  controller.getOrderHandler,
);

orderRouter.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.ORDER_CANCEL),
  validateParams(objectIdParam),
  controller.cancelOrderHandler,
);
