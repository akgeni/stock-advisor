/**
 * Valuation Score - Layer 4
 * Multi-method valuation with value trap filters and catalyst detection
 * Score: 0-100 (higher = more undervalued)
 */

/**
 * Calculate comprehensive valuation score
 */
export function calculateValuationScore(stock) {
    const components = {
        relativeValue: calculateRelativeValue(stock),
        intrinsicValueGap: calculateIntrinsicValueGap(stock),
        valueTrapFilter: calculateValueTrapFilter(stock),
        catalystScore: calculateCatalystScore(stock)
    };

    // Weighted score
    const weights = {
        relativeValue: 0.35,
        intrinsicValueGap: 0.30,
        valueTrapFilter: 0.20,
        catalystScore: 0.15
    };

    let totalScore = 0;
    for (const [key, weight] of Object.entries(weights)) {
        totalScore += components[key].score * weight;
    }

    return {
        score: Math.round(totalScore),
        components,
        verdict: getValuationVerdict(totalScore)
    };
}

/**
 * Relative Value - PE vs sector, PEG ratio
 */
function calculateRelativeValue(stock) {
    let score = 50;
    const details = {};

    const pe = stock['Price to Earning'] || 0;
    const industryPE = stock['Industry PE'] || pe;
    const profitGrowth3Y = stock['Profit growth 3Years'] || 0;

    // 1. PE vs Industry PE (sector median proxy)
    if (pe > 0 && industryPE > 0) {
        const peRatio = pe / industryPE;

        if (peRatio <= 0.6) {
            score += 25;
            details.deepDiscount = `PE ${pe.toFixed(1)} vs Industry ${industryPE.toFixed(1)}`;
        } else if (peRatio <= 0.8) {
            score += 15;
            details.discount = 'Trading at discount to sector';
        } else if (peRatio <= 1.0) {
            score += 5;
        } else if (peRatio > 1.3) {
            score -= 15;
            details.premium = 'Trading at premium to sector';
        }
    }

    // 2. Quality-adjusted PE (normalize by ROCE)
    const roce = stock['Return on capital employed'] || 15;
    if (pe > 0 && roce > 0) {
        const qualityAdjustedPE = pe / (roce / 15); // Normalize to 15% ROCE

        if (qualityAdjustedPE < 15) {
            score += 10;
            details.qualityValue = 'Good value for quality';
        } else if (qualityAdjustedPE > 30) {
            score -= 10;
            details.expensiveForQuality = 'Expensive relative to quality';
        }
    }

    // 3. PEG ratio (with fixes for edge cases)
    if (pe > 0 && profitGrowth3Y > 5) {
        const growthForPEG = Math.min(profitGrowth3Y, 40); // Cap at 40%
        const peg = pe / growthForPEG;

        if (peg <= 0.8) {
            score += 15;
            details.lowPEG = `PEG ratio: ${peg.toFixed(2)}`;
        } else if (peg <= 1.2) {
            score += 5;
        } else if (peg > 2.0) {
            score -= 10;
            details.highPEG = 'High PEG ratio';
        }
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.35
    };
}

/**
 * Intrinsic Value Gap - Margin of safety
 */
function calculateIntrinsicValueGap(stock) {
    let score = 50;
    const details = {};

    // 1. Gordon discount (from data)
    const gordonIV = stock['gordanIV'] || 0;
    if (gordonIV >= 0.30) {
        score += 20;
        details.gordonDiscount = `Gordon IV discount: ${(gordonIV * 100).toFixed(0)}%`;
    } else if (gordonIV >= 0.15) {
        score += 10;
    } else if (gordonIV < 0) {
        score -= 10;
        details.gordonPremium = 'Trading above Gordon IV';
    }

    // 2. Screener discount metrics
    const discount1 = stock['discount1'] || 0;
    const discount2 = stock['discount2'] || 0;

    const avgDiscount = (discount1 + discount2) / 2;
    if (avgDiscount >= 0.40) {
        score += 20;
        details.largeDiscount = 'Significant discount to intrinsic value';
    } else if (avgDiscount >= 0.20) {
        score += 10;
    } else if (avgDiscount < 0) {
        score -= 15;
        details.overvalued = 'Trading above intrinsic value estimates';
    }

    // 3. Geni score (comprehensive value score)
    const geniScore1 = stock['geniscore1'] || 0;
    if (geniScore1 >= 7) {
        score += 10;
        details.geniValue = 'High geni score';
    } else if (geniScore1 < 3) {
        score -= 10;
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.30
    };
}

/**
 * Value Trap Filter - Avoid cheap but deteriorating stocks
 */
function calculateValueTrapFilter(stock) {
    let score = 70; // Start optimistic, penalize for trap indicators
    const details = {};
    let trapIndicators = 0;

    const profitGrowth = stock['Profit growth'] || 0;
    const profitGrowth3Y = stock['Profit growth 3Years'] || 0;
    const salesGrowth = stock['Sales growth'] || 0;
    const salesGrowth3Y = stock['Sales growth 3Years'] || 0;
    const opMargin = stock['opmargin'] || 0;
    const cashFlow = stock['CashFlow'] || 0;

    // 1. Cheap + declining business = TRAP
    if (profitGrowth < 0 && profitGrowth3Y < 0 && salesGrowth < 0) {
        score -= 30;
        trapIndicators++;
        details.decliningBusiness = 'Revenue and profit both declining';
    }

    // 2. Margin erosion = TRAP
    if (opMargin < 0.05 && profitGrowth < salesGrowth) {
        score -= 20;
        trapIndicators++;
        details.marginErosion = 'Margins under pressure';
    }

    // 3. Cash burning despite "profits" = TRAP
    if (cashFlow < 0 && profitGrowth3Y < 10) {
        score -= 15;
        trapIndicators++;
        details.cashBurner = 'Negative cash flow without growth';
    }

    // 4. Quarterly deterioration
    const yoyQuarterlyProfit = stock['YOY Quarterly profit growth'] || 0;
    const yoyQuarterlySales = stock['YOY Quarterly sales growth'] || 0;

    if (yoyQuarterlyProfit < -20 && yoyQuarterlySales < -10) {
        score -= 15;
        trapIndicators++;
        details.quarterlyWeak = 'Recent quarter shows deterioration';
    }

    // 5. No institutional interest
    const accumulation = stock['accumulation'] || 0;
    const volumeIncr = stock['volumeincr'] || 0;

    if (accumulation === 0 && volumeIncr === 0) {
        score -= 10;
        details.noInterest = 'No accumulation signals';
    }

    // Bonus: NOT a trap indicators
    if (trapIndicators === 0 && profitGrowth3Y > 10) {
        score += 20;
        details.healthy = 'No value trap indicators detected';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        trapIndicators,
        weight: 0.20
    };
}

/**
 * Catalyst Score - Is there a reason for re-rating?
 */
function calculateCatalystScore(stock) {
    let score = 40; // Start conservative
    const details = {};

    // 1. Debt reduction catalyst
    const debtReduce = stock['debtreduce'] || 0;
    const debtGeni = stock['debtgeni'] || 0;

    if (debtReduce > 0 || debtGeni >= 4) {
        score += 15;
        details.debtCatalyst = 'Debt reduction in progress';
    }

    // 2. Earnings acceleration catalyst
    const profitGrowth = stock['Profit growth'] || 0;
    const profitGrowth3Y = stock['Profit growth 3Years'] || 0;

    if (profitGrowth > profitGrowth3Y + 15) {
        score += 15;
        details.earningsAccel = 'Earnings accelerating';
    }

    // 3. Capacity expansion catalyst
    const capacityExpansion = stock['capacity expansion'] || 0;
    if (capacityExpansion > 0) {
        score += 15;
        details.capacityCatalyst = 'Capacity expansion underway';
    }

    // 4. Turnaround signals
    const yoyQuarterlyProfit = stock['YOY Quarterly profit growth'] || 0;
    if (profitGrowth3Y < 10 && yoyQuarterlyProfit > 20) {
        score += 15;
        details.turnaround = 'Turnaround signs in recent quarter';
    }

    // 5. Technical setup (near support, accumulation)
    const accumulation = stock['accumulation'] || 0;
    const rsiIncr = stock['rsiincr'] || 0;

    if (accumulation > 0 || rsiIncr > 0) {
        score += 10;
        details.technicalSetup = 'Positive accumulation signals';
    }

    // 6. GARP score (Growth at Reasonable Price)
    const garp = stock['garp'] || 0;
    if (garp > 0) {
        score += 10;
        details.garpPositive = 'GARP criteria met';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.15
    };
}

/**
 * Get valuation verdict
 */
function getValuationVerdict(score) {
    if (score >= 75) return 'Significantly Undervalued';
    if (score >= 60) return 'Undervalued';
    if (score >= 45) return 'Fairly Valued';
    if (score >= 35) return 'Slightly Overvalued';
    return 'Overvalued';
}
