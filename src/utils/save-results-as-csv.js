import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const CONFIG_FILE = process.env.CONFIG_FILE || 'згенеровані системою';
const COMMISSION_FEE = parseFloat(process.env.COMMISSION_FEE) || 0.001;
const POSITION_VOLUME = parseInt(process.env.POSITION_VOLUME, 10) || 100;
const YEARS_BACK = parseInt(process.env.YEARS_BACK || '0');
const MONTHS_BACK = parseInt(process.env.MONTHS_BACK || '0');

const TRANSLATIONS = {
  'settings.positionVolume': 'Об’єм позиції',
  'settings.dropPercent': 'Відсоток падіння',
  'settings.takeProfit': 'Тейк-профіт',
  'settings.stopLoss': 'Стоп-лосс',
  'settings.maxPositionLifetime': 'Максимальний час існування позиції',
  'settings.duration': 'Тривалість',
  'settings.breakTime': 'Час паузи',
  'result.netProfit': 'Чистий прибуток',
  'result.netWithCommission': 'Чистий прибуток з урахуванням комісії',
  'result.commission': 'Комісія',
  'result.totalPnL': 'Загальний прибуток/збиток (PnL)',
  'result.winRate': 'Відсоток виграшних угод',
  'result.totalProfit': 'Загальний прибуток',
  'result.totalLoss': 'Загальні збитки',
  'result.profitFactor': 'Коефіцієнт прибутковості',
  'result.countPosition.qty': 'Кількість позицій',
  'result.countPosition.wins': 'Виграшні позиції',
  'result.countPosition.losses': 'Програшні позиції',
  'result.maxDrawdownUSD': 'Максимальна просадка (USD)',
  'result.maxTimeInTrade': 'Максимальний час в угоді',
  'result.avgTimeInTrade': 'Середній час в угоді',
  score: 'Оцінка'
};

function generateFileName(prefix = 'output') {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const randomPart = Math.floor(Math.random() * 10000);
  return `${prefix}-${timestamp}-${randomPart}`;
}

function getAvailableFilename(folder, baseName, extension) {
  let index = 1;
  let finalFilename = `${baseName}-${index}.${extension}`;
  while (fs.existsSync(path.join(folder, finalFilename))) {
    index++;
    finalFilename = `${baseName}-${index}.${extension}`;
  }
  return {
    name: `${baseName}-${index}`,
    fullPath: path.join(folder, finalFilename)
  };
}

function flattenObject(obj, prefix = '', res = {}) {
  for (const key in obj) {
    const value = obj[key];
    const pathKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenObject(value, pathKey, res);
    } else {
      res[pathKey] = value;
    }
  }
  return res;
}

async function getOrCreateDriveFolder(drive, folderName, parentId = null) {
  const query =
    `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false` +
    (parentId ? ` and '${parentId}' in parents` : '');

  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  if (res.data.files.length > 0) return res.data.files[0].id;

  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentId ? { parents: [parentId] } : {})
  };

  const folder = await drive.files.create({
    resource: folderMetadata,
    fields: 'id'
  });

  return folder.data.id;
}

async function getOrCreateDriveFolderByPath(drive, folderPath) {
  const parts = folderPath
    .split('/')
    .map(p => p.trim())
    .filter(Boolean);
  let parentId = null;
  for (const part of parts) {
    parentId = await getOrCreateDriveFolder(drive, part, parentId);
  }
  return parentId;
}

function writeFile(filePath, data, logLabel) {
  fs.writeFileSync(filePath, data, 'utf-8');
  console.log(`📁 ${logLabel} збережено у: ${filePath}`);
}

async function uploadFile(auth, filePath, fileName, mimeType, folderPath) {
  if (!auth) return;

  const drive = google.drive({ version: 'v3', auth });
  const folderId = await getOrCreateDriveFolderByPath(drive, folderPath);

  const response = await drive.files.create({
    resource: {
      name: fileName,
      parents: [folderId]
    },
    media: {
      mimeType,
      body: fs.createReadStream(filePath)
    },
    fields: 'id'
  });

  const fileId = response.data.id;
  console.log(
    `☁️  Завантажено ${fileName} на Google Drive: https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`
  );
}

export async function saveResultsAsCsv(
  auth,
  results,
  driveFolderPath = 'results-strategies',
  userFilename = null
) {
  if (!results || results.length === 0) {
    console.warn('⚠️ Немає даних для збереження.');
    return;
  }

  const folder = path.resolve(process.cwd(), driveFolderPath);
  fs.mkdirSync(folder, { recursive: true });

  const baseName = userFilename || generateFileName();
  const csvFile = getAvailableFilename(folder, baseName, 'csv');
  const jsonFile = getAvailableFilename(folder, baseName, 'json');

  const allKeys = new Set();
  const flattenedResults = results.map(item => {
    const flat = flattenObject(item);
    Object.keys(flat).forEach(k => allKeys.add(k));
    return flat;
  });

  const headers = Array.from(allKeys);
  const rows = flattenedResults.map(row =>
    headers
      .map(key => {
        const value = row[key];
        return typeof value === 'number'
          ? value.toString().replace('.', ',')
          : typeof value === 'string' && /^-?\d+\.\d+$/.test(value)
            ? value.replace('.', ',')
            : (value ?? '');
      })
      .join(';')
  );

  const csv = [
    `DATE: ${new Date()}; YEARS_BACK: ${YEARS_BACK}; MONTHS_BACK: ${MONTHS_BACK}; COMMISSION FEE: ${COMMISSION_FEE}; POSITION VOLUME: ${POSITION_VOLUME}; CONFIG: ${CONFIG_FILE};`,
    headers.map(h => TRANSLATIONS[h] || h).join(';'),
    ...rows
  ].join('\n');

  const configs = results
    .filter(item => item.settings && typeof item.settings === 'object')
    .map(item => item.settings);

  console.log(`\n💾 Завантаження результатів:`);

  writeFile(csvFile.fullPath, csv, 'CSV');
  if (configs.length > 0) {
    writeFile(jsonFile.fullPath, JSON.stringify(configs, null, 2), 'JSON');
  }

  if (auth) {
    await Promise.all([
      await uploadFile(auth, csvFile.fullPath, `${csvFile.name}.csv`, 'text/csv', driveFolderPath),
      configs.length > 0
        ? await uploadFile(
            auth,
            jsonFile.fullPath,
            `${jsonFile.name}.json`,
            'application/json',
            driveFolderPath
          )
        : null
    ]);
  }
}
