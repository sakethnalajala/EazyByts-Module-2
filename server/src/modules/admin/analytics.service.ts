import { ROLES, type PlatformAnalytics, type Role } from '@smd/shared';
import { User } from '../users/user.model.js';
import { Order, Transaction } from '../orders/order.model.js';
import { Instrument } from '../instruments/instrument.model.js';
import { EducationResourceModel } from '../education/education.model.js';
import { NewsArticleModel } from '../news/news.model.js';
import { Watchlist } from '../watchlists/watchlist.model.js';
import { Alert } from '../alerts/alert.model.js';
import { Notification } from '../notifications/notification.model.js';

/**
 * Platform-wide KPIs for the admin dashboard.
 *
 * Built from aggregations rather than loading documents: these counts run over
 * the whole collection, and pulling every order into memory to count them would
 * not survive any realistic data volume.
 */
export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [
    totalUsers,
    activeUsers,
    pendingUsers,
    suspendedUsers,
    demoUsers,
    newUsers,
    roleCounts,
    totalOrders,
    filledOrders,
    pendingOrders,
    rejectedOrders,
    recentOrders,
    volumeByCurrency,
    instruments,
    activeInstruments,
    educationPublished,
    educationDrafts,
    newsArticles,
    watchlistAgg,
    activeAlerts,
    unreadNotifications,
    ordersTrendRaw,
    topSymbolsRaw,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: 'active' }),
    User.countDocuments({ status: 'pending' }),
    User.countDocuments({ status: 'suspended' }),
    User.countDocuments({ isDemo: true }),
    User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
    User.aggregate<{ _id: Role; count: number }>([
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
    Order.countDocuments(),
    Order.countDocuments({ status: 'FILLED' }),
    Order.countDocuments({ status: 'PENDING' }),
    Order.countDocuments({ status: 'REJECTED' }),
    Order.countDocuments({ placedAt: { $gte: dayAgo } }),
    Transaction.aggregate<{ _id: string; volume: number; fees: number }>([
      {
        $group: {
          _id: '$currency',
          volume: { $sum: '$grossAmount' },
          fees: { $sum: '$fees.total' },
        },
      },
    ]),
    Instrument.countDocuments(),
    Instrument.countDocuments({ isActive: true }),
    EducationResourceModel.countDocuments({ status: 'published' }),
    EducationResourceModel.countDocuments({ status: 'draft' }),
    NewsArticleModel.countDocuments(),
    Watchlist.aggregate<{ _id: null; total: number }>([
      { $project: { count: { $size: '$items' } } },
      { $group: { _id: null, total: { $sum: '$count' } } },
    ]),
    Alert.countDocuments({ status: 'ACTIVE' }),
    Notification.countDocuments({ readAt: null }),
    Order.aggregate<{ _id: string; orders: number; filled: number }>([
      { $match: { placedAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } },
          orders: { $sum: 1 },
          filled: { $sum: { $cond: [{ $eq: ['$status', 'FILLED'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate<{ _id: { symbol: string; exchange: string }; orders: number }>([
      { $group: { _id: { symbol: '$symbol', exchange: '$exchange' }, orders: { $sum: 1 } } },
      { $sort: { orders: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const byRole = Object.fromEntries(ROLES.map((role) => [role, 0])) as Record<Role, number>;
  for (const row of roleCounts) byRole[row._id] = row.count;

  const inr = volumeByCurrency.find((row) => row._id === 'INR');
  const usd = volumeByCurrency.find((row) => row._id === 'USD');

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      pending: pendingUsers,
      suspended: suspendedUsers,
      demo: demoUsers,
      newLast7Days: newUsers,
      byRole,
    },
    trading: {
      totalOrders,
      filledOrders,
      pendingOrders,
      rejectedOrders,
      ordersLast24h: recentOrders,
      totalVolumeInr: inr?.volume ?? 0,
      totalVolumeUsd: usd?.volume ?? 0,
      totalFeesInr: inr?.fees ?? 0,
      totalFeesUsd: usd?.fees ?? 0,
    },
    content: {
      instruments,
      activeInstruments,
      educationPublished,
      educationDrafts,
      newsArticles,
    },
    engagement: {
      watchlistItems: watchlistAgg[0]?.total ?? 0,
      activeAlerts,
      unreadNotifications,
    },
    ordersTrend: ordersTrendRaw.map((row) => ({
      date: row._id,
      orders: row.orders,
      filled: row.filled,
    })),
    topTradedSymbols: topSymbolsRaw.map((row) => ({
      symbol: row._id.symbol,
      exchange: row._id.exchange,
      orders: row.orders,
    })),
  };
}
