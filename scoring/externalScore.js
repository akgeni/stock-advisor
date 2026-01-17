/**
 * External Factors Score - Layer 6
 * Quantitative sector and macro analysis (no external API dependency)
 * Score: 0-100
 */

import { getSectorGroup, isRateSensitive, isCurrencyBeneficiary, getCyclicality } from './sectorConfig.js';

/**
 * Calculate external factors score
 */
export function calculateExternalScore(stock, allStocks = []) {
    const components = {
        sectorMomentum: calculateSectorMomentum(stock, allStocks),
        peerPerformance: calculatePeerPerformance(stock, allStocks),
        macroSensitivity: calculateMacroSensitivity(stock)
    };

    // Weighted score
    const weights = {
        sectorMomentum: 0.40,
        peerPerformance: 0.30,
        macroSensitivity: 0.30
    };

    let totalScore = 0;
    for (const [key, weight] of Object.entries(weights)) {
        totalScore += components[key].score * weight;
    }

    return {
        score: Math.round(totalScore),
        components
    };
}

/**
 * Sector Momentum - How is the sector performing?
 */
function calculateSectorMomentum(stock, allStocks) {
    let score = 50;
    const details = {};

    const industry = stock.Industry || '';
    const sectorGroup = getSectorGroup(industry);

    // Get all stocks in same sector group
    const sectorStocks = allStocks.filter(s => getSectorGroup(s.Industry) === sectorGroup);

    if (sectorStocks.length > 1) {
        // 1. Calculate sector average return
        const sectorReturns = sectorStocks
            .map(s => s['Return over 3months'] || 0)
            .filter(r => !isNaN(r));

        const avgSectorReturn = sectorReturns.reduce((a, b) => a + b, 0) / sectorReturns.length;
        const stockReturn = stock['Return over 3months'] || 0;

        // Sector is doing well
        if (avgSectorReturn > 5) {
            score += 15;
            details.sectorStrong = `${sectorGroup} sector avg return: ${avgSectorReturn.toFixed(1)}%`;
        } else if (avgSectorReturn < -10) {
            score -= 15;
            details.sectorWeak = `${sectorGroup} sector struggling`;
        }

        // 2. Stock vs sector
        if (stockReturn > avgSectorReturn + 5) {
            score += 10;
            details.outperformingSector = 'Outperforming sector peers';
        } else if (stockReturn < avgSectorReturn - 10) {
            score -= 10;
            details.lagginSector = 'Lagging sector peers';
        }
    }

    // 3. Sector valuation context
    const industryPE = stock['Industry PE'] || 0;
    if (industryPE > 35) {
        score -= 5;
        details.expensiveSector = 'Sector trading at high valuations';
    } else if (industryPE < 15) {
        score += 5;
        details.cheapSector = 'Sector trading at low valuations';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        sectorGroup,
        weight: 0.40
    };
}

/**
 * Peer Performance - How are similar stocks doing?
 */
function calculatePeerPerformance(stock, allStocks) {
    let score = 50;
    const details = {};

    const industry = stock.Industry || '';

    // Get stocks in same industry
    const peers = allStocks.filter(s => s.Industry === industry && s.Name !== stock.Name);

    if (peers.length > 0) {
        // 1. Peer momentum
        const peerReturns = peers
            .map(s => s['Return over 3months'] || 0)
            .filter(r => !isNaN(r));

        if (peerReturns.length > 0) {
            const avgPeerReturn = peerReturns.reduce((a, b) => a + b, 0) / peerReturns.length;
            const stockReturn = stock['Return over 3months'] || 0;

            // Rising tide lifts all boats
            if (avgPeerReturn > 5) {
                score += 10;
                details.peersStrong = 'Industry peers performing well';
            }

            // Stock relative to peers
            if (stockReturn > avgPeerReturn + 10) {
                score += 15;
                details.sectorLeader = 'Leading peers significantly';
            } else if (stockReturn < avgPeerReturn - 10) {
                score -= 10;
                details.sectorLaggard = 'Significantly lagging peers';
            }
        }

        // 2. Relative valuation
        const stockPE = stock['Price to Earning'] || 0;
        const peerPEs = peers
            .map(s => s['Price to Earning'] || 0)
            .filter(pe => pe > 0);

        if (peerPEs.length > 0 && stockPE > 0) {
            const medianPeerPE = peerPEs.sort((a, b) => a - b)[Math.floor(peerPEs.length / 2)];

            if (stockPE < medianPeerPE * 0.7) {
                score += 10;
                details.cheapVsPeers = 'Trading at discount to peers';
            } else if (stockPE > medianPeerPE * 1.3) {
                score -= 5;
                details.expensiveVsPeers = 'Trading at premium to peers';
            }
        }
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        peerCount: peers.length,
        weight: 0.30
    };
}

/**
 * Macro Sensitivity - How affected by macro factors?
 */
function calculateMacroSensitivity(stock) {
    let score = 50;
    const details = {};

    const industry = stock.Industry || '';
    const cyclicality = getCyclicality(industry);

    // 1. Interest rate sensitivity
    // Current environment assumption: rates elevated, may start declining
    if (isRateSensitive(industry)) {
        // Rate sensitive stocks could benefit from rate cuts
        score += 5;
        details.rateSensitive = 'May benefit from rate cuts';
    }

    // 2. Currency exposure
    // Assumption: INR may remain under pressure
    if (isCurrencyBeneficiary(industry)) {
        score += 10;
        details.currencyBenefit = 'Export oriented - benefits from weak rupee';
    }

    // 3. Cyclicality in current environment
    // Current assumption: Economy in mild slowdown
    if (cyclicality === 'high') {
        score -= 10;
        details.cyclicalRisk = 'Cyclical stock - vulnerable in slowdown';
    } else if (cyclicality === 'low') {
        score += 10;
        details.defensive = 'Defensive business - resilient in slowdown';
    }

    // 4. Use cyclical triggers from data
    const cyclicalTriggers = stock['cyclicaltriggers'] || 0;
    if (cyclicalTriggers > 0) {
        score += 15;
        details.cyclicalUpturn = 'Cyclical upturn signals detected';
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        details,
        cyclicality,
        weight: 0.30
    };
}
