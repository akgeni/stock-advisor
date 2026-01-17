/**
 * Momentum Score - Layer 5
 * Smart momentum with fundamental backing and regime awareness
 * Score: 0-100
 */

/**
 * Calculate comprehensive momentum score
 */
export function calculateMomentumScore(stock, marketData = {}) {
    const components = {
        trendQuality: calculateTrendQuality(stock),
        pullbackQuality: calculatePullbackQuality(stock),
        volumeAnalysis: calculateVolumeAnalysis(stock),
        regimeFilter: calculateRegimeFilter(stock, marketData)
    };

    // Weighted score
    const weights = {
        trendQuality: 0.30,
        pullbackQuality: 0.30,
        volumeAnalysis: 0.25,
        regimeFilter: 0.15
    };

    let totalScore = 0;
    for (const [key, weight] of Object.entries(weights)) {
        totalScore += components[key].score * weight;
    }

    return {
        score: Math.round(totalScore),
        components,
        signal: getMomentumSignal(totalScore)
    };
}

/**
 * Trend Quality - Is the trend sustainable?
 */
function calculateTrendQuality(stock) {
    let score = 50;
    const details = {};

    const price = stock['Current Price'] || 0;
    const dma50 = stock['DMA 50'] || price;
    const dma200 = stock['DMA 200'] || price;
    const dma50Prev = stock['DMA 50 previous day'] || dma50;
    const dma200Prev = stock['DMA 200 previous day'] || dma200;

    // 1. Trend with fundamental backing
    const profitGrowth = stock['Profit growth'] || 0;
    const return3m = stock['Return over 3months'] || 0;

    // Best: Price up AND earnings up
    if (return3m > 0 && profitGrowth > 0) {
        score += 15;
        details.confirmedTrend = 'Price trend backed by fundamentals';
    } else if (return3m > 0 && profitGrowth < -10) {
        score -= 15;
        details.divergence = 'Warning: Price up but earnings down';
    } else if (return3m < -15 && profitGrowth > 10) {
        score += 5;
        details.opportunity = 'Fundamentals strong despite price weakness';
    }

    // 2. DMA alignment and direction
    const dma50Rising = dma50 > dma50Prev;
    const dma200Rising = dma200 > dma200Prev;

    if (price > dma50 && dma50 > dma200) {
        score += 15;
        details.bullishAlignment = 'Price > 50DMA > 200DMA';

        if (dma50Rising && dma200Rising) {
            score += 5;
            details.risingDMAs = 'Both DMAs rising';
        }
    } else if (price < dma50 && dma50 < dma200) {
        score -= 15;
        details.bearishAlignment = 'Price below both DMAs';

        if (!dma50Rising && !dma200Rising) {
            score -= 5;
            details.fallingDMAs = 'Both DMAs falling';
        }
    }

    // 3. Trend strength (distance from 200DMA)
    if (dma200 > 0) {
        const trendStrength = (price - dma200) / dma200 * 100;

        if (trendStrength > 30) {
            score -= 10; // Extended
            details.extended = `${trendStrength.toFixed(0)}% above 200DMA - extended`;
        } else if (trendStrength > 10) {
            score += 5; // Healthy uptrend
        } else if (trendStrength > 0) {
            score += 10; // Near support
        }
    }

    // 4. Momentum score from data
    const momentumScore = stock['momentumscore'] || 0;
    if (momentumScore >= 4) {
        score += 10;
        details.strongMomentum = 'High momentum score';
    } else if (momentumScore <= 1) {
        score -= 5;
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.30
    };
}

/**
 * Pullback Quality - Is this a buying opportunity?
 */
function calculatePullbackQuality(stock) {
    let score = 50;
    const details = {};

    const price = stock['Current Price'] || 0;
    const dma50 = stock['DMA 50'] || price;
    const dma200 = stock['DMA 200'] || price;
    const return1w = stock['Return over 1week'] || 0;
    const return1m = stock['Return over 1month'] || 0;
    const return3m = stock['Return over 3months'] || 0;

    // 1. Fundamentals must be intact for healthy pullback
    const profitGrowth = stock['Profit growth'] || 0;
    const profitGrowth3Y = stock['Profit growth 3Years'] || 0;
    const yoyQuarterlyProfit = stock['YOY Quarterly profit growth'] || 0;

    const fundamentalsIntact = profitGrowth3Y > 5 && yoyQuarterlyProfit > -10;

    // 2. Ideal pullback zone (10-25% from highs, but above 200DMA)
    const pullbackFromRecent = -return3m; // Positive if price fell

    if (fundamentalsIntact) {
        if (pullbackFromRecent >= 10 && pullbackFromRecent <= 25 && price > dma200) {
            score += 25;
            details.idealPullback = `${pullbackFromRecent.toFixed(0)}% pullback with intact fundamentals`;
        } else if (pullbackFromRecent >= 5 && pullbackFromRecent <= 15 && price > dma50) {
            score += 15;
            details.shallowPullback = 'Shallow pullback near support';
        }
    }

    // 3. Near support levels
    const nearDma50 = Math.abs(price - dma50) / dma50 < 0.05;
    const nearDma200 = Math.abs(price - dma200) / dma200 < 0.05;

    if (nearDma50 && price > dma200) {
        score += 10;
        details.near50DMA = 'Testing 50DMA support';
    }
    if (nearDma200 && fundamentalsIntact) {
        score += 15;
        details.near200DMA = 'Testing 200DMA support with good fundamentals';
    }

    // 4. Recovery signals after pullback
    if (return3m < -10 && return1w > 0) {
        score += 10;
        details.recoveryStarting = 'Recent week showing recovery';
    }

    // 5. Danger zone: Falling knife
    if (pullbackFromRecent > 30 || price < dma200 * 0.85) {
        score -= 20;
        details.fallingKnife = 'Severe decline - potential falling knife';
    }

    // 6. RSI increase (turning from oversold)
    const rsiIncr = stock['rsiincr'] || 0;
    if (rsiIncr > 0 && return3m < 0) {
        score += 10;
        details.rsiTurning = 'RSI turning positive';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.30
    };
}

/**
 * Volume Analysis - Accumulation vs Distribution
 */
function calculateVolumeAnalysis(stock) {
    let score = 50;
    const details = {};

    const volume = stock['Volume'] || 0;
    const volume1w = stock['Volume 1week average'] || 0;
    const volume1m = stock['Volume 1month average'] || 0;
    const volumeIncr = stock['volumeincr'] || 0;
    const accumulation = stock['accumulation'] || 0;
    const return1w = stock['Return over 1week'] || 0;

    // 1. Volume trend
    if (volume1m > 0) {
        const volumeRatio = volume / volume1m;

        if (volumeRatio > 1.5 && return1w > 0) {
            score += 20;
            details.volumeExpansion = 'Rising volume on price increase - accumulation';
        } else if (volumeRatio > 1.5 && return1w < 0) {
            score -= 15;
            details.distribution = 'Rising volume on price decrease - distribution';
        } else if (volumeRatio < 0.5) {
            score -= 5;
            details.lowVolume = 'Below average volume';
        }
    }

    // 2. Volume increase flag from data
    if (volumeIncr > 0) {
        score += 15;
        details.volumeTrending = 'Volume trending up';
    }

    // 3. Accumulation signal from data
    if (accumulation > 0) {
        score += 15;
        details.accumulationDetected = 'Accumulation pattern detected';
    }

    // 4. Healthy pullback volume (decreasing on pullback)
    const return3m = stock['Return over 3months'] || 0;
    if (return3m < -10 && volume < volume1m * 0.7) {
        score += 10;
        details.healthyPullback = 'Low volume on pullback (healthy)';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.25
    };
}

/**
 * Regime Filter - Market context
 */
function calculateRegimeFilter(stock, marketData) {
    let score = 50;
    const details = {};

    // For now, use sector relative strength as proxy
    // In production, would compare to Nifty/market data

    const return3m = stock['Return over 3months'] || 0;
    const industryPE = stock['Industry PE'] || 0;
    const pe = stock['Price to Earning'] || 0;

    // 1. Relative performance (approximate sector RS)
    // Assume market ~5% over 3 months as baseline
    const relativeStrength = return3m - (-5); // vs assumed market

    if (relativeStrength > 10) {
        score += 15;
        details.outperforming = 'Outperforming market';
    } else if (relativeStrength < -10) {
        score -= 10;
        details.underperforming = 'Underperforming market';
    }

    // 2. Sector valuation context
    if (pe > 0 && industryPE > 0) {
        // If sector is expensive but stock is cheap, could be opportunity
        if (industryPE > 30 && pe < industryPE * 0.7) {
            score += 10;
            details.sectorExpensive = 'Cheap in expensive sector';
        }
        // If sector is cheap and stock is cheapest, could be distress
        if (industryPE < 15 && pe < 10) {
            score -= 5;
            details.sectorDistress = 'Very cheap sector - check for distress';
        }
    }

    // 3. Cyclical timing (use cyclicality from config)
    const cyclicalTriggers = stock['cyclicaltriggers'] || 0;
    if (cyclicalTriggers > 0) {
        score += 15;
        details.cyclicalTiming = 'Cyclical upturn detected';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        weight: 0.15
    };
}

/**
 * Get momentum signal
 */
function getMomentumSignal(score) {
    if (score >= 70) return 'Strong Buy';
    if (score >= 55) return 'Buy';
    if (score >= 45) return 'Neutral';
    if (score >= 35) return 'Caution';
    return 'Avoid';
}
