/**
 * Response fixtures captured from the running API.
 *
 * Hand-written stubs drift from the real payloads and then prove nothing, so
 * these were recorded from live `/api/v1` responses. Values are deliberately
 * small - what matters is the SHAPE the dashboards destructure.
 */

export const apiFixtures: Record<string, unknown> = {
  "/portfolio": {
    "wallets": [
      {
        "market": "IN",
        "currency": "INR",
        "cashAvailable": 99372965,
        "cashBlocked": 0,
        "initialCapital": 100000000,
        "investedAmount": 625645,
        "holdingsValue": 624000,
        "totalValue": 99996965,
        "unrealisedPnl": -1645,
        "realisedPnl": -1394,
        "totalFeesPaid": 2135,
        "dayChange": 3800,
        "dayChangePercent": 0,
        "overallReturn": -3035,
        "overallReturnPercent": 0,
        "hasStalePrices": false
      },
      {
        "market": "US",
        "currency": "USD",
        "cashAvailable": 1000000,
        "cashBlocked": 0,
        "initialCapital": 1000000,
        "investedAmount": 0,
        "holdingsValue": 0,
        "totalValue": 1000000,
        "unrealisedPnl": 0,
        "realisedPnl": 0,
        "totalFeesPaid": 0,
        "dayChange": 0,
        "dayChangePercent": 0,
        "overallReturn": 0,
        "overallReturnPercent": 0,
        "hasStalePrices": false
      }
    ],
    "holdingsCount": 1,
    "openOrdersCount": 0,
    "indicative": {
      "currency": "INR",
      "totalValue": 182996965,
      "rate": 83,
      "disclaimer": "Indicative only, converted at a fixed rate of 1 USD = 83 INR. The INR and USD wallets are fully segregated and no conversion occurs in the ledger."
    }
  },
  "/portfolio/holdings": {
    "holdings": [
      {
        "id": "6ab36bf55592256b3f9aa662",
        "symbol": "RELIANCE",
        "exchange": "NSE",
        "instrumentName": "Reliance Industries Ltd",
        "currency": "INR",
        "quantity": 5,
        "blockedQuantity": 0,
        "averageCost": 125129,
        "investedAmount": 625641,
        "lastPrice": 124800,
        "marketValue": 624000,
        "unrealisedPnl": -1645,
        "unrealisedPnlPercent": -0.26,
        "dayChange": 3800,
        "dayChangePercent": 0.61,
        "realisedPnl": -1394,
        "isStale": false
      }
    ]
  },
  "/portfolio/analytics/performance": {
    "series": [
      {
        "date": "2026-09-22",
        "totalValue": 183000000,
        "cash": 183000000,
        "holdingsValue": 0,
        "invested": 0,
        "unrealisedPnl": 0,
        "realisedPnlCumulative": 0
      },
      {
        "date": "2026-09-23",
        "totalValue": 182996965,
        "cash": 182372965,
        "holdingsValue": 624000,
        "invested": 625645,
        "unrealisedPnl": -1645,
        "realisedPnlCumulative": -1394
      }
    ],
    "range": "1M",
    "note": "Daily points are recorded as they occur; historical valuation cannot be reconstructed retroactively from free market data."
  },
  "/market/indices": {
    "indices": [
      {
        "symbol": "NIFTY50",
        "name": "NIFTY 50",
        "market": "IN",
        "value": 2344680,
        "change": 3250,
        "changePercent": 0.14,
        "sourceMeta": {
          "source": "yahoo",
          "asOf": "2026-09-23T12:19:32.117Z",
          "isDelayed": true,
          "isSimulated": false
        }
      },
      {
        "symbol": "SENSEX",
        "name": "S&P BSE SENSEX",
        "market": "IN",
        "value": 7482825,
        "change": -3075,
        "changePercent": -0.04,
        "sourceMeta": {
          "source": "yahoo",
          "asOf": "2026-09-23T12:19:32.227Z",
          "isDelayed": true,
          "isSimulated": false
        }
      },
      {
        "symbol": "BANKNIFTY",
        "name": "NIFTY Bank",
        "market": "IN",
        "value": 5654890,
        "change": 7830,
        "changePercent": 0.14,
        "sourceMeta": {
          "source": "yahoo",
          "asOf": "2026-09-23T12:19:32.326Z",
          "isDelayed": true,
          "isSimulated": false
        }
      },
      {
        "symbol": "SPX",
        "name": "S&P 500",
        "market": "US",
        "value": 776464,
        "change": -6,
        "changePercent": 0,
        "sourceMeta": {
          "source": "yahoo",
          "asOf": "2026-09-23T12:19:32.443Z",
          "isDelayed": true,
          "isSimulated": false
        }
      },
      {
        "symbol": "IXIC",
        "name": "NASDAQ Composite",
        "market": "US",
        "value": 2724428,
        "change": 12219,
        "changePercent": 0.45,
        "sourceMeta": {
          "source": "yahoo",
          "asOf": "2026-09-23T12:19:32.546Z",
          "isDelayed": true,
          "isSimulated": false
        }
      },
      {
        "symbol": "DJI",
        "name": "Dow Jones Industrial Average",
        "market": "US",
        "value": 5186369,
        "change": -18511,
        "changePercent": -0.36,
        "sourceMeta": {
          "source": "yahoo",
          "asOf": "2026-09-23T12:19:32.630Z",
          "isDelayed": true,
          "isSimulated": false
        }
      }
    ]
  },
  "/market/movers": {
    "gainers": [
      {
        "symbol": "BAJFINANCE",
        "exchange": "NSE",
        "name": "Bajaj Finance Ltd",
        "currency": "INR",
        "ltp": 104320,
        "change": 3440,
        "changePercent": 3.41
      },
      {
        "symbol": "TATASTEEL",
        "exchange": "BSE",
        "name": "Tata Steel Ltd",
        "currency": "INR",
        "ltp": 19075,
        "change": 605,
        "changePercent": 3.28
      },
      {
        "symbol": "HINDALCO",
        "exchange": "NSE",
        "name": "Hindalco Industries Ltd",
        "currency": "INR",
        "ltp": 100380,
        "change": 3080,
        "changePercent": 3.17
      },
      {
        "symbol": "TATASTEEL",
        "exchange": "NSE",
        "name": "Tata Steel Ltd",
        "currency": "INR",
        "ltp": 19082,
        "change": 585,
        "changePercent": 3.16
      },
      {
        "symbol": "DIVISLAB",
        "exchange": "NSE",
        "name": "Divi's Laboratories Ltd",
        "currency": "INR",
        "ltp": 962400,
        "change": 27200,
        "changePercent": 2.91
      }
    ],
    "losers": [
      {
        "symbol": "TATAMOTORS",
        "exchange": "NSE",
        "name": "Tata Motors Ltd",
        "currency": "INR",
        "ltp": 81534,
        "change": -1037,
        "changePercent": -1.26
      },
      {
        "symbol": "HCLTECH",
        "exchange": "NSE",
        "name": "HCL Technologies Ltd",
        "currency": "INR",
        "ltp": 125670,
        "change": -1370,
        "changePercent": -1.08
      },
      {
        "symbol": "INFY",
        "exchange": "BSE",
        "name": "Infosys Ltd",
        "currency": "INR",
        "ltp": 101920,
        "change": -1060,
        "changePercent": -1.03
      },
      {
        "symbol": "TITAN",
        "exchange": "NSE",
        "name": "Titan Company Ltd",
        "currency": "INR",
        "ltp": 488000,
        "change": -4850,
        "changePercent": -0.98
      },
      {
        "symbol": "TCS",
        "exchange": "BSE",
        "name": "Tata Consultancy Services Ltd",
        "currency": "INR",
        "ltp": 208590,
        "change": -2010,
        "changePercent": -0.95
      }
    ],
    "sourceMeta": {
      "source": "mock",
      "asOf": "2026-09-23T12:14:36.742Z",
      "isDelayed": true,
      "isSimulated": true
    }
  },
  "/watchlists": {
    "watchlists": [
      {
        "id": "6ab2c1b5397bd8ae51dc551e",
        "name": "My Watchlist",
        "isDefault": true,
        "items": [
          {
            "instrumentId": "6ab2c1b5397bd8ae51dc5466",
            "symbol": "HDFCBANK",
            "exchange": "NSE",
            "name": "HDFC Bank Ltd",
            "currency": "INR",
            "note": null,
            "addedAt": "2026-09-22T17:58:13.270Z",
            "ltp": 73725,
            "change": -135,
            "changePercent": -0.18,
            "isStale": false
          },
          {
            "instrumentId": "6ab2c1b5397bd8ae51dc5467",
            "symbol": "INFY",
            "exchange": "NSE",
            "name": "Infosys Ltd",
            "currency": "INR",
            "note": null,
            "addedAt": "2026-09-22T17:58:13.270Z",
            "ltp": 102050,
            "change": -890,
            "changePercent": -0.86,
            "isStale": false
          },
          {
            "instrumentId": "6ab2c1b5397bd8ae51dc5464",
            "symbol": "RELIANCE",
            "exchange": "NSE",
            "name": "Reliance Industries Ltd",
            "currency": "INR",
            "note": null,
            "addedAt": "2026-09-22T17:58:13.270Z",
            "ltp": 124800,
            "change": 760,
            "changePercent": 0.61,
            "isStale": false
          },
          {
            "instrumentId": "6ab2c1b5397bd8ae51dc5465",
            "symbol": "TCS",
            "exchange": "NSE",
            "name": "Tata Consultancy Services Ltd",
            "currency": "INR",
            "note": null,
            "addedAt": "2026-09-22T17:58:13.270Z",
            "ltp": 208960,
            "change": -1540,
            "changePercent": -0.73,
            "isStale": false
          },
          {
            "instrumentId": "6ab2c1b5397bd8ae51dc54a5",
            "symbol": "AAPL",
            "exchange": "NASDAQ",
            "name": "Apple Inc.",
            "currency": "USD",
            "note": null,
            "addedAt": "2026-09-22T17:58:13.270Z",
            "ltp": 33975,
            "change": 77,
            "changePercent": 0.23,
            "isStale": false
          },
          {
            "instrumentId": "6ab2c1b5397bd8ae51dc54a6",
            "symbol": "MSFT",
            "exchange": "NASDAQ",
            "name": "Microsoft Corporation",
            "currency": "USD",
            "note": null,
            "addedAt": "2026-09-22T17:58:13.270Z",
            "ltp": 49800,
            "change": -361,
            "changePercent": -0.72,
            "isStale": false
          },
          {
            "instrumentId": "6ab2c1b5397bd8ae51dc54a9",
            "symbol": "NVDA",
            "exchange": "NASDAQ",
            "name": "NVIDIA Corporation",
            "currency": "USD",
            "note": null,
            "addedAt": "2026-09-22T17:58:13.270Z",
            "ltp": 22887,
            "change": 149,
            "changePercent": 0.66,
            "isStale": false
          }
        ],
        "createdAt": "2026-09-22T17:58:13.270Z"
      }
    ]
  },
  "/super-admin/config": {
    "tradingEnabled": true,
    "registrationEnabled": true,
    "maintenanceMode": false,
    "maintenanceMessage": "",
    "initialCapitalInr": 100000000,
    "initialCapitalUsd": 1000000,
    "featureFlags": {
      "marketNews": true,
      "education": true,
      "stockComparison": true,
      "priceAlerts": true,
      "realtimeNotifications": true
    },
    "updatedAt": "2026-09-23T12:19:33.653Z",
    "updatedByEmail": null
  },
  "/super-admin/system/health": {
    "status": "ready",
    "uptimeSeconds": 409,
    "nodeVersion": "v24.18.0",
    "environment": "development",
    "memory": {
      "rssMb": 145,
      "heapUsedMb": 59,
      "heapTotalMb": 63
    },
    "dependencies": {
      "mongo": {
        "state": "up",
        "latencyMs": 1
      },
      "redis": {
        "state": "disabled",
        "message": "REDIS_URL not configured; using in-process cache"
      }
    },
    "marketDataProviders": [
      {
        "name": "yahoo",
        "state": "up",
        "lastSuccessAt": "2026-09-23T12:19:33.421Z",
        "failureCount": 0
      },
      {
        "name": "finnhub",
        "state": "up",
        "lastSuccessAt": null,
        "failureCount": 0
      },
      {
        "name": "mock",
        "state": "up",
        "lastSuccessAt": "2026-09-23T12:14:36.742Z",
        "failureCount": 0
      }
    ],
    "counts": {
      "users": 3,
      "orders": 7,
      "instruments": 165
    },
    "workers": [
      {
        "name": "orderMatcher",
        "lastRunAt": "2026-09-23T12:19:16.416Z",
        "lastRunStatus": "ok"
      },
      {
        "name": "alertEvaluator",
        "lastRunAt": "2026-09-23T12:18:46.398Z",
        "lastRunStatus": "ok"
      },
      {
        "name": "snapshotJob",
        "lastRunAt": null,
        "lastRunStatus": "never run"
      },
      {
        "name": "newsSync",
        "lastRunAt": null,
        "lastRunStatus": "never run"
      }
    ]
  },
  "/super-admin/roles": {
    "roles": [
      {
        "role": "trader",
        "label": "Trader",
        "permissions": [
          "portfolio:read",
          "order:create",
          "order:read",
          "order:cancel",
          "watchlist:manage",
          "alert:manage",
          "notification:read",
          "market:read",
          "education:read",
          "news:read"
        ],
        "userCount": 1,
        "isSystem": true
      },
      {
        "role": "admin",
        "label": "Admin",
        "permissions": [
          "portfolio:read",
          "order:create",
          "order:read",
          "order:cancel",
          "watchlist:manage",
          "alert:manage",
          "notification:read",
          "market:read",
          "education:read",
          "news:read",
          "user:read",
          "user:manage",
          "trade:monitor",
          "analytics:read",
          "instrument:manage",
          "education:manage",
          "news:manage"
        ],
        "userCount": 1,
        "isSystem": true
      },
      {
        "role": "super_admin",
        "label": "Super Admin",
        "permissions": [
          "portfolio:read",
          "order:create",
          "order:read",
          "order:cancel",
          "watchlist:manage",
          "alert:manage",
          "notification:read",
          "market:read",
          "education:read",
          "news:read",
          "user:read",
          "user:manage",
          "trade:monitor",
          "analytics:read",
          "instrument:manage",
          "education:manage",
          "news:manage",
          "admin:manage",
          "permission:manage",
          "config:manage",
          "system:monitor",
          "audit:read"
        ],
        "userCount": 1,
        "isSystem": true
      }
    ],
    "availablePermissions": [
      "portfolio:read",
      "order:create",
      "order:read",
      "order:cancel",
      "watchlist:manage",
      "alert:manage",
      "notification:read",
      "market:read",
      "education:read",
      "news:read",
      "user:read",
      "user:manage",
      "trade:monitor",
      "analytics:read",
      "instrument:manage",
      "education:manage",
      "news:manage",
      "admin:manage",
      "permission:manage",
      "config:manage",
      "system:monitor",
      "audit:read"
    ]
  },
  "/market/instruments": {
    "results": [
      {
        "id": "id-RELIANCE",
        "symbol": "RELIANCE",
        "name": "Reliance Industries Ltd",
        "exchange": "NSE",
        "market": "IN",
        "currency": "INR",
        "sector": "Energy",
        "industry": null,
        "isActive": true,
        "providerSymbol": "RELIANCE",
        "ltp": 122520,
        "change": 600,
        "changePercent": 0.49,
        "isStale": false
      },
      {
        "id": "id-TCS",
        "symbol": "TCS",
        "name": "Tata Consultancy Services Ltd",
        "exchange": "NSE",
        "market": "IN",
        "currency": "INR",
        "sector": "IT",
        "industry": null,
        "isActive": true,
        "providerSymbol": "TCS",
        "ltp": 207400,
        "change": -1300,
        "changePercent": -0.62,
        "isStale": false
      },
      {
        "id": "id-INFY",
        "symbol": "INFY",
        "name": "Infosys Ltd",
        "exchange": "NSE",
        "market": "IN",
        "currency": "INR",
        "sector": "IT",
        "industry": null,
        "isActive": true,
        "providerSymbol": "INFY",
        "ltp": 99600,
        "change": -1100,
        "changePercent": -1.1,
        "isStale": false
      },
      {
        "id": "id-HDFCBANK",
        "symbol": "HDFCBANK",
        "name": "HDFC Bank Ltd",
        "exchange": "NSE",
        "market": "IN",
        "currency": "INR",
        "sector": "Financial Services",
        "industry": null,
        "isActive": true,
        "providerSymbol": "HDFCBANK",
        "ltp": 73745,
        "change": 850,
        "changePercent": 1.17,
        "isStale": false
      },
      {
        "id": "id-AXISBANK",
        "symbol": "AXISBANK",
        "name": "Axis Bank Ltd",
        "exchange": "NSE",
        "market": "IN",
        "currency": "INR",
        "sector": "Financial Services",
        "industry": null,
        "isActive": true,
        "providerSymbol": "AXISBANK",
        "ltp": 122180,
        "change": 3540,
        "changePercent": 2.98,
        "isStale": false
      },
      {
        "id": "id-AAPL",
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "exchange": "NASDAQ",
        "market": "US",
        "currency": "USD",
        "sector": "Technology",
        "industry": null,
        "isActive": true,
        "providerSymbol": "AAPL",
        "ltp": 33975,
        "change": 120,
        "changePercent": 0.35,
        "isStale": false
      }
    ],
    "total": 6,
    "sectors": [
      "Energy",
      "Financial Services",
      "IT",
      "Technology"
    ]
  },
  "/admin/analytics": {
    "users": {
      "total": 3,
      "active": 3,
      "pending": 0,
      "suspended": 0,
      "demo": 3,
      "newLast7Days": 3,
      "byRole": {
        "trader": 1,
        "admin": 1,
        "super_admin": 1
      }
    },
    "trading": {
      "totalOrders": 7,
      "filledOrders": 2,
      "pendingOrders": 0,
      "rejectedOrders": 0,
      "ordersLast24h": 7,
      "totalVolumeInr": 1874700,
      "totalVolumeUsd": 0,
      "totalFeesInr": 2135,
      "totalFeesUsd": 0
    },
    "content": {
      "instruments": 165,
      "activeInstruments": 165,
      "educationPublished": 12,
      "educationDrafts": 0,
      "newsArticles": 0
    },
    "engagement": {
      "watchlistItems": 7,
      "activeAlerts": 0,
      "unreadNotifications": 7
    },
    "ordersTrend": [
      {
        "date": "2026-09-23",
        "orders": 7,
        "filled": 2
      }
    ],
    "topTradedSymbols": [
      {
        "symbol": "RELIANCE",
        "exchange": "NSE",
        "orders": 5
      },
      {
        "symbol": "TCS",
        "exchange": "NSE",
        "orders": 2
      }
    ]
  }
};
