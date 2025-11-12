const https = require('https');

/**
 * API Ninjas Earnings endpoint
 * Returns comprehensive financial data including:
 * - Income Statement (revenue, expenses, profit margins)
 * - Balance Sheet (assets, liabilities, equity)
 * - Cash Flow (operating, investing, financing)
 */

// Cache for earnings data (24 hour TTL since financial data doesn't change frequently)
const earningsCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetches data from API Ninjas
 */
function fetchFromApiNinjas(path, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.api-ninjas.com',
      path: path,
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey
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
            resolve({ success: true, data: jsonData, statusCode: res.statusCode });
          } catch (error) {
            resolve({ success: false, message: 'Failed to parse JSON', statusCode: res.statusCode });
          }
        } else {
          resolve({ success: false, message: data, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * Calculates the most recent completed fiscal quarter
 * Companies typically file earnings 45 days after quarter end
 */
function getMostRecentQuarter() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11

  // Estimate most recent filed quarter based on current month
  // Accounting for ~45 day filing delay
  let quarter, year;

  if (currentMonth >= 10) {
    // November-December: Q3 should be filed
    quarter = 3;
    year = currentYear;
  } else if (currentMonth >= 7) {
    // August-October: Q2 should be filed
    quarter = 2;
    year = currentYear;
  } else if (currentMonth >= 4) {
    // May-July: Q1 should be filed
    quarter = 1;
    year = currentYear;
  } else {
    // January-April: Q4 of previous year should be filed
    quarter = 4;
    year = currentYear - 1;
  }

  return { quarter, year };
}

/**
 * Fetches earnings data for a ticker
 */
async function fetchEarningsData(ticker, apiKey) {
  try {
    const { quarter, year } = getMostRecentQuarter();
    console.log(`Fetching earnings data for ${ticker} - Q${quarter} ${year}...`);

    // Request the most recent quarter
    const result = await fetchFromApiNinjas(`/v1/earnings?ticker=${ticker}&year=${year}&quarter=${quarter}`, apiKey);

    if (!result.success) {
      console.log(`Earnings API failed for ${ticker} Q${quarter} ${year}:`, result.statusCode);

      // Try previous quarter as fallback
      const prevQuarter = quarter === 1 ? 4 : quarter - 1;
      const prevYear = quarter === 1 ? year - 1 : year;
      console.log(`Trying previous quarter: Q${prevQuarter} ${prevYear}...`);

      const fallbackResult = await fetchFromApiNinjas(`/v1/earnings?ticker=${ticker}&year=${prevYear}&quarter=${prevQuarter}`, apiKey);

      if (!fallbackResult.success) {
        console.log(`Fallback also failed for ${ticker}`);
        return null;
      }

      console.log(`Earnings data received for ${ticker} (fallback to Q${prevQuarter} ${prevYear})`);
      return fallbackResult.data;
    }

    console.log(`Earnings data received for ${ticker} - Q${quarter} ${year}`);
    console.log(`Filing date: ${result.data.filing_info?.filing_date}, Period end: ${result.data.filing_info?.period_end_date}`);

    return result.data;
  } catch (error) {
    console.error(`Error fetching earnings for ${ticker}:`, error);
    return null;
  }
}

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API_KEY not configured' });
    }

    // Get ticker from query params
    const { ticker } = req.query;

    if (!ticker) {
      return res.status(400).json({ error: 'Missing ticker parameter' });
    }

    const tickerUpper = ticker.toUpperCase();

    // Check cache
    const cacheKey = tickerUpper;
    const cached = earningsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`Returning cached earnings data for ${tickerUpper}`);
      return res.status(200).json({
        success: true,
        cached: true,
        data: cached.data
      });
    }

    // Fetch earnings data
    const earningsData = await fetchEarningsData(tickerUpper, apiKey);

    if (!earningsData) {
      return res.status(404).json({
        success: false,
        error: 'Earnings data not available for this ticker'
      });
    }

    // Cache the result
    earningsCache.set(cacheKey, {
      data: earningsData,
      timestamp: Date.now()
    });

    return res.status(200).json({
      success: true,
      cached: false,
      data: earningsData
    });

  } catch (error) {
    console.error('Error in earnings endpoint:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
