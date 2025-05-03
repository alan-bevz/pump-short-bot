import BigNumber from 'bignumber.js';
import { count } from 'console';

export function getTestConfigs() {
  const pumpPercents = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const takeProfits = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, ];
  const stopLosses = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  const durations = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150];
  const breakTimes = [1, 15, 30, 45, 60, 75, 90, 105];

  const targetCount = 1000000;
  const testConfigs = [];

  outer: for (let pp of pumpPercents) {
    for (let tp of takeProfits) {
      for (let sl of stopLosses) {
        for (let d of durations) {
          for (let bt of breakTimes) {
            testConfigs.push({
              positionVolume: 50,
              pumpPercent: pp,
              takeProfit: tp,
              stopLoss: sl,
              maxPositionLifetime: 30000,
              duration: d,
              breakTime: bt,
            });
            if (testConfigs.length >= targetCount) break outer;
          }
        }
      }
    }
  }

  return testConfigs;
}

function percentGrowth(from, to) {
  return new BigNumber(to).minus(from).div(from).multipliedBy(100);
}

export async function backtest(settings, candles) {
  try {
  let inPosition = false;
  let entryPrice = null;
  let entryIndex = null;
  let cooldownUntil = -Infinity;

  const results = [];

  for (let i = settings.duration; i < candles.length; i++) {
    const now = candles[i];
    const [timestamp, open, high, low, close] = now.map((v, idx) =>
      idx === 0 ? Number(v) : new BigNumber(v)
    );

    const past = candles[i - settings.duration];
    const pastLow = new BigNumber(past[3]);
    const pump = percentGrowth(pastLow, close);

    if (!inPosition && i > cooldownUntil && pump.isGreaterThanOrEqualTo(settings.pumpPercent)) {
      // Open short
      inPosition = true;
      entryPrice = close;
      entryIndex = i;
    }

    if (inPosition) {
      const pnl = entryPrice.minus(close).div(entryPrice).multipliedBy(100); // short = earn when price drops
      const timeInPosition = i - entryIndex;

      if (
        pnl.isGreaterThanOrEqualTo(settings.takeProfit) ||
        pnl.isLessThanOrEqualTo(new BigNumber(settings.stopLoss).negated()) ||
        timeInPosition >= settings.maxPositionLifetime
      ) {
        results.push({
          entryTime: new Date(candles[entryIndex][0]).toISOString(),
          exitTime: new Date(candles[i][0]).toISOString(),
          entryPrice: entryPrice.toString(),
          exitPrice: close.toString(),
          pnl: pnl.toFixed(2),
          duration: timeInPosition + ' min',
        });

        inPosition = false;
        cooldownUntil = i + settings.breakTime;
      }
    }
  }

  // console.log('Результати угод:', results);


  // Підсумки
  let totalPnL = new BigNumber(0);
  let totalProfit = new BigNumber(0);
  let totalLoss = new BigNumber(0);
  let wins = 0;
  let losses = 0;

  for (const trade of results) {
    const pnl = new BigNumber(trade.pnl);
    totalPnL = totalPnL.plus(pnl);

    const profitUSD = pnl.div(100).multipliedBy(settings.positionVolume);
    if (pnl.isGreaterThan(0)) {
      wins++;
      totalProfit = totalProfit.plus(profitUSD);
    } else {
      losses++;
      totalLoss = totalLoss.plus(profitUSD); // буде від’ємне число
    }
  }

  const netProfit = totalProfit.plus(totalLoss).toFixed(2); // totalLoss від’ємний
  const winRate = (wins / (wins + losses)) * 100;

  return {
    settings,
    result: {
      netProfit,
      totalPnL: totalPnL.toFixed(2),
      winRate,
      totalProfit: totalProfit.toFixed(2),
      totalLoss: totalLoss.toFixed(2),
      countPosition: {
        wins, losses
      }
    }
  };

    
} catch (error) {
    console.log(error.message);
}
}
