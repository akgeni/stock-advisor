/**
 * Risk Score - Layer 2
 * Comprehensive risk assessment with Base-50 Model
 * Score starts at 50 (Moderate). Safety features add points. Risks subtract points.
 * Scale: 0-100 (Higher = Safer)
 */

import { getCyclicality } from './sectorConfig.js';

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
        valuationRisk: calculateValuationRisk(stock) // New component
    };

    // Calculate average score
    let totalScore = 0;
    let totalWeight = 0;

    const weights = {
        fundamentalRisk: 0.30,
        volatilityRisk: 0.20,
        liquidityRisk: 0.20,
        governanceRisk: 0.20,
        valuationRisk: 0.10
    };

    for (const [key, weight] of Object.entries(weights)) {
        totalScore += components[key].score * weight;
        totalWeight += weight;
    }

    // Tail risk penalty - significant penalty if any critical component is very low
    const criticalComponents = [
        components.fundamentalRisk.score,
        components.governanceRisk.score,
        components.liquidityRisk.score
    ];
    const worstCritical = Math.min(...criticalComponents);

    // If worst critical score is < 30 (High Risk), penalty is heavy
    const tailRiskPenalty = worstCritical < 30 ? (30 - worstCritical) * 0.8 : 0;

    const finalScore = Math.max(0, Math.min(100, totalScore - tailRiskPenalty));

    return {
        score: finalScore,
        components,
        riskLevel: getRiskLevel(finalScore),
        tailRiskPenalty
    };
}

/**
 * Fundamental Risk - Financial stability assessment
 * Base: 50
 */
function calculateFundamentalRisk(stock) {
    let score = 50;
    const details = {};

    // 1. Balance Sheet Strength (BSchklist is 0-10)
    // Strong BS adds safety, weak subtracts heavily
    const bsScore = stock['BSchklist'] || 0;
    if (bsScore >= 7) {
        score += 15;
    } else if (bsScore >= 5) {
        score += 5;
    } else if (bsScore <= 3) {
        score -= 20;
        details.weakBS = 'Weak Balance Sheet Score';
    }

    // 2. Debt Management (debtgeni is 0-5 usually)
    const debtScore = stock['debtgeni'] || 0;
    const debtReduce = stock['debtreduce'] === 1;
    if (debtScore >= 4 || debtReduce) {
        score += 10;
    } else if (debtScore <= 2) {
        score -= 15;
        details.highDebt = 'Poor debt rating';
    }

    // 3. Earnings Stability
    const profitGrowth3Y = stock['Profit growth 3Years'] || 0;
    if (profitGrowth3Y > 15) {
        score += 10; // Proven growth adds safety
    } else if (profitGrowth3Y < 0) {
        score -= 15;
        details.negGrowth = 'Negative 3Y Profit Growth';
    }

    // 4. ROCE Buffer
    const roce = stock['Return on capital employed'] || 0;
    if (roce > 20) {
        score += 10;
    } else if (roce < 10) {
        score -= 10;
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.30
    };
}

/**
 * Volatility Risk - Trends and Drawdowns
 * Base: 50
 */
function calculateVolatilityRisk(stock) {
    let score = 50;
    const details = {};
    const price = stock['Current Price'] || 0;
    const dma200 = stock['DMA 200'] || price;

    // 1. Long term Trend Safety
    if (price > dma200) {
        score += 10; // Trading above 200DMA is safer
    } else {
        score -= 10;
        details.downtrend = 'Trading below 200 DMA';
    }

    // 2. Overextension Risk (Too far from mean = Reversion risk)
    const deviation = (price - dma200) / dma200 * 100;
    if (deviation > 50) {
        score -= 20;
        details.overextended = `Price +${deviation.toFixed(0)}% vs 200DMA (Overheated)`;
    } else if (deviation > 30) {
        score -= 10;
    }

    // 3. Recent Drawdowns (3M return)
    const ret3m = stock['Return over 3months'] || 0;
    if (ret3m < -20) {
        score -= 20;
        details.heavyDrawdown = 'Heavy 3M Drawdown (>20%)';
    } else if (ret3m < -10) {
        score -= 10;
    } else if (ret3m > 0 && ret3m < 20) {
        score += 10; // Steady uptrend
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.20
    };
}

/**
 * Liquidity & Size Risk - Market Cap
 * Base: 40 (Small caps start risky)
 */
function calculateLiquidityRisk(stock) {
    let score = 40;
    const details = {};
    const mcap = stock['Market Capitalization'] || 0;

    // 1. Market Cap Scale
    if (mcap > 50000) {
        score += 50; // Large Cap = Very Safe
    } else if (mcap > 20000) {
        score += 40; // Mid-Large
    } else if (mcap > 5000) {
        score += 20; // Mid Cap
    } else if (mcap < 1000) {
        score -= 15; // Micro Cap = High Risk
        details.microCap = 'Micro Cap Risk (<1000Cr)';
    }

    // 2. Volume Consistency (from previous logic)
    const avgVolume = stock['Volume 1month average'] || 0;
    const price = stock['Current Price'] || 0;
    const dailyTurnover = avgVolume * price / 10000000; // Cr

    if (dailyTurnover > 10) {
        score += 10; // High liquidity
    } else if (dailyTurnover < 0.5) {
        score -= 20;
        details.illiquid = 'Daily turnover < 50L';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.20
    };
}

/**
 * Governance Risk - Management & Holding
 * Base: 50
 */
function calculateGovernanceRisk(stock) {
    let score = 50;
    const details = {};

    // 1. Promoter Holding
    const holding = stock['Promoter holding'] || 0;
    if (holding > 60) {
        score += 20; // High skin in the game
    } else if (holding > 45) {
        score += 10;
    } else if (holding < 30) {
        score -= 20;
        details.lowPromoter = 'Low promoter holding';
    }

    // 2. Change in Holding
    const change = stock['Change in promoter holding'] || 0;
    if (change > 0.5) {
        score += 15; // Buying is strong signal
        details.promoterBuying = 'Promoter buying stake';
    } else if (change < -1) {
        score -= 25; // Selling is red flag
        details.promoterSelling = 'Promoter reducing stake';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.20
    };
}

/**
 * Valuation Risk - Price Risk
 * Base: 60 (Fair value assumed)
 */
function calculateValuationRisk(stock) {
    let score = 60;
    const details = {};

    const pe = stock['Price to Earning'] || 0;
    const indPe = stock['Industry PE'] || 0;

    // 1. Absolute Valuation Hygeine
    if (pe > 80) {
        score -= 30; // Very Expensive = Risk of correction
        details.bubbleValuation = 'PE > 80';
    } else if (pe > 50) {
        score -= 15;
    } else if (pe < 25 && pe > 0) {
        score += 10; // Margin of safety
    }

    // 2. Relative to Industry
    if (indPe > 0 && pe > indPe * 2) {
        score -= 20;
        details.expensiveVsInd = 'Double industry PE';
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
    if (score >= 80) return 'Very Low'; // Bluechip safety
    if (score >= 65) return 'Low';      // Quality Midcaps
    if (score >= 50) return 'Moderate'; // Average
    if (score >= 35) return 'High';     // Speculative/Volatile
    return 'Very High';                 // Distress/Microcap
}
