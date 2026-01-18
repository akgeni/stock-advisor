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
import { checkAI } from '../ai.js';

/**
 * Generate weekly recommendation
 * @param {Array} stocks - Raw stock data
 * @returns {Object} Complete recommendation with weights
 */
export async function generateRecommendation(stocks) {
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

    // 5. Get Top Picks (Initially based on quant score)
    let topPicks = getTopPicks(portfolioResult.stocks);

    // 6. ENHANCE with AI Checks (Top 15 only to save time)
    // We only run AI on the best candidates to refine the scoring
    const enhancedPicks = [];
    console.log(`🧠 Running AI Analysis on Top ${topPicks.length} candidates...`);

    for (const pick of topPicks) {
        try {
            // Check AI
            const aiData = await checkAI(pick.name, pick.industry);

            // Parse Score
            let aiScore = 50; // Neutral default
            if (aiData && aiData.aiScore) {
                const parsed = parseInt(aiData.aiScore);
                if (!isNaN(parsed)) aiScore = parsed;
            }

            // Update Composite Score (80% Quant + 20% AI)
            // Existing composite is 0-100
            const oldScore = pick.compositeScore || 50;
            const newComposite = Math.round((oldScore * 0.8) + (aiScore * 0.2));

            enhancedPicks.push({
                ...pick,
                aiScore, // Store raw AI score
                compositeScore: newComposite, // Update main score
                scoreBreakdown: {
                    ...pick.scoreBreakdown,
                    ai: aiScore
                }
            });

        } catch (e) {
            console.error(`AI Check failed for ${pick.name}:`, e.message);
            enhancedPicks.push(pick); // Keep original if fail
        }
    }

    // Re-sort based on new scores
    topPicks = enhancedPicks.sort((a, b) => b.compositeScore - a.compositeScore);


    // 7. Build recommendation object
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
            stocks: portfolioResult.stocks.map(s => {
                // Update allocation stocks with AI score if they are in top picks
                const enhanced = topPicks.find(p => p.code === s.nseCode);
                return enhanced ? { ...s, compositeScore: enhanced.compositeScore, aiScore: enhanced.aiScore } : s;
            }),
            totalEquity: portfolioResult.totalWeight,
            cash: portfolioResult.cashAllocation,
            sectorBreakdown: portfolioResult.sectorAllocation
        },

        // Top picks with reasoning
        topPicks,

        // Watchlist (good stocks but not in main allocation)
        watchlist: getWatchlist(scoringResult.passed, portfolioResult.stocks),

        // Contrarian Picks (quality stocks with recent corrections)
        contrarianPicks: getContrarianPicks(scoringResult.passed),

        // Sector Trends (calculated from ALL passed stocks)
        sectorTrends: calculateSectorTrends(scoringResult.passed),

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
 * Get top 20 picks with detailed reasoning
 */
function getTopPicks(stocks) {
    return stocks.slice(0, 20).map(stock => ({
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
 * Get Contrarian Picks - Quality stocks with recent corrections
 * "Buy the Dip" opportunities: Strong fundamentals + Undervalued + Weak Momentum
 */
function getContrarianPicks(allPassed) {
    return allPassed
        .filter(s => {
            const fundamental = s.scores?.fundamental?.score || s.scores?.fundamental || 0;
            const valuation = s.scores?.valuation?.score || s.scores?.valuation || 0;
            const momentum = s.scores?.momentum?.score || s.scores?.momentum || 0;

            // Contrarian criteria:
            // 1. Strong fundamentals (>= 70)
            // 2. Good valuation / undervalued (>= 60)
            // 3. Weak momentum (< 45) - recent correction
            return fundamental >= 70 && valuation >= 60 && momentum < 45;
        })
        .sort((a, b) => {
            // Sort by fundamental strength (best quality first)
            const fundA = a.scores?.fundamental?.score || a.scores?.fundamental || 0;
            const fundB = b.scores?.fundamental?.score || b.scores?.fundamental || 0;
            return fundB - fundA;
        })
        .slice(0, 10)
        .map(s => {
            const fundamental = s.scores?.fundamental?.score || s.scores?.fundamental || 0;
            const valuation = s.scores?.valuation?.score || s.scores?.valuation || 0;
            const momentum = s.scores?.momentum?.score || s.scores?.momentum || 0;

            return {
                name: s.name,
                code: s.nseCode,
                industry: s.industry,
                currentPrice: s.currentPrice,
                compositeScore: s.compositeScore,
                recommendation: s.recommendation,
                // Score breakdown
                scores: {
                    fundamental,
                    valuation,
                    momentum,
                    safety: s.scores?.risk?.score || s.scores?.risk || 0
                },
                // Correction metrics - now using direct fields
                return1w: s.return1w || 0,
                return1m: s.return1m || 0,
                return3m: s.return3m || 0,
                // Why it's a contrarian pick - with detailed reason
                contrarian_reason: getContrarianReason(s, fundamental, valuation, momentum)
            };
        });
}

/**
 * Get detailed reason for contrarian pick
 */
function getContrarianReason(stock, fundamental, valuation, momentum) {
    const return3m = stock.return3m || 0;
    const return1m = stock.return1m || 0;

    // Build a specific reason based on the stock's characteristics
    if (fundamental >= 80 && valuation >= 80 && return3m < -15) {
        return `🌟 Top-tier quality (F:${fundamental}) crashed ${return3m.toFixed(0)}% in 3M - rare deep value`;
    } else if (fundamental >= 80 && valuation >= 70) {
        return `💎 Premium fundamentals (${fundamental}) at discount valuation (${valuation})`;
    } else if (valuation >= 80 && return3m < -10) {
        return `💰 Heavily undervalued (V:${valuation}) after ${return3m.toFixed(0)}% correction`;
    } else if (momentum < 35 && return1m < -10) {
        return `📉 Oversold (M:${momentum}) with ${return1m.toFixed(0)}% drop - mean reversion play`;
    } else if (fundamental >= 75 && return3m < -20) {
        return `🔥 Quality stock (F:${fundamental}) down ${return3m.toFixed(0)}% - contrarian opportunity`;
    } else {
        return `🎯 Strong base (F:${fundamental}, V:${valuation}) + weak momentum (${momentum}) = entry zone`;
    }
}

/**
 * Calculate Sector Trends from ALL passed stocks
 * Groups stocks by industry/sector and calculates aggregate metrics
 */
function calculateSectorTrends(allPassedStocks) {
    const sectorMap = {};

    // Group stocks by industry
    for (const stock of allPassedStocks) {
        const sector = stock.industry || 'Other';
        if (!sectorMap[sector]) {
            sectorMap[sector] = {
                sector,
                stocks: [],
                totalScore: 0,
                totalReturn3m: 0,
                totalMomentum: 0
            };
        }
        sectorMap[sector].stocks.push(stock);
        sectorMap[sector].totalScore += stock.compositeScore || 0;
        sectorMap[sector].totalReturn3m += stock.return3m || 0;
        sectorMap[sector].totalMomentum += (stock.scores?.momentum?.score || stock.scores?.momentum || 0);
        // Add external score for sector trend calculation
        sectorMap[sector].totalExternal = (sectorMap[sector].totalExternal || 0) + (stock.scores?.external?.score || stock.scores?.external || 0);
    }

    // Calculate averages and determine trends
    const sectors = Object.values(sectorMap).map(s => {
        const count = s.stocks.length;
        const avgMomentum = count > 0 ? Math.round(s.totalMomentum / count) : 0;
        const avgExternal = count > 0 ? Math.round((s.totalExternal || 0) / count) : 0;
        const avgReturn3m = count > 0 ? s.totalReturn3m / count : 0;

        // Sector Score = 50% Momentum + 50% External
        const avgScore = Math.round(0.5 * avgMomentum + 0.5 * avgExternal);

        // Determine trend based on momentum score (correlates better with sector quality)
        // High momentum = stocks in uptrend, Low momentum = stocks in downtrend
        let trend = 'neutral';
        let trendIcon = '➡️';
        if (avgMomentum >= 55 || (avgMomentum >= 45 && avgReturn3m > 5)) {
            trend = 'bullish';
            trendIcon = '🚀';
        } else if (avgMomentum < 40 || (avgMomentum < 50 && avgReturn3m < -10)) {
            trend = 'bearish';
            trendIcon = '📉';
        }

        return {
            sector: s.sector,
            stockCount: count,
            sectorScore: avgScore,
            avgReturn3m: parseFloat(avgReturn3m.toFixed(1)),
            avgMomentum,
            trend,
            trendIcon
        };
    });

    // Sort by sector score (highest first)
    return sectors.sort((a, b) => b.sectorScore - a.sectorScore);
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
