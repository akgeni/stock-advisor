/**
 * Recommendation Engine
 * Generates weekly recommendations with persistence
 */

import { scoreAllStocks, generateScoringStats } from '../scoring/index.js';
import { calculatePortfolioWeights, validateWeights } from './positionSizing.js';

/**
 * Generate weekly recommendation
 * @param {Array} stocks - Raw stock data
 * @returns {Object} Complete recommendation with weights
 */
export function generateRecommendation(stocks) {
    const timestamp = new Date().toISOString();
    const weekId = getWeekId(new Date());

    // 1. Score all stocks
    const scoringResult = scoreAllStocks(stocks);

    // 2. Generate scoring statistics
    const stats = generateScoringStats(scoringResult);

    // 3. Calculate portfolio weights for passed stocks
    const portfolioResult = calculatePortfolioWeights(scoringResult.passed);

    // 4. Validate weights
    const validation = validateWeights(portfolioResult);

    // 5. Build recommendation object
    const recommendation = {
        id: `rec_${weekId}`,
        weekId,
        timestamp,
        marketCondition: scoringResult.marketCondition,

        // Summary stats
        summary: {
            totalAnalyzed: stocks.length,
            passedGates: scoringResult.passed.length,
            failedGates: scoringResult.failed.length,
            recommendedStocks: portfolioResult.stocks.length,
            averageScore: stats.topScorers.length > 0
                ? Math.round(stats.topScorers.reduce((s, t) => s + t.score, 0) / stats.topScorers.length)
                : 0
        },

        // Portfolio allocation
        allocation: {
            stocks: portfolioResult.stocks,
            totalEquity: portfolioResult.totalWeight,
            cash: portfolioResult.cashAllocation,
            sectorBreakdown: portfolioResult.sectorAllocation
        },

        // Top picks with reasoning
        topPicks: getTopPicks(portfolioResult.stocks),

        // Watchlist (good stocks but not in main allocation)
        watchlist: getWatchlist(scoringResult.passed, portfolioResult.stocks),

        // Failed stocks info
        excluded: {
            count: scoringResult.failed.length,
            reasons: getExclusionSummary(scoringResult.failed)
        },

        // Validation status
        validation
    };

    return recommendation;
}

/**
 * Get top 5 picks with detailed reasoning
 */
function getTopPicks(stocks) {
    return stocks.slice(0, 5).map(stock => ({
        name: stock.name,
        code: stock.nseCode,
        weight: stock.weight,
        price: stock.currentPrice,
        industry: stock.industry,
        compositeScore: stock.compositeScore,
        recommendation: stock.recommendation,

        // Key strengths
        strengths: getStrengths(stock),

        // Key risks
        risks: getRisks(stock),

        // Score breakdown
        scoreBreakdown: {
            safety: stock.scores.risk,
            fundamental: stock.scores.fundamental,
            valuation: stock.scores.valuation,
            momentum: stock.scores.momentum,
            external: stock.scores.external
        }
    }));
}

/**
 * Get stock strengths based on scores
 */
function getStrengths(stock) {
    const strengths = [];

    if (stock.scores.risk >= 70) strengths.push('Low risk profile');
    if (stock.scores.fundamental >= 70) strengths.push('Strong fundamentals');
    if (stock.scores.valuation >= 70) strengths.push('Attractive valuation');
    if (stock.scores.momentum >= 60) strengths.push('Positive momentum');
    if (stock.scores.external >= 60) strengths.push('Favorable sector trends');

    if (strengths.length === 0) {
        if (stock.compositeScore >= 55) strengths.push('Balanced overall profile');
    }

    return strengths;
}

/**
 * Get stock risks based on scores
 */
function getRisks(stock) {
    const risks = [];

    if (stock.scores.risk < 50) risks.push('Above average risk');
    if (stock.scores.momentum < 40) risks.push('Weak momentum');
    if (stock.scores.valuation < 40) risks.push('Valuation concerns');
    if (stock.riskLevel === 'High' || stock.riskLevel === 'Very High') {
        risks.push('Elevated overall risk');
    }

    return risks;
}

/**
 * Get watchlist stocks (scored well but didn't make allocation)
 */
function getWatchlist(allPassed, allocated) {
    const allocatedCodes = new Set(allocated.map(s => s.nseCode));

    return allPassed
        .filter(s => !allocatedCodes.has(s.nseCode) && s.compositeScore >= 50)
        .slice(0, 10)
        .map(s => ({
            name: s.name,
            code: s.nseCode,
            industry: s.industry,
            compositeScore: s.compositeScore,
            recommendation: s.recommendation,
            reason: getWatchlistReason(s)
        }));
}

/**
 * Get reason for watchlist inclusion
 */
function getWatchlistReason(stock) {
    if (stock.scores.momentum.score < 45) {
        return 'Good fundamentals, waiting for better entry point';
    }
    if (stock.scores.valuation.score < 45) {
        return 'Quality stock but currently expensive';
    }
    if (stock.scores.risk.score < 50) {
        return 'Potential but needs risk reduction';
    }
    return 'Monitor for allocation opportunity';
}

/**
 * Get summary of exclusion reasons
 */
function getExclusionSummary(failedStocks) {
    const reasons = {};

    for (const stock of failedStocks) {
        for (const failure of stock.gateResult.failures) {
            const category = failure.split(':')[0];
            reasons[category] = (reasons[category] || 0) + 1;
        }
    }

    return Object.entries(reasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Generate week ID (YYYY-WW format)
 */
function getWeekId(date) {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Compare two recommendations
 */
export function compareRecommendations(current, previous) {
    if (!previous) return { changes: [], new: current.allocation.stocks, removed: [] };

    const currentCodes = new Set(current.allocation.stocks.map(s => s.nseCode));
    const previousCodes = new Set(previous.allocation.stocks.map(s => s.nseCode));

    const newStocks = current.allocation.stocks.filter(s => !previousCodes.has(s.nseCode));
    const removedStocks = previous.allocation.stocks.filter(s => !currentCodes.has(s.nseCode));

    const weightChanges = [];
    for (const stock of current.allocation.stocks) {
        const prevStock = previous.allocation.stocks.find(s => s.nseCode === stock.nseCode);
        if (prevStock && Math.abs(stock.weight - prevStock.weight) > 0.5) {
            weightChanges.push({
                code: stock.nseCode,
                name: stock.name,
                previousWeight: prevStock.weight,
                currentWeight: stock.weight,
                change: stock.weight - prevStock.weight
            });
        }
    }

    return {
        new: newStocks,
        removed: removedStocks,
        weightChanges: weightChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)),
        marketConditionChange: current.marketCondition !== previous.marketCondition
            ? { from: previous.marketCondition, to: current.marketCondition }
            : null
    };
}
