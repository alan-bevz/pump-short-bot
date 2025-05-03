import { Worker } from 'worker_threads';
import { getCandles } from './candles.js';
import { getTestConfigs } from './pump-short-bot.js';
import os from 'os';
import BigNumber from 'bignumber.js';

const CPU_COUNT = os.cpus().length;
const THREADS = Math.max(os.cpus().length - 1, 1);
const PAIR = 'FARTCOINUSDT'.toLowerCase()

console.log(`🧠 Доступно логічних ядер: ${CPU_COUNT}`);

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}г ${m}хв ${s}с`;
}

function getTime() {
  const now = new Date();
  const to = now.getTime() + 1 * 60 * 60 * 1000; // текущее время + 1 час

  const fromDate = new Date(now);
  fromDate.setFullYear(fromDate.getFullYear() - 1);
  fromDate.setMonth(fromDate.getMonth() - 3);
  const from = fromDate.getTime(); // минус 1 год и 3 месяца

  return {
    start: now,
    to,
    from
  }
}

async function run() {
  const {start, from, to} = getTime();
  console.log(`🟢 Бектест стартував о ${start.toLocaleTimeString()}`);
  
  const { candles } = await getCandles(PAIR, from, to, 1, 'futures');
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

  const results = await Promise.all(promises);
  const bestResult = results.reduce((max, current) => {
    const currentNet = new BigNumber(current.netProfit);
    const maxNet = new BigNumber(max.netProfit);
    return currentNet.isGreaterThan(maxNet) ? current : max;
  });

  console.log('\n🚀 Найприбутковіші налаштування:');
  console.log(JSON.stringify(bestResult.settings, null, 2));
  console.log(JSON.stringify(results, null, 2));
  console.log(`Чистий прибуток: ${bestResult.netProfit} USDT`);

  const end = new Date();
  const duration = formatDuration(end - start);

  console.log(`✅ Бектест завершився о ${end.toLocaleTimeString()}`);
  console.log(`🕒 Тривалість: ${duration}`);
}

run();