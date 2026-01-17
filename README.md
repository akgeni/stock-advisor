# Stock Advisor - User Guide

A risk-adjusted stock recommendation system that analyzes your portfolio and generates weighted buy recommendations.

---

## Quick Start

### 1. Start the Server

```bash
cd c:\Users\anshu\Documents\Practice\StockAdvisor
node server.js
```

You should see:
```
📁 Database initialized at: C:\Users\anshu\Documents\Practice\StockAdvisor\db
🚀 Stock Advisor API running on http://localhost:3001
```

### 2. Open the UI

Open your browser and go to: **http://localhost:3001**

### 3. Generate Recommendations

Click the **"🔍 Run Analysis"** button to analyze your stocks and generate weighted recommendations.

---

## Using New Input Data

### Step 1: Prepare Your CSV File

Your input file should be a CSV with the following structure. The file should contain these columns:

#### Required Columns:
| Column | Description | Example |
|--------|-------------|---------|
| `Name` | Stock name | Cigniti Tech. |
| `NSE Code` | NSE ticker symbol | CIGNITITEC |
| `BSE Code` | BSE ticker code | 534758 |
| `Industry` | Industry classification | IT Enabled Services |
| `Current Price` | Current stock price | 1707.5 |
| `Market Capitalization` | Market cap in Cr | 4598.1 |

#### Scoring Columns (Highly Recommended):
| Column | Description |
|--------|-------------|
| `Return on capital employed` | ROCE % |
| `Average return on capital employed 3Years` | 3-year avg ROCE |
| `Profit growth` | YoY profit growth % |
| `Profit growth 3Years` | 3-year profit CAGR |
| `Sales growth` | YoY sales growth % |
| `Sales growth 3Years` | 3-year sales CAGR |
| `Price to Earning` | P/E ratio |
| `Industry PE` | Sector P/E ratio |
| `Promoter holding` | Promoter stake % |
| `Change in promoter holding` | Quarterly change in promoter % |

#### Technical/Momentum Columns:
| Column | Description |
|--------|-------------|
| `DMA 50` | 50-day moving average |
| `DMA 200` | 200-day moving average |
| `Return over 3months` | 3-month return % |
| `Return over 1month` | 1-month return % |
| `Volume` | Current trading volume |
| `Volume 1month average` | Avg monthly volume |

#### Quality Score Columns (Optional but helpful):
| Column | Description |
|--------|-------------|
| `BSchklist` | Benjamin Graham score (0-10) |
| `Canslim` | CANSLIM methodology score |
| `master score` | Overall quality score |
| `momentumscore` | Momentum score |
| `debtgeni` | Debt quality score |
| `CashFlow` | Operating cash flow indicator |

### Step 2: Export from Screener.in

If you're using Screener.in:

1. Go to your **Watchlist** on Screener.in
2. Click **"Export to Excel"** 
3. Save the file as CSV format
4. Save as `watchlist.csv` in the project folder

### Step 3: Replace the Input File

Copy your new CSV file to the project directory:

```bash
# Replace the existing file
copy "your-new-watchlist.csv" "c:\Users\anshu\Documents\Practice\StockAdvisor\watchlist.csv"
```

**OR** update the server to use a different filename by editing `server.js` line 41:
```javascript
const DATA_FILE = join(__dirname, 'your-filename.csv');
```

### Step 4: Restart and Analyze

1. Stop the server (Ctrl+C)
2. Start it again: `node server.js`
3. Open http://localhost:3001
4. Click **"Run Analysis"**

---

## Understanding the Recommendations

### Score Components

Each stock is scored across 5 dimensions (0-100 scale):

| Score | What it Measures |
|-------|------------------|
| **Safety** | Financial stability, volatility, liquidity |
| **Fundamental** | Earnings quality, growth, competitive moat |
| **Valuation** | PE ratios, intrinsic value gap, value traps |
| **Momentum** | Price trends, pullback quality, volume |
| **External** | Sector momentum, peer performance |

### Recommendation Signals

| Signal | Composite Score | Meaning |
|--------|-----------------|---------|
| **STRONG BUY** | 70+ | High conviction pick |
| **BUY** | 60-70 | Good investment opportunity |
| **ACCUMULATE** | 50-60 | Worth buying on dips |
| **HOLD** | 40-50 | Hold if owned |
| **WATCH** | <40 | Monitor only |

### Position Sizing

- Maximum single stock: **12%**
- Maximum sector allocation: **25%**
- Cash reserve: **10%**
- Weights sum to **90%** equity allocation

---

## API Reference

For programmatic access:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/recommendations` | GET | Current recommendations |
| `/api/analyze` | POST | Generate new recommendations |
| `/api/stocks` | GET | List all stocks |
| `/api/stocks/:code` | GET | Stock details & scores |
| `/api/scoring` | GET | Full scoring breakdown |
| `/api/recommendations/history` | GET | Historical recommendations |

### Example: Generate via API

```powershell
# PowerShell
Invoke-RestMethod -Uri "http://localhost:3001/api/analyze" -Method POST

# Or using curl (Git Bash)
curl -X POST http://localhost:3001/api/analyze
```

---

## Troubleshooting

### "Data file not found"
- Ensure `watchlist.csv` exists in the project root
- Check the filename matches exactly

### "Server already running"
```powershell
# Kill existing node processes
Get-Process -Name "node" | Stop-Process -Force
# Then start again
node server.js
```

### "No recommendations generated"
- Check that your CSV has the required columns
- Verify stocks pass quality gates (ROCE > threshold, Market Cap > ₹300 Cr)

### Stocks excluded?
Check the exclusion reasons in the API response:
- **Profitability**: ROCE below sector threshold
- **Market cap too low**: Below ₹300 Cr minimum
- **Low promoter holding**: Below 26%

---

## File Structure

```
StockAdvisor/
├── server.js                    # Main server
├── watchlist.csv                # Your input data ← REPLACE THIS
├── public/
│   └── index.html               # Web UI
├── scoring/                     # Scoring algorithms
├── recommendation/              # Position sizing
├── data/                        # Data loading
└── db/
    └── recommendations.json     # Saved recommendations
```

---

## Weekly Usage Workflow

1. **Download fresh data** from Screener.in each week
2. **Replace** `watchlist.csv` with new file
3. **Restart** the server
4. **Run Analysis** from the UI
5. **Review** recommendations and adjust portfolio

---

## Need Help?

- Check API response at `http://localhost:3001/api/recommendations`
- View raw scoring at `http://localhost:3001/api/scoring`
- Inspect stock details at `http://localhost:3001/api/stocks/STOCKCODE`
