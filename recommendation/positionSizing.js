/**
 * Position Sizing - Risk-adjusted weight calculation
 * Uses inverse volatility, dynamic caps, and sector diversification
 */

import { getSectorGroup } from '../scoring/sectorConfig.js';

/**
 * Calculate portfolio weights for recommended stocks
 * @param {Array} scoredStocks - Stocks that passed quality gates with scores
 * @param {Object} options - Configuration options
 * @returns {Array} Stocks with calculated weights
 */
export function calculatePortfolioWeights(scoredStocks, options = {}) {
    const config = {
        maxSingleStock: 12,        // Max weight for single stock (%)
        maxTop5: 50,               // Max weight for top 5 stocks (%)
        maxPerSector: 25,          // Max weight per sector (%)
        minStockWeight: 2,         // Minimum weight to include (%)
        targetEquityAllocation: 90, // Keep 10% cash
        ...options
    };

    // Filter out low-scoring stocks and take top 20
    const eligibleStocks = scoredStocks
        .filter(s => s.passed && s.compositeScore >= 45)
        .slice(0, 20)
        .map(s => ({ ...s }));

    if (eligibleStocks.length === 0) {
        return { stocks: [], totalWeight: 0, cashAllocation: 100, sectorAllocation: [] };
    }

    // Step 1: Calculate conviction scores
    eligibleStocks.forEach(stock => {
        const safetyMultiplier = Math.max(0.5, stock.scores.risk.score / 100);
        stock.conviction = stock.compositeScore * safetyMultiplier;
    });

    // Step 2: Calculate initial weights from conviction
    const totalConviction = eligibleStocks.reduce((sum, s) => sum + s.conviction, 0);

    eligibleStocks.forEach(stock => {
        // Base weight proportional to conviction
        stock.rawWeight = (stock.conviction / totalConviction) * config.targetEquityAllocation;
    });

    // Step 3: Cap individual stocks
    eligibleStocks.forEach(stock => {
        const safetyScore = stock.scores.risk.score;

        // Dynamic cap based on safety score
        let maxWeight;
        if (safetyScore >= 75) maxWeight = config.maxSingleStock;
        else if (safetyScore >= 65) maxWeight = 10;
        else if (safetyScore >= 55) maxWeight = 8;
        else maxWeight = 5;

        stock.cappedWeight = Math.min(stock.rawWeight, maxWeight);
    });

    // Assign sector groups
    eligibleStocks.forEach(stock => {
        stock.sectorGroup = getSectorGroup(stock.industry);
    });

    // Step 4: Apply sector limits iteratively
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
        iterations++;
        let sectorOverflow = false;

        // Calculate current sector totals
        const sectorTotals = {};
        eligibleStocks.forEach(stock => {
            sectorTotals[stock.sectorGroup] = (sectorTotals[stock.sectorGroup] || 0) + stock.cappedWeight;
        });

        // Check and fix overflowing sectors
        for (const sector of Object.keys(sectorTotals)) {
            if (sectorTotals[sector] > config.maxPerSector) {
                sectorOverflow = true;
                const scaleFactor = config.maxPerSector / sectorTotals[sector];

                eligibleStocks.forEach(stock => {
                    if (stock.sectorGroup === sector) {
                        stock.cappedWeight *= scaleFactor;
                    }
                });
            }
        }

        if (!sectorOverflow) break;
    }

    // Step 5: Sort by weight and apply top 5 limit
    eligibleStocks.sort((a, b) => b.cappedWeight - a.cappedWeight);

    const top5Total = eligibleStocks.slice(0, 5).reduce((sum, s) => sum + s.cappedWeight, 0);
    if (top5Total > config.maxTop5) {
        const scaleFactor = config.maxTop5 / top5Total;
        eligibleStocks.slice(0, 5).forEach(stock => {
            stock.cappedWeight *= scaleFactor;
        });
    }

    // Step 6: Remove stocks below minimum weight
    eligibleStocks.forEach(stock => {
        if (stock.cappedWeight < config.minStockWeight) {
            stock.excluded = true;
        }
    });

    const includedStocks = eligibleStocks.filter(s => !s.excluded);

    // Step 7: Calculate totals and round
    const rawTotal = includedStocks.reduce((sum, s) => sum + s.cappedWeight, 0);

    // Normalize so weights sum to targetEquityAllocation
    const normalizer = rawTotal > 0 ? config.targetEquityAllocation / rawTotal : 1;

    includedStocks.forEach(stock => {
        stock.weight = Math.round(stock.cappedWeight * normalizer * 10) / 10;
    });

    // Adjust first stock for rounding to hit target exactly
    const currentTotal = includedStocks.reduce((sum, s) => sum + s.weight, 0);
    const diff = config.targetEquityAllocation - currentTotal;
    if (includedStocks.length > 0 && Math.abs(diff) >= 0.1) {
        includedStocks[0].weight = Math.round((includedStocks[0].weight + diff) * 10) / 10;
    }

    // Final values
    const finalTotal = includedStocks.reduce((sum, s) => sum + s.weight, 0);
    const cashAllocation = Math.round((100 - finalTotal) * 10) / 10;

    // Prepare final output
    const finalStocks = includedStocks.map(stock => ({
        name: stock.name,
        nseCode: stock.nseCode,
        bseCode: stock.bseCode,
        industry: stock.industry,
        sectorGroup: stock.sectorGroup,
        currentPrice: stock.currentPrice,
        marketCap: stock.marketCap,
        weight: stock.weight,
        compositeScore: stock.compositeScore,
        recommendation: stock.recommendation,
        scores: {
            risk: stock.scores.risk.score,
            fundamental: stock.scores.fundamental.score,
            valuation: stock.scores.valuation.score,
            momentum: stock.scores.momentum.score,
            external: stock.scores.external.score
        },
        // Return metrics for sector trend analysis
        return1w: stock.return1w || 0,
        return1m: stock.return1m || 0,
        return3m: stock.return3m || 0,
        riskLevel: stock.scores.risk.riskLevel,
        conviction: Math.round(stock.conviction)
    }));

    // Sort by weight descending
    finalStocks.sort((a, b) => b.weight - a.weight);

    return {
        stocks: finalStocks,
        totalWeight: Math.round(finalTotal * 10) / 10,
        cashAllocation,
        sectorAllocation: calculateSectorAllocation(finalStocks),
        excludedCount: eligibleStocks.filter(s => s.excluded).length
    };
}

/**
 * Calculate sector allocation summary
 */
function calculateSectorAllocation(stocks) {
    const sectorWeights = {};

    for (const stock of stocks) {
        const sector = stock.sectorGroup;
        sectorWeights[sector] = (sectorWeights[sector] || 0) + stock.weight;
    }

    return Object.entries(sectorWeights)
        .map(([sector, weight]) => ({ sector, weight: Math.round(weight * 10) / 10 }))
        .sort((a, b) => b.weight - a.weight);
}

/**
 * Validate portfolio weights
 */
export function validateWeights(result) {
    const issues = [];

    // Check total weight
    const totalWeight = result.stocks.reduce((sum, s) => sum + s.weight, 0);
    if (Math.abs(totalWeight - result.totalWeight) > 1) {
        issues.push(`Weight mismatch: calculated ${totalWeight.toFixed(1)}, reported ${result.totalWeight}`);
    }

    // Check sector concentration
    for (const sector of result.sectorAllocation) {
        if (sector.weight > 26) {
            issues.push(`Sector ${sector.sector} exceeds 25% limit at ${sector.weight}%`);
        }
    }

    // Check individual stock limits
    for (const stock of result.stocks) {
        if (stock.weight > 13) {
            issues.push(`Stock ${stock.nseCode} exceeds 12% limit at ${stock.weight}%`);
        }
    }

    // Check top 5 concentration
    const top5Weight = result.stocks.slice(0, 5).reduce((sum, s) => sum + s.weight, 0);
    if (top5Weight > 52) {
        issues.push(`Top 5 concentration ${top5Weight.toFixed(1)}% exceeds 50% limit`);
    }

    return {
        valid: issues.length === 0,
        issues,
        summary: {
            stockCount: result.stocks.length,
            totalWeight: result.totalWeight,
            cashAllocation: result.cashAllocation,
            sectorCount: result.sectorAllocation.length,
            top5Weight: Math.round(top5Weight * 10) / 10
        }
    };
}
