/**
 * Serverless API Function: Economic Indicators Fetcher
 *
 * Fetches key US economic indicators from API Ninjas.
 * Available indicators: Inflation Rate
 *
 * Note: API Ninjas has limited economic data. For production use,
 * consider integrating with FRED API (Federal Reserve Economic Data)
 * or other economic data providers.
 *
 * Environment Variables Required:
 * - API_KEY: API Ninjas authentication key
 */

const https = require('https');

// Cache for economic data (1 hour TTL - economic data changes slowly)
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetches inflation data from API Ninjas
 * @param {string} apiKey - API Ninjas API key
 * @returns {Promise<Object>} Inflation data
 */
function fetchInflationData(apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.api-ninjas.com',
      path: '/v1/inflation',
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

            // API Ninjas returns an array of inflation data
            // Get the most recent entry (usually first in array)
            if (Array.isArray(jsonData) && jsonData.length > 0) {
              const latest = jsonData[0];
              resolve({
                type: latest.type || 'CPI',
                period: latest.period || 'Unknown',
                rate: parseFloat(latest.rate) || 0
              });
            } else {
              reject(new Error('No inflation data available'));
            }
          } catch (error) {
            reject(new Error(`Failed to parse inflation data: ${error.message}`));
          }
        } else {
          reject(new Error(`API Ninjas inflation endpoint error: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Network error fetching inflation: ${error.message}`));
    });

    req.end();
  });
}

/**
 * Get status level for inflation rate
 */
function getInflationStatus(rate) {
  if (rate < 2) return { level: 'good', color: 'green', label: 'Low' };
  if (rate < 4) return { level: 'moderate', color: 'yellow', label: 'Moderate' };
  return { level: 'concerning', color: 'red', label: 'High' };
}

/**
 * Main handler
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

  // Validate API key
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Configuration error',
      message: 'API_KEY environment variable is not configured'
    });
  }

  try {
    // Check cache
    const cacheKey = 'economic_indicators';
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({
        success: true,
        cached: true,
        timestamp: new Date(cached.timestamp).toISOString(),
        data: cached.data
      });
    }

    // Fetch inflation data
    const inflationData = await fetchInflationData(apiKey);
    const inflationStatus = getInflationStatus(inflationData.rate);

    const indicators = {
      inflation: {
        name: 'Inflation Rate',
        value: inflationData.rate,
        unit: '%',
        period: inflationData.period,
        status: inflationStatus,
        available: true
      },
      // Note: These would require additional API integrations
      // Including them as unavailable with informational messages
      gdp: {
        name: 'GDP Growth Rate',
        value: null,
        unit: '%',
        status: { level: 'info', color: 'blue', label: 'N/A' },
        available: false,
        note: 'Requires FRED API or BEA integration'
      },
      unemployment: {
        name: 'Unemployment Rate',
        value: null,
        unit: '%',
        status: { level: 'info', color: 'blue', label: 'N/A' },
        available: false,
        note: 'Requires BLS API integration'
      },
      interestRate: {
        name: 'Fed Interest Rate',
        value: null,
        unit: '%',
        status: { level: 'info', color: 'blue', label: 'N/A' },
        available: false,
        note: 'Requires FRED API integration'
      }
    };

    // Store in cache
    const responseData = {
      indicators,
      lastUpdated: new Date().toISOString(),
      source: 'API Ninjas (Inflation), Others require additional integrations'
    };

    cache.set(cacheKey, {
      timestamp: Date.now(),
      data: responseData
    });

    return res.status(200).json({
      success: true,
      cached: false,
      timestamp: new Date().toISOString(),
      data: responseData
    });

  } catch (error) {
    console.error('Error fetching economic indicators:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      note: 'Some economic indicators may require additional API integrations'
    });
  }
};
