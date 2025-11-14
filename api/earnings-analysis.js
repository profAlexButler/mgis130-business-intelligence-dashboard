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
    console.log(`Fetching earnings transcript for ${ticker}...`);
    const result = await fetchFromApiNinjas(`/v1/earningstranscript?ticker=${ticker}`, apiKey);

    if (!result.success) {
      console.log(`Earnings transcript API failed for ${ticker}:`, result.statusCode);
      return null;
    }

    console.log(`Earnings transcript received for ${ticker}, keys:`, Object.keys(result.data));
    return result.data;
  } catch (error) {
    console.error(`Error fetching earnings transcript for ${ticker}:`, error);
    return null;
  }
}

/**
 * Splits text into sentences for analysis
 */
function splitIntoSentences(text) {
  if (!text) return [];

  // Split on sentence boundaries (., !, ?)
  // Keep the punctuation and handle common abbreviations
  const sentences = text
    .replace(/([.!?])\s+/g, '$1|')
    .split('|')
    .map(s => s.trim())
    .filter(s => s.length > 20); // Filter out very short fragments

  return sentences;
}

/**
 * Analyzes sentiment of a single sentence using API Ninjas
 */
async function analyzeSentenceSentiment(sentence, apiKey) {
  try {
    // Keep sentences under reasonable length for URL encoding
    const maxLength = 500;
    const textToAnalyze = sentence.length > maxLength ? sentence.substring(0, maxLength) : sentence;

    const encodedText = encodeURIComponent(textToAnalyze);

    const result = await fetchFromApiNinjas(`/v1/sentiment?text=${encodedText}`, apiKey);

    if (!result.success) {
      return null;
    }

    return {
      sentence: textToAnalyze,
      sentiment: result.data.sentiment,
      score: result.data.score
    };
  } catch (error) {
    console.error('Error analyzing sentence sentiment:', error);
    return null;
  }
}

/**
 * Analyzes sentiment for multiple sentences with rate limiting
 */
async function analyzeSentimentDetailed(text, apiKey) {
  try {
    console.log('Starting detailed sentiment analysis...');

    // Split into sentences
    const sentences = splitIntoSentences(text);
    console.log(`Split into ${sentences.length} sentences`);

    if (sentences.length === 0) {
      return null;
    }

    // Limit to first 20 sentences to avoid too many API calls
    const sentencesToAnalyze = sentences.slice(0, 20);
    console.log(`Analyzing ${sentencesToAnalyze.length} sentences...`);

    // Analyze sentences with small delays to avoid rate limiting
    const results = [];
    for (let i = 0; i < sentencesToAnalyze.length; i++) {
      const result = await analyzeSentenceSentiment(sentencesToAnalyze[i], apiKey);
      if (result) {
        results.push(result);
      }

      // Small delay between requests (100ms)
      if (i < sentencesToAnalyze.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Successfully analyzed ${results.length} sentences`);

    if (results.length === 0) {
      return null;
    }

    // Aggregate results
    const positive = results.filter(r => r.sentiment === 'POSITIVE');
    const negative = results.filter(r => r.sentiment === 'NEGATIVE');
    const neutral = results.filter(r => r.sentiment === 'NEUTRAL');

    // Find most positive and most negative
    const mostPositive = positive.length > 0
      ? positive.reduce((max, r) => r.score > max.score ? r : max)
      : null;

    const mostNegative = negative.length > 0
      ? negative.reduce((min, r) => r.score < min.score ? r : min)
      : null;

    // Calculate average score
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    // Determine overall sentiment based on counts and average
    let overallSentiment = 'NEUTRAL';
    if (positive.length > negative.length && avgScore > 0.55) {
      overallSentiment = 'POSITIVE';
    } else if (negative.length > positive.length && avgScore < 0.45) {
      overallSentiment = 'NEGATIVE';
    }

    const aggregatedData = {
      overall: {
        sentiment: overallSentiment,
        score: avgScore
      },
      breakdown: {
        positive: positive.length,
        negative: negative.length,
        neutral: neutral.length,
        total: results.length
      },
      highlights: {
        mostPositive: mostPositive,
        mostNegative: mostNegative
      },
      sentimentRatio: {
        positivePercent: Math.round((positive.length / results.length) * 100),
        negativePercent: Math.round((negative.length / results.length) * 100),
        neutralPercent: Math.round((neutral.length / results.length) * 100)
      }
    };

    console.log('Sentiment analysis complete:', JSON.stringify(aggregatedData.breakdown));

    return aggregatedData;
  } catch (error) {
    console.error('Error in detailed sentiment analysis:', error);
    return null;
  }
}

/**
 * Extracts key executive statements from earnings transcript
 */
function extractKeyStatements(transcript) {
  if (!transcript) {
    console.log('No transcript provided');
    return '';
  }

  console.log('Transcript keys:', Object.keys(transcript));
  console.log('transcript_split type:', typeof transcript.transcript_split);

  // Parse transcript_split if it's a JSON string
  let transcriptSplit = transcript.transcript_split;
  if (typeof transcriptSplit === 'string') {
    try {
      console.log('Parsing transcript_split JSON string...');
      transcriptSplit = JSON.parse(transcriptSplit);
      console.log('Successfully parsed, array length:', transcriptSplit.length);
    } catch (error) {
      console.error('Failed to parse transcript_split:', error.message);
      transcriptSplit = null;
    }
  }

  // Check if transcript_split is an array before using it
  if (Array.isArray(transcriptSplit) && transcriptSplit.length > 0) {
    console.log('transcript_split length:', transcriptSplit.length);
    console.log('First item sample:', JSON.stringify(transcriptSplit[0]).substring(0, 200));

    // Focus on CEO and CFO statements (most important for sentiment)
    const keyRoles = ['Chief Executive Officer', 'Chief Financial Officer', 'Chairman'];
    const executiveStatements = transcriptSplit
      .filter(item => item && item.role && keyRoles.some(role => item.role.includes(role)))
      .filter(item => item.text); // Remove any null/undefined texts

    // Take statements from the MIDDLE/END of the call (skip first statement which is often intro)
    // Get last 3 executive statements for better sentiment (Q&A, conclusions)
    const relevantStatements = executiveStatements.length > 3
      ? executiveStatements.slice(-3) // Last 3 statements
      : executiveStatements; // All statements if <= 3

    const keyStatements = relevantStatements
      .map(item => item.text)
      .join(' ');

    console.log('Extracted key statements from', relevantStatements.length, 'executive statements (total:', executiveStatements.length, ')');
    console.log('Key statements length:', keyStatements.length);
    if (keyStatements) {
      return keyStatements;
    }
  }

  // Fallback to full transcript text if available
  // Use the END of the transcript to avoid introductions and get Q&A/conclusions
  if (transcript.transcript && typeof transcript.transcript === 'string') {
    console.log('Using full transcript fallback, length:', transcript.transcript.length);
    const transcriptLength = transcript.transcript.length;
    // Take the last 1000 characters for better sentiment (Q&A, conclusions, not intros)
    const startPos = Math.max(0, transcriptLength - 1000);
    const endSegment = transcript.transcript.substring(startPos);
    console.log('Using end segment from position', startPos, 'to', transcriptLength);
    return endSegment;
  }

  console.log('No suitable transcript data found');
  return '';
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

  // 1. SENTIMENT ANALYSIS (40% weight) - Now with detailed breakdown
  if (sentimentData && sentimentData.overall) {
    const score = sentimentData.overall.score;
    const sentiment = sentimentData.overall.sentiment;
    const breakdown = sentimentData.breakdown;
    const ratios = sentimentData.sentimentRatio;

    if (sentiment === 'POSITIVE' && score > 0.5) {
      factors.sentiment = 1;
      reasoning.push(`✅ Positive earnings sentiment: ${ratios.positivePercent}% positive statements (${breakdown.positive}/${breakdown.total} analyzed)`);
    } else if (sentiment === 'NEGATIVE' || score < 0.3) {
      factors.sentiment = -1;
      reasoning.push(`⚠️ Negative earnings sentiment: ${ratios.negativePercent}% negative statements suggests challenges`);
    } else {
      factors.sentiment = 0;
      reasoning.push(`➖ Mixed earnings sentiment: ${ratios.positivePercent}% positive, ${ratios.negativePercent}% negative`);
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

    // Analyze earnings sentiment with detailed sentence-level analysis
    let sentimentData = null;
    if (earningsTranscript) {
      console.log('Earnings transcript received, extracting key statements...');
      const keyStatements = extractKeyStatements(earningsTranscript);
      console.log('Key statements extracted:', keyStatements ? `${keyStatements.length} characters` : 'empty/null');
      if (keyStatements) {
        sentimentData = await analyzeSentimentDetailed(keyStatements, apiKey);
        console.log('Sentiment data result:', sentimentData ? 'received' : 'null');
      } else {
        console.log('No key statements extracted, skipping sentiment analysis');
      }
    } else {
      console.log('No earnings transcript available');
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
        hasTranscript: true,
        transcript: earningsTranscript.transcript || null,
        transcriptSplit: earningsTranscript.transcript_split ?
          (typeof earningsTranscript.transcript_split === 'string' ?
            JSON.parse(earningsTranscript.transcript_split) :
            earningsTranscript.transcript_split) : null,
        participants: earningsTranscript.participants || null
      } : { hasTranscript: false },
      sentimentAnalysis: sentimentData ? {
        overall: sentimentData.overall,
        breakdown: sentimentData.breakdown,
        highlights: sentimentData.highlights,
        sentimentRatio: sentimentData.sentimentRatio
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
