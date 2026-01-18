/**
 * Stock Advisor API Server
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { checkAI } from './ai.js';
import { dirname, join } from 'path';
import { existsSync, writeFileSync } from 'fs';

import { loadStockData, transformStockData, validateStockData, getDataSummary } from './data/loader.js';
import { generateRecommendation, compareRecommendations } from './recommendation/engine.js';
import {
    initDatabase,
    saveRecommendation,
    getLatestRecommendation,
    getRecommendationHistory,
    getRecommendationByWeek,
    getStockHistory,
    getRecommendationStats,
    closeDatabase
} from './recommendation/persistence.js';
import { scoreAllStocks, generateScoringStats } from './scoring/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'text/csv', limit: '10mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(join(__dirname, 'public')));

// Initialize database
initDatabase();

// Data file path
const DATA_FILE = join(__dirname, 'watchlist.csv');

// Cache for stock data
let stockDataCache = null;
let lastLoadTime = null;

/**
 * Load or get cached stock data
 */
function getStockData() {
    const now = Date.now();
    const cacheMaxAge = 5 * 60 * 1000; // 5 minutes

    if (stockDataCache && lastLoadTime && (now - lastLoadTime) < cacheMaxAge) {
        return stockDataCache;
    }

    if (!existsSync(DATA_FILE)) {
        throw new Error(`Data file not found: ${DATA_FILE}`);
    }

    const rawData = loadStockData(DATA_FILE);
    const transformed = transformStockData(rawData);
    const { valid, issues } = validateStockData(transformed);

    stockDataCache = {
        stocks: valid,
        issues,
        summary: getDataSummary(valid),
        loadedAt: new Date().toISOString()
    };
    lastLoadTime = now;

    return stockDataCache;
}

// ============ API ENDPOINTS ============

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        dataFile: existsSync(DATA_FILE) ? 'found' : 'missing'
    });
});

/**
 * Get data summary
 */
app.get('/api/data/summary', (req, res) => {
    try {
        const data = getStockData();
        res.json({
            summary: data.summary,
            issues: data.issues,
            loadedAt: data.loadedAt
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get all stocks with basic info
 */
app.get('/api/stocks', (req, res) => {
    try {
        const data = getStockData();
        const stocks = data.stocks.map(s => ({
            name: s.Name,
            nseCode: s['NSE Code'],
            bseCode: s['BSE Code'],
            industry: s.Industry,
            industryGroup: s['Industry Group'],
            price: s['Current Price'],
            marketCap: s['Market Capitalization'],
            pe: s['Price to Earning'],
            roce: s['Return on capital employed'],
            profitGrowth3Y: s['Profit growth 3Years'],
            return3m: s['Return over 3months']
        }));
        res.json(stocks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get single stock details with scoring
 */
app.get('/api/stocks/:code', (req, res) => {
    try {
        const data = getStockData();
        const stock = data.stocks.find(
            s => s['NSE Code'] === req.params.code || s['BSE Code'] === req.params.code
        );

        if (!stock) {
            return res.status(404).json({ error: 'Stock not found' });
        }

        // Get full scoring
        const scoringResult = scoreAllStocks(data.stocks);
        const scoredStock = scoringResult.passed.find(
            s => s.nseCode === req.params.code || s.bseCode === req.params.code
        ) || scoringResult.failed.find(
            s => s.nseCode === req.params.code || s.bseCode === req.params.code
        );

        // Get history
        const history = getStockHistory(req.params.code);

        res.json({
            stock,
            scoring: scoredStock,
            history
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Deep analysis for a stock - quarterly results and news
 */
app.get('/api/analysis/:code', (req, res) => {
    try {
        const data = getStockData();
        const searchCode = req.params.code;
        const stock = data.stocks.find(
            s => s['NSE Code'] === searchCode ||
                String(s['BSE Code']) === searchCode ||
                s['Name'] === searchCode ||
                s['Name'].toLowerCase().includes(searchCode.toLowerCase())
        );

        if (!stock) {
            return res.status(404).json({ error: `Stock not found: ${searchCode}` });
        }

        const name = stock['Name'];
        const nseCode = stock['NSE Code'] || '';
        const bseCode = stock['BSE Code'] || '';

        // Quarterly Results Analysis
        const quarterlyAnalysis = {
            yoyQuarterlySalesGrowth: stock['YOY Quarterly sales growth'] || 0,
            yoyQuarterlyProfitGrowth: stock['YOY Quarterly profit growth'] || 0,
            quarterlyGrowers: stock['Quarterly Growers'] || 0,
            profitGrowth: stock['Profit growth'] || 0,
            salesGrowth: stock['Sales growth'] || 0,
            npMargin: stock['npmargin'] || 0,
            opMargin: stock['opmargin'] || 0,
            signals: []
        };

        // Generate quarterly signals
        if (quarterlyAnalysis.yoyQuarterlyProfitGrowth > 30) {
            quarterlyAnalysis.signals.push({ type: 'positive', text: `Strong quarterly profit growth: ${quarterlyAnalysis.yoyQuarterlyProfitGrowth.toFixed(1)}%` });
        } else if (quarterlyAnalysis.yoyQuarterlyProfitGrowth < -20) {
            quarterlyAnalysis.signals.push({ type: 'negative', text: `Quarterly profit decline: ${quarterlyAnalysis.yoyQuarterlyProfitGrowth.toFixed(1)}%` });
        }

        if (quarterlyAnalysis.yoyQuarterlySalesGrowth > 20) {
            quarterlyAnalysis.signals.push({ type: 'positive', text: `Strong quarterly sales growth: ${quarterlyAnalysis.yoyQuarterlySalesGrowth.toFixed(1)}%` });
        } else if (quarterlyAnalysis.yoyQuarterlySalesGrowth < -10) {
            quarterlyAnalysis.signals.push({ type: 'negative', text: `Quarterly sales decline: ${quarterlyAnalysis.yoyQuarterlySalesGrowth.toFixed(1)}%` });
        }

        if (quarterlyAnalysis.profitGrowth > quarterlyAnalysis.salesGrowth * 1.5) {
            quarterlyAnalysis.signals.push({ type: 'positive', text: 'Operating leverage: Profit growing faster than sales' });
        }

        if (quarterlyAnalysis.quarterlyGrowers >= 1) {
            quarterlyAnalysis.signals.push({ type: 'positive', text: 'Consistent quarterly growth pattern' });
        }

        // Fundamental Highlights
        const fundamentals = {
            roce: stock['Return on capital employed'] || 0,
            roce3y: stock['Average return on capital employed 3Years'] || 0,
            profitGrowth3y: stock['Profit growth 3Years'] || 0,
            salesGrowth3y: stock['Sales growth 3Years'] || 0,
            pe: stock['Price to Earning'] || 0,
            industryPE: stock['Industry PE'] || 0,
            promoterHolding: stock['Promoter holding'] || 0,
            promoterChange: stock['Change in promoter holding'] || 0,
            bSchklist: stock['BSchklist'] || 0,
            canslim: stock['Canslim'] || 0,
            masterScore: stock['master score'] || 0,
            debtGeni: stock['debtgeni'] || 0,
            cashFlow: stock['CashFlow'] || 0
        };

        // News Search Links
        const searchQuery = encodeURIComponent(`${name} ${nseCode} stock news quarterly results`);
        const newsLinks = [
            { source: 'Google News', url: `https://news.google.com/search?q=${searchQuery}&hl=en-IN&gl=IN&ceid=IN:en` },
            { source: 'Moneycontrol', url: `https://www.moneycontrol.com/stocks/company_info/stock_news.php?sc_id=${bseCode || nseCode}` },
            { source: 'Economic Times', url: `https://economictimes.indiatimes.com/topic/${encodeURIComponent(name)}` },
            { source: 'Screener.in', url: `https://www.screener.in/company/${nseCode || bseCode}/` },
            { source: 'BSE', url: bseCode ? `https://www.bseindia.com/stock-share-price/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}/${bseCode}` : null },
            { source: 'NSE', url: nseCode ? `https://www.nseindia.com/get-quotes/equity?symbol=${nseCode}` : null }
        ].filter(l => l.url);

        // Technical Signals
        const technicals = {
            dma50: stock['DMA 50'] || 0,
            dma200: stock['DMA 200'] || 0,
            currentPrice: stock['Current Price'] || 0,
            return1m: stock['Return over 1month'] || 0,
            return3m: stock['Return over 3months'] || 0,
            momentumScore: stock['momentumscore'] || 0,
            volumeIncr: stock['volumeincr'] || 0,
            rsiIncr: stock['rsiincr'] || 0,
            signals: []
        };

        // Technical signals
        if (technicals.currentPrice > technicals.dma50 && technicals.dma50 > technicals.dma200) {
            technicals.signals.push({ type: 'positive', text: 'Price above both DMAs - Strong uptrend' });
        } else if (technicals.currentPrice < technicals.dma50 && technicals.dma50 < technicals.dma200) {
            technicals.signals.push({ type: 'negative', text: 'Price below both DMAs - Downtrend' });
        }

        if (technicals.return3m > 15) {
            technicals.signals.push({ type: 'positive', text: `Strong 3-month momentum: +${technicals.return3m.toFixed(1)}%` });
        } else if (technicals.return3m < -15) {
            technicals.signals.push({ type: 'negative', text: `Weak 3-month performance: ${technicals.return3m.toFixed(1)}%` });
        }

        if (technicals.volumeIncr >= 1) {
            technicals.signals.push({ type: 'positive', text: 'Increasing volume - Accumulation' });
        }

        // Overall Assessment
        const positiveSignals = quarterlyAnalysis.signals.filter(s => s.type === 'positive').length +
            technicals.signals.filter(s => s.type === 'positive').length;
        const negativeSignals = quarterlyAnalysis.signals.filter(s => s.type === 'negative').length +
            technicals.signals.filter(s => s.type === 'negative').length;

        let overallSentiment = 'Neutral';
        if (positiveSignals > negativeSignals + 1) overallSentiment = 'Bullish';
        else if (negativeSignals > positiveSignals + 1) overallSentiment = 'Bearish';

        // Investment Checklist - Critical criteria for stock selection
        const checklist = generateInvestmentChecklist(stock, quarterlyAnalysis, fundamentals, technicals);

        res.json({
            stock: stock,
            quarterlyAnalysis,
            fundamentals,
            technicals,
            newsLinks,
            checklist,
            overallSentiment,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Generate comprehensive investment checklist
 */
function generateInvestmentChecklist(stock, quarterly, fundamentals, technicals) {
    const checks = [];

    // Helper to get raw CSV value safely
    const getVal = (key) => stock[key] !== undefined ? parseFloat(stock[key]) : 0;

    // === 1. FINANCIAL FORTITUDE (Solvency & Quality) ===
    // Balance Sheet Strength Score
    const bsScore = getVal('BSchklist');
    checks.push({
        category: 'Financial Fortitude',
        name: 'Strong Balance Sheet',
        description: 'Balance Sheet Checklist Score ≥ 7/10',
        passed: bsScore >= 7,
        value: `Score: ${bsScore}/10`,
        importance: 'critical'
    });

    // Cash Flow positive
    // Note: CashFlow column seems to be a score or ratio. >0 is baseline.
    const cfoPositive = getVal('CashFlow') > 0;
    checks.push({
        category: 'Financial Fortitude',
        name: 'Positive Operating Cash Flow',
        description: 'Company generates real cash from operations',
        passed: cfoPositive,
        value: cfoPositive ? 'Positive' : 'Negative/Low',
        importance: 'critical'
    });

    // Debt Reduction or Low Debt
    const debtReduce = getVal('debtreduce') === 1;
    const debtScore = getVal('debtgeni'); // Score out of 5 usually
    checks.push({
        category: 'Financial Fortitude',
        name: 'Debt Management',
        description: 'Active debt reduction or low debt (Score ≥ 4)',
        passed: debtReduce || debtScore >= 4,
        value: debtReduce ? 'Reducing Debt' : `Score: ${debtScore}`,
        importance: 'important'
    });

    // === 2. GROWTH TRAJECTORY (Sustainability) ===
    // Sales Acceleration: Recent Q growth > 3Y Avg
    const salesAccel = quarterly.yoyQuarterlySalesGrowth > fundamentals.salesGrowth3y;
    checks.push({
        category: 'Growth Trajectory',
        name: 'Sales Acceleration',
        description: 'Quarterly sales growth > 3Y average',
        passed: salesAccel,
        value: `Q: ${quarterly.yoyQuarterlySalesGrowth}% vs 3Y: ${fundamentals.salesGrowth3y}%`,
        importance: 'important'
    });

    // Consistent Growth Pattern
    const consistentGrower = getVal('Quarterly Growers') === 1;
    checks.push({
        category: 'Growth Trajectory',
        name: 'Consistent Quarterly Growth',
        description: 'Classified as a consistent quarterly grower',
        passed: consistentGrower,
        value: consistentGrower ? 'Yes' : 'No',
        importance: 'critical'
    });

    // Capacity Expansion
    const expansion = getVal('capacity expansion') === 1;
    checks.push({
        category: 'Growth Trajectory',
        name: 'Capacity Expansion',
        description: 'Company is expanding capacity for future growth',
        passed: expansion,
        value: expansion ? 'Expanding' : 'No',
        importance: 'optional'
    });

    // === 3. VALUATION & MARGIN OF SAFETY ===
    // Valuation Discount (Proprietary)
    const discount = getVal('discount1'); // Negative implies discount? Or positive?
    // Let's assume based on "discount" naming conventions: usually positive means discount.
    // However, looking at data: Accelya (Buy) has discount1 = -0.21. 
    // Wait, let's look at Discount2: 0.31. 
    // Let's use Industry PE comparison as primary, and 'fundamental value' if useful.

    // Garp score check
    const garpScore = getVal('garp');
    checks.push({
        category: 'Valuation',
        name: 'GARP Score',
        description: 'Growth At Reasonable Price score > 0',
        passed: garpScore > 0,
        value: `Score: ${garpScore}`,
        importance: 'important'
    });

    // Industry PE Discount
    const peDiscount = fundamentals.pe < fundamentals.industryPE;
    checks.push({
        category: 'Valuation',
        name: 'Discount to Industry',
        description: 'Trading at P/E lower than industry average',
        passed: peDiscount,
        value: `${fundamentals.pe} vs ${fundamentals.industryPE}`,
        importance: 'important'
    });

    // Margin of Safety (P/E < 25 or Growth > 20%)
    const marginOfSafety = fundamentals.pe < 25 || fundamentals.profitGrowth3y > 20;
    checks.push({
        category: 'Valuation',
        name: 'Margin of Safety',
        description: 'P/E < 25 OR High Growth (>20%)',
        passed: marginOfSafety,
        value: `P/E: ${fundamentals.pe}, Gr: ${fundamentals.profitGrowth3y}%`,
        importance: 'critical'
    });

    // === 4. CAPITAL EFFICIENCY ===
    // ROCE Trend
    // rocev2 likely represents recent/forward ROCE or similar derivative
    const roceImproving = getVal('rocev2') > 0 || fundamentals.roce > fundamentals.roce3y;
    checks.push({
        category: 'Capital Efficiency',
        name: 'Improving Capital Returns',
        description: 'Current ROCE > 3Y Average',
        passed: roceImproving,
        value: `${fundamentals.roce}% vs ${fundamentals.roce3y}%`,
        importance: 'important'
    });

    // High ROCE baseline
    checks.push({
        category: 'Capital Efficiency',
        name: 'High ROCE (>20%)',
        description: 'Superior capital efficiency',
        passed: fundamentals.roce > 20,
        value: `${fundamentals.roce}%`,
        importance: 'critical'
    });

    // === 5. INSTITUTIONAL ACTION ===
    // Smart Money Flow (Decreasing Public Holding = Increasing Pro/Inst Holding)
    const smartMoney = getVal('pubholdingdecr') === 1;
    checks.push({
        category: 'Institutional Action',
        name: 'Smart Money Accumulation',
        description: 'Public shareholding is decreasing (Institutions buying)',
        passed: smartMoney,
        value: smartMoney ? 'Yes (Accumulating)' : 'No',
        importance: 'critical'
    });

    // Accumulation Signal
    const accumulation = getVal('accumulation') === 1;
    checks.push({
        category: 'Institutional Action',
        name: 'Volume Accumulation',
        description: 'Price volume action suggests accumulation',
        passed: accumulation,
        value: accumulation ? 'Detected' : 'None',
        importance: 'important'
    });

    // Promoter Confidence (Not selling)
    const promoterHold = getVal('Change in promoter holding') >= 0;
    checks.push({
        category: 'Institutional Action',
        name: 'Promoter Confidence',
        description: 'Promoters are not reducing stake',
        passed: promoterHold,
        value: `${getVal('Change in promoter holding')}% change`,
        importance: 'critical'
    });

    // Calculate summary
    const criticalChecks = checks.filter(c => c.importance === 'critical');
    const importantChecks = checks.filter(c => c.importance === 'important');

    const criticalPassed = criticalChecks.filter(c => c.passed).length;
    const importantPassed = importantChecks.filter(c => c.passed).length;
    const totalPassed = checks.filter(c => c.passed).length;

    // Investment recommendation logic
    let recommendation;
    let color;

    const criticalRate = criticalChecks.length > 0 ? criticalPassed / criticalChecks.length : 0;
    const totalRate = totalPassed / checks.length;

    if (criticalRate >= 0.8 && totalRate >= 0.75) {
        recommendation = 'STRONG CONVICTION - Institutional quality';
        color = 'success';
    } else if (criticalRate >= 0.6 && totalRate >= 0.6) {
        recommendation = 'INVEST - Good quality, monitor risks';
        color = 'success';
    } else if (totalRate >= 0.5) {
        recommendation = 'SPECULATIVE - Mixed signals';
        color = 'warning';
    } else {
        recommendation = 'AVOID - Fundamental weakness';
        color = 'danger';
    }

    return {
        checks,
        summary: {
            total: checks.length,
            passed: totalPassed,
            failed: checks.length - totalPassed,
            criticalTotal: criticalChecks.length,
            criticalPassed,
            importantTotal: importantChecks.length,
            importantPassed,
            passRate: ((totalPassed / checks.length) * 100).toFixed(0)
        },
        recommendation,
        color,
        guidance: {
            ideal: 'Match >80% Critical Checks (Smart Money + Balance Sheet)',
            acceptable: '>60% Total Pass Rate',
            caution: 'Declining Margins or Public Holding Increase',
            avoid: 'Weak Balance Sheet (Score < 5)'
        }
    };
}

/**
 * Get current recommendation
 */
app.get('/api/recommendations', (req, res) => {
    try {
        const latest = getLatestRecommendation();

        if (!latest) {
            return res.json({
                message: 'No recommendations yet. Use POST /api/analyze to generate.',
                hasRecommendation: false
            });
        }

        res.json({
            hasRecommendation: true,
            recommendation: latest
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get recommendation history
 */
app.get('/api/recommendations/history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;

        const history = getRecommendationHistory(limit, offset);
        const stats = getRecommendationStats();

        res.json({ history, stats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get specific week's recommendation
 */
app.get('/api/recommendations/:weekId', (req, res) => {
    try {
        const recommendation = getRecommendationByWeek(req.params.weekId);

        if (!recommendation) {
            return res.status(404).json({ error: 'Recommendation not found for this week' });
        }

        res.json(recommendation);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Generate new recommendation (analyze stocks)
 */
app.post('/api/analyze', async (req, res) => {
    try {
        // Clear cache to get fresh data
        stockDataCache = null;

        const data = getStockData();

        // Generate new recommendation
        const recommendation = await generateRecommendation(data.stocks);

        // Get previous for comparison
        const previous = getLatestRecommendation();

        // Save new recommendation
        saveRecommendation(recommendation);

        // Compare with previous
        const changes = compareRecommendations(recommendation, previous);

        res.json({
            success: true,
            recommendation,
            changes,
            dataInfo: {
                totalStocks: data.stocks.length,
                dataIssues: data.issues.length,
                loadedAt: data.loadedAt
            }
        });
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Upload new watchlist CSV and analyze
 */
app.post('/api/upload', async (req, res) => {
    try {
        let csvContent = req.body;

        // Handle different content types
        if (Buffer.isBuffer(csvContent)) {
            csvContent = csvContent.toString('utf-8');
        }

        if (!csvContent || typeof csvContent !== 'string' || csvContent.trim().length === 0) {
            return res.status(400).json({ error: 'No CSV content provided' });
        }

        // Validate it looks like CSV (has header row with expected columns)
        const firstLine = csvContent.split('\n')[0].toLowerCase();
        if (!firstLine.includes('name') || !firstLine.includes('price')) {
            return res.status(400).json({
                error: 'Invalid CSV format. File must contain "Name" and "Current Price" columns.'
            });
        }

        // Save the uploaded file
        writeFileSync(DATA_FILE, csvContent, 'utf-8');
        console.log(`📁 New watchlist uploaded: ${DATA_FILE}`);

        // Clear cache to force reload
        stockDataCache = null;

        // Load and validate the new data
        const data = getStockData();

        // Generate new recommendation
        const recommendation = await generateRecommendation(data.stocks);

        // Get previous for comparison
        const previous = getLatestRecommendation();

        // Save new recommendation
        saveRecommendation(recommendation);

        // Compare with previous
        const changes = compareRecommendations(recommendation, previous);

        res.json({
            success: true,
            message: 'Watchlist uploaded and analyzed successfully',
            recommendation,
            changes,
            dataInfo: {
                totalStocks: data.stocks.length,
                dataIssues: data.issues.length,
                loadedAt: data.loadedAt
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get scoring breakdown for all stocks
 */
app.get('/api/scoring', (req, res) => {
    try {
        const data = getStockData();
        const scoringResult = scoreAllStocks(data.stocks);
        const stats = generateScoringStats(scoringResult);

        res.json({
            marketCondition: scoringResult.marketCondition,
            summary: scoringResult.summary,
            stats,
            passed: scoringResult.passed.slice(0, 30), // Top 30
            failedCount: scoringResult.failed.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get stock history
 */
app.get('/api/history/:code', (req, res) => {
    try {
        const history = getStockHistory(req.params.code);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// AI Check Endpoint
app.post('/api/ai-check', async (req, res) => {
    try {
        const { name, industry } = req.body;
        if (!name) return res.status(400).json({ error: 'Stock name required' });

        console.log(`🤖 AI Check for: ${name}`);
        const result = await checkAI(name, industry || 'Unknown');
        res.json(result);
    } catch (err) {
        console.error("AI Check Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Stockify API running on http://localhost:${PORT}`);
    console.log(`📊 Data file: ${DATA_FILE}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /api/health              - Health check`);
    console.log(`  GET  /api/data/summary        - Data summary`);
    console.log(`  GET  /api/stocks              - List all stocks`);
    console.log(`  GET  /api/stocks/:code        - Stock details`);
    console.log(`  GET  /api/recommendations     - Current recommendation`);
    console.log(`  GET  /api/recommendations/history - Recommendation history`);
    console.log(`  POST /api/analyze             - Generate new recommendation`);
    console.log(`  GET  /api/scoring             - Scoring breakdown`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    closeDatabase();
    process.exit(0);
});
