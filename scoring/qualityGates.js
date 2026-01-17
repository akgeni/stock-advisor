/**
 * Quality Gates - Layer 1
 * Hard filters that must be passed before scoring
 * Stocks failing these gates are excluded from recommendations
 */

import { getROCEThreshold, getDebtThreshold, getCyclicality } from './sectorConfig.js';

/**
 * Check if stock passes all quality gates
 * Uses 2-of-3 passing for flexibility on profitability
 * @returns {object} { passed: boolean, failures: string[], warnings: string[] }
 */
export function checkQualityGates(stock) {
    const failures = [];
    const warnings = [];
    const industry = stock.Industry || 'default';

    // 1. PROFITABILITY GATE (2-of-3 must pass)
    const roceThreshold = getROCEThreshold(industry);
    const profitabilityChecks = [
        {
            name: 'Current ROCE',
            passed: stock['Return on capital employed'] >= roceThreshold,
            value: stock['Return on capital employed'],
            threshold: roceThreshold
        },
        {
            name: '3Y Avg ROCE',
            passed: stock['Average return on capital employed 3Years'] >= roceThreshold * 0.8,
            value: stock['Average return on capital employed 3Years'],
            threshold: roceThreshold * 0.8
        },
        {
            name: 'ROCE Improving',
            passed: stock['Return on capital employed'] >= stock['Average return on capital employed 3Years'],
            value: stock['Return on capital employed'],
            threshold: stock['Average return on capital employed 3Years']
        }
    ];

    const profitabilityPassed = profitabilityChecks.filter(c => c.passed).length >= 2;
    if (!profitabilityPassed) {
        failures.push(`Profitability: Only ${profitabilityChecks.filter(c => c.passed).length}/3 criteria passed`);
    }

    // 2. PROMOTER GATE
    const promoterHolding = stock['Promoter holding'] || 0;
    const promoterChange = stock['Change in promoter holding'] || 0;

    // Allow low promoter for widely held companies (check if promoter is 0 - MNCs/widely held)
    if (promoterHolding > 0 && promoterHolding < 26) {
        failures.push(`Low promoter holding: ${promoterHolding.toFixed(1)}% (min: 26%)`);
    }

    if (promoterChange < -2) {
        warnings.push(`Promoter reducing stake: ${promoterChange.toFixed(2)}%`);
    }

    // 3. LIQUIDITY GATE
    const marketCap = stock['Market Capitalization'] || 0;
    const avgVolume = stock['Volume 1month average'] || 0;

    if (marketCap < 300) {
        failures.push(`Market cap too low: ₹${marketCap.toFixed(0)} Cr (min: ₹300 Cr)`);
    }

    if (avgVolume < 5000) {
        warnings.push(`Low liquidity: ${avgVolume.toFixed(0)} avg volume`);
    }

    // 4. QUALITY SCORE GATE (Using available scores from data)
    const bSchklist = stock['BSchklist'] || 0;
    const canslim = stock['Canslim'] || 0;
    const masterScore = stock['master score'] || 0;

    const qualityScoresPassed = (bSchklist >= 5 ? 1 : 0) + (canslim >= 1 ? 1 : 0) + (masterScore >= 6 ? 1 : 0);
    if (qualityScoresPassed < 1) {
        warnings.push(`Low quality scores: BSchklist=${bSchklist}, Canslim=${canslim}, Master=${masterScore}`);
    }

    // 5. CASH FLOW GATE (with growth stage consideration)
    const cashFlow = stock['CashFlow'] || 0;
    const salesGrowth = stock['Sales growth'] || 0;
    const cyclicality = getCyclicality(industry);

    // Allow negative cash flow if in high growth phase or cyclical upturn
    if (cashFlow < 0 && salesGrowth < 20) {
        if (cyclicality !== 'high') {
            warnings.push(`Negative cash flow without high growth`);
        }
    }

    // 6. DEBT SANITY CHECK (for non-financials)
    const isFinancial = industry.includes('NBFC') ||
        industry.includes('Financial') ||
        industry.includes('Stockbroking');

    if (!isFinancial) {
        const debtGeni = stock['debtgeni'] || 0;
        if (debtGeni < 1) {
            warnings.push(`Debt concerns: debtgeni score = ${debtGeni}`);
        }
    }

    return {
        passed: failures.length === 0,
        failures,
        warnings,
        profitabilityDetails: profitabilityChecks
    };
}

/**
 * Get quality gate summary for display
 */
export function getGateSummary(gateResult) {
    if (gateResult.passed) {
        return {
            status: 'PASSED',
            color: 'green',
            warnings: gateResult.warnings
        };
    }
    return {
        status: 'FAILED',
        color: 'red',
        failures: gateResult.failures,
        warnings: gateResult.warnings
    };
}
