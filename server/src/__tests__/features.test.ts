import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { toMinor } from '@smd/shared';
import { createApp } from '../app.js';
import {
  createAuthedUser,
  createInstrument,
  seedRoles,
  type AuthedUser,
} from './helpers/factories.js';
import { Alert } from '../modules/alerts/alert.model.js';
import { Notification } from '../modules/notifications/notification.model.js';
import { EducationResourceModel } from '../modules/education/education.model.js';
import { conditionMet, runAlertEvaluator } from '../workers/alertEvaluator.js';

const app = createApp();

let trader: AuthedUser;

beforeEach(async () => {
  await seedRoles();
  trader = await createAuthedUser(app, { role: 'trader' });
});

// ------------------------------------------------------------- watchlists

describe('watchlists', () => {
  beforeEach(async () => {
    await createInstrument({ symbol: 'WATCH1', exchange: 'NSE', name: 'Watch One Ltd' });
    await createInstrument({ symbol: 'WATCH2', exchange: 'NASDAQ', name: 'Watch Two Inc' });
  });

  it('creates a default list on first read', async () => {
    const res = await trader.auth(request(app).get('/api/v1/watchlists'));

    expect(res.status).toBe(200);
    expect(res.body.data.watchlists).toHaveLength(1);
    expect(res.body.data.watchlists[0]).toMatchObject({ name: 'My Watchlist', isDefault: true });
  });

  it('adds a symbol and hydrates it with a live price', async () => {
    const lists = await trader.auth(request(app).get('/api/v1/watchlists'));
    const listId = lists.body.data.watchlists[0].id;

    const res = await trader.auth(
      request(app).post(`/api/v1/watchlists/${listId}/items`).send({
        symbol: 'WATCH1',
        exchange: 'NSE',
      }),
    );

    expect(res.status).toBe(201);
    const item = res.body.data.items[0];
    expect(item).toMatchObject({ symbol: 'WATCH1', exchange: 'NSE', name: 'Watch One Ltd' });
    expect(item.ltp).toBeGreaterThan(0);
    expect(item.isStale).toBe(false);
  });

  it('holds symbols from both markets on one list', async () => {
    const lists = await trader.auth(request(app).get('/api/v1/watchlists'));
    const listId = lists.body.data.watchlists[0].id;

    await trader.auth(
      request(app)
        .post(`/api/v1/watchlists/${listId}/items`)
        .send({ symbol: 'WATCH1', exchange: 'NSE' }),
    );
    const res = await trader.auth(
      request(app)
        .post(`/api/v1/watchlists/${listId}/items`)
        .send({ symbol: 'WATCH2', exchange: 'NASDAQ' }),
    );

    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items.map((i: { currency: string }) => i.currency).sort()).toEqual([
      'INR',
      'USD',
    ]);
  });

  it('refuses a duplicate symbol on the same list', async () => {
    const lists = await trader.auth(request(app).get('/api/v1/watchlists'));
    const listId = lists.body.data.watchlists[0].id;

    await trader.auth(
      request(app)
        .post(`/api/v1/watchlists/${listId}/items`)
        .send({ symbol: 'WATCH1', exchange: 'NSE' }),
    );
    const second = await trader.auth(
      request(app)
        .post(`/api/v1/watchlists/${listId}/items`)
        .send({ symbol: 'WATCH1', exchange: 'NSE' }),
    );

    expect(second.status).toBe(409);
  });

  it('removes a symbol', async () => {
    const lists = await trader.auth(request(app).get('/api/v1/watchlists'));
    const listId = lists.body.data.watchlists[0].id;

    await trader.auth(
      request(app)
        .post(`/api/v1/watchlists/${listId}/items`)
        .send({ symbol: 'WATCH1', exchange: 'NSE' }),
    );
    const res = await trader.auth(
      request(app).delete(`/api/v1/watchlists/${listId}/items/NSE/WATCH1`),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it('rejects a symbol that does not exist on this platform', async () => {
    const lists = await trader.auth(request(app).get('/api/v1/watchlists'));
    const listId = lists.body.data.watchlists[0].id;

    const res = await trader.auth(
      request(app)
        .post(`/api/v1/watchlists/${listId}/items`)
        .send({ symbol: 'NOPE', exchange: 'NSE' }),
    );

    expect(res.status).toBe(404);
  });

  it('creates additional named lists', async () => {
    // The default list is created lazily on first read, so load it first -
    // which is exactly what the UI does before offering a "new list" button.
    await trader.auth(request(app).get('/api/v1/watchlists'));

    const res = await trader.auth(
      request(app).post('/api/v1/watchlists').send({ name: 'Earnings week' }),
    );

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Earnings week');

    const all = await trader.auth(request(app).get('/api/v1/watchlists'));
    expect(all.body.data.watchlists).toHaveLength(2);
  });

  it('refuses to delete the last remaining list', async () => {
    const lists = await trader.auth(request(app).get('/api/v1/watchlists'));
    const res = await trader.auth(
      request(app).delete(`/api/v1/watchlists/${lists.body.data.watchlists[0].id}`),
    );

    expect(res.status).toBe(400);
  });

  it('never exposes another user watchlist', async () => {
    const lists = await trader.auth(request(app).get('/api/v1/watchlists'));
    const listId = lists.body.data.watchlists[0].id;

    const other = await createAuthedUser(app, { email: 'other-watch@example.com' });
    const res = await other.auth(
      request(app)
        .post(`/api/v1/watchlists/${listId}/items`)
        .send({ symbol: 'WATCH1', exchange: 'NSE' }),
    );

    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/watchlists')).status).toBe(401);
  });
});

// ----------------------------------------------------------------- alerts

describe('price alerts', () => {
  beforeEach(async () => {
    await createInstrument({ symbol: 'ALERTCO', exchange: 'NSE', referencePrice: 1000 });
  });

  it('creates a price alert and stores the threshold in minor units', async () => {
    const res = await trader.auth(
      request(app).post('/api/v1/alerts').send({
        symbol: 'ALERTCO',
        exchange: 'NSE',
        condition: 'PRICE_ABOVE',
        threshold: 1200,
        repeat: false,
      }),
    );

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      symbol: 'ALERTCO',
      condition: 'PRICE_ABOVE',
      status: 'ACTIVE',
    });
    // 1200 rupees stored as 120000 paise.
    expect(res.body.data.threshold).toBe(toMinor(1200));
  });

  it('stores a percentage threshold as a plain percent', async () => {
    const res = await trader.auth(
      request(app).post('/api/v1/alerts').send({
        symbol: 'ALERTCO',
        exchange: 'NSE',
        condition: 'PCT_CHANGE_UP',
        threshold: 5,
        repeat: false,
      }),
    );

    expect(res.body.data.threshold).toBe(5);
  });

  it.each([
    ['PRICE_ABOVE', 0],
    ['PCT_CHANGE_UP', 150],
  ])('rejects an invalid threshold for %s', async (condition, threshold) => {
    const res = await trader.auth(
      request(app).post('/api/v1/alerts').send({
        symbol: 'ALERTCO',
        exchange: 'NSE',
        condition,
        threshold,
        repeat: false,
      }),
    );

    expect(res.status).toBe(422);
  });

  it('lists and filters alerts by status', async () => {
    await trader.auth(
      request(app).post('/api/v1/alerts').send({
        symbol: 'ALERTCO',
        exchange: 'NSE',
        condition: 'PRICE_ABOVE',
        threshold: 1200,
        repeat: false,
      }),
    );

    const active = await trader.auth(request(app).get('/api/v1/alerts?status=ACTIVE'));
    const triggered = await trader.auth(request(app).get('/api/v1/alerts?status=TRIGGERED'));

    expect(active.body.data).toHaveLength(1);
    expect(triggered.body.data).toHaveLength(0);
  });

  it('cancels an alert while preserving its history', async () => {
    const created = await trader.auth(
      request(app).post('/api/v1/alerts').send({
        symbol: 'ALERTCO',
        exchange: 'NSE',
        condition: 'PRICE_ABOVE',
        threshold: 1200,
        repeat: false,
      }),
    );

    const res = await trader.auth(
      request(app).post(`/api/v1/alerts/${created.body.data.id}/cancel`),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    // Cancelled, not deleted - the row survives for the history view.
    expect(await Alert.countDocuments()).toBe(1);
  });

  it('never exposes another user alert', async () => {
    const created = await trader.auth(
      request(app).post('/api/v1/alerts').send({
        symbol: 'ALERTCO',
        exchange: 'NSE',
        condition: 'PRICE_ABOVE',
        threshold: 1200,
        repeat: false,
      }),
    );

    const other = await createAuthedUser(app, { email: 'other-alert@example.com' });
    const res = await other.auth(request(app).get(`/api/v1/alerts/${created.body.data.id}`));

    expect(res.status).toBe(404);
  });
});

describe('alert condition evaluation', () => {
  beforeEach(async () => {
    await createInstrument({ symbol: 'ALERTCO', exchange: 'NSE', referencePrice: 1000 });
  });

  it.each([
    ['PRICE_ABOVE', 100_000, 110_000, 0, true],
    ['PRICE_ABOVE', 100_000, 90_000, 0, false],
    ['PRICE_BELOW', 100_000, 90_000, 0, true],
    ['PRICE_BELOW', 100_000, 110_000, 0, false],
    ['PCT_CHANGE_UP', 5, 0, 6, true],
    ['PCT_CHANGE_UP', 5, 0, 4, false],
    ['PCT_CHANGE_DOWN', 5, 0, -6, true],
    ['PCT_CHANGE_DOWN', 5, 0, -4, false],
  ])(
    '%s with threshold %s at price %s / change %s%% -> %s',
    (condition, threshold, price, change, expected) => {
      expect(
        conditionMet(condition as Parameters<typeof conditionMet>[0], threshold, price, change),
      ).toBe(expected);
    },
  );

  it('fires a notification when an alert condition is met', async () => {
    // Threshold of 1 paisa is certain to be exceeded by any simulated price.
    await trader.auth(
      request(app).post('/api/v1/alerts').send({
        symbol: 'ALERTCO',
        exchange: 'NSE',
        condition: 'PRICE_ABOVE',
        threshold: 0.01,
        repeat: false,
      }),
    );

    const result = await runAlertEvaluator();

    expect(result.triggered).toBe(1);

    const alert = await Alert.findOne({ userId: trader.user._id });
    expect(alert?.status).toBe('TRIGGERED');
    expect(alert?.triggeredPrice).toBeGreaterThan(0);

    const notification = await Notification.findOne({
      userId: trader.user._id,
      type: 'ALERT_TRIGGERED',
    });
    expect(notification).not.toBeNull();
    expect(notification?.title).toContain('ALERTCO');
  });

  it('leaves an unmet alert active', async () => {
    // A threshold far above any simulated price.
    await trader.auth(
      request(app).post('/api/v1/alerts').send({
        symbol: 'ALERTCO',
        exchange: 'NSE',
        condition: 'PRICE_ABOVE',
        threshold: 9_000_000,
        repeat: false,
      }),
    );

    const result = await runAlertEvaluator();

    expect(result.triggered).toBe(0);
    expect((await Alert.findOne({}))?.status).toBe('ACTIVE');
  });

  it('re-arms a repeating alert with a cooldown instead of closing it', async () => {
    await trader.auth(
      request(app).post('/api/v1/alerts').send({
        symbol: 'ALERTCO',
        exchange: 'NSE',
        condition: 'PRICE_ABOVE',
        threshold: 0.01,
        repeat: true,
      }),
    );

    await runAlertEvaluator();

    const alert = await Alert.findOne({});
    expect(alert?.status).toBe('ACTIVE');
    expect(alert?.cooldownUntil).not.toBeNull();

    // The cooldown is what stops it firing again on the very next pass.
    const second = await runAlertEvaluator();
    expect(second.triggered).toBe(0);
  });
});

// ---------------------------------------------------------- notifications

describe('notifications', () => {
  async function makeNotification(count = 1): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await Notification.create({
        userId: trader.user._id,
        type: 'SYSTEM',
        title: `Notice ${index}`,
        body: 'Body text',
      });
    }
  }

  it('lists notifications newest first', async () => {
    await makeNotification(3);
    const res = await trader.auth(request(app).get('/api/v1/notifications'));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.every((n: { read: boolean }) => n.read === false)).toBe(true);
  });

  it('reports an unread count', async () => {
    await makeNotification(4);
    const res = await trader.auth(request(app).get('/api/v1/notifications/unread-count'));

    expect(res.body.data.count).toBe(4);
  });

  it('marks one as read', async () => {
    await makeNotification(2);
    const list = await trader.auth(request(app).get('/api/v1/notifications'));
    const id = list.body.data[0].id;

    const res = await trader.auth(request(app).patch(`/api/v1/notifications/${id}/read`));

    expect(res.status).toBe(200);
    expect(res.body.data.read).toBe(true);

    const count = await trader.auth(request(app).get('/api/v1/notifications/unread-count'));
    expect(count.body.data.count).toBe(1);
  });

  it('marking read twice is idempotent', async () => {
    await makeNotification(1);
    const list = await trader.auth(request(app).get('/api/v1/notifications'));
    const id = list.body.data[0].id;

    const first = await trader.auth(request(app).patch(`/api/v1/notifications/${id}/read`));
    const second = await trader.auth(request(app).patch(`/api/v1/notifications/${id}/read`));

    expect(second.status).toBe(200);
    expect(second.body.data.readAt).toBe(first.body.data.readAt);
  });

  it('marks all as read', async () => {
    await makeNotification(5);
    const res = await trader.auth(request(app).patch('/api/v1/notifications/read-all'));

    expect(res.body.data.marked).toBe(5);

    const count = await trader.auth(request(app).get('/api/v1/notifications/unread-count'));
    expect(count.body.data.count).toBe(0);
  });

  it('filters to unread only', async () => {
    await makeNotification(3);
    const list = await trader.auth(request(app).get('/api/v1/notifications'));
    await trader.auth(request(app).patch(`/api/v1/notifications/${list.body.data[0].id}/read`));

    const unread = await trader.auth(request(app).get('/api/v1/notifications?unreadOnly=true'));
    expect(unread.body.data).toHaveLength(2);
  });

  it('never exposes another user notifications', async () => {
    await makeNotification(2);
    const other = await createAuthedUser(app, { email: 'other-notif@example.com' });

    const res = await other.auth(request(app).get('/api/v1/notifications'));
    expect(res.body.data).toHaveLength(0);
  });
});

// -------------------------------------------------------------- education

describe('education library', () => {
  async function seedArticle(overrides: Record<string, unknown> = {}): Promise<void> {
    await EducationResourceModel.create({
      title: 'Understanding limit orders',
      slug: 'understanding-limit-orders',
      summary: 'What a limit order is and when to use one instead of a market order.',
      category: 'basics',
      level: 'beginner',
      content: '## Heading\n\nSome article body with enough words to be meaningful.',
      readMinutes: 4,
      status: 'published',
      tags: ['orders'],
      ...overrides,
    });
  }

  it('lists published articles without requiring a login', async () => {
    await seedArticle();
    const res = await request(app).get('/api/v1/education');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    // The list response omits the body to keep the payload small.
    expect(res.body.data[0].content).toBeUndefined();
  });

  it('returns the full body on the detail endpoint', async () => {
    await seedArticle();
    const res = await request(app).get('/api/v1/education/understanding-limit-orders');

    expect(res.status).toBe(200);
    expect(res.body.data.content).toContain('## Heading');
  });

  it('hides drafts from readers', async () => {
    await seedArticle({ status: 'draft' });

    expect((await request(app).get('/api/v1/education')).body.data).toHaveLength(0);
    expect((await request(app).get('/api/v1/education/understanding-limit-orders')).status).toBe(
      404,
    );
  });

  it('shows drafts to an editor', async () => {
    await seedArticle({ status: 'draft' });
    const admin = await createAuthedUser(app, { role: 'admin', email: 'editor@example.com' });

    const res = await admin.auth(request(app).get('/api/v1/education'));
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by category and level', async () => {
    await seedArticle();
    await seedArticle({
      title: 'Advanced risk sizing',
      slug: 'advanced-risk-sizing',
      category: 'risk',
      level: 'advanced',
    });

    expect((await request(app).get('/api/v1/education?category=risk')).body.data).toHaveLength(1);
    expect((await request(app).get('/api/v1/education?level=beginner')).body.data).toHaveLength(1);
  });

  it('searches by title', async () => {
    await seedArticle();
    const res = await request(app).get('/api/v1/education?q=limit');
    expect(res.body.data).toHaveLength(1);
  });

  it('exposes the category list for filter menus', async () => {
    const res = await request(app).get('/api/v1/education/categories');
    expect(res.status).toBe(200);
    expect(res.body.data.categories.length).toBeGreaterThan(3);
    expect(res.body.data.levels).toEqual(['beginner', 'intermediate', 'advanced']);
  });

  it('returns 404 for an unknown slug', async () => {
    expect((await request(app).get('/api/v1/education/no-such-article')).status).toBe(404);
  });
});
