import { useState, useEffect, useCallback } from 'react';

// API base URL
const API_BASE = '/api';

/**
 * Stock Advisor Main App
 */
export default function App() {
    const [recommendation, setRecommendation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('allocation');

    // Load current recommendation on mount
    useEffect(() => {
        loadRecommendation();
    }, []);

    const loadRecommendation = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(`${API_BASE}/recommendations`);
            const data = await res.json();

            if (data.hasRecommendation) {
                setRecommendation(data.recommendation);
            }
        } catch (err) {
            setError('Failed to load recommendations. Is the server running?');
        } finally {
            setLoading(false);
        }
    };

    const runAnalysis = async () => {
        try {
            setAnalyzing(true);
            setError(null);
            const res = await fetch(`${API_BASE}/analyze`, { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                setRecommendation(data.recommendation);
            } else {
                throw new Error(data.error || 'Analysis failed');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setAnalyzing(false);
        }
    };

    if (loading) {
        return (
            <div className="app">
                <div className="container">
                    <div className="loading">
                        <div className="spinner"></div>
                        <p>Loading Stock Advisor...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="app">
            <div className="container">
                {/* Header */}
                <header className="header">
                    <h1>📈 Stock Advisor</h1>
                    <p>Risk-adjusted portfolio recommendations powered by multi-factor analysis</p>
                </header>

                {/* Error Display */}
                {error && (
                    <div className="card fade-in" style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger)', marginBottom: 'var(--spacing-lg)' }}>
                        <p style={{ color: 'var(--danger)' }}>⚠️ {error}</p>
                    </div>
                )}

                {/* Controls */}
                <div className="card fade-in" style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
                        <div>
                            <h3 style={{ marginBottom: 'var(--spacing-xs)' }}>Generate Recommendations</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                Analyze your portfolio and generate weighted buy recommendations
                            </p>
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={runAnalysis}
                            disabled={analyzing}
                        >
                            {analyzing ? (
                                <>
                                    <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, marginBottom: 0 }}></span>
                                    Analyzing...
                                </>
                            ) : (
                                <>🔍 Run Analysis</>
                            )}
                        </button>
                    </div>
                </div>

                {/* Main Content */}
                {recommendation ? (
                    <RecommendationView
                        recommendation={recommendation}
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                    />
                ) : (
                    <div className="card empty-state fade-in">
                        <h3>No Recommendations Yet</h3>
                        <p>Click "Run Analysis" to generate your first portfolio recommendation.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Recommendation View Component
 */
function RecommendationView({ recommendation, activeTab, setActiveTab }) {
    const { summary, allocation, marketCondition, topPicks, watchlist, timestamp } = recommendation;

    return (
        <div className="fade-in">
            {/* Stats Summary */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-value">{allocation.stocks.length}</div>
                    <div className="stat-label">Recommended Stocks</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{allocation.totalEquity}%</div>
                    <div className="stat-label">Equity Allocation</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{allocation.cash}%</div>
                    <div className="stat-label">Cash Reserve</div>
                </div>
                <div className="stat-card">
                    <div className={`market-badge ${marketCondition.toLowerCase()}`}>
                        {marketCondition === 'BULLISH' && '🚀'}
                        {marketCondition === 'BEARISH' && '🐻'}
                        {marketCondition === 'NEUTRAL' && '⚖️'}
                        {marketCondition}
                    </div>
                    <div className="stat-label">Market Condition</div>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs">
                <button
                    className={`tab ${activeTab === 'allocation' ? 'active' : ''}`}
                    onClick={() => setActiveTab('allocation')}
                >
                    Portfolio Allocation
                </button>
                <button
                    className={`tab ${activeTab === 'topPicks' ? 'active' : ''}`}
                    onClick={() => setActiveTab('topPicks')}
                >
                    Top 5 Picks
                </button>
                <button
                    className={`tab ${activeTab === 'sectors' ? 'active' : ''}`}
                    onClick={() => setActiveTab('sectors')}
                >
                    Sector Breakdown
                </button>
                <button
                    className={`tab ${activeTab === 'watchlist' ? 'active' : ''}`}
                    onClick={() => setActiveTab('watchlist')}
                >
                    Watchlist
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'allocation' && (
                <AllocationTable stocks={allocation.stocks} />
            )}
            {activeTab === 'topPicks' && (
                <TopPicksView picks={topPicks} />
            )}
            {activeTab === 'sectors' && (
                <SectorBreakdown sectors={allocation.sectorBreakdown} />
            )}
            {activeTab === 'watchlist' && (
                <WatchlistView watchlist={watchlist} />
            )}

            {/* Footer */}
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 'var(--spacing-xl)' }}>
                Last updated: {new Date(timestamp).toLocaleString()}
            </div>
        </div>
    );
}

/**
 * Allocation Table Component
 */
function AllocationTable({ stocks }) {
    return (
        <div className="card">
            <div className="card-header">
                <h3 className="card-title">Portfolio Allocation</h3>
                <span style={{ color: 'var(--text-secondary)' }}>{stocks.length} stocks</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table className="recommendation-table">
                    <thead>
                        <tr>
                            <th>Stock</th>
                            <th>Industry</th>
                            <th>Weight</th>
                            <th>Score</th>
                            <th>Risk</th>
                            <th>Signal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stocks.map((stock, index) => (
                            <tr key={stock.nseCode || index}>
                                <td>
                                    <div className="stock-name">{stock.name}</div>
                                    <div className="stock-code">{stock.nseCode}</div>
                                </td>
                                <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                    {stock.industry}
                                </td>
                                <td>
                                    <div className="weight-value">{stock.weight}%</div>
                                    <div className="weight-bar-container" style={{ width: 80, marginTop: 4 }}>
                                        <div className="weight-bar" style={{ width: `${Math.min(stock.weight * 6.67, 100)}%` }}></div>
                                    </div>
                                </td>
                                <td>
                                    <div className={`score-badge ${getScoreClass(stock.compositeScore)}`}>
                                        {stock.compositeScore}
                                    </div>
                                </td>
                                <td>
                                    <span style={{ color: getRiskColor(stock.riskLevel) }}>
                                        {stock.riskLevel}
                                    </span>
                                </td>
                                <td>
                                    <span className={`rec-badge ${stock.recommendation.toLowerCase().replace(' ', '-')}`}>
                                        {stock.recommendation}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/**
 * Top Picks View Component
 */
function TopPicksView({ picks }) {
    return (
        <div className="top-picks-grid">
            {picks.map((pick, index) => (
                <div key={pick.code} className="top-pick-card">
                    <div className="top-pick-rank">{index + 1}</div>

                    <div className="top-pick-header">
                        <h4>{pick.name}</h4>
                        <span className="stock-code">{pick.code}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div className="top-pick-weight">{pick.weight}%</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                ₹{pick.price?.toLocaleString()}
                            </div>
                        </div>
                        <div className={`score-badge ${getScoreClass(pick.compositeScore)}`} style={{ width: 50, height: 50, fontSize: '1.1rem' }}>
                            {pick.compositeScore}
                        </div>
                    </div>

                    <div className="score-grid">
                        <div className="score-item">
                            <div className="score-item-label">Safety</div>
                            <div className="score-item-value" style={{ color: getScoreColor(pick.scoreBreakdown?.safety) }}>
                                {pick.scoreBreakdown?.safety || '-'}
                            </div>
                        </div>
                        <div className="score-item">
                            <div className="score-item-label">Fund.</div>
                            <div className="score-item-value" style={{ color: getScoreColor(pick.scoreBreakdown?.fundamental) }}>
                                {pick.scoreBreakdown?.fundamental || '-'}
                            </div>
                        </div>
                        <div className="score-item">
                            <div className="score-item-label">Value</div>
                            <div className="score-item-value" style={{ color: getScoreColor(pick.scoreBreakdown?.valuation) }}>
                                {pick.scoreBreakdown?.valuation || '-'}
                            </div>
                        </div>
                        <div className="score-item">
                            <div className="score-item-label">Mom.</div>
                            <div className="score-item-value" style={{ color: getScoreColor(pick.scoreBreakdown?.momentum) }}>
                                {pick.scoreBreakdown?.momentum || '-'}
                            </div>
                        </div>
                        <div className="score-item">
                            <div className="score-item-label">Ext.</div>
                            <div className="score-item-value" style={{ color: getScoreColor(pick.scoreBreakdown?.external) }}>
                                {pick.scoreBreakdown?.external || '-'}
                            </div>
                        </div>
                    </div>

                    {pick.strengths?.length > 0 && (
                        <div className="top-pick-strengths">
                            {pick.strengths.map((s, i) => (
                                <span key={i} className="strength-tag">{s}</span>
                            ))}
                        </div>
                    )}

                    {pick.risks?.length > 0 && (
                        <div style={{ marginTop: 'var(--spacing-sm)' }}>
                            {pick.risks.map((r, i) => (
                                <span key={i} className="risk-tag">{r}</span>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

/**
 * Sector Breakdown Component
 */
function SectorBreakdown({ sectors }) {
    return (
        <div className="card">
            <div className="card-header">
                <h3 className="card-title">Sector Allocation</h3>
            </div>
            <div className="sector-grid">
                {sectors.map((sector, index) => (
                    <div key={index} className="sector-item">
                        <span className="sector-name">{sector.sector}</span>
                        <span className="sector-weight">{sector.weight}%</span>
                    </div>
                ))}
            </div>

            {/* Visual Bar Chart */}
            <div style={{ marginTop: 'var(--spacing-lg)' }}>
                {sectors.map((sector, index) => (
                    <div key={index} style={{ marginBottom: 'var(--spacing-sm)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{sector.sector}</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-secondary)' }}>{sector.weight}%</span>
                        </div>
                        <div className="weight-bar-container">
                            <div
                                className="weight-bar"
                                style={{
                                    width: `${Math.min(sector.weight * 4, 100)}%`,
                                    background: `hsl(${240 - index * 20}, 70%, 60%)`
                                }}
                            ></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Watchlist View Component
 */
function WatchlistView({ watchlist }) {
    if (!watchlist || watchlist.length === 0) {
        return (
            <div className="card empty-state">
                <h3>No Watchlist Items</h3>
                <p>All qualifying stocks are in the main allocation.</p>
            </div>
        );
    }

    return (
        <div className="card">
            <div className="card-header">
                <h3 className="card-title">Watchlist</h3>
                <span style={{ color: 'var(--text-secondary)' }}>Monitor for future opportunities</span>
            </div>
            <div className="watchlist-grid">
                {watchlist.map((stock, index) => (
                    <div key={index} className="watchlist-card">
                        <div className="stock-name">{stock.name}</div>
                        <div className="stock-code">{stock.code}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--spacing-sm)' }}>
                            <span className={`rec-badge ${stock.recommendation?.toLowerCase().replace(' ', '-')}`}>
                                {stock.recommendation}
                            </span>
                            <span className={`score-badge ${getScoreClass(stock.compositeScore)}`} style={{ width: 32, height: 32, fontSize: '0.8rem' }}>
                                {stock.compositeScore}
                            </span>
                        </div>
                        <div className="watchlist-reason">{stock.reason}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Helper functions
function getScoreClass(score) {
    if (score >= 65) return 'high';
    if (score >= 45) return 'medium';
    return 'low';
}

function getScoreColor(score) {
    if (score >= 65) return 'var(--success)';
    if (score >= 45) return 'var(--warning)';
    return 'var(--danger)';
}

function getRiskColor(riskLevel) {
    switch (riskLevel) {
        case 'Very Low':
        case 'Low':
            return 'var(--success)';
        case 'Moderate':
            return 'var(--warning)';
        case 'High':
        case 'Very High':
            return 'var(--danger)';
        default:
            return 'var(--text-secondary)';
    }
}
