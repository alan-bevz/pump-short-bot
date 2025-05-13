import os from 'os';
import { Worker } from 'worker_threads';

import strategy from './strategies/index.js';
import toCamelCase from './utils/to-camel-case.js'
import { saveResultsAsCsv } from './utils/save-results-as-csv.js';
import { getCandles } from './candles.js';

const CPU_COUNT = os.cpus().length;
const THREADS = Math.max(os.cpus().length - 2, 1);
const STRATEGY_NAME = process.env.STRATEGY_NAME?.toLowerCase() || null;
const PAIR = process.env.PAIR?.toLowerCase() || null
const TRADING_TYPE = process.env.TRADING_TYPE?.toLowerCase() || null
const STRATEGY_KEY = toCamelCase(STRATEGY_NAME);
const YEARS_BACK = parseInt(process.env.YEARS_BACK || '0');
const MONTHS_BACK = parseInt(process.env.MONTHS_BACK || '0');
const FOLDER = '../results-strategies/';

// === Перевірка, чи задані всі змінні
if (!STRATEGY_NAME || !PAIR || !TRADING_TYPE) {
  throw new Error('❌ STRATEGY_NAME, PAIR або TRADING_TYPE не задані у .env файлі!');
}

// === Перевірка наявності такої стратегії
if (!strategy[STRATEGY_KEY]) {
  const available = Object.keys(strategy).join(', ');
  throw new Error(`❌ Стратегія "${STRATEGY_NAME}" не знайдена. Доступні: ${available}`);
}

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
  fromDate.setFullYear(fromDate.getFullYear() - YEARS_BACK);
  fromDate.setMonth(fromDate.getMonth() - MONTHS_BACK);

  const from = fromDate.getTime(); // минус YEARS_BACK год и MONTHS_BACK месяца

  return {
    start: now,
    to,
    from
  }
}

function shuffleArray(array) {
  const arr = array.slice(); // копіюємо, щоб не змінювати оригінал
  let currentIndex = arr.length, randomIndex;

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // Міняємо місцями
    [arr[currentIndex], arr[randomIndex]] = [
      arr[randomIndex], arr[currentIndex]
    ];
  }

  return arr;
}

async function run() {
  const { start, from, to } = getTime();

  console.log(`🟢 Бектест стартував о ${start.toLocaleTimeString()}`);
  console.log(`🧠 Доступно логічних ядер: ${THREADS}/${CPU_COUNT}`);
  console.log(`🧠 Розрахунок по стратегії: ${STRATEGY_NAME}`);
  console.log(`🧠 Пара: ${PAIR}`);

  const testConfigs = shuffleArray(strategy[STRATEGY_KEY].configs());

  console.log(`🧠 Кількість конфігурацій: ${testConfigs.length} \n`);

  const { candles } = await getCandles(PAIR, from, to, 1, TRADING_TYPE);
  console.log(`🧠 Кількість свічок: ${candles.length} \n`);

  const chunkSize = Math.ceil(testConfigs.length / THREADS);
  const chunks = Array.from({ length: THREADS }, (_, i) =>
    testConfigs.slice(i * chunkSize, (i + 1) * chunkSize)
  );

  const promises = chunks.map((chunk, idx) =>
    new Promise((resolve, reject) => {
      const worker = new Worker('./worker.js', {
        workerData: {
          configs: chunk,
          candles, workerId: idx + 1,
          strategyKey: STRATEGY_KEY
        }
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

  const results = (await Promise.all(promises)).flat();
  const sortedResults = results.sort((a, b) => {
    return parseFloat(b.score) - parseFloat(a.score);
  });

  saveResultsAsCsv(sortedResults, FOLDER + PAIR, `${PAIR}-${TRADING_TYPE}-${STRATEGY_NAME}`);

  const end = new Date();
  const duration = formatDuration(end - start);

  console.log(`\n✅ Бектест завершився о ${end.toLocaleTimeString()}`);
  console.log(`🕒 Тривалість: ${duration}`);
  console.log(`🚀 Чистий прибуток: ${sortedResults[0].result.netProfit} USDT, WinRate: ${sortedResults[0].result.winRate}%`);
}

run();