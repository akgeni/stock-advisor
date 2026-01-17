/**
 * Risk Score - Layer 2
 * Comprehensive risk assessment with tail risk penalty
 * Higher score = SAFER (0-100 scale)
 */

import { getCyclicality, getSectorGroup } from './sectorConfig.js';

/**
 * Calculate comprehensive risk score
 * @returns {object} { score: number, components: object, riskLevel: string }
 */
export function calculateRiskScore(stock) {
    const components = {
        fundamentalRisk: calculateFundamentalRisk(stock),
        volatilityRisk: calculateVolatilityRisk(stock),
        liquidityRisk: calculateLiquidityRisk(stock),
        governanceRisk: calculateGovernanceRisk(stock),
        concentrationRisk: calculateConcentrationRisk(stock)
    };

    // Weighted linear score
    const weights = {
        fundamentalRisk: 0.35,
        volatilityRisk: 0.25,
        liquidityRisk: 0.15,
        governanceRisk: 0.15,
        concentrationRisk: 0.10
    };

    let linearScore = 0;
    for (const [key, weight] of Object.entries(weights)) {
        linearScore += components[key].score * weight;
    }

    // Tail risk penalty - worst component drags down overall score
    const worstComponent = Math.min(...Object.values(components).map(c => c.score));
    const tailRiskPenalty = worstComponent < 30 ? (30 - worstComponent) * 0.5 : 0;

    const finalScore = Math.max(0, Math.min(100, linearScore - tailRiskPenalty));

    return {
        score: finalScore,
        components,
        riskLevel: getRiskLevel(finalScore),
        tailRiskPenalty
    };
}

/**
 * Fundamental Risk - Financial stability assessment
 */
function calculateFundamentalRisk(stock) {
    let score = 100;
    const details = {};

    // 1. Altman Z-Score proxy (simplified)
    // Z = 1.2*(WC/TA) + 1.4*(RE/TA) + 3.3*(EBIT/TA) + 0.6*(MCap/TL) + 1.0*(Sales/TA)
    // We approximate using available metrics
    const roce = stock['Return on capital employed'] || 0;
    const marketCap = stock['Market Capitalization'] || 0;
    const debtGeni = stock['debtgeni'] || 0;

    // Approximate distress probability from ROCE and debt metrics
    if (roce < 5) {
        score -= 25;
        details.lowROCE = 'ROCE < 5% indicates potential distress';
    } else if (roce < 10) {
        score -= 10;
    }

    // 2. Interest coverage stress test (approximate)
    // Using operating margin as proxy for interest coverage
    const opMargin = stock['opmargin'] || 0;
    const npMargin = stock['npmargin'] || 0;

    if (opMargin < 0.05) {
        score -= 20;
        details.lowMargins = 'Operating margin < 5%';
    } else if (opMargin < 0.10) {
        score -= 10;
    }

    // 3. Debt trend (debtgeni score from data)
    if (debtGeni >= 4) {
        score += 5; // Bonus for good debt management
    } else if (debtGeni <= 1) {
        score -= 15;
        details.debtConcern = 'Poor debt metrics';
    }

    // 4. Profitability consistency
    const profitGrowth = stock['Profit growth'] || 0;
    const profitGrowth3Y = stock['Profit growth 3Years'] || 0;

    if (profitGrowth < -20 || profitGrowth3Y < -10) {
        score -= 15;
        details.earningsDecline = 'Significant profit decline';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.35
    };
}

/**
 * Volatility Risk - Price volatility and drawdown
 */
function calculateVolatilityRisk(stock) {
    let score = 100;
    const details = {};

    // 1. Price volatility proxy using DMA deviation
    const price = stock['Current Price'] || 0;
    const dma50 = stock['DMA 50'] || price;
    const dma200 = stock['DMA 200'] || price;

    const deviationFrom50 = Math.abs(price - dma50) / dma50 * 100;
    const deviationFrom200 = Math.abs(price - dma200) / dma200 * 100;

    if (deviationFrom200 > 30) {
        score -= 20;
        details.highVolatility = `Price ${deviationFrom200.toFixed(1)}% from 200DMA`;
    } else if (deviationFrom200 > 20) {
        score -= 10;
    }

    // 2. Maximum drawdown proxy (using return metrics)
    const return3m = stock['Return over 3months'] || 0;
    const return1m = stock['Return over 1month'] || 0;
    const return1w = stock['Return over 1week'] || 0;

    // Check for severe recent drawdown
    if (return3m < -30) {
        score -= 25;
        details.severeDrawdown = `3-month return: ${return3m.toFixed(1)}%`;
    } else if (return3m < -20) {
        score -= 15;
    } else if (return3m < -10) {
        score -= 5;
    }

    // 3. Recent stability
    const recentVolatility = Math.abs(return1w) + Math.abs(return1m - return1w);
    if (recentVolatility > 30) {
        score -= 10;
        details.recentVolatile = 'High recent price swings';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.25
    };
}

/**
 * Liquidity Risk - Can you exit when needed?
 */
function calculateLiquidityRisk(stock) {
    let score = 100;
    const details = {};

    const marketCap = stock['Market Capitalization'] || 0;
    const avgVolume = stock['Volume 1month average'] || 0;
    const currentVolume = stock['Volume'] || 0;
    const price = stock['Current Price'] || 0;

    // 1. Market cap liquidity
    if (marketCap < 500) {
        score -= 25;
        details.smallCap = `Market cap ₹${marketCap.toFixed(0)} Cr`;
    } else if (marketCap < 1000) {
        score -= 15;
    } else if (marketCap < 2000) {
        score -= 5;
    }

    // 2. Volume adequacy
    const dailyTurnover = avgVolume * price / 10000000; // In Cr
    const turnoverRatio = dailyTurnover / marketCap * 100;

    if (turnoverRatio < 0.1) {
        score -= 20;
        details.lowTurnover = 'Daily turnover < 0.1% of market cap';
    } else if (turnoverRatio < 0.3) {
        score -= 10;
    }

    // 3. Volume trend
    if (avgVolume > 0 && currentVolume > 0) {
        const volumeRatio = currentVolume / avgVolume;
        if (volumeRatio < 0.3) {
            score -= 10;
            details.volumeDrying = 'Recent volume significantly below average';
        }
    }

    // 4. Public holding proxy
    const promoterHolding = stock['Promoter holding'] || 0;
    const publicHolding = 100 - promoterHolding;
    if (publicHolding < 20) {
        score -= 15;
        details.lowFloat = `Public holding only ${publicHolding.toFixed(1)}%`;
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.15
    };
}

/**
 * Governance Risk - Management trust factors
 */
function calculateGovernanceRisk(stock) {
    let score = 100;
    const details = {};

    // 1. Promoter pledge (most important)
    // We don't have pledge data directly, but promoter change can indicate issues
    const promoterChange = stock['Change in promoter holding'] || 0;

    if (promoterChange < -5) {
        score -= 30;
        details.promoterSelling = `Promoter reduced stake by ${Math.abs(promoterChange).toFixed(2)}%`;
    } else if (promoterChange < -2) {
        score -= 15;
    } else if (promoterChange > 2) {
        score += 10; // Bonus for increasing stake
        details.promoterBuying = 'Promoter increasing stake';
    }

    // 2. Public holding decrease (could indicate institutional concern)
    const pubHoldingDecr = stock['pubholdingdecr'] || 0;
    if (pubHoldingDecr > 0) {
        score -= 10;
        details.publicExiting = 'Public holding decreasing';
    }

    // 3. Use BSchklist as governance proxy
    const bSchklist = stock['BSchklist'] || 0;
    if (bSchklist >= 8) {
        score += 5;
    } else if (bSchklist <= 4) {
        score -= 10;
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.15
    };
}

/**
 * Concentration Risk - Business model risks
 */
function calculateConcentrationRisk(stock) {
    let score = 100;
    const details = {};
    const industry = stock.Industry || '';

    // 1. Cyclicality risk
    const cyclicality = getCyclicality(industry);
    if (cyclicality === 'high') {
        score -= 15;
        details.cyclical = 'Highly cyclical industry';
    } else if (cyclicality === 'medium') {
        score -= 5;
    }

    // 2. Sector-specific risks using margin as business stability proxy
    const margin = stock['margin'] || 0;
    const opMargin = stock['opmargin'] || 0;

    if (opMargin < 0.05) {
        score -= 15;
        details.lowMargin = 'Low operating margins indicate competitive pressure';
    }

    // 3. Revenue concentration proxy (using quarterly growth volatility)
    const yoyQuarterlySales = stock['YOY Quarterly sales growth'] || 0;
    const yoyQuarterlyProfit = stock['YOY Quarterly profit growth'] || 0;

    // High volatility between quarters suggests concentration
    if (Math.abs(yoyQuarterlySales) > 50 || Math.abs(yoyQuarterlyProfit) > 100) {
        score -= 10;
        details.volatileQuarters = 'High quarterly volatility';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.10
    };
}

/**
 * Get risk level label
 */
function getRiskLevel(score) {
    if (score >= 80) return 'Very Low';
    if (score >= 65) return 'Low';
    if (score >= 50) return 'Moderate';
    if (score >= 35) return 'High';
    return 'Very High';
}
