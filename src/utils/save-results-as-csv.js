import fs from 'fs';
import path from 'path';

const CONFIG_FILE = process.env.CONFIG_FILE || 'згенеровані системою';
const COMMISSION_FEE = parseFloat(process.env.COMMISSION_FEE) || 0.001;
const POSITION_VOLUME = parseInt(process.env.POSITION_VOLUME, 10) || 100;
const YEARS_BACK = parseInt(process.env.YEARS_BACK || '0');
const MONTHS_BACK = parseInt(process.env.MONTHS_BACK || '0');

function generateFileName(prefix = 'output') {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-'); // ISO дата без двокрапок
  const randomPart = Math.floor(Math.random() * 10000); // випадкове число від 0 до 9999
  return `${prefix}-${timestamp}-${randomPart}`;
}

function flattenObject(obj, prefix = '', res = {}) {
  for (const key in obj) {
    const value = obj[key];
    const path = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenObject(value, path, res);
    } else {
      res[path] = value;
    }
  }
  return res;
}

/**
 * Зберігає масив результатів у форматі CSV в папку "results/"
 * @param {Array} results - масив об'єктів з полями result + settings
 * @param {string} filename - назва файлу (без шляху), напр. "drop-long.csv"
 */
export function saveResultsAsCsv(results, folderName = 'results-strategies', userFilename = null) {

  const folder =  path.resolve(process.cwd(), folderName)
  const filename = userFilename || generateFileName();
  const extension = '.csv';

  if (!results || results.length === 0) {
    console.warn('⚠️ Немає даних для збереження CSV.');
    return;
  }

  const outputDir = path.resolve(folder);

  fs.mkdirSync(outputDir, { recursive: true });


  // 🆕 Генеруємо унікальну назву файлу
  let finalFilename = filename;
  let outputPath = path.join(outputDir, finalFilename + extension);
  let counter = 1;

  while (fs.existsSync(outputPath)) {
    finalFilename = `${filename}-${counter}`;
    outputPath = path.join(outputDir, finalFilename + extension);
    counter++;
  }

  // 1. Збираємо всі ключі з розплющених об'єктів
  const allKeys = new Set();
  const flattenedResults = results.map(item => {
    const flat = flattenObject(item);
    Object.keys(flat).forEach(k => allKeys.add(k));
    return flat;
  });

  // 2. Формуємо CSV
  const headers = Array.from(allKeys);
  const rows = flattenedResults.map(row => {
    return headers.map(key => {
      const value = row[key];
      return (typeof value === 'number')
        ? value.toString().replace('.', ',')
        : (typeof value === 'string' && /^-?\d+\.\d+$/.test(value))
          ? value.replace('.', ',')
          : value ?? '';
    }).join(';'); // роздільник колонок — крапка з комою
  });

  const csv = [
    `DATE: ${new Date()}; YEARS_BACK: ${YEARS_BACK}; MONTHS_BACK: ${MONTHS_BACK}; COMMISSION FEE: ${COMMISSION_FEE} ; POSITION VOLUME: ${POSITION_VOLUME} ;CONFIG: ${CONFIG_FILE} ;`,
    headers.join(';'),
    ...rows
  ].join('\n');

  // 3. Зберігаємо конфіги в JSON, якщо settings є
  const configsWithSettings = results
    .filter(item => item.settings && typeof item.settings === 'object')
    .map(item => item.settings);

  if (configsWithSettings.length > 0) {
    const jsonPath = path.join(outputDir, finalFilename + '.json');
    fs.writeFileSync(jsonPath, JSON.stringify(configsWithSettings, null, 2), 'utf-8');
  }

  fs.writeFileSync(outputPath, csv, 'utf-8');
  console.log(`\n📁 CSV збережено у: ${outputPath}`);
}
