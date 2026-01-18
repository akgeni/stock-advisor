
import https from 'https';
import Parser from 'rss-parser';
import dotenv from 'dotenv';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';

dotenv.config();

const parser = new Parser();
const CACHE_DIR = path.join(process.cwd(), 'db');
const CACHE_FILE = path.join(CACHE_DIR, 'ai_cache.json');
const CACHE_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days

function getCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        }
    } catch (e) {
        console.error("Cache read failed:", e.message);
    }
    return {};
}

function saveCache(cache) {
    try {
        if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch (e) {
        console.error("Cache write failed:", e.message);
    }
}

export async function checkAI(stockName, industry) {
    // 0. Check Cache
    const cache = getCache();
    const cacheKey = stockName.toLowerCase().trim();

    if (cache[cacheKey] && (Date.now() - cache[cacheKey].timestamp < CACHE_DURATION)) {
        console.log(`🧠 Serving cached AI analysis for: ${stockName}`);
        return cache[cacheKey].data;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return {
            error: "Missing GROQ_API_KEY. Please add it to your .env file."
        };
    }

    // 1. Fetch Internet Data (News)
    let newsContext = "No specific recent news found.";
    try {
        const query = `${stockName} stock news india`;
        const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`);

        if (feed.items && feed.items.length > 0) {
            newsContext = feed.items.slice(0, 6).map(item => `- ${item.title} (${item.pubDate})`).join('\n');
        }
    } catch (e) {
        console.error("News fetch failed:", e.message);
        newsContext += " (News fetch failed).";
    }

    // 2. Prompt LLM
    const prompt = `
Role: Senior Financial Strategist.
Task: Analyze the company "${stockName}" (Industry: ${industry}).
Data Source: Use your internal knowledge and the following recent news headlines.

Recent News Context:
${newsContext}

Questions to Answer (Be Decisive and Direct):
1. Government Guidelines: Start with YES/NO. Are there strict regulations hindering growth? List key ones using bullet points.
2. Sector Future: Provide a decisive outlook (Bullish/Bearish/Neutral). List 2-3 key growth drivers or risks using bullet points.
3. Industry Lifecycle: Classify as Startup, Growth, Shakeout, Maturity, or Decline. Start with the classification in bold (e.g. **Maturity**). Explain briefly.
4. BCG Matrix: Classify as Star, Cash Cow, Dog, or Question Mark. Start with the classification in bold. Explain logic.
5. Price Drivers: Explain why the stock price is moving up or down recently. Cite factual reasons (earnings, news, market sentiment) if available in context.
6. Corporate Governance: Critical analysis of governance standards. highlighting any red flags, trust issues, or management quality concerns. Be critical.
7. Broker Recommendations: Summarize recent buy/sell calls from major brokerage houses (e.g. Morgan Stanley, Jefferies, Motilal Oswal). Include target prices if known.
8. Institutional Activity: Analyze FII and DII flows for this stock. Also mention any recent buying/selling by Super Investors (e.g. Jhunjhunwala, Vijay Kedia, Radhakishan Damani, Rakesh Jhunjhunwala, Rekha Jhunjhunwala, Raamdeo Agrawal, Ashish Kacholia, Sunil Singhania, Dolly Khanna, Nemish S Shah, Porinju Veliyath). Be specific with names if possible.

Output Format: JSON object with keys: "guidelines", "future", "lifecycle", "bcg", "priceDrivers", "governance", "brokerRecs", "institutional". All values MUST be strings, not objects.
Content Style: Use short paragraphs and emojis. Use \n for line breaks. Avoid hedging (e.g. "It depends").
`;

    // 3. Call Groq API via HTTPS (Node 14 compatible)
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            model: 'moonshotai/kimi-k2-instruct-0905',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const options = {
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const json = JSON.parse(data);
                        const content = json.choices[0].message.content;
                        const result = JSON.parse(content);

                        // Save to cache
                        try {
                            const updatedCache = getCache();
                            updatedCache[cacheKey] = { timestamp: Date.now(), data: result };
                            saveCache(updatedCache);
                        } catch (e) { console.error("Cache save warning:", e.message); }

                        resolve(result);
                    } catch (e) {
                        reject(new Error("Failed to parse Groq response: " + data));
                    }
                } else {
                    reject(new Error(`Groq API Error: ${res.statusCode} ${data}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(new Error("Request failed: " + e.message));
        });

        req.write(postData);
        req.end();
    });
}
