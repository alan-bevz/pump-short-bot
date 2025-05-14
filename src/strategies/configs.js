import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.resolve(__dirname, '../../results-strategies');
const CONFIG_FILE = process.env.CONFIG_FILE || null;
const POSITION_VOLUME = parseInt(process.env.POSITION_VOLUME, 10) || 100;
const TARGET_COUNT = parseInt(process.env.TARGET_COUNT, 10) || 1000000;

// === ГЕНЕРАТОР КОНФІГІВ ДЛЯ PUMP-SHORT ===
function configsPumpShort() {
  const pumpPercents = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const takeProfits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const stopLosses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const durations = [1, 5, 10, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150];
  const breakTimes = [1, 15, 30, 45, 60, 75, 90, 105];

  const configs = [];
  outer: for (let pp of pumpPercents) {
    for (let tp of takeProfits) {
      for (let sl of stopLosses) {
        for (let d of durations) {
          for (let bt of breakTimes) {
            configs.push({
              positionVolume: POSITION_VOLUME,
              pumpPercent: pp,
              takeProfit: tp,
              stopLoss: sl,
              duration: d,
              breakTime: bt,
              maxPositionLifetime: 30000,
            });
            if (configs.length >= TARGET_COUNT) break outer;
          }
        }
      }
    }
  }
  return configs;
}

// === ГЕНЕРАТОР КОНФІГІВ ДЛЯ DROP-LONG ===
function configsDropLong() {
  const dropPercents = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const takeProfits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const stopLosses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const durations = [1, 5, 10, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150];
  const breakTimes = [1, 15, 30, 45, 60, 75, 90, 105];

  const configs = [];
  outer: for (let dp of dropPercents) {
    for (let tp of takeProfits) {
      for (let sl of stopLosses) {
        for (let d of durations) {
          for (let bt of breakTimes) {
            configs.push({
              positionVolume: POSITION_VOLUME,
              dropPercent: dp,
              takeProfit: tp,
              stopLoss: sl,
              duration: d,
              breakTime: bt,
              maxPositionLifetime: 30000,
            });
            if (configs.length >= TARGET_COUNT) break outer;
          }
        }
      }
    }
  }
  return configs;
}

// === ГЕНЕРАТОР КОНФІГІВ ДЛЯ GRID-LONG ===
function configsGridLong() {
  const firstPositionVolumes = [POSITION_VOLUME];
  const positionVolumeRatios = [1, 1.25, 1.5, 2, 3];
  const distanceToFirstOrders = [0.5, 1, 2, 3, 5];
  const averagingSteps = [0.5, 1, 2, 3, 5, 10];
  const averagingStepRatios = [0.5, 1, 1.5, 2];
  const numberOfAveragingStepsList = [3, 5, 10, 15, 20];
  const takeProfits = [2, 3, 5, 8, 10, 15];
  const stopLosses = [5, 10, 15, 20, 30, 45, 60];
  const breakTimes = [30, 60, 120, 240, 480];

  const configs = [];
  outer: for (let fpv of firstPositionVolumes) {
    for (let pvr of positionVolumeRatios) {
      for (let df of distanceToFirstOrders) {
        for (let as of averagingSteps) {
          for (let asr of averagingStepRatios) {
            for (let nas of numberOfAveragingStepsList) {
              for (let tp of takeProfits) {
                for (let sl of stopLosses) {
                  for (let bt of breakTimes) {
                    configs.push({
                      firstPositionVolume: fpv,
                      positionVolumeRatio: pvr,
                      distanceToFirstOrder: df,
                      averagingStep: as,
                      averagingStepRatio: asr,
                      numberOfAveragingSteps: nas,
                      takeProfit: tp,
                      stopLoss: sl,
                      breakTime: bt,
                    });
                    if (configs.length >= TARGET_COUNT) break outer;
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return configs;
}

// === ГОЛОВНА ФУНКЦІЯ ЗАВАНТАЖЕННЯ КОНФІГІВ ===
export function configs(strategy) {
  // Спроба завантажити JSON-конфіги з папки results-strategies
  if (CONFIG_FILE) {
    if (fs.existsSync(BASE_DIR) && fs.statSync(BASE_DIR).isDirectory()) {
      const findConfig = dir => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, e.name);
          if (e.isFile() && e.name === CONFIG_FILE) return fullPath;
          if (e.isDirectory()) {
            const found = findConfig(fullPath);
            if (found) return found;
          }
        }
        return null;
      };
      const configPath = findConfig(BASE_DIR);
      if (configPath) {
        try {
          const fileContent = fs.readFileSync(configPath, 'utf-8');
          const configData = JSON.parse(fileContent);
          console.log(`✅ Завантажено ${configData.length} конфігів із ${configPath}`);
          return configData;
        } catch (e) {
          console.error('❌ Помилка при читанні JSON-конфігів', e);
        }
      } else {
        console.warn(`⚠️ JSON-файл ${CONFIG_FILE} не знайдено`);
      }
    } else {
      console.warn(`⚠️ Директорія ${BASE_DIR} не знайдена або це не папка, пропускаю завантаження JSON.`);
    }
  }

  // Вибір стратегії
  if (!strategy) {
    console.warn('⚠️ STRATEGY не задана — повертаю null');
    return null;
  }
  switch (strategy) {
    case 'pump-short': return configsPumpShort();
    case 'drop-long': return configsDropLong();
    case 'grid-long': return configsGridLong();
    default: throw new Error(`Невідома стратегія "${strategy}"`);
  }
}

export default { configs };