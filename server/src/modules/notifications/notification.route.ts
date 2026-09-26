import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PERMISSIONS, listNotificationsQuerySchema, type NotificationType } from '@smd/shared';
import { ApiError } from '../../utils/ApiError.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { params, query, validateParams, validateQuery } from '../../middleware/validate.js';
import { Notification } from './notification.model.js';
import { toNotificationDto } from './notification.service.js';

export const notificationRouter: Router = Router();

notificationRouter.use(authenticate, requirePermission(PERMISSIONS.NOTIFICATION_READ));

const idParam = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid notification id.'),
});

notificationRouter.get(
  '/',
  validateQuery(listNotificationsQuerySchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { page, limit, unreadOnly, type } = query<{
      page: number;
      limit: number;
      unreadOnly: boolean;
      type?: NotificationType;
    }>(req);

    const filter: Record<string, unknown> = { userId: auth.user._id };
    if (unreadOnly) filter.readAt = null;
    if (type) filter.type = type;

    const [docs, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Notification.countDocuments(filter),
    ]);

    sendPaginated(res, docs.map(toNotificationDto), { page, limit, total });
  },
);

/** Drives the bell badge. Kept separate so it stays a cheap count query. */
notificationRouter.get('/unread-count', async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const count = await Notification.countDocuments({ userId: auth.user._id, readAt: null });
  sendSuccess(res, { count });
});

notificationRouter.patch('/read-all', async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const result = await Notification.updateMany(
    { userId: auth.user._id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  sendSuccess(res, { marked: result.modifiedCount });
});

notificationRouter.patch(
  '/:id/read',
  validateParams(idParam),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { id } = params<{ id: string }>(req);

    const doc = await Notification.findOne({ _id: id, userId: auth.user._id });
    if (!doc) throw ApiError.notFound('Notification not found.');

    // Idempotent: re-reading an already-read notification is not an error.
    doc.readAt ??= new Date();
    await doc.save();

    sendSuccess(res, toNotificationDto(doc));
  },
);

notificationRouter.delete('/:id', validateParams(idParam), async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const { id } = params<{ id: string }>(req);

  const result = await Notification.deleteOne({ _id: id, userId: auth.user._id });
  if (result.deletedCount === 0) throw ApiError.notFound('Notification not found.');

  sendSuccess(res, { deleted: true });
});
