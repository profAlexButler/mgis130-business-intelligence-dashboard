/**
 * Serverless API Function: Historical Stock Data Fetcher
 *
 * Fetches 30-day historical stock data from Yahoo Finance for charting
 * and trend analysis. Implements caching to reduce API calls.
 *
 * Yahoo Finance API is free and doesn't require authentication.
 */

const https = require('https');

// In-memory cache for historical data (5-minute TTL)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches historical stock data from Yahoo Finance
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<Object>} Historical data with timestamps and prices
 */
function fetchYahooFinanceData(ticker) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'query1.finance.yahoo.com',
      path: `/v8/finance/chart/${ticker}?interval=1d&range=1mo`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data);

            // Extract data from Yahoo Finance response structure
            const result = jsonData.chart?.result?.[0];
            if (!result) {
              reject(new Error(`No data found for ${ticker}`));
              return;
            }

            const timestamps = result.timestamp || [];
            const quotes = result.indicators?.quote?.[0];
            const closePrices = quotes?.close || [];

            // Filter out null values and create data points
            const dataPoints = timestamps
              .map((timestamp, index) => ({
                date: new Date(timestamp * 1000).toISOString().split('T')[0],
                price: closePrices[index]
              }))
              .filter(point => point.price !== null);

            if (dataPoints.length === 0) {
              reject(new Error(`No valid price data for ${ticker}`));
              return;
            }

            // Calculate statistics
            const prices = dataPoints.map(p => p.price);
            const high = Math.max(...prices);
            const low = Math.min(...prices);
            const average = prices.reduce((sum, p) => sum + p, 0) / prices.length;

            // Calculate 30-day trend (first vs last price)
            const firstPrice = prices[0];
            const lastPrice = prices[prices.length - 1];
            const trendPercent = ((lastPrice - firstPrice) / firstPrice) * 100;

            resolve({
              ticker,
              dataPoints,
              statistics: {
                high: parseFloat(high.toFixed(2)),
                low: parseFloat(low.toFixed(2)),
                average: parseFloat(average.toFixed(2)),
                trendPercent: parseFloat(trendPercent.toFixed(2)),
                trendDirection: trendPercent >= 0 ? 'up' : 'down'
              }
            });
          } catch (error) {
            reject(new Error(`Failed to parse Yahoo Finance data for ${ticker}: ${error.message}`));
          }
        } else {
          reject(new Error(`Yahoo Finance API error for ${ticker}: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Network error fetching ${ticker}: ${error.message}`));
    });

    req.end();
  });
}

/**
 * Main handler with caching
 */
module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'This endpoint only accepts GET requests'
    });
  }

  // Get ticker from query parameter
  const ticker = req.query.ticker;

  if (!ticker) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'Ticker parameter is required'
    });
  }

  try {
    // Check cache first
    const cacheKey = ticker.toUpperCase();
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({
        success: true,
        cached: true,
        data: cached.data
      });
    }

    // Fetch fresh data
    const historicalData = await fetchYahooFinanceData(ticker);

    // Store in cache
    cache.set(cacheKey, {
      timestamp: Date.now(),
      data: historicalData
    });

    // Clean old cache entries (keep cache size manageable)
    if (cache.size > 20) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    return res.status(200).json({
      success: true,
      cached: false,
      data: historicalData
    });

  } catch (error) {
    console.error('Error fetching historical data:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
