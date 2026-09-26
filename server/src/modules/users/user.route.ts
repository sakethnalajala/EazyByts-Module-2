import { Router, type Request, type Response } from 'express';
import {
  updatePreferencesSchema,
  updateProfileSchema,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
} from '@smd/shared';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { blockDemoAccounts } from '../../middleware/authorize.js';
import { body, validateBody } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/response.js';
import { toPublicUser } from '../auth/auth.service.js';

export const userRouter: Router = Router();

userRouter.use(authenticate);

/** Profile name changes. Demo accounts are read-only here. */
userRouter.patch(
  '/profile',
  blockDemoAccounts('edit the profile'),
  validateBody(updateProfileSchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const input = body<UpdateProfileInput>(req);

    if (input.firstName !== undefined) auth.user.firstName = input.firstName;
    if (input.lastName !== undefined) auth.user.lastName = input.lastName;
    await auth.user.save();

    sendSuccess(res, { user: await toPublicUser(auth.user) });
  },
);

/**
 * Preferences, including dashboard widget layout.
 *
 * Demo accounts CAN change these - a reviewer should be able to rearrange
 * widgets and flip the theme. They are reset by the nightly demo job.
 */
userRouter.patch(
  '/preferences',
  validateBody(updatePreferencesSchema),
  async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const input = body<UpdatePreferencesInput>(req);

    if (input.theme !== undefined) auth.user.preferences.theme = input.theme;
    if (input.defaultMarket !== undefined)
      auth.user.preferences.defaultMarket = input.defaultMarket;
    if (input.emailNotifications !== undefined) {
      auth.user.preferences.emailNotifications = input.emailNotifications;
    }
    if (input.widgets !== undefined) {
      auth.user.preferences.widgets = input.widgets.map((widget) => ({
        id: widget.id,
        visible: widget.visible,
        order: widget.order,
      }));
    }

    auth.user.markModified('preferences');
    await auth.user.save();

    sendSuccess(res, { user: await toPublicUser(auth.user) });
  },
);
