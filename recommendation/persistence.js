/**
 * Persistence Layer - JSON file storage for recommendations
 * Simple file-based storage without native dependencies
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_DIR = join(__dirname, '..', 'db');
const RECOMMENDATIONS_FILE = join(DB_DIR, 'recommendations.json');
const HISTORY_FILE = join(DB_DIR, 'stock_history.json');

/**
 * Ensure database directory exists
 */
function ensureDbDir() {
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }
}

/**
 * Load JSON file safely
 */
function loadJson(filepath, defaultValue = []) {
  try {
    if (existsSync(filepath)) {
      const content = readFileSync(filepath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error(`Error loading ${filepath}:`, e.message);
  }
  return defaultValue;
}

/**
 * Save JSON file
 */
function saveJson(filepath, data) {
  ensureDbDir();
  writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Initialize database (create files if needed)
 */
export function initDatabase() {
  ensureDbDir();

  if (!existsSync(RECOMMENDATIONS_FILE)) {
    saveJson(RECOMMENDATIONS_FILE, []);
  }
  if (!existsSync(HISTORY_FILE)) {
    saveJson(HISTORY_FILE, []);
  }

  console.log('📁 Database initialized at:', DB_DIR);
}

/**
 * Save recommendation
 */
export function saveRecommendation(recommendation) {
  const recommendations = loadJson(RECOMMENDATIONS_FILE, []);

  // Remove existing recommendation for same week if exists
  const filtered = recommendations.filter(r => r.weekId !== recommendation.weekId);

  // Add new recommendation
  filtered.unshift(recommendation);

  // Keep only last 52 weeks
  const trimmed = filtered.slice(0, 52);

  saveJson(RECOMMENDATIONS_FILE, trimmed);

  // Save stock history entries
  const history = loadJson(HISTORY_FILE, []);

  for (const stock of recommendation.allocation.stocks) {
    history.push({
      recommendationId: recommendation.id,
      weekId: recommendation.weekId,
      timestamp: recommendation.timestamp,
      stockCode: stock.nseCode,
      stockName: stock.name,
      weight: stock.weight,
      compositeScore: stock.compositeScore,
      recommendation: stock.recommendation,
      priceAtRecommendation: stock.currentPrice
    });
  }

  // Keep last 1000 entries
  const trimmedHistory = history.slice(-1000);
  saveJson(HISTORY_FILE, trimmedHistory);

  return recommendation.id;
}

/**
 * Get latest recommendation
 */
export function getLatestRecommendation() {
  const recommendations = loadJson(RECOMMENDATIONS_FILE, []);
  return recommendations.length > 0 ? recommendations[0] : null;
}

/**
 * Get recommendation by week ID
 */
export function getRecommendationByWeek(weekId) {
  const recommendations = loadJson(RECOMMENDATIONS_FILE, []);
  return recommendations.find(r => r.weekId === weekId) || null;
}

/**
 * Get all recommendations (paginated)
 */
export function getRecommendationHistory(limit = 10, offset = 0) {
  const recommendations = loadJson(RECOMMENDATIONS_FILE, []);
  return recommendations.slice(offset, offset + limit).map(r => ({
    id: r.id,
    weekId: r.weekId,
    timestamp: r.timestamp,
    marketCondition: r.marketCondition,
    data: r
  }));
}

/**
 * Get stock performance history
 */
export function getStockHistory(stockCode, limit = 20) {
  const history = loadJson(HISTORY_FILE, []);
  return history
    .filter(h => h.stockCode === stockCode)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

/**
 * Get weight changes for a stock over time
 */
export function getWeightTrend(stockCode) {
  const history = loadJson(HISTORY_FILE, []);
  return history
    .filter(h => h.stockCode === stockCode)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(h => ({
      weekId: h.weekId,
      weight: h.weight,
      compositeScore: h.compositeScore,
      priceAtRecommendation: h.priceAtRecommendation
    }));
}

/**
 * Get recommendation stats
 */
export function getRecommendationStats() {
  const recommendations = loadJson(RECOMMENDATIONS_FILE, []);
  const history = loadJson(HISTORY_FILE, []);

  if (recommendations.length === 0) {
    return {
      totalRecommendations: 0,
      firstRecommendation: null,
      lastRecommendation: null,
      frequentPicks: []
    };
  }

  // Count stock appearances
  const stockCounts = {};
  const stockWeights = {};

  for (const h of history) {
    stockCounts[h.stockCode] = (stockCounts[h.stockCode] || 0) + 1;
    stockWeights[h.stockCode] = (stockWeights[h.stockCode] || []);
    stockWeights[h.stockCode].push(h.weight);
  }

  const frequentPicks = Object.entries(stockCounts)
    .map(([code, appearances]) => ({
      stockCode: code,
      appearances,
      avgWeight: stockWeights[code].reduce((a, b) => a + b, 0) / stockWeights[code].length
    }))
    .sort((a, b) => b.appearances - a.appearances)
    .slice(0, 10);

  return {
    totalRecommendations: recommendations.length,
    firstRecommendation: recommendations[recommendations.length - 1]?.timestamp,
    lastRecommendation: recommendations[0]?.timestamp,
    frequentPicks
  };
}

/**
 * Close database (no-op for JSON storage)
 */
export function closeDatabase() {
  // No-op for JSON storage
}
