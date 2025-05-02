import { parentPort, workerData } from 'worker_threads';
import { backtest } from './pump-short-bot.js';

const { configs, candles, workerId } = workerData;

let bestResult = null;

(async () => {
  for (let i = 0; i < configs.length; i++) {
    const result = await backtest(configs[i], candles);
    if (!result) continue;

    if (
      !bestResult ||
      result.netProfit.isGreaterThan(bestResult.netProfit)
    ) {
      bestResult = result;
    }

    if ((i + 1) % 1000 === 0) {
      console.log(`🧩 Воркер #${workerId}: оброблено ${i + 1} конфігурацій`);
    }
  }

  parentPort.postMessage(bestResult);
})();
