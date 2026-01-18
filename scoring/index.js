/**
 * Scoring Index - Main Orchestrator
 * Combines all scoring layers with dynamic weighting
 */

import { checkQualityGates } from './qualityGates.js';
import { calculateRiskScore } from './riskScore.js';
import { calculateFundamentalScore } from './fundamentalScore.js';
import { calculateValuationScore } from './valuationScore.js';
import { calculateMomentumScore } from './momentumScore.js';
import { calculateExternalScore } from './externalScore.js';

/**
 * Market condition detection
 * In production, would use Nifty/market data
 */
function detectMarketCondition(allStocks) {
    // Calculate average 3-month return of all stocks
    const returns = allStocks
        .map(s => s['Return over 3months'] || 0)
        .filter(r => !isNaN(r));

    if (returns.length === 0) return 'NEUTRAL';

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const positiveCount = returns.filter(r => r > 0).length;
    const positiveRatio = positiveCount / returns.length;

    if (avgReturn > 10 && positiveRatio > 0.7) return 'BULLISH';
    if (avgReturn < -10 && positiveRatio < 0.3) return 'BEARISH';
    return 'NEUTRAL';
}

/**
 * Get dynamic weights based on market condition
 */
function getDynamicWeights(marketCondition) {
    switch (marketCondition) {
        case 'BEARISH':
            // In bear markets, prioritize safety
            return {
                safety: 0.40,
                fundamental: 0.25,
                valuation: 0.25,
                momentum: 0.05,
                external: 0.05
            };
        case 'BULLISH':
            // In bull markets, capture more upside
            return {
                safety: 0.20,
                fundamental: 0.30,
                valuation: 0.20,
                momentum: 0.20,
                external: 0.10
            };
        default:
            // Neutral - balanced approach
            return {
                safety: 0.30,
                fundamental: 0.25,
                valuation: 0.20,
                momentum: 0.15,
                external: 0.10
            };
    }
}

/**
 * Calculate complete score for a single stock
 */
export function calculateStockScore(stock, allStocks = [], marketCondition = null) {
    // 1. Quality Gates - Must pass to be considered
    const gateResult = checkQualityGates(stock);

    if (!gateResult.passed) {
        return {
            name: stock.Name,
            nseCode: stock['NSE Code'],
            industry: stock.Industry,
            passed: false,
            gateResult,
            scores: null,
            compositeScore: 0,
            recommendation: 'EXCLUDED'
        };
    }

    // 2. Calculate all score components
    const riskScore = calculateRiskScore(stock);
    const fundamentalScore = calculateFundamentalScore(stock);
    const valuationScore = calculateValuationScore(stock);
    const momentumScore = calculateMomentumScore(stock);
    const externalScore = calculateExternalScore(stock, allStocks);

    // 3. Get weights based on market condition
    const condition = marketCondition || detectMarketCondition(allStocks);
    const weights = getDynamicWeights(condition);

    // 4. Calculate composite score
    const compositeScore =
        weights.safety * riskScore.score +
        weights.fundamental * fundamentalScore.score +
        weights.valuation * valuationScore.score +
        weights.momentum * momentumScore.score +
        weights.external * externalScore.score;

    // 5. Generate recommendation
    const recommendation = getRecommendation(compositeScore, riskScore.score);

    return {
        name: stock.Name,
        nseCode: stock['NSE Code'],
        bseCode: stock['BSE Code'],
        industry: stock.Industry,
        industryGroup: stock['Industry Group'],
        currentPrice: stock['Current Price'],
        marketCap: stock['Market Capitalization'],
        passed: true,
        gateResult,
        scores: {
            risk: riskScore,
            fundamental: fundamentalScore,
            valuation: valuationScore,
            momentum: momentumScore,
            external: externalScore
        },
        // Return metrics for contrarian analysis
        return1w: stock['Return over 1week'] || 0,
        return1m: stock['Return over 1month'] || 0,
        return3m: stock['Return over 3months'] || 0,
        weights,
        marketCondition: condition,
        compositeScore: Math.round(compositeScore),
        recommendation
    };
}

/**
 * Score all stocks and return sorted results
 */
export function scoreAllStocks(stocks) {
    // Detect market condition from all stocks
    const marketCondition = detectMarketCondition(stocks);

    // Score each stock
    const scoredStocks = stocks.map(stock =>
        calculateStockScore(stock, stocks, marketCondition)
    );

    // Separate passed and failed
    const passed = scoredStocks.filter(s => s.passed);
    const failed = scoredStocks.filter(s => !s.passed);

    // Sort passed stocks by composite score (descending)
    passed.sort((a, b) => b.compositeScore - a.compositeScore);

    return {
        marketCondition,
        passed,
        failed,
        summary: {
            total: stocks.length,
            passedGates: passed.length,
            failedGates: failed.length,
            avgCompositeScore: passed.length > 0
                ? Math.round(passed.reduce((sum, s) => sum + s.compositeScore, 0) / passed.length)
                : 0
        }
    };
}

/**
 * Get recommendation label
 */
function getRecommendation(compositeScore, safetyScore) {
    if (compositeScore >= 70 && safetyScore >= 60) return 'STRONG BUY';
    if (compositeScore >= 60 && safetyScore >= 50) return 'BUY';
    if (compositeScore >= 50) return 'ACCUMULATE';
    if (compositeScore >= 40) return 'HOLD';
    return 'WATCH';
}

/**
 * Generate summary statistics
 */
export function generateScoringStats(scoringResult) {
    const { passed, failed, marketCondition } = scoringResult;

    // Score distribution
    const scoreRanges = {
        'Strong Buy (70+)': passed.filter(s => s.compositeScore >= 70).length,
        'Buy (60-70)': passed.filter(s => s.compositeScore >= 60 && s.compositeScore < 70).length,
        'Accumulate (50-60)': passed.filter(s => s.compositeScore >= 50 && s.compositeScore < 60).length,
        'Hold (40-50)': passed.filter(s => s.compositeScore >= 40 && s.compositeScore < 50).length,
        'Watch (<40)': passed.filter(s => s.compositeScore < 40).length
    };

    // Sector distribution
    const sectorCounts = {};
    for (const stock of passed) {
        const sector = stock.industryGroup || 'Other';
        sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
    }

    // Top failures reasons
    const failureReasons = {};
    for (const stock of failed) {
        for (const failure of stock.gateResult.failures) {
            const reason = failure.split(':')[0];
            failureReasons[reason] = (failureReasons[reason] || 0) + 1;
        }
    }

    return {
        marketCondition,
        scoreRanges,
        sectorCounts,
        failureReasons,
        topScorers: passed.slice(0, 10).map(s => ({
            name: s.name,
            code: s.nseCode,
            score: s.compositeScore,
            recommendation: s.recommendation
        }))
    };
}
