import BigNumber from 'bignumber.js';

import { configs } from './configs.js';

const COMMISSION_FEE = (parseFloat(process.env.COMMISSION_FEE) || 0.05) / 100;

/**
 * Проста бектест-функція грід-бота (лонг)
 * @param {object} settings
 * @param {number} settings.firstPositionVolume
 * @param {number} settings.positionVolumeRatio
 * @param {number} settings.distanceToFirstOrder   // %
 * @param {number} settings.averagingStep         // %
 * @param {number} settings.averagingStepRatio
 * @param {number} settings.numberOfAveragingSteps
 * @param {number} settings.takeProfit            // %
 * @param {number} settings.stopLoss              // %
 * @param {number} settings.breakTime             // хвилин
 * @param {Array} candles                         // [[timestamp, open, high, low, close], ...]
 */
export async function backtest(settings, candles) {
  const results = [];
  let cooldownUntil = -Infinity;

  for (let i = 0; i < candles.length; i++) {
    if (i <= cooldownUntil) continue;
    const entryAnchor = new BigNumber(candles[i][4]);
    // Генеруємо рівні гріду
    const gridLevels = [];
    for (let k = 0; k <= settings.numberOfAveragingSteps; k++) {
      const offset = settings.distanceToFirstOrder/100
        + (settings.averagingStep/100) * k * settings.averagingStepRatio;
      const price = entryAnchor.multipliedBy(new BigNumber(1).minus(offset));
      const volume = settings.firstPositionVolume * Math.pow(settings.positionVolumeRatio, k);
      gridLevels.push({ price, volume, executed: false });
    }

    let inGrid = true;
    for (let j = i + 1; j < candles.length && inGrid; j++) {
      const closePrice = new BigNumber(candles[j][4]);
      // Виконуємо ордери
      gridLevels.forEach(l => {
        if (!l.executed && closePrice.isLessThanOrEqualTo(l.price)) {
          l.executed = true;
        }
      });
      const executed = gridLevels.filter(l => l.executed);
      if (executed.length === 0) continue;
      // Розрахунок середньої ціни входу та обсягу
      const totalVol = executed.reduce((sum, l) => sum + l.volume, 0);
      const weightedSum = executed.reduce((sum, l) => sum + l.price.multipliedBy(l.volume).toNumber(), 0);
      const avgEntry = new BigNumber(weightedSum).dividedBy(totalVol);
      // PnL % та USD
      const pnlPerc = closePrice.minus(avgEntry).dividedBy(avgEntry).multipliedBy(100);
      const profitUSD = pnlPerc.dividedBy(100).multipliedBy(totalVol);
      // Комісія: вхід+вихід для кожного обсягу
      const entryCommission = executed.reduce((sum, l) => sum + l.volume * l.price.toNumber(), 0) * COMMISSION_FEE;
      const exitCommission  = executed.reduce((sum, l) => sum + l.volume * closePrice.toNumber(), 0) * COMMISSION_FEE;
      const commission = entryCommission + exitCommission;

      // Умова виходу
      if (
        pnlPerc.isGreaterThanOrEqualTo(settings.takeProfit) ||
        pnlPerc.isLessThanOrEqualTo(new BigNumber(settings.stopLoss).negated())
      ) {
        results.push({
          entryTime:   new Date(candles[i][0]).toISOString(),
          exitTime:    new Date(candles[j][0]).toISOString(),
          avgEntry:    avgEntry.toFixed(2),
          exitPrice:   closePrice.toFixed(2),
          pnlPerc:     pnlPerc.toNumber(),
          profitUSD:   profitUSD.toNumber(),
          duration:    j - i,       // в хвилинах
          commission:  commission
        });
        cooldownUntil = j + settings.breakTime;
        inGrid = false;
      }
    }
  }

  // Метрики
  const totalTrades = results.length;
  let totalPnL = new BigNumber(0);
  let grossProfit = new BigNumber(0);
  let grossLoss   = new BigNumber(0);
  let commissionTotal = new BigNumber(0);
  let wins = 0;

  results.forEach(t => {
    totalPnL = totalPnL.plus(t.pnlPerc);
    commissionTotal = commissionTotal.plus(t.commission);
    if (t.profitUSD >= 0) {
      wins++;
      grossProfit = grossProfit.plus(t.profitUSD);
    } else {
      grossLoss = grossLoss.plus(Math.abs(t.profitUSD));
    }
  });

  const losses = totalTrades - wins;
  const netProfit = grossProfit.minus(grossLoss);
  const netWithCommission = netProfit.minus(commissionTotal);
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitFactor = grossLoss.isZero() ? Infinity : grossProfit.dividedBy(grossLoss);

  // Max drawdown
  const cum = [];
  let running = 0;
  results.forEach(t => {
    running += t.profitUSD;
    cum.push(running);
  });
  let peak = 0;
  const drawdowns = cum.map(v => {
    peak = Math.max(peak, v);
    return v - peak;
  });
  const maxDrawdownUSD = drawdowns.length ? Math.min(...drawdowns) : 0;

  const durations = results.map(t => t.duration);
  const maxTimeInTrade = durations.length ? Math.max(...durations) : 0;
  const avgTimeInTrade = durations.length ? durations.reduce((a,b)=>a+b,0)/durations.length : 0;

  return {
    settings,
    result: {
      netProfit:           netProfit.toFixed(2),
      netWithCommission:   netWithCommission.toFixed(2),
      commission:          commissionTotal.toFixed(2),
      totalPnL:            totalPnL.toFixed(2) + '%',
      winRate:             winRate.toFixed(2) + '%',
      totalProfit:         grossProfit.toFixed(2),
      totalLoss:           grossLoss.toFixed(2),
      profitFactor:        profitFactor.toFixed(2),
      countPosition:       { qty: totalTrades, wins, losses },
      maxDrawdownUSD:      maxDrawdownUSD.toFixed(2),
      maxTimeInTrade:      `${maxTimeInTrade} min`,
      avgTimeInTrade:      `${avgTimeInTrade.toFixed(2)} min`
    }
  };
}

export default {
  backtest,
  configs: configs.bind(this, 'grid-long')
};
