import fs from 'fs';
import path from 'path';

const CONFIG_FILE = process.env.CONFIG_FILE || null;
const POSITION_VOLUME = parseInt(process.env.POSITION_VOLUME, 10) || 100;
const TARGET_COUNT = parseInt(process.env.TARGET_COUNT, 10) || 1000000;

// === ГЕНЕРАТОР КОНФІГІВ ДЛЯ PUMP-SHORT ===
function configsPumpShort() {
  const pumpPercents = [1,2,3,4,5,6,7,8,9,10];
  const takeProfits = [1,2,3,4,5];
  const stopLosses = [1,2,3,4,5];
  const durations = [1,5,10,15];
  const breakTimes = [1,15,30,60];

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
  const dropPercents = [1,2,3,4,5,10,15,20];
  const takeProfits = [1,2,3,4,5,10];
  const stopLosses = [5,10,20,30];
  const durations = [1,5,10,15,30];
  const breakTimes = [5,30,60,120];

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
  const firstPositionVolumes       = [POSITION_VOLUME];
  const positionVolumeRatios       = [1,1.25,1.5,2,3];
  const distanceToFirstOrders      = [0.5,1,2,3,5];       // % від ціни входу
  const averagingSteps             = [0.5,1,2,3,5,10];    // % за крок
  const averagingStepRatios        = [0.5,1,1.5,2];       // множник кроку
  const numberOfAveragingStepsList = [3,5,10,15,20];
  const takeProfits                = [2,3,5,8,10,15];     // %
  const stopLosses                 = [5,10,15,20,30,45,60]; // %
  const breakTimes                 = [30,60,120,240,480]; // хвилин

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
  // Якщо є JSON-файл з конфігами — шукаємо його рекурсивно в ../results-strategies
  if (CONFIG_FILE) {
    const baseDir = path.resolve(__dirname, '../results-strategies');
    // Рекурсивний пошук файлу
    function findConfig(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const fullPath = path.join(dir, e.name);
        if (e.isFile() && e.name === CONFIG_FILE) {
          return fullPath;
        } else if (e.isDirectory()) {
          const found = findConfig(fullPath);
          if (found) return found;
        }
      }
      return null;
    }

    const configPath = findConfig(baseDir);
    if (configPath) {
      try {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const configData = JSON.parse(fileContent);
        console.log(`✅ Загружено ${configData.length} конфігів із JSON за шляхом ${configPath}`);
        return configData;
      } catch (e) {
        console.error('❌ Помилка при читанні конфігів із JSON', e);
        // падаємо далі до генерації
      }
    } else {
      console.warn(`⚠️ JSON-файл ${CONFIG_FILE} не знайдено у папці results-strategies.`);
    }
  }

  // Далі обираємо генератор за стратегією
  if (!strategy) {
    console.warn('⚠️ Змінна STRATEGY не задана. Повертаю null.');
    return null;
  }
  switch (strategy) {
    case 'grid-long':
      return configsGridLong();
    case 'drop-long':
      return configsDropLong();
    case 'pump-short':
      return configsPumpShort();
    default:
      throw new Error(`Невідома стратегія "${strategy}". Доступні: pump-short, drop-long, grid-long.`);
  }
}

export default { configs };
