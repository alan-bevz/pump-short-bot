import 'dotenv/config';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import strategy from './strategies/index.js';
import toCamelCase from './utils/to-camel-case.js';
import { checkGoogleDriveAuthorization } from './utils/google-drive-auth.js';
import { saveResultsAsCsv } from './utils/save-results-as-csv.js';
import { getCandles } from './candles.js';

const CPU_COUNT = os.cpus().length;
const THREADS = Math.max(os.cpus().length - 2, 1);
const STRATEGY_NAME = process.env.STRATEGY_NAME?.toLowerCase() || null;
const TRADING_TYPE = process.env.TRADING_TYPE?.toLowerCase() || null;
const STRATEGY_KEY = toCamelCase(STRATEGY_NAME);
const YEARS_BACK = parseInt(process.env.YEARS_BACK || '0');
const MONTHS_BACK = parseInt(process.env.MONTHS_BACK || '0');
const WORKER_PATH = path.resolve(__dirname, './worker.js');
const FOLDER_RESULTS_NAME = 'results-strategies';
const PAIR_LIST = process.env.PAIR_LIST?.toLowerCase()
  .split(',')
  .map(p => p.trim())
  .filter(Boolean);

// === Перевірка, чи задані всі змінні
if (!STRATEGY_NAME || !PAIR_LIST?.length || !TRADING_TYPE) {
  console.error('❌ STRATEGY_NAME, PAIR_LIST або TRADING_TYPE не задані у .env файлі!');
  process.exit(1);
}

// === Перевірка наявності такої стратегії
if (!strategy[STRATEGY_KEY]) {
  const available = Object.keys(strategy).join(', ');
  console.error(`❌ Стратегія "${STRATEGY_NAME}" не знайдена. Доступні: ${available}`);
  process.exit(1);
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

  const from = fromDate.getTime();

  return {
    start: now,
    to,
    from
  };
}

function shuffleArray(array) {
  const arr = array.slice(); // копіюємо, щоб не змінювати оригінал
  let currentIndex = arr.length,
    randomIndex;

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // Міняємо місцями
    [arr[currentIndex], arr[randomIndex]] = [arr[randomIndex], arr[currentIndex]];
  }

  return arr;
}

// === Обработка сообщений от воркера ===
function handleWorkerMessage(data, idx, resolve) {
  if (data?.type === 'log') {
    console.log(data.message);
  } else if (data?.type === 'warn') {
    console.warn(data.message);
  } else {
    console.log(`🧵 Воркер #${idx + 1} завершився.`);
    resolve(data);
  }
}

async function runForPair(pair, googleDriveAuth) {
  const { start, from, to } = getTime();
  console.log(`\n🟢 Бектест для ${pair} стартував о ${start.toLocaleTimeString()}`);

  try {
    const { candles } = await getCandles(pair, from, to, 1, TRADING_TYPE);
    console.log(`🧠 Кількість свічок: ${candles.length}`);

    const testConfigs = shuffleArray(strategy[STRATEGY_KEY].configs());
    console.log(`🧠 Кількість конфігурацій: ${testConfigs.length}`);

    const chunkSize = Math.ceil(testConfigs.length / THREADS);
    const chunks = Array.from({ length: THREADS }, (_, i) =>
      testConfigs.slice(i * chunkSize, (i + 1) * chunkSize)
    );

    const promises = chunks.map(
      (chunk, idx) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(WORKER_PATH, {
            workerData: {
              configs: chunk,
              candles,
              workerId: idx + 1,
              strategyKey: STRATEGY_KEY
            }
          });

          worker.on('message', data => handleWorkerMessage(data, idx, resolve));
          worker.on('error', reject);
          worker.on('exit', code => {
            if (code !== 0) reject(new Error(`Воркер завершився з кодом ${code}`));
          });
        })
    );

    const results = (await Promise.all(promises)).flat();
    const sortedResults = results.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));

    await saveResultsAsCsv(
      googleDriveAuth,
      sortedResults,
      `${FOLDER_RESULTS_NAME}/${pair}/${STRATEGY_NAME}`,
      `${pair}-${TRADING_TYPE}-${STRATEGY_NAME}`
    );

    const end = new Date();
    const duration = formatDuration(end - start);

    console.log(
      `✅ ${pair}: Бектест завершився о ${end.toLocaleTimeString()} — Тривалість: ${duration}`
    );
    if (sortedResults.length > 0) {
      console.log(
        `🚀 ${pair}: Чистий прибуток: ${sortedResults[0].result.netWithCommission} USDT, WinRate: ${sortedResults[0].result.winRate}%`
      );
    } else {
      console.warn(`⚠️ ${pair}: Результати порожні.`);
    }
  } catch (error) {
   console.error('\x1b[31m%s\x1b[0m',`🆘 ${error.message}`);
  }
}

async function run() {
  console.log(`🟢 Доступно логічних ядер: ${THREADS}/${CPU_COUNT}
🧠 Розрахунок по стратегії: ${STRATEGY_NAME}
🧠 Пар(а/и): ${PAIR_LIST.join(', ')}`);

  const auth = await checkGoogleDriveAuthorization();

  for (const pair of PAIR_LIST) {
    await runForPair(pair, auth);
  }
}

run();
