/**
 * Serverless API Function: Stock Price Fetcher
 *
 * This function fetches real-time stock prices for major technology companies
 * from the API Ninjas Stock Price endpoint and returns formatted data for
 * the business intelligence dashboard.
 *
 * Environment Variables Required:
 * - API_KEY: API Ninjas authentication key
 */

// Company information mapping
const COMPANIES = [
  { ticker: 'AAPL', name: 'Apple Inc.' },
  { ticker: 'MSFT', name: 'Microsoft Corporation' },
  { ticker: 'GOOGL', name: 'Alphabet Inc. (Google)' },
  { ticker: 'META', name: 'Meta Platforms Inc.' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.' }
];

/**
 * Fetches stock price for a single ticker symbol
 * @param {string} ticker - Stock ticker symbol
 * @param {string} apiKey - API Ninjas API key
 * @returns {Promise<Object>} Stock data object
 */
async function fetchStockPrice(ticker, apiKey) {
  const url = `https://api.api-ninjas.com/v1/stockprice?ticker=${ticker}`;

  const response = await fetch(url, {
    headers: {
      'X-Api-Key': apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${ticker}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Main serverless function handler
 * Vercel will automatically invoke this function for requests to /api/stocks
 */
export default async function handler(req, res) {
  // Set CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'This endpoint only accepts GET requests'
    });
  }

  // Validate API key exists
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Configuration error',
      message: 'API_KEY environment variable is not configured'
    });
  }

  try {
    // Fetch stock data for all companies in parallel for better performance
    const stockPromises = COMPANIES.map(async (company) => {
      try {
        const stockData = await fetchStockPrice(company.ticker, apiKey);

        return {
          ticker: company.ticker,
          companyName: company.name,
          price: stockData.price || null,
          timestamp: new Date().toISOString(),
          success: true
        };
      } catch (error) {
        // Log error but don't fail entire request if one stock fails
        console.error(`Error fetching ${company.ticker}:`, error.message);

        return {
          ticker: company.ticker,
          companyName: company.name,
          price: null,
          timestamp: new Date().toISOString(),
          success: false,
          error: error.message
        };
      }
    });

    // Wait for all stock data fetches to complete
    const stocksData = await Promise.all(stockPromises);

    // Check if all requests failed
    const allFailed = stocksData.every(stock => !stock.success);
    if (allFailed) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Unable to fetch stock data from API provider',
        data: stocksData
      });
    }

    // Return successful response with stock data
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      data: stocksData,
      message: 'Stock data retrieved successfully'
    });

  } catch (error) {
    // Handle unexpected errors
    console.error('Unexpected error in stock API handler:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while fetching stock data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
