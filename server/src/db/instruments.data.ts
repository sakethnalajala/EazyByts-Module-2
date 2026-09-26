import type { Exchange } from '@smd/shared';

/**
 * The curated instrument universe.
 *
 * This is deliberately a fixed list rather than a full exchange listing: a
 * complete NSE + NASDAQ dump is tens of thousands of symbols, most of them
 * illiquid, and every one would need a quote fetch. ~145 large caps covers
 * every realistic demo without exhausting a free provider tier.
 *
 * `referencePrice` is a MAJOR-unit baseline used as the seed for the
 * deterministic mock feed and as a sanity bound on live quotes. It is an
 * approximation, not a live price.
 */

export interface InstrumentSeed {
  symbol: string;
  name: string;
  sector: string;
  referencePrice: number;
}

/** NIFTY 50 constituents. */
export const NSE_INSTRUMENTS: InstrumentSeed[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', sector: 'Energy', referencePrice: 2945 },
  { symbol: 'TCS', name: 'Tata Consultancy Services Ltd', sector: 'IT', referencePrice: 4120 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'Financial Services', referencePrice: 1685 },
  { symbol: 'INFY', name: 'Infosys Ltd', sector: 'IT', referencePrice: 1845 },
  {
    symbol: 'ICICIBANK',
    name: 'ICICI Bank Ltd',
    sector: 'Financial Services',
    referencePrice: 1258,
  },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', sector: 'FMCG', referencePrice: 2410 },
  { symbol: 'ITC', name: 'ITC Ltd', sector: 'FMCG', referencePrice: 462 },
  {
    symbol: 'SBIN',
    name: 'State Bank of India',
    sector: 'Financial Services',
    referencePrice: 832,
  },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', sector: 'Telecom', referencePrice: 1625 },
  {
    symbol: 'KOTAKBANK',
    name: 'Kotak Mahindra Bank Ltd',
    sector: 'Financial Services',
    referencePrice: 1782,
  },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd', sector: 'Construction', referencePrice: 3580 },
  { symbol: 'AXISBANK', name: 'Axis Bank Ltd', sector: 'Financial Services', referencePrice: 1148 },
  {
    symbol: 'ASIANPAINT',
    name: 'Asian Paints Ltd',
    sector: 'Consumer Durables',
    referencePrice: 2870,
  },
  {
    symbol: 'MARUTI',
    name: 'Maruti Suzuki India Ltd',
    sector: 'Automobile',
    referencePrice: 12450,
  },
  {
    symbol: 'BAJFINANCE',
    name: 'Bajaj Finance Ltd',
    sector: 'Financial Services',
    referencePrice: 7120,
  },
  { symbol: 'HCLTECH', name: 'HCL Technologies Ltd', sector: 'IT', referencePrice: 1795 },
  {
    symbol: 'SUNPHARMA',
    name: 'Sun Pharmaceutical Industries Ltd',
    sector: 'Healthcare',
    referencePrice: 1782,
  },
  { symbol: 'TITAN', name: 'Titan Company Ltd', sector: 'Consumer Durables', referencePrice: 3395 },
  {
    symbol: 'ULTRACEMCO',
    name: 'UltraTech Cement Ltd',
    sector: 'Construction Materials',
    referencePrice: 11280,
  },
  { symbol: 'WIPRO', name: 'Wipro Ltd', sector: 'IT', referencePrice: 552 },
  { symbol: 'NESTLEIND', name: 'Nestle India Ltd', sector: 'FMCG', referencePrice: 2245 },
  {
    symbol: 'ONGC',
    name: 'Oil & Natural Gas Corporation Ltd',
    sector: 'Energy',
    referencePrice: 268,
  },
  { symbol: 'NTPC', name: 'NTPC Ltd', sector: 'Power', referencePrice: 358 },
  {
    symbol: 'POWERGRID',
    name: 'Power Grid Corporation of India Ltd',
    sector: 'Power',
    referencePrice: 318,
  },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', sector: 'Automobile', referencePrice: 985 },
  { symbol: 'TATASTEEL', name: 'Tata Steel Ltd', sector: 'Metals & Mining', referencePrice: 152 },
  { symbol: 'JSWSTEEL', name: 'JSW Steel Ltd', sector: 'Metals & Mining', referencePrice: 1045 },
  {
    symbol: 'ADANIENT',
    name: 'Adani Enterprises Ltd',
    sector: 'Metals & Mining',
    referencePrice: 2480,
  },
  { symbol: 'ADANIPORTS', name: 'Adani Ports & SEZ Ltd', sector: 'Services', referencePrice: 1345 },
  { symbol: 'COALINDIA', name: 'Coal India Ltd', sector: 'Metals & Mining', referencePrice: 398 },
  {
    symbol: 'GRASIM',
    name: 'Grasim Industries Ltd',
    sector: 'Construction Materials',
    referencePrice: 2685,
  },
  {
    symbol: 'HINDALCO',
    name: 'Hindalco Industries Ltd',
    sector: 'Metals & Mining',
    referencePrice: 692,
  },
  {
    symbol: 'DRREDDY',
    name: "Dr. Reddy's Laboratories Ltd",
    sector: 'Healthcare',
    referencePrice: 1268,
  },
  { symbol: 'CIPLA', name: 'Cipla Ltd', sector: 'Healthcare', referencePrice: 1512 },
  {
    symbol: 'BAJAJFINSV',
    name: 'Bajaj Finserv Ltd',
    sector: 'Financial Services',
    referencePrice: 1985,
  },
  { symbol: 'BRITANNIA', name: 'Britannia Industries Ltd', sector: 'FMCG', referencePrice: 4890 },
  { symbol: 'EICHERMOT', name: 'Eicher Motors Ltd', sector: 'Automobile', referencePrice: 4920 },
  { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp Ltd', sector: 'Automobile', referencePrice: 4385 },
  {
    symbol: 'INDUSINDBK',
    name: 'IndusInd Bank Ltd',
    sector: 'Financial Services',
    referencePrice: 985,
  },
  {
    symbol: 'SBILIFE',
    name: 'SBI Life Insurance Company Ltd',
    sector: 'Financial Services',
    referencePrice: 1642,
  },
  {
    symbol: 'HDFCLIFE',
    name: 'HDFC Life Insurance Company Ltd',
    sector: 'Financial Services',
    referencePrice: 718,
  },
  { symbol: 'TECHM', name: 'Tech Mahindra Ltd', sector: 'IT', referencePrice: 1652 },
  {
    symbol: 'APOLLOHOSP',
    name: 'Apollo Hospitals Enterprise Ltd',
    sector: 'Healthcare',
    referencePrice: 7120,
  },
  { symbol: 'TATACONSUM', name: 'Tata Consumer Products Ltd', sector: 'FMCG', referencePrice: 985 },
  {
    symbol: 'BPCL',
    name: 'Bharat Petroleum Corporation Ltd',
    sector: 'Energy',
    referencePrice: 312,
  },
  { symbol: 'LTIM', name: 'LTIMindtree Ltd', sector: 'IT', referencePrice: 5820 },
  {
    symbol: 'SHRIRAMFIN',
    name: 'Shriram Finance Ltd',
    sector: 'Financial Services',
    referencePrice: 615,
  },
  { symbol: 'TRENT', name: 'Trent Ltd', sector: 'Consumer Services', referencePrice: 6280 },
  { symbol: 'BEL', name: 'Bharat Electronics Ltd', sector: 'Capital Goods', referencePrice: 298 },
  {
    symbol: 'DIVISLAB',
    name: "Divi's Laboratories Ltd",
    sector: 'Healthcare',
    referencePrice: 5980,
  },
];

/** BSE-listed duplicates, so the app genuinely covers both Indian exchanges. */
export const BSE_INSTRUMENTS: InstrumentSeed[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', sector: 'Energy', referencePrice: 2947 },
  { symbol: 'TCS', name: 'Tata Consultancy Services Ltd', sector: 'IT', referencePrice: 4123 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'Financial Services', referencePrice: 1686 },
  { symbol: 'INFY', name: 'Infosys Ltd', sector: 'IT', referencePrice: 1847 },
  {
    symbol: 'ICICIBANK',
    name: 'ICICI Bank Ltd',
    sector: 'Financial Services',
    referencePrice: 1259,
  },
  { symbol: 'ITC', name: 'ITC Ltd', sector: 'FMCG', referencePrice: 463 },
  {
    symbol: 'SBIN',
    name: 'State Bank of India',
    sector: 'Financial Services',
    referencePrice: 833,
  },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', sector: 'Automobile', referencePrice: 986 },
  { symbol: 'TATASTEEL', name: 'Tata Steel Ltd', sector: 'Metals & Mining', referencePrice: 153 },
  { symbol: 'WIPRO', name: 'Wipro Ltd', sector: 'IT', referencePrice: 553 },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd', sector: 'Construction', referencePrice: 3582 },
  { symbol: 'AXISBANK', name: 'Axis Bank Ltd', sector: 'Financial Services', referencePrice: 1149 },
  {
    symbol: 'MARUTI',
    name: 'Maruti Suzuki India Ltd',
    sector: 'Automobile',
    referencePrice: 12455,
  },
  {
    symbol: 'SUNPHARMA',
    name: 'Sun Pharmaceutical Industries Ltd',
    sector: 'Healthcare',
    referencePrice: 1784,
  },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', sector: 'Telecom', referencePrice: 1627 },
];

export const NASDAQ_INSTRUMENTS: InstrumentSeed[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', referencePrice: 228 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', referencePrice: 428 },
  {
    symbol: 'GOOGL',
    name: 'Alphabet Inc. Class A',
    sector: 'Communication Services',
    referencePrice: 176,
  },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Cyclical', referencePrice: 198 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', referencePrice: 132 },
  {
    symbol: 'META',
    name: 'Meta Platforms Inc.',
    sector: 'Communication Services',
    referencePrice: 578,
  },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Cyclical', referencePrice: 248 },
  { symbol: 'AVGO', name: 'Broadcom Inc.', sector: 'Technology', referencePrice: 172 },
  {
    symbol: 'COST',
    name: 'Costco Wholesale Corporation',
    sector: 'Consumer Defensive',
    referencePrice: 892,
  },
  { symbol: 'PEP', name: 'PepsiCo Inc.', sector: 'Consumer Defensive', referencePrice: 168 },
  { symbol: 'ADBE', name: 'Adobe Inc.', sector: 'Technology', referencePrice: 512 },
  { symbol: 'CSCO', name: 'Cisco Systems Inc.', sector: 'Technology', referencePrice: 58 },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', sector: 'Technology', referencePrice: 142 },
  { symbol: 'NFLX', name: 'Netflix Inc.', sector: 'Communication Services', referencePrice: 745 },
  { symbol: 'INTC', name: 'Intel Corporation', sector: 'Technology', referencePrice: 23 },
  { symbol: 'QCOM', name: 'QUALCOMM Incorporated', sector: 'Technology', referencePrice: 168 },
  {
    symbol: 'TXN',
    name: 'Texas Instruments Incorporated',
    sector: 'Technology',
    referencePrice: 205,
  },
  { symbol: 'AMGN', name: 'Amgen Inc.', sector: 'Healthcare', referencePrice: 318 },
  { symbol: 'INTU', name: 'Intuit Inc.', sector: 'Technology', referencePrice: 625 },
  {
    symbol: 'BKNG',
    name: 'Booking Holdings Inc.',
    sector: 'Consumer Cyclical',
    referencePrice: 4120,
  },
  {
    symbol: 'SBUX',
    name: 'Starbucks Corporation',
    sector: 'Consumer Cyclical',
    referencePrice: 96,
  },
  { symbol: 'GILD', name: 'Gilead Sciences Inc.', sector: 'Healthcare', referencePrice: 88 },
  { symbol: 'MU', name: 'Micron Technology Inc.', sector: 'Technology', referencePrice: 102 },
  { symbol: 'ADI', name: 'Analog Devices Inc.', sector: 'Technology', referencePrice: 228 },
  {
    symbol: 'MDLZ',
    name: 'Mondelez International Inc.',
    sector: 'Consumer Defensive',
    referencePrice: 71,
  },
  {
    symbol: 'PYPL',
    name: 'PayPal Holdings Inc.',
    sector: 'Financial Services',
    referencePrice: 78,
  },
  { symbol: 'ZTS', name: 'Zoetis Inc.', sector: 'Healthcare', referencePrice: 182 },
  { symbol: 'PANW', name: 'Palo Alto Networks Inc.', sector: 'Technology', referencePrice: 372 },
  {
    symbol: 'REGN',
    name: 'Regeneron Pharmaceuticals Inc.',
    sector: 'Healthcare',
    referencePrice: 1025,
  },
  {
    symbol: 'VRTX',
    name: 'Vertex Pharmaceuticals Incorporated',
    sector: 'Healthcare',
    referencePrice: 468,
  },
  { symbol: 'ISRG', name: 'Intuitive Surgical Inc.', sector: 'Healthcare', referencePrice: 492 },
  { symbol: 'LRCX', name: 'Lam Research Corporation', sector: 'Technology', referencePrice: 78 },
  { symbol: 'KLAC', name: 'KLA Corporation', sector: 'Technology', referencePrice: 692 },
  { symbol: 'SNPS', name: 'Synopsys Inc.', sector: 'Technology', referencePrice: 512 },
  {
    symbol: 'CDNS',
    name: 'Cadence Design Systems Inc.',
    sector: 'Technology',
    referencePrice: 272,
  },
  { symbol: 'MRVL', name: 'Marvell Technology Inc.', sector: 'Technology', referencePrice: 78 },
  {
    symbol: 'ORLY',
    name: "O'Reilly Automotive Inc.",
    sector: 'Consumer Cyclical',
    referencePrice: 1182,
  },
  { symbol: 'CSX', name: 'CSX Corporation', sector: 'Industrials', referencePrice: 34 },
  { symbol: 'ABNB', name: 'Airbnb Inc.', sector: 'Consumer Cyclical', referencePrice: 128 },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings Inc.', sector: 'Technology', referencePrice: 292 },
];

export const NYSE_INSTRUMENTS: InstrumentSeed[] = [
  {
    symbol: 'BRK-B',
    name: 'Berkshire Hathaway Inc. Class B',
    sector: 'Financial Services',
    referencePrice: 462,
  },
  {
    symbol: 'JPM',
    name: 'JPMorgan Chase & Co.',
    sector: 'Financial Services',
    referencePrice: 225,
  },
  { symbol: 'V', name: 'Visa Inc.', sector: 'Financial Services', referencePrice: 292 },
  {
    symbol: 'UNH',
    name: 'UnitedHealth Group Incorporated',
    sector: 'Healthcare',
    referencePrice: 578,
  },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', sector: 'Energy', referencePrice: 118 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', referencePrice: 158 },
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Consumer Defensive', referencePrice: 82 },
  {
    symbol: 'MA',
    name: 'Mastercard Incorporated',
    sector: 'Financial Services',
    referencePrice: 495,
  },
  {
    symbol: 'PG',
    name: 'Procter & Gamble Company',
    sector: 'Consumer Defensive',
    referencePrice: 172,
  },
  { symbol: 'HD', name: 'Home Depot Inc.', sector: 'Consumer Cyclical', referencePrice: 398 },
  { symbol: 'CVX', name: 'Chevron Corporation', sector: 'Energy', referencePrice: 152 },
  { symbol: 'MRK', name: 'Merck & Co. Inc.', sector: 'Healthcare', referencePrice: 108 },
  { symbol: 'ABBV', name: 'AbbVie Inc.', sector: 'Healthcare', referencePrice: 192 },
  { symbol: 'KO', name: 'Coca-Cola Company', sector: 'Consumer Defensive', referencePrice: 68 },
  { symbol: 'CRM', name: 'Salesforce Inc.', sector: 'Technology', referencePrice: 292 },
  {
    symbol: 'BAC',
    name: 'Bank of America Corporation',
    sector: 'Financial Services',
    referencePrice: 42,
  },
  {
    symbol: 'TMO',
    name: 'Thermo Fisher Scientific Inc.',
    sector: 'Healthcare',
    referencePrice: 562,
  },
  {
    symbol: 'MCD',
    name: "McDonald's Corporation",
    sector: 'Consumer Cyclical',
    referencePrice: 302,
  },
  { symbol: 'ACN', name: 'Accenture plc Class A', sector: 'Technology', referencePrice: 352 },
  { symbol: 'LIN', name: 'Linde plc', sector: 'Basic Materials', referencePrice: 468 },
  { symbol: 'ABT', name: 'Abbott Laboratories', sector: 'Healthcare', referencePrice: 115 },
  {
    symbol: 'DIS',
    name: 'Walt Disney Company',
    sector: 'Communication Services',
    referencePrice: 96,
  },
  {
    symbol: 'WFC',
    name: 'Wells Fargo & Company',
    sector: 'Financial Services',
    referencePrice: 62,
  },
  { symbol: 'DHR', name: 'Danaher Corporation', sector: 'Healthcare', referencePrice: 252 },
  {
    symbol: 'VZ',
    name: 'Verizon Communications Inc.',
    sector: 'Communication Services',
    referencePrice: 43,
  },
  {
    symbol: 'PM',
    name: 'Philip Morris International Inc.',
    sector: 'Consumer Defensive',
    referencePrice: 122,
  },
  { symbol: 'NEE', name: 'NextEra Energy Inc.', sector: 'Utilities', referencePrice: 78 },
  { symbol: 'RTX', name: 'RTX Corporation', sector: 'Industrials', referencePrice: 122 },
  { symbol: 'UNP', name: 'Union Pacific Corporation', sector: 'Industrials', referencePrice: 242 },
  {
    symbol: 'LOW',
    name: "Lowe's Companies Inc.",
    sector: 'Consumer Cyclical',
    referencePrice: 262,
  },
  {
    symbol: 'IBM',
    name: 'International Business Machines Corporation',
    sector: 'Technology',
    referencePrice: 228,
  },
  { symbol: 'SPGI', name: 'S&P Global Inc.', sector: 'Financial Services', referencePrice: 512 },
  { symbol: 'CAT', name: 'Caterpillar Inc.', sector: 'Industrials', referencePrice: 385 },
  {
    symbol: 'GS',
    name: 'Goldman Sachs Group Inc.',
    sector: 'Financial Services',
    referencePrice: 512,
  },
  { symbol: 'BA', name: 'Boeing Company', sector: 'Industrials', referencePrice: 152 },
  {
    symbol: 'HON',
    name: 'Honeywell International Inc.',
    sector: 'Industrials',
    referencePrice: 212,
  },
  { symbol: 'ELV', name: 'Elevance Health Inc.', sector: 'Healthcare', referencePrice: 482 },
  { symbol: 'DE', name: 'Deere & Company', sector: 'Industrials', referencePrice: 412 },
  { symbol: 'BLK', name: 'BlackRock Inc.', sector: 'Financial Services', referencePrice: 962 },
  { symbol: 'PLD', name: 'Prologis Inc.', sector: 'Real Estate', referencePrice: 118 },
  {
    symbol: 'LMT',
    name: 'Lockheed Martin Corporation',
    sector: 'Industrials',
    referencePrice: 582,
  },
  { symbol: 'SYK', name: 'Stryker Corporation', sector: 'Healthcare', referencePrice: 358 },
  { symbol: 'TJX', name: 'TJX Companies Inc.', sector: 'Consumer Cyclical', referencePrice: 118 },
  {
    symbol: 'AXP',
    name: 'American Express Company',
    sector: 'Financial Services',
    referencePrice: 272,
  },
  { symbol: 'MMM', name: '3M Company', sector: 'Industrials', referencePrice: 132 },
  { symbol: 'CVS', name: 'CVS Health Corporation', sector: 'Healthcare', referencePrice: 58 },
  { symbol: 'MO', name: 'Altria Group Inc.', sector: 'Consumer Defensive', referencePrice: 52 },
  {
    symbol: 'SCHW',
    name: 'Charles Schwab Corporation',
    sector: 'Financial Services',
    referencePrice: 68,
  },
  { symbol: 'CI', name: 'Cigna Group', sector: 'Healthcare', referencePrice: 342 },
  { symbol: 'SO', name: 'Southern Company', sector: 'Utilities', referencePrice: 89 },
  { symbol: 'DUK', name: 'Duke Energy Corporation', sector: 'Utilities', referencePrice: 112 },
  { symbol: 'T', name: 'AT&T Inc.', sector: 'Communication Services', referencePrice: 22 },
  { symbol: 'PFE', name: 'Pfizer Inc.', sector: 'Healthcare', referencePrice: 28 },
  { symbol: 'NKE', name: 'NIKE Inc. Class B', sector: 'Consumer Cyclical', referencePrice: 78 },
  { symbol: 'ORCL', name: 'Oracle Corporation', sector: 'Technology', referencePrice: 172 },
  { symbol: 'UPS', name: 'United Parcel Service Inc.', sector: 'Industrials', referencePrice: 128 },
  { symbol: 'GE', name: 'GE Aerospace', sector: 'Industrials', referencePrice: 185 },
  { symbol: 'COP', name: 'ConocoPhillips', sector: 'Energy', referencePrice: 108 },
  { symbol: 'MS', name: 'Morgan Stanley', sector: 'Financial Services', referencePrice: 105 },
  { symbol: 'C', name: 'Citigroup Inc.', sector: 'Financial Services', referencePrice: 63 },
];

export const INSTRUMENT_SEED: Readonly<Record<Exchange, InstrumentSeed[]>> = {
  NSE: NSE_INSTRUMENTS,
  BSE: BSE_INSTRUMENTS,
  NASDAQ: NASDAQ_INSTRUMENTS,
  NYSE: NYSE_INSTRUMENTS,
};

/**
 * Maps an instrument to the ticker its provider expects. Yahoo suffixes Indian
 * symbols by exchange; US symbols pass through unchanged.
 */
export function toProviderSymbol(symbol: string, exchange: Exchange): string {
  switch (exchange) {
    case 'NSE':
      return `${symbol}.NS`;
    case 'BSE':
      return `${symbol}.BO`;
    default:
      return symbol;
  }
}

/** Market indices tracked on the market overview page. */
export interface IndexSeed {
  symbol: string;
  providerSymbol: string;
  name: string;
  market: 'IN' | 'US';
  referenceValue: number;
}

export const MARKET_INDICES: IndexSeed[] = [
  {
    symbol: 'NIFTY50',
    providerSymbol: '^NSEI',
    name: 'NIFTY 50',
    market: 'IN',
    referenceValue: 24850,
  },
  {
    symbol: 'SENSEX',
    providerSymbol: '^BSESN',
    name: 'S&P BSE SENSEX',
    market: 'IN',
    referenceValue: 81500,
  },
  {
    symbol: 'BANKNIFTY',
    providerSymbol: '^NSEBANK',
    name: 'NIFTY Bank',
    market: 'IN',
    referenceValue: 52400,
  },
  { symbol: 'SPX', providerSymbol: '^GSPC', name: 'S&P 500', market: 'US', referenceValue: 5820 },
  {
    symbol: 'IXIC',
    providerSymbol: '^IXIC',
    name: 'NASDAQ Composite',
    market: 'US',
    referenceValue: 18450,
  },
  {
    symbol: 'DJI',
    providerSymbol: '^DJI',
    name: 'Dow Jones Industrial Average',
    market: 'US',
    referenceValue: 42300,
  },
];
