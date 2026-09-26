import { Router } from 'express';
import {
  changePasswordSchema,
  demoLoginSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@smd/shared';
import { validateBody } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { blockDemoAccounts } from '../../middleware/authorize.js';
import { authLimiter, sensitiveLimiter } from '../../middleware/rateLimit.js';
import * as controller from './auth.controller.js';

export const authRouter: Router = Router();

// --- public ---------------------------------------------------------------

authRouter.post('/register', authLimiter, validateBody(registerSchema), controller.registerHandler);

authRouter.post('/login', authLimiter, validateBody(loginSchema), controller.loginHandler);

authRouter.post(
  '/demo-login',
  authLimiter,
  validateBody(demoLoginSchema),
  controller.demoLoginHandler,
);

/** Lists the demo accounts so the login screen can render role cards. */
authRouter.get('/demo-accounts', controller.demoAccountsHandler);

authRouter.post('/verify-email', validateBody(verifyEmailSchema), controller.verifyEmailHandler);

authRouter.post(
  '/resend-verification',
  sensitiveLimiter,
  validateBody(resendVerificationSchema),
  controller.resendVerificationHandler,
);

authRouter.post(
  '/forgot-password',
  sensitiveLimiter,
  validateBody(forgotPasswordSchema),
  controller.forgotPasswordHandler,
);

authRouter.post(
  '/reset-password',
  sensitiveLimiter,
  validateBody(resetPasswordSchema),
  controller.resetPasswordHandler,
);

/** Authenticated by the httpOnly cookie, not by a bearer token. */
authRouter.post('/refresh', controller.refreshHandler);

authRouter.post('/logout', controller.logoutHandler);

// --- authenticated --------------------------------------------------------

authRouter.get('/me', authenticate, controller.meHandler);

authRouter.post(
  '/change-password',
  authenticate,
  // Demo credentials are public; letting anyone change them would break the
  // demo for every other visitor.
  blockDemoAccounts('change the password'),
  validateBody(changePasswordSchema),
  controller.changePasswordHandler,
);
