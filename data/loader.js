/**
 * Data Loader - CSV parsing and data transformation
 */

import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';

/**
 * Load stock data from CSV file
 */
export function loadStockData(filePath) {
    const content = readFileSync(filePath, 'utf-8');

    const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: (value, context) => {
            // Auto-convert numeric columns
            if (context.header) return value;

            const numValue = parseFloat(value);
            if (!isNaN(numValue) && value.trim() !== '') {
                return numValue;
            }
            return value;
        }
    });

    return records;
}

/**
 * Transform stock data to consistent format
 */
export function transformStockData(records) {
    return records.map(record => ({
        // Identifiers
        Name: record.Name || '',
        'BSE Code': record['BSE Code'] || '',
        'NSE Code': record['NSE Code'] || '',
        'ISIN Code': record['ISIN Code'] || '',
        'Industry Group': record['Industry Group'] || '',
        Industry: record.Industry || '',

        // Price and market data
        'Current Price': parseNumeric(record['Current Price']),
        'Market Capitalization': parseNumeric(record['Market Capitalization']),
        'DMA 50': parseNumeric(record['DMA 50']),
        'DMA 200': parseNumeric(record['DMA 200']),
        'DMA 50 previous day': parseNumeric(record['DMA 50 previous day']),
        'DMA 200 previous day': parseNumeric(record['DMA 200 previous day']),

        // Volume
        Volume: parseNumeric(record.Volume),
        'Volume 1week average': parseNumeric(record['Volume 1week average']),
        'Volume 1month average': parseNumeric(record['Volume 1month average']),

        // Growth metrics
        'Profit growth': parseNumeric(record['Profit growth']),
        'Profit growth 3Years': parseNumeric(record['Profit growth 3Years']),
        'Sales growth': parseNumeric(record['Sales growth']),
        'Sales growth 3Years': parseNumeric(record['Sales growth 3Years']),

        // Profitability
        'Return on capital employed': parseNumeric(record['Return on capital employed']),
        'Average return on capital employed 3Years': parseNumeric(record['Average return on capital employed 3Years']),
        rocev2: parseNumeric(record.rocev2),
        npmargin: parseNumeric(record.npmargin),
        opmargin: parseNumeric(record.opmargin),
        margin: parseNumeric(record.margin),

        // Valuation
        'Price to Earning': parseNumeric(record['Price to Earning']),
        'Industry PE': parseNumeric(record['Industry PE']),
        gordanIV: parseNumeric(record.gordanIV),
        discount1: parseNumeric(record.discount1),
        discount2: parseNumeric(record.discount2),
        geniscore1: parseNumeric(record.geniscore1),
        epsgeni: parseNumeric(record.epsgeni),

        // Returns
        'Return over 1week': parseNumeric(record['Return over 1week']),
        'Return over 1month': parseNumeric(record['Return over 1month']),
        'Return over 3months': parseNumeric(record['Return over 3months']),

        // Quality scores
        BSchklist: parseNumeric(record.BSchklist),
        Canslim: parseNumeric(record.Canslim),
        'master score': parseNumeric(record['master score']),
        momentumscore: parseNumeric(record.momentumscore),
        garp: parseNumeric(record.garp),

        // Technical indicators
        volumeincr: parseNumeric(record.volumeincr),
        rsiincr: parseNumeric(record.rsiincr),
        accumulation: parseNumeric(record.accumulation),

        // Ownership
        'Promoter holding': parseNumeric(record['Promoter holding']),
        'Change in promoter holding': parseNumeric(record['Change in promoter holding']),
        pubholdingdecr: parseNumeric(record.pubholdingdecr),

        // Financial health
        CashFlow: parseNumeric(record.CashFlow),
        debtgeni: parseNumeric(record.debtgeni),
        debtreduce: parseNumeric(record.debtreduce),
        equityreduce: parseNumeric(record.equityreduce),

        // Quarterly
        'Quarterly Growers': parseNumeric(record['Quarterly Growers']),
        'YOY Quarterly sales growth': parseNumeric(record['YOY Quarterly sales growth']),
        'YOY Quarterly profit growth': parseNumeric(record['YOY Quarterly profit growth']),

        // Special metrics
        epsgrowth: parseNumeric(record.epsgrowth),
        epsgrowthbydiscount: parseNumeric(record.epsgrowthbydiscount),
        epsgrowthbydiscount2: parseNumeric(record.epsgrowthbydiscount2),
        epsgrowthbyprice2: parseNumeric(record.epsgrowthbyprice2),
        roicreinv: parseNumeric(record.roicreinv),
        cyclicaltriggers: parseNumeric(record.cyclicaltriggers),
        'capacity expansion': parseNumeric(record['capacity expansion']),
        'fundamental value': parseNumeric(record['fundamental value'])
    }));
}

/**
 * Parse numeric value safely
 */
function parseNumeric(value) {
    if (value === undefined || value === null || value === '') {
        return 0;
    }
    if (typeof value === 'number') {
        return value;
    }
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
}

/**
 * Validate stock data
 */
export function validateStockData(stocks) {
    const issues = [];
    const valid = [];

    for (const stock of stocks) {
        const stockIssues = [];

        if (!stock.Name) {
            stockIssues.push('Missing name');
        }
        if (!stock['Current Price'] || stock['Current Price'] <= 0) {
            stockIssues.push('Invalid price');
        }
        if (!stock['NSE Code'] && !stock['BSE Code']) {
            stockIssues.push('Missing stock code');
        }

        if (stockIssues.length > 0) {
            issues.push({ stock: stock.Name || 'Unknown', issues: stockIssues });
        } else {
            valid.push(stock);
        }
    }

    return { valid, issues };
}

/**
 * Get data summary
 */
export function getDataSummary(stocks) {
    const industries = new Set(stocks.map(s => s.Industry));
    const industryGroups = new Set(stocks.map(s => s['Industry Group']));

    const priceRange = {
        min: Math.min(...stocks.map(s => s['Current Price']).filter(p => p > 0)),
        max: Math.max(...stocks.map(s => s['Current Price']).filter(p => p > 0))
    };

    const marketCapRange = {
        min: Math.min(...stocks.map(s => s['Market Capitalization']).filter(m => m > 0)),
        max: Math.max(...stocks.map(s => s['Market Capitalization']).filter(m => m > 0))
    };

    return {
        totalStocks: stocks.length,
        uniqueIndustries: industries.size,
        uniqueIndustryGroups: industryGroups.size,
        priceRange,
        marketCapRange,
        industries: [...industries].sort()
    };
}
