import BigNumber from 'bignumber.js';

import { configs } from './configs.js';

const COMMISSION_FEE = (parseFloat(process.env.COMMISSION_FEE) || 0.05) / 100;

function percentDrop(from, to) {
  return new BigNumber(from).minus(to).div(from).multipliedBy(100);
}

// === Основная функция бэктеста DropLongBot ===
async function backtest(settings, candles) {
  try {
    let inPosition = false;
    let entryPrice = null;
    let entryIndex = null;
    let cooldownUntil = -Infinity;

    const trades = [];

    for (let i = settings.duration; i < candles.length; i++) {
      const now = candles[i];
      const [timestamp, open, high, low, close] = now.map((v, idx) =>
        idx === 0 ? Number(v) : new BigNumber(v)
      );

      const past = candles[i - settings.duration];
      const pastHigh = new BigNumber(past[2]);
      const drop = percentDrop(pastHigh, close);

      if (!inPosition && i > cooldownUntil && drop.isGreaterThanOrEqualTo(settings.dropPercent)) {
        inPosition = true;
        entryPrice = close;
        entryIndex = i;
      }

      if (inPosition) {
        const pnl = close.minus(entryPrice).div(entryPrice).multipliedBy(100);
        const timeInPosition = i - entryIndex;

        if (
          pnl.isGreaterThanOrEqualTo(settings.takeProfit) ||
          pnl.isLessThanOrEqualTo(new BigNumber(settings.stopLoss).negated()) ||
          timeInPosition >= settings.maxPositionLifetime
        ) {
          const profitUSD = pnl.div(100).multipliedBy(settings.positionVolume).toNumber();

          trades.push({
            entryTime: new Date(candles[entryIndex][0]).toISOString(),
            exitTime: new Date(candles[i][0]).toISOString(),
            entryPrice: entryPrice.toString(),
            exitPrice: close.toString(),
            pnl: pnl.toFixed(2),
            durationMinutes: timeInPosition,
            profitUSD,
          });

          inPosition = false;
          cooldownUntil = i + settings.breakTime;
        }
      }
    }

    // === Подсчёт итоговых метрик ===
    let totalPnL = new BigNumber(0);
    let totalProfit = new BigNumber(0);
    let totalLoss = new BigNumber(0);
    let wins = 0;
    let losses = 0;

    trades.forEach(trade => {
      const pnl = new BigNumber(trade.pnl);
      totalPnL = totalPnL.plus(pnl);
      if (pnl.isGreaterThan(0)) {
        wins++;
        totalProfit = totalProfit.plus(trade.profitUSD);
      } else {
        losses++;
        totalLoss = totalLoss.plus(trade.profitUSD);
      }
    });

    const countPosition = wins + losses;
    const netProfit = totalProfit.plus(totalLoss).toFixed(2);
    const winRate = countPosition ? (wins / countPosition) * 100 : 0;
    const commission = (settings.positionVolume * COMMISSION_FEE * countPosition).toFixed(4);
    const netWithCommission = new BigNumber(netProfit).minus(commission).toFixed(2);
    const profitFactor = totalLoss.isZero() ? 999 : totalProfit.div(totalLoss.abs()).toFixed(2);

    // Расчёт просадки: накапливаемый PnL и максимальный откат
    const profitUsdArray = trades.map(t => t.profitUSD);
    const cumulative = [];
    let cumSum = 0;
    for (const p of profitUsdArray) {
      cumSum += p;
      cumulative.push(cumSum);
    }
    let peak = 0;
    const drawdowns = cumulative.map(c => {
      peak = Math.max(peak, c);
      return c - peak;
    });
    const maxDrawdownUsd = drawdowns.length ? Math.min(...drawdowns) : 0;

    // Время в сделке
    const durationsArr = trades.map(t => t.durationMinutes);
    const maxTimeInTrade = durationsArr.length ? Math.max(...durationsArr) : 0;
    const avgTimeInTrade = durationsArr.length
      ? durationsArr.reduce((sum, v) => sum + v, 0) / durationsArr.length
      : 0;

    return {
      settings,
      result: {
        netProfit,
        netWithCommission,
        commission,
        totalPnL: totalPnL.toFixed(2) + '%',
        winRate: winRate.toFixed(2) + '%',
        totalProfit: totalProfit.toFixed(2),
        totalLoss: totalLoss.toFixed(2),
        profitFactor,
        countPosition: { qty: countPosition, wins, losses },
        maxDrawdownUSD: maxDrawdownUsd.toFixed(2),
        maxTimeInTrade: `${maxTimeInTrade} min`,
        avgTimeInTrade: `${avgTimeInTrade.toFixed(2)} min`,
      },
    };

  } catch (error) {
    console.error(error);
  }
}

export default {
  backtest,
  configs: configs.bind(this, 'drop-long')
};
