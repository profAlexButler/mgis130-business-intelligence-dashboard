/**
 * Serverless API Function: Earnings Analysis & Investment Recommendations
 *
 * This endpoint provides AI-powered investment recommendations by analyzing:
 * 1. Earnings call transcript sentiment
 * 2. Current stock price and 30-day trends
 * 3. Macroeconomic indicators
 *
 * Returns BUY/HOLD/SELL recommendation with detailed reasoning.
 *
 * Environment Variables Required:
 * - API_KEY: API Ninjas authentication key
 */

const https = require('https');

// Cache for earnings analysis (24 hour TTL - earnings data doesn't change frequently)
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generic function to fetch data from API Ninjas
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
            resolve({ success: true, data: jsonData });
          } catch (error) {
            reject(new Error(`Failed to parse JSON from ${endpoint}: ${error.message}`));
          }
        } else {
          resolve({ success: false, statusCode: res.statusCode, error: `API error: ${res.statusCode}` });
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Network error fetching ${endpoint}: ${error.message}`));
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${endpoint}`));
    });

    req.end();
  });
}

/**
 * Fetches earnings call transcript
 */
async function fetchEarningsTranscript(ticker, apiKey) {
  try {
    const result = await fetchFromApiNinjas(`/v1/earningstranscript?ticker=${ticker}`, apiKey);

    if (!result.success) {
      console.log(`Earnings transcript API failed for ${ticker}:`, result.statusCode);
      return null;
    }

    return result.data;
  } catch (error) {
    console.error(`Error fetching earnings transcript for ${ticker}:`, error);
    return null;
  }
}

/**
 * Analyzes sentiment of text using API Ninjas
 */
async function analyzeSentiment(text, apiKey) {
  try {
    // Sentiment API has text length limits - truncate if needed
    const maxLength = 2000;
    const textToAnalyze = text.length > maxLength ? text.substring(0, maxLength) : text;

    const encodedText = encodeURIComponent(textToAnalyze);
    const result = await fetchFromApiNinjas(`/v1/sentiment?text=${encodedText}`, apiKey);

    if (!result.success) {
      console.log('Sentiment analysis API failed:', result.statusCode);
      return null;
    }

    return result.data;
  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    return null;
  }
}

/**
 * Extracts key executive statements from earnings transcript
 */
function extractKeyStatements(transcript) {
  if (!transcript || !transcript.transcript_split) {
    return '';
  }

  // Focus on CEO and CFO statements (most important for sentiment)
  const keyRoles = ['Chief Executive Officer', 'Chief Financial Officer', 'Chairman'];
  const keyStatements = transcript.transcript_split
    .filter(item => keyRoles.some(role => item.role && item.role.includes(role)))
    .slice(0, 3) // Get first 3 key executive statements
    .map(item => item.text)
    .join(' ');

  return keyStatements || transcript.transcript.substring(0, 2000);
}

/**
 * Generates investment recommendation based on all factors
 */
function generateRecommendation(stockData, sentimentData, economicData, historicalTrend) {
  const factors = {
    sentiment: 0,
    priceTrend: 0,
    economic: 0
  };

  let reasoning = [];

  // 1. SENTIMENT ANALYSIS (40% weight)
  if (sentimentData && sentimentData.score !== undefined) {
    const score = sentimentData.score;
    const sentiment = sentimentData.sentiment;

    if (sentiment === 'POSITIVE' && score > 0.5) {
      factors.sentiment = 1;
      reasoning.push(`✅ Positive earnings sentiment (${(score * 100).toFixed(0)}% confidence) indicates strong company outlook`);
    } else if (sentiment === 'NEGATIVE' || score < 0.3) {
      factors.sentiment = -1;
      reasoning.push(`⚠️ Negative earnings sentiment suggests challenges ahead`);
    } else {
      factors.sentiment = 0;
      reasoning.push(`➖ Neutral earnings sentiment indicates mixed outlook`);
    }
  }

  // 2. PRICE TREND ANALYSIS (30% weight)
  if (historicalTrend && historicalTrend.trendPercent !== undefined) {
    const trend = historicalTrend.trendPercent;

    if (trend > 5) {
      factors.priceTrend = 1;
      reasoning.push(`📈 Strong 30-day uptrend (+${trend.toFixed(1)}%) shows positive momentum`);
    } else if (trend < -5) {
      factors.priceTrend = -1;
      reasoning.push(`📉 30-day downtrend (${trend.toFixed(1)}%) indicates selling pressure`);
    } else {
      factors.priceTrend = 0;
      reasoning.push(`➖ Price relatively stable over past 30 days (${trend > 0 ? '+' : ''}${trend.toFixed(1)}%)`);
    }
  }

  // 3. ECONOMIC INDICATORS (30% weight)
  if (economicData && economicData.indicators) {
    const indicators = economicData.indicators;
    let economicScore = 0;
    let economicReasons = [];

    // Check inflation
    if (indicators.inflation && indicators.inflation.available) {
      if (indicators.inflation.value < 3) {
        economicScore += 0.5;
        economicReasons.push('low inflation');
      } else if (indicators.inflation.value > 5) {
        economicScore -= 0.5;
        economicReasons.push('high inflation');
      }
    }

    // Check unemployment
    if (indicators.unemployment && indicators.unemployment.available) {
      if (indicators.unemployment.value < 5) {
        economicScore += 0.5;
        economicReasons.push('strong employment');
      } else if (indicators.unemployment.value > 6) {
        economicScore -= 0.5;
        economicReasons.push('weak employment');
      }
    }

    if (economicScore > 0) {
      factors.economic = 1;
      reasoning.push(`🌍 Favorable economic conditions (${economicReasons.join(', ')})`);
    } else if (economicScore < 0) {
      factors.economic = -1;
      reasoning.push(`🌍 Challenging economic environment (${economicReasons.join(', ')})`);
    } else {
      factors.economic = 0;
      reasoning.push(`🌍 Mixed economic signals`);
    }
  }

  // CALCULATE FINAL SCORE
  const finalScore = (factors.sentiment * 0.4) + (factors.priceTrend * 0.3) + (factors.economic * 0.3);

  let recommendation, confidence, riskLevel, summary;

  if (finalScore > 0.4) {
    recommendation = 'BUY';
    confidence = 'High';
    riskLevel = 'Moderate';
    summary = 'Strong indicators suggest potential for appreciation. Positive sentiment combined with favorable conditions support a buying opportunity.';
  } else if (finalScore > 0) {
    recommendation = 'BUY';
    confidence = 'Moderate';
    riskLevel = 'Moderate';
    summary = 'Generally positive indicators with some caution. Consider gradual position building.';
  } else if (finalScore > -0.4) {
    recommendation = 'HOLD';
    confidence = 'Moderate';
    riskLevel = 'Moderate';
    summary = 'Mixed signals suggest maintaining current position. Monitor for clearer trends before making changes.';
  } else {
    recommendation = 'SELL';
    confidence = 'Moderate';
    riskLevel = 'Elevated';
    summary = 'Negative indicators suggest risk mitigation. Consider reducing exposure or taking profits.';
  }

  return {
    recommendation,
    confidence,
    riskLevel,
    score: finalScore,
    summary,
    reasoning,
    factors,
    disclaimer: 'This analysis is for educational purposes only and not financial advice. Always conduct thorough research and consult with financial professionals before making investment decisions.'
  };
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

  // Get ticker from query parameter
  const ticker = req.query.ticker;

  if (!ticker) {
    return res.status(400).json({
      error: 'Bad request',
      message: 'Ticker parameter is required'
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
    const cacheKey = `earnings_${ticker.toUpperCase()}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({
        success: true,
        cached: true,
        data: cached.data
      });
    }

    // Fetch all data in parallel
    const [earningsTranscript, stockPriceResult, historicalDataResult, economicDataResult] = await Promise.all([
      fetchEarningsTranscript(ticker, apiKey),
      fetchFromApiNinjas(`/v1/stockprice?ticker=${ticker}`, apiKey),
      fetchFromApiNinjas(`/v1/historicaldata?ticker=${ticker}`, apiKey).catch(() => ({ success: false })),
      fetchFromApiNinjas('/v1/economics', apiKey).catch(() => ({ success: false }))
    ]);

    // Get stock price
    const stockData = stockPriceResult.success ? stockPriceResult.data : null;

    // Get historical trend data (or fetch from our own history endpoint)
    let historicalTrend = null;
    if (!historicalDataResult.success) {
      // Fallback to our own history endpoint
      try {
        const historyResponse = await fetch(`${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/history?ticker=${ticker}`);
        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          if (historyData.success) {
            historicalTrend = historyData.data.statistics;
          }
        }
      } catch (err) {
        console.log('Failed to fetch from history endpoint:', err.message);
      }
    }

    // Get economic data (or fetch from our own economics endpoint)
    let economicData = economicDataResult.success ? economicDataResult.data : null;
    if (!economicData) {
      try {
        const economicsResponse = await fetch(`${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/economics`);
        if (economicsResponse.ok) {
          const economicsResult = await economicsResponse.json();
          if (economicsResult.success) {
            economicData = economicsResult.data;
          }
        }
      } catch (err) {
        console.log('Failed to fetch from economics endpoint:', err.message);
      }
    }

    // Analyze earnings sentiment
    let sentimentData = null;
    if (earningsTranscript) {
      const keyStatements = extractKeyStatements(earningsTranscript);
      if (keyStatements) {
        sentimentData = await analyzeSentiment(keyStatements, apiKey);
      }
    }

    // Generate recommendation
    const recommendation = generateRecommendation(stockData, sentimentData, economicData, historicalTrend);

    // Build response
    const responseData = {
      ticker: ticker.toUpperCase(),
      timestamp: new Date().toISOString(),
      stockData: stockData ? {
        price: stockData.price,
        ticker: stockData.ticker
      } : null,
      earningsData: earningsTranscript ? {
        date: earningsTranscript.date,
        quarter: earningsTranscript.quarter,
        year: earningsTranscript.year,
        hasTranscript: true
      } : { hasTranscript: false },
      sentimentAnalysis: sentimentData ? {
        score: sentimentData.score,
        sentiment: sentimentData.sentiment
      } : null,
      historicalTrend: historicalTrend,
      recommendation: recommendation
    };

    // Cache the result
    cache.set(cacheKey, {
      timestamp: Date.now(),
      data: responseData
    });

    return res.status(200).json({
      success: true,
      cached: false,
      data: responseData
    });

  } catch (error) {
    console.error('Error in earnings analysis:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
