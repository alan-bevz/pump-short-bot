import { parentPort, workerData } from 'worker_threads';
import { backtest } from './pump-short-bot.js';
import BigNumber from 'bignumber.js';

const { configs, candles, workerId } = workerData;
const BATCH_SIZE = 100;
const defaultResult = {
  settings: {},
  result: {
    netProfit: '0',
    totalPnL: '0',
    winRate: '0',
    totalProfit: '0',
    totalLoss: '0',
    countPosition: {
      wins: '0',
      losses: '0'
    }
  }
}

let bestResult = JSON.parse(JSON.stringify(defaultResult));

async function processBatch(batch, startIndex) {
  const results = await Promise.all(batch.map(config => backtest(config, candles)));

  let bestInBatch = JSON.parse(JSON.stringify(defaultResult));
  for (const result of results) {
    if (!result) continue;

    const resultNetProfit = new BigNumber(result.result.netProfit);
    const bestResultNetProfit = new BigNumber(bestResult.result.netProfit);
    const bestInBatchNetProfit = new BigNumber(bestInBatch.result.netProfit);

    if (!bestResult || resultNetProfit.isGreaterThan(bestResultNetProfit)) {
      bestResult = result;
    }

    if (!bestInBatch || resultNetProfit.isGreaterThan(bestInBatchNetProfit)) {
      bestInBatch = result;
    }
  }

  if (bestInBatch) {
    console.log(`📈 Воркер #${workerId}: кращий у бачу (від ${startIndex}): ${bestInBatch.result.netProfit} USDT`);
  }
}

(async () => {
  for (let i = 0; i < configs.length; i += BATCH_SIZE) {
    console.warn(`\x1b[32m📈 Воркер #${workerId}: початок обробки бача (від ${i})\x1b[0m`);

    const batch = configs.slice(i, i + BATCH_SIZE);
    await processBatch(batch, i);
  }

  const res = {
    netProfit: bestResult.netProfit,
    settings: bestResult.settings
  }

  parentPort.postMessage(res);
})();