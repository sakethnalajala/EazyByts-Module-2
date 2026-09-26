import { Router } from 'express';
import { healthRouter } from '../modules/health/health.route.js';
import { authRouter } from '../modules/auth/auth.route.js';
import { userRouter } from '../modules/users/user.route.js';
import { marketRouter } from '../modules/market/market.route.js';
import { orderRouter } from '../modules/orders/order.route.js';
import { portfolioRouter } from '../modules/portfolios/portfolio.route.js';
import { watchlistRouter } from '../modules/watchlists/watchlist.route.js';
import { alertRouter } from '../modules/alerts/alert.route.js';
import { notificationRouter } from '../modules/notifications/notification.route.js';
import { educationRouter } from '../modules/education/education.route.js';
import { adminRouter } from '../modules/admin/admin.route.js';
import { superAdminRouter } from '../modules/admin/superAdmin.route.js';
import { SERVICE_NAME, SERVICE_VERSION } from '../constants/app.js';
import { sendSuccess } from '../utils/response.js';

/**
 * The v1 API surface. Feature routers are mounted here as each milestone lands.
 */
export const apiRouter: Router = Router();

apiRouter.use(healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/market', marketRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/portfolio', portfolioRouter);
apiRouter.use('/watchlists', watchlistRouter);
apiRouter.use('/alerts', alertRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/education', educationRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/super-admin', superAdminRouter);

apiRouter.get('/', (_req, res) => {
  sendSuccess(res, {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    documentation: '/api/v1/health',
    notice: 'Simulated trading platform. No real money or real orders are involved.',
    endpoints: [
      '/api/v1/health',
      '/api/v1/ready',
      '/api/v1/auth',
      '/api/v1/users',
      '/api/v1/market',
      '/api/v1/orders',
      '/api/v1/portfolio',
      '/api/v1/watchlists',
      '/api/v1/alerts',
      '/api/v1/notifications',
      '/api/v1/education',
      '/api/v1/admin',
      '/api/v1/super-admin',
    ],
  });
});
