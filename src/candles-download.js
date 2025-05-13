import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

import { getCandles } from './candles.js';

const YEARS_BACK = 1;
const MONTHS_BACK = 0;
const TRADING_TYPE = 'spot';
const PAIR = 'xrpusdt'

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function fetchAndSaveCandles() {
  const { start, from, to } = getTime();
  const { candles, currentPrice, currentVolume, symbol } = await getCandles(PAIR, from, to, 1, TRADING_TYPE);

  const data = { meta: { start, from, to, symbol }, currentPrice, currentVolume, candles };

  // Формируем путь к файлу относительно текущей папки
  const filePath = resolve(__dirname, 'candles.json');

  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`✅ Файл сохранён: ${filePath}`);
  } catch (err) {
    console.error('❌ Ошибка записи candles.json:', err);
  }
}

fetchAndSaveCandles();
