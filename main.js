// 📄 main.js
import { Worker } from 'worker_threads';
import { getCandles } from './candles.js';
import { getTestConfigs } from './pump-short-bot.js';
import os from 'os';
const cpuCount = os.cpus().length;

console.log(`🧠 Доступно логічних ядер: ${cpuCount}`);

const THREADS = Math.max(os.cpus().length - 2, 1);

async function run() {
  const from = 1719912800 * 1000;
  const to = 1751448800 * 1000;
  const { candles } = await getCandles('broccolif3busdt', from, to, 1, 'futures');
  const testConfigs = getTestConfigs();

  const chunkSize = Math.ceil(testConfigs.length / THREADS);
  const chunks = Array.from({ length: THREADS }, (_, i) =>
    testConfigs.slice(i * chunkSize, (i + 1) * chunkSize)
  );

  const promises = chunks.map((chunk, idx) =>
    new Promise((resolve, reject) => {
      const worker = new Worker('./worker.js', {
        workerData: { configs: chunk, candles, workerId: idx + 1 }
      });

      worker.on('message', (result) => {
        console.log(`🧵 Воркер #${idx + 1} завершився.`);
        resolve(result);
      });

      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Воркер завершився з кодом ${code}`));
      });
    })
  );

  const flatResults = await Promise.all(promises);
  const bestResult = flatResults.reduce((max, current) =>
    current.netProfit.isGreaterThan(max.netProfit) ? current : max
  );

  console.log('\n🚀 Найприбутковіші налаштування:');
  console.log(JSON.stringify(bestResult.settings, null, 2));
  console.log(`Чистий прибуток: ${bestResult.netProfit.toFixed(2)} USDT`);
}

run();