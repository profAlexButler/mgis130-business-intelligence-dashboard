/**
 * Serverless API Function: Economic Indicators Fetcher
 *
 * Fetches key US economic indicators from API Ninjas.
 * Attempts to fetch multiple indicators and handles unavailable endpoints gracefully.
 *
 * Environment Variables Required:
 * - API_KEY: API Ninjas authentication key
 */

const https = require('https');

// Cache for economic data (1 hour TTL - economic data changes slowly)
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Generic function to fetch data from API Ninjas
 * @param {string} endpoint - API endpoint path
 * @param {string} apiKey - API Ninjas API key
 * @returns {Promise<Object>} API response data
 */
function fetchFromApiNinjas(endpoint, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.api-ninjas.com',
      path: endpoint,
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
            reject(new Error(`Failed to parse JSON from ${endpoint}: ${error.message}`));
          }
        } else if (res.statusCode === 404) {
          // Endpoint doesn't exist
          resolve({ success: false, statusCode: 404, message: 'Endpoint not available' });
        } else {
          resolve({ success: false, statusCode: res.statusCode, message: `API error: ${res.statusCode}` });
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Network error fetching ${endpoint}: ${error.message}`));
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${endpoint}`));
    });

    req.end();
  });
}

/**
 * Fetches inflation data from API Ninjas
 * @param {string} apiKey - API Ninjas API key
 * @returns {Promise<Object>} Inflation data or null
 */
async function fetchInflationData(apiKey) {
  try {
    // Add country parameter for US data
    const result = await fetchFromApiNinjas('/v1/inflation?country=united%20states', apiKey);

    if (!result.success) {
      console.log('Inflation API failed:', result.statusCode, result.message);
      return null;
    }

    const jsonData = result.data;
    console.log('Inflation raw response:', JSON.stringify(jsonData));

    // API Ninjas returns an array of inflation data
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      const latest = jsonData[0];
      // Try different possible field names
      const rateValue = latest.yearly_rate_pct || latest.rate || latest.inflation_rate || latest.value;

      if (rateValue !== undefined && rateValue !== null) {
        return {
          value: parseFloat(rateValue),
          period: latest.period || latest.year || latest.date || 'Recent',
          type: latest.type || 'CPI'
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching inflation:', error);
    return null;
  }
}

/**
 * Fetches interest rate data from API Ninjas
 * @param {string} apiKey - API Ninjas API key
 * @returns {Promise<Object>} Interest rate data or null
 */
async function fetchInterestRateData(apiKey) {
  try {
    // Add central bank parameter for Fed
    const result = await fetchFromApiNinjas('/v1/interestrate?central_bank=federal_reserve', apiKey);

    if (!result.success) {
      console.log('Interest rate API failed:', result.statusCode, result.message);
      return null;
    }

    const jsonData = result.data;
    console.log('Interest rate raw response:', JSON.stringify(jsonData));

    // Handle different possible response formats
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      const latest = jsonData[0];
      const rateValue = latest.rate_pct || latest.rate || latest.value || latest.central_bank_rate;

      if (rateValue !== undefined && rateValue !== null) {
        return {
          value: parseFloat(rateValue),
          period: latest.last_updated || latest.period || latest.date || 'Current'
        };
      }
    } else if (jsonData && typeof jsonData === 'object') {
      const rateValue = jsonData.rate_pct || jsonData.rate || jsonData.value;
      if (rateValue !== undefined && rateValue !== null) {
        return {
          value: parseFloat(rateValue),
          period: jsonData.last_updated || jsonData.period || jsonData.date || 'Current'
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching interest rate:', error);
    return null;
  }
}

/**
 * Fetches mortgage rate data from API Ninjas
 * @param {string} apiKey - API Ninjas API key
 * @returns {Promise<Object>} Mortgage rate data or null
 */
async function fetchMortgageRateData(apiKey) {
  try {
    // Mortgage rate endpoint - no parameters needed for US data
    const result = await fetchFromApiNinjas('/v1/mortgagerate', apiKey);

    if (!result.success) {
      console.log('Mortgage rate API failed:', result.statusCode, result.message);
      return null;
    }

    const jsonData = result.data;
    console.log('Mortgage rate raw response:', JSON.stringify(jsonData));

    // Handle different possible response formats
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      const latest = jsonData[0];
      const rateValue = latest.rate_30_year || latest.rate || latest.value;

      if (rateValue !== undefined && rateValue !== null) {
        return {
          value: parseFloat(rateValue),
          period: latest.date || latest.period || latest.week || 'Current',
          type: latest.type || '30-year fixed'
        };
      }
    } else if (jsonData && typeof jsonData === 'object') {
      const rateValue = jsonData.rate_30_year || jsonData.rate || jsonData.value;
      if (rateValue !== undefined && rateValue !== null) {
        return {
          value: parseFloat(rateValue),
          period: jsonData.date || jsonData.period || jsonData.week || 'Current',
          type: jsonData.type || '30-year fixed'
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching mortgage rate:', error);
    return null;
  }
}

/**
 * Fetches unemployment data from API Ninjas
 * @param {string} apiKey - API Ninjas API key
 * @returns {Promise<Object>} Unemployment data or null
 */
async function fetchUnemploymentData(apiKey) {
  try {
    // Add country parameter for US data
    const result = await fetchFromApiNinjas('/v1/unemployment?country=united%20states', apiKey);

    if (!result.success) {
      console.log('Unemployment API failed:', result.statusCode, result.message);
      return null;
    }

    const jsonData = result.data;
    console.log('Unemployment raw response:', JSON.stringify(jsonData));

    // Handle different possible response formats
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      const latest = jsonData[0];
      const rateValue = latest.overall_unemployment_rate || latest.unemployment_rate || latest.rate || latest.value;

      if (rateValue !== undefined && rateValue !== null) {
        return {
          value: parseFloat(rateValue),
          period: latest.period || latest.date || latest.year_month || 'Current'
        };
      }
    } else if (jsonData && typeof jsonData === 'object') {
      const rateValue = jsonData.overall_unemployment_rate || jsonData.unemployment_rate || jsonData.rate || jsonData.value;
      if (rateValue !== undefined && rateValue !== null) {
        return {
          value: parseFloat(rateValue),
          period: jsonData.period || jsonData.date || jsonData.year_month || 'Current'
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching unemployment:', error);
    return null;
  }
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
 * Get status level for unemployment rate
 */
function getUnemploymentStatus(rate) {
  if (rate < 4) return { level: 'good', color: 'green', label: 'Low' };
  if (rate < 6) return { level: 'moderate', color: 'yellow', label: 'Moderate' };
  return { level: 'concerning', color: 'red', label: 'High' };
}

/**
 * Get status level for interest rate
 */
function getInterestRateStatus(rate) {
  if (rate < 2) return { level: 'info', color: 'green', label: 'Low' };
  if (rate < 4) return { level: 'info', color: 'yellow', label: 'Moderate' };
  return { level: 'info', color: 'red', label: 'High' };
}

/**
 * Get status level for mortgage rate
 */
function getMortgageRateStatus(rate) {
  if (rate < 4) return { level: 'good', color: 'green', label: 'Low' };
  if (rate < 6) return { level: 'moderate', color: 'yellow', label: 'Moderate' };
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

    // Fetch all economic indicators in parallel
    const [inflationData, interestRateData, mortgageRateData, unemploymentData] = await Promise.all([
      fetchInflationData(apiKey),
      fetchInterestRateData(apiKey),
      fetchMortgageRateData(apiKey),
      fetchUnemploymentData(apiKey)
    ]);

    // Build indicators object with available data
    const indicators = {};
    const availableSources = [];

    // Inflation
    if (inflationData) {
      indicators.inflation = {
        name: 'Inflation Rate',
        value: inflationData.value,
        unit: '%',
        period: inflationData.period,
        status: getInflationStatus(inflationData.value),
        available: true
      };
      availableSources.push('Inflation');
    } else {
      indicators.inflation = {
        name: 'Inflation Rate',
        value: null,
        unit: '%',
        status: { level: 'info', color: 'blue', label: 'N/A' },
        available: false,
        note: 'Data temporarily unavailable'
      };
    }

    // Mortgage Rate
    if (mortgageRateData) {
      indicators.mortgageRate = {
        name: 'Mortgage Rate (30-yr)',
        value: mortgageRateData.value,
        unit: '%',
        period: mortgageRateData.period,
        status: getMortgageRateStatus(mortgageRateData.value),
        available: true
      };
      availableSources.push('Mortgage Rate');
    } else {
      indicators.mortgageRate = {
        name: 'Mortgage Rate (30-yr)',
        value: null,
        unit: '%',
        status: { level: 'info', color: 'blue', label: 'N/A' },
        available: false,
        note: 'Data temporarily unavailable'
      };
    }

    // Unemployment
    if (unemploymentData) {
      indicators.unemployment = {
        name: 'Unemployment Rate',
        value: unemploymentData.value,
        unit: '%',
        period: unemploymentData.period,
        status: getUnemploymentStatus(unemploymentData.value),
        available: true
      };
      availableSources.push('Unemployment');
    } else {
      indicators.unemployment = {
        name: 'Unemployment Rate',
        value: null,
        unit: '%',
        status: { level: 'info', color: 'blue', label: 'N/A' },
        available: false,
        note: 'Data temporarily unavailable'
      };
    }

    // Interest Rate
    if (interestRateData) {
      indicators.interestRate = {
        name: 'Fed Interest Rate',
        value: interestRateData.value,
        unit: '%',
        period: interestRateData.period,
        status: getInterestRateStatus(interestRateData.value),
        available: true
      };
      availableSources.push('Interest Rate');
    } else {
      indicators.interestRate = {
        name: 'Fed Interest Rate',
        value: null,
        unit: '%',
        status: { level: 'info', color: 'blue', label: 'N/A' },
        available: false,
        note: 'Data temporarily unavailable'
      };
    }

    // Build source string
    const sourceString = availableSources.length > 0
      ? `API Ninjas (${availableSources.join(', ')})`
      : 'API Ninjas (checking available endpoints)';

    // Store in cache
    const responseData = {
      indicators,
      lastUpdated: new Date().toISOString(),
      source: sourceString,
      availableCount: availableSources.length,
      totalIndicators: 4
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
      note: 'Error fetching economic data from API Ninjas'
    });
  }
};
