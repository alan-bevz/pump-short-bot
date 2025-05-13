import { parentPort, workerData } from 'worker_threads';
import strategy from './strategies/index.js';

// Розпаковуємо дані з воркеру
const { 
  configs: CONFIGS, 
  candles: CANDLES, 
  workerId: WORKER_ID,
  strategyKey: STRATEGY_KEY
} = workerData;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || 100);

// Масив для збереження всіх результатів
const ALL_RESULTS = [];

/**
 * Розрахунок оцінки якості стратегії:
 * - netProfit: основний прибуток
 * - avgProfitPerTrade: ефективність однієї угоди
 * - winRate: стабільність
 * - totalTrades: штраф за надто часті угоди
 */
function evaluateResult(result) {
  const netProfit = parseFloat(result.result.netWithCommission);
  const winRate = parseFloat(result.result.winRate);
  const profitFactor = parseFloat(result.result.profitFactor);
  const totalTrades = parseInt(result.result.countPosition.qty);

  // if (profitFactor < 1.5) return -Infinity;
  if (isNaN(winRate)) return -Infinity;
  if (1 >= netProfit) return -Infinity;

  const avgProfitPerTrade = netProfit / totalTrades;

  const score =
    avgProfitPerTrade * 10 +
    winRate * 0.5 +
    netProfit -
    totalTrades / 250;

  return score.toFixed(8);
}


/**
 * Обробка однієї пачки конфігів
 */
async function processBatch(batch, startIndex) {
  const results = await Promise.all(batch.map(config => strategy[STRATEGY_KEY].backtest(config, CANDLES)));

  let bestInBatch = null;

  for (const result of results) {
    if (!result) continue;

    const score = evaluateResult(result);

    // Для відображення в консолі найкращого в цій пачці
    if (score !== -Infinity && (!bestInBatch || score > bestInBatch.score)) {
      bestInBatch = { ...result, score };
    }
  }

  if (bestInBatch) {
    ALL_RESULTS.push(bestInBatch);
    console.log(`📈 Воркер #${WORKER_ID}: кращий у бачу (від ${startIndex} до ${startIndex + BATCH_SIZE}): ${bestInBatch.result.netWithCommission} USDT`);
  } else {
    console.log(`📈 Воркер #${WORKER_ID}: немає кращого у бачі (від ${startIndex} до ${startIndex + BATCH_SIZE})`);
  }
}

// Головний блок виконання
(async () => {
  console.warn(`\x1b[32m📈 Воркер #${WORKER_ID}: початок обробки бача ${CONFIGS.length}\x1b[0m`);

  for (let i = 0; i < CONFIGS.length; i += BATCH_SIZE) {
    const batch = CONFIGS.slice(i, i + BATCH_SIZE);
    await processBatch(batch, i);
  }

  parentPort.postMessage(ALL_RESULTS);
})();
