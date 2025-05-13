import BigNumber from 'bignumber.js';
import fs from 'fs';
import path from 'path';

// Загружаем параметры из переменных окружения или используем значения по умолчанию
const COMMISSION_FEE = (parseFloat(process.env.COMMISSION_FEE) || 0.05) / 100;
const POSITION_VOLUME = parseInt(process.env.POSITION_VOLUME, 10) || 100;
const CONFIG_FILE = process.env.CONFIG_FILE || null;

// Функция для расчета EMA
function ema(data, period) {
  // Коэффициент сглаживания как BigNumber
  const k = new BigNumber(2).dividedBy(period + 1);
  return data.reduce((acc, curr, idx) => {
    const price = new BigNumber(curr);
    if (idx === 0) {
      // Первый элемент EMA = цена
      return price;
    }
    // EMA = price * k + acc * (1 - k)
    return price.times(k).plus(acc.times(new BigNumber(1).minus(k)));
  }, new BigNumber(0));
}

// Основная функция бектеста
async function backtest(settings, candles) {
  const {
    positionVolume,
    length,
    emaPeriod,
    tp_pct,
    sl_pct,
    maxPositionLifetime,
  } = settings;

  let inPosition = false;
  let positionType = null;
  let entryPrice = null;
  let entryIndex = null;

  // Метрики для дополнительных полей
  let equity = new BigNumber(0);
  let peakEquity = new BigNumber(0);
  let maxDrawdown = new BigNumber(0);
  const timeInPositions = [];

  let totalProfit = new BigNumber(0);
  let totalLoss = new BigNumber(0);
  let wins = 0;
  let losses = 0;

  // Предвычисляем EMA
  const emaValues = candles.map((_, idx) => {
    const sliceStart = Math.max(0, idx - emaPeriod);
    const window = candles.slice(sliceStart, idx + 1).map(c => c[4]);
    return ema(window, emaPeriod);
  });

  for (let i = length; i < candles.length; i++) {
    const [timestamp, open, high, low, close, volume] = candles[i].map(v => new BigNumber(v));
    const pastWindow = candles.slice(i - length, i);
    const highestHigh = BigNumber.max(...pastWindow.map(c => new BigNumber(c[2])));
    const lowestLow = BigNumber.min(...pastWindow.map(c => new BigNumber(c[3])));
    const avgVol = pastWindow
      .reduce((sum, c) => sum.plus(new BigNumber(c[5])), new BigNumber(0))
      .dividedBy(length);

    const longSignal =
      close.isGreaterThan(highestHigh) &&
      close.isGreaterThan(emaValues[i]) &&
      new BigNumber(candles[i][5]).isGreaterThan(avgVol);
    const shortSignal =
      close.isLessThan(lowestLow) &&
      close.isLessThan(emaValues[i]) &&
      new BigNumber(candles[i][5]).isGreaterThan(avgVol);

    if (longSignal && !inPosition) {
      entryPrice = open;
      entryIndex = i;
      inPosition = true;
      positionType = 'long';
    }
    if (shortSignal && !inPosition) {
      entryPrice = open;
      entryIndex = i;
      inPosition = true;
      positionType = 'short';
    }

    if (inPosition) {
      // PnL в процентах
      const pnl = close.minus(entryPrice).dividedBy(entryPrice).times(100);
      const timeInPosition = i - entryIndex;

      // Проверка тейк-профит/стоп-лосс
      const tpReached = pnl.isGreaterThanOrEqualTo(new BigNumber(tp_pct));
      const slReached = pnl.isLessThanOrEqualTo(new BigNumber(-sl_pct));
      const timeout = timeInPosition >= maxPositionLifetime;

      if (tpReached || slReached || timeout) {
        inPosition = false;
        positionType = null;

        const profitUSD = pnl.dividedBy(100).times(positionVolume);
        equity = equity.plus(profitUSD);
        peakEquity = BigNumber.max(peakEquity, equity);
        const drawdown = peakEquity
          .minus(equity)
          .dividedBy(peakEquity.isZero() ? new BigNumber(1) : peakEquity)
          .times(100);
        if (drawdown.isGreaterThan(maxDrawdown)) {
          maxDrawdown = drawdown;
        }
        timeInPositions.push(timeInPosition);

        if (pnl.isGreaterThan(0)) {
          wins++;
          totalProfit = totalProfit.plus(profitUSD);
        } else {
          losses++;
          totalLoss = totalLoss.plus(profitUSD);
        }
      }
    }
  }

  const qtyPosition = wins + losses;
  const netProfit = totalProfit.plus(totalLoss).toFixed(2);
  const winRate = qtyPosition > 0 ? (wins / qtyPosition) * 100 : 0;
  const commission = new BigNumber(positionVolume)
    .times(COMMISSION_FEE)
    .times(qtyPosition)
    .toFixed(4);
  const netProfitWithCommission = new BigNumber(netProfit)
    .minus(commission)
    .toFixed(2);
  const profitFactor = totalLoss.isZero()
    ? 999
    : totalProfit.dividedBy(totalLoss.abs()).toFixed(2);
  const avgTimeInPosition =
    timeInPositions.length > 0
      ? timeInPositions.reduce((sum, t) => sum + t, 0) / timeInPositions.length
      : 0;

  return {
    settings,
    result: {
      netProfit,
      netWithCommission: netProfitWithCommission,
      commission,
      totalPnL: totalProfit.plus(totalLoss).toFixed(2) + '%',
      winRate: winRate.toFixed(2) + '%',
      totalProfit: totalProfit.toFixed(2),
      totalLoss: totalLoss.toFixed(2),
      profitFactor,
      countPosition: { qty: qtyPosition, wins, losses },
      maxDrawdown: maxDrawdown.toFixed(2) + '%',
      avgTimeInPosition: avgTimeInPosition.toFixed(2)
    }
  };
}

// Функция генерации конфигураций
function configs() {
  if (CONFIG_FILE) {
    const configPath = path.resolve(`../results-strategies/${CONFIG_FILE}`);
    if (fs.existsSync(configPath)) {
      try {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const configData = JSON.parse(fileContent);
        console.log(`✅ Загружено ${configData.length} конфигов из JSON.`);
        return configData;
      } catch (e) {
        console.error('❌ Ошибка при чтении конфигов из JSON');
      }
    } else {
      console.warn('⚠️ Файл конфигов не найден, генерирую список конфигураций.');
    }
  }

  const lengths = [5, 8, 10, 15];
  const emaPeriods = [8, 20, 50, 100];
  const tpPercents = [0.5, 0.75, 1];
  const slPercents = [0.25, 0.5, 0.75, 1];
  const lifetimes = [15, 30, 45, 60];
  const targetCount = 1000000;
  const testConfigs = [];

  outer: for (let length of lengths) {
    for (let emaPeriod of emaPeriods) {
      for (let tp_pct of tpPercents) {
        for (let sl_pct of slPercents) {
          for (let maxPositionLifetime of lifetimes) {
            testConfigs.push({
              positionVolume: POSITION_VOLUME,
              length,
              emaPeriod,
              tp_pct: tp_pct,
              sl_pct: sl_pct,
              maxPositionLifetime,
            });
            if (testConfigs.length >= targetCount) break outer;
          }
        }
      }
    }
  }

  return testConfigs;
}

export default {
  backtest,
  configs,
};
