/**
 * Fundamental Score - Layer 3
 * Assesses sustainable earnings power, growth quality, and competitive moat
 * Score: 0-100
 */

import { getROCEThreshold } from './sectorConfig.js';

/**
 * Calculate comprehensive fundamental score
 */
export function calculateFundamentalScore(stock) {
    const components = {
        earningsPower: calculateEarningsPower(stock),
        growthQuality: calculateGrowthQuality(stock),
        cashConversion: calculateCashConversion(stock),
        competitiveMoat: calculateCompetitiveMoat(stock),
        capitalAllocation: calculateCapitalAllocation(stock)
    };

    // Weighted score
    const weights = {
        earningsPower: 0.30,
        growthQuality: 0.25,
        cashConversion: 0.20,
        competitiveMoat: 0.15,
        capitalAllocation: 0.10
    };

    let totalScore = 0;
    for (const [key, weight] of Object.entries(weights)) {
        totalScore += components[key].score * weight;
    }

    return {
        score: Math.round(totalScore),
        components,
        grade: getGrade(totalScore)
    };
}

/**
 * Earnings Power - Sustainable profitability
 */
function calculateEarningsPower(stock) {
    let score = 50; // Start at neutral
    const details = {};
    const industry = stock.Industry || 'default';
    const roceThreshold = getROCEThreshold(industry);

    // 1. ROCE relative to sector threshold
    const roce = stock['Return on capital employed'] || 0;
    const roceRatio = roce / roceThreshold;

    if (roceRatio >= 2.0) {
        score += 30;
        details.excellentROCE = `ROCE ${roce.toFixed(1)}% is 2x+ sector threshold`;
    } else if (roceRatio >= 1.5) {
        score += 20;
    } else if (roceRatio >= 1.0) {
        score += 10;
    } else if (roceRatio >= 0.8) {
        // Neutral
    } else {
        score -= 15;
        details.weakROCE = `ROCE ${roce.toFixed(1)}% below sector threshold`;
    }

    // 2. ROCE consistency (current vs 3Y average)
    const roce3Y = stock['Average return on capital employed 3Years'] || roce;
    const roceConsistency = roce3Y > 0 ? Math.min(roce, roce3Y) / Math.max(roce, roce3Y) : 0;

    if (roceConsistency >= 0.8) {
        score += 10;
        details.consistentROCE = 'Stable ROCE over 3 years';
    } else if (roceConsistency < 0.5) {
        score -= 10;
        details.volatileROCE = 'Volatile ROCE';
    }

    // 3. ROCE improvement trend
    if (roce > roce3Y * 1.1) {
        score += 10;
        details.improvingROCE = 'ROCE trending up';
    } else if (roce < roce3Y * 0.8) {
        score -= 10;
        details.decliningROCE = 'ROCE trending down';
    }

    // 4. Operating margin strength
    const opMargin = stock['opmargin'] || 0;
    if (opMargin >= 0.20) {
        score += 10;
    } else if (opMargin >= 0.12) {
        score += 5;
    } else if (opMargin < 0.05) {
        score -= 10;
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.30
    };
}

/**
 * Growth Quality - Sustainable, efficient growth
 */
function calculateGrowthQuality(stock) {
    let score = 50;
    const details = {};

    const profitGrowth = stock['Profit growth'] || 0;
    const profitGrowth3Y = stock['Profit growth 3Years'] || 0;
    const salesGrowth = stock['Sales growth'] || 0;
    const salesGrowth3Y = stock['Sales growth 3Years'] || 0;

    // 1. 3-Year profit growth
    if (profitGrowth3Y >= 30) {
        score += 20;
        details.strongGrowth = `3Y profit CAGR: ${profitGrowth3Y.toFixed(1)}%`;
    } else if (profitGrowth3Y >= 15) {
        score += 10;
    } else if (profitGrowth3Y < 0) {
        score -= 15;
        details.negativeGrowth = 'Negative 3Y profit growth';
    }

    // 2. Profit growing faster than sales (operating leverage)
    if (salesGrowth3Y > 0) {
        const leverageRatio = profitGrowth3Y / salesGrowth3Y;
        if (leverageRatio >= 1.5) {
            score += 15;
            details.goodLeverage = 'Profit growth outpacing sales';
        } else if (leverageRatio < 0.7) {
            score -= 10;
            details.marginCompression = 'Margins under pressure';
        }
    }

    // 3. Growth acceleration (recent vs long-term)
    if (profitGrowth > profitGrowth3Y + 10) {
        score += 10;
        details.accelerating = 'Growth accelerating';
    } else if (profitGrowth < profitGrowth3Y - 20) {
        score -= 10;
        details.decelerating = 'Growth decelerating';
    }

    // 4. Quarterly momentum
    const yoyQuarterlyProfit = stock['YOY Quarterly profit growth'] || 0;
    if (yoyQuarterlyProfit >= 20) {
        score += 10;
        details.quarterlyStrong = `Latest quarter: +${yoyQuarterlyProfit.toFixed(1)}%`;
    } else if (yoyQuarterlyProfit < -10) {
        score -= 10;
        details.quarterlyWeak = 'Weak latest quarter';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.25
    };
}

/**
 * Cash Conversion - Quality of earnings
 */
function calculateCashConversion(stock) {
    let score = 50;
    const details = {};

    // 1. Cash flow quality (using CashFlow metric from data)
    const cashFlow = stock['CashFlow'] || 0;

    if (cashFlow >= 1.0) {
        score += 20;
        details.excellentCash = 'Strong cash generation';
    } else if (cashFlow >= 0.5) {
        score += 10;
    } else if (cashFlow >= 0) {
        // Neutral
    } else {
        score -= 15;
        details.poorCash = 'Negative operating cash flow';
    }

    // 2. Net profit margin vs operating margin (earnings quality)
    const npMargin = stock['npmargin'] || 0;
    const opMargin = stock['opmargin'] || 0;

    if (opMargin > 0) {
        const conversionRatio = npMargin / opMargin;
        if (conversionRatio >= 0.7) {
            score += 10;
            details.efficientConversion = 'Good profit conversion';
        } else if (conversionRatio < 0.4) {
            score -= 10;
            details.leakage = 'Significant profit leakage below EBIT';
        }
    }

    // 3. EPS geni score (earnings quality from data)
    const epsGeni = stock['epsgeni'] || 0;
    if (epsGeni >= 2.5) {
        score += 15;
    } else if (epsGeni >= 1.5) {
        score += 5;
    } else if (epsGeni < 0.5) {
        score -= 10;
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.20
    };
}

/**
 * Competitive Moat - Durability of advantages
 */
function calculateCompetitiveMoat(stock) {
    let score = 50;
    const details = {};

    // 1. Sustained high ROCE (proxy for moat)
    const roce = stock['Return on capital employed'] || 0;
    const roce3Y = stock['Average return on capital employed 3Years'] || 0;

    if (roce >= 25 && roce3Y >= 25) {
        score += 25;
        details.wideMoat = 'Sustained high ROCE suggests moat';
    } else if (roce >= 20 && roce3Y >= 18) {
        score += 15;
        details.narrowMoat = 'Good sustained profitability';
    }

    // 2. Margin stability (using margin metric)
    const margin = stock['margin'] || 0;
    const opMargin = stock['opmargin'] || 0;

    if (opMargin >= 0.15) {
        score += 10;
        details.pricingPower = 'High margins indicate pricing power';
    }

    // 3. ROCE vs sector (rocev2 metric)
    const roceV2 = stock['rocev2'] || 0;
    if (roceV2 >= 1.5) {
        score += 10;
        details.sectorLeader = 'ROCE well above sector';
    }

    // 4. Market cap as size/scale advantage proxy
    const marketCap = stock['Market Capitalization'] || 0;
    if (marketCap >= 20000) {
        score += 5;
        details.scaleAdvantage = 'Large scale provides advantages';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.15
    };
}

/**
 * Capital Allocation - Management quality
 */
function calculateCapitalAllocation(stock) {
    let score = 50;
    const details = {};

    // 1. Reinvestment efficiency (ROCE * retention)
    const roce = stock['Return on capital employed'] || 0;

    // High ROCE implies good capital allocation
    if (roce >= 25) {
        score += 15;
    } else if (roce >= 15) {
        score += 5;
    }

    // 2. Debt management (debt reduction trend)
    const debtReduce = stock['debtreduce'] || 0;
    const debtGeni = stock['debtgeni'] || 0;

    if (debtReduce > 0 || debtGeni >= 4) {
        score += 15;
        details.debtDiscipline = 'Good debt management';
    } else if (debtGeni <= 1) {
        score -= 10;
        details.debtConcern = 'Debt management concerns';
    }

    // 3. Equity management (no dilution)
    const equityReduce = stock['equityreduce'] || 0;
    if (equityReduce > 0) {
        score += 10;
        details.buybacks = 'Shareholder-friendly (buybacks/no dilution)';
    }

    // 4. Master score as overall quality proxy
    const masterScore = stock['master score'] || 0;
    if (masterScore >= 10) {
        score += 10;
    } else if (masterScore >= 7) {
        score += 5;
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.10
    };
}

/**
 * Get letter grade
 */
function getGrade(score) {
    if (score >= 85) return 'A+';
    if (score >= 75) return 'A';
    if (score >= 65) return 'B+';
    if (score >= 55) return 'B';
    if (score >= 45) return 'C+';
    if (score >= 35) return 'C';
    return 'D';
}
