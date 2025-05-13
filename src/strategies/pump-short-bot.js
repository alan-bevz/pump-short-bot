import fs from 'fs';
import path from 'path';
import BigNumber from 'bignumber.js';

const CONFIG_FILE = process.env.CONFIG_FILE || null;
const COMMISSION_FEE = (parseFloat(process.env.COMMISSION_FEE) || 0.05) / 100;
const POSITION_VOLUME = parseInt(process.env.POSITION_VOLUME, 10) || 100;

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
        console.error('❌ Помилка при читанні конфига з JSON');
      }
    } else {
      console.warn('⚠️ Файл конфігів не знайдено, генерую список.');
    }
  }

  const pumpPercents = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
  const takeProfits = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
  const stopLosses  = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
  const durations   = [1,5,10,15,30,45,60,75,90,105,120,135,150];
  const breakTimes  = [1,15,30,45,60,75,90,105];
  const targetCount = 1000000;
  const testConfigs = [];

  outer: for (let pp of pumpPercents) {
    for (let tp of takeProfits) {
      for (let sl of stopLosses) {
        for (let d of durations) {
          for (let bt of breakTimes) {
            testConfigs.push({
              pumpPercent: pp,
              takeProfit: tp,
              stopLoss: sl,
              duration: d,
              breakTime: bt,
              maxPositionLifetime: 30000,
              positionVolume: POSITION_VOLUME,
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
  return new BigNumber(to).minus(from).dividedBy(from).multipliedBy(100);
}

async function backtest(settings, candles) {
  try {
    let inPosition = false;
    let entryPrice = null;
    let entryIndex = null;
    let cooldownUntil = -Infinity;
    const results = [];

    for (let i = settings.duration; i < candles.length; i++) {
      const [timestamp, open, high, low, close] = candles[i].map((v, idx) =>
        idx === 0 ? Number(v) : new BigNumber(v)
      );
      if (i <= cooldownUntil) continue;

      const past = candles[i - settings.duration];
      const pastClose = new BigNumber(past[4]);
      const pump = percentGrowth(pastClose, close);

      // Вхід: шорт при пампі
      if (!inPosition && pump.isGreaterThanOrEqualTo(settings.pumpPercent)) {
        inPosition = true;
        entryPrice = close;
        entryIndex = i;
        continue;
      }

      // Вихід: TP, SL або максимально тривалість
      if (inPosition) {
        const pnl = entryPrice.minus(close).dividedBy(entryPrice).multipliedBy(100);
        const profitUSD = pnl.dividedBy(100).multipliedBy(settings.positionVolume);
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
            durationMinutes: timeInPosition,
            profitUSD: profitUSD.toNumber(),
          });
          inPosition = false;
          cooldownUntil = i + settings.breakTime;
        }
      }
    }

    // === Підсумкові метрики ===
    let totalPnL = new BigNumber(0);
    let totalProfit = new BigNumber(0);
    let totalLoss = new BigNumber(0);
    let wins = 0;
    let losses = 0;

    for (const trade of results) {
      const pnl = new BigNumber(trade.pnl);
      totalPnL = totalPnL.plus(pnl);
      const profitUSD = pnl.dividedBy(100).multipliedBy(settings.positionVolume);
      if (pnl.isGreaterThan(0)) {
        wins++;
        totalProfit = totalProfit.plus(profitUSD);
      } else {
        losses++;
        totalLoss = totalLoss.plus(profitUSD);
      }
    }

    const tradesCount = wins + losses;
    const commissionTotal = tradesCount * 2 * settings.positionVolume * COMMISSION_FEE;

    const netProfit = totalProfit.plus(totalLoss).toFixed(2);
    const netWithCommission = new BigNumber(netProfit).minus(commissionTotal).toFixed(2);
    const winRate = tradesCount ? ((wins / tradesCount) * 100).toFixed(2) : '0.00';
    const profitFactor = totalLoss.isZero()
      ? '999'
      : totalProfit.minus(commissionTotal).dividedBy(totalLoss.abs()).toFixed(2);

    // Розрахунок максимальної просадки
    const profitUsdArr = results.map(t => t.profitUSD);
    const cumulative = [];
    let cum = 0;
    for (const p of profitUsdArr) {
      cum += p;
      cumulative.push(cum);
    }
    let peak = 0;
    const drawdowns = cumulative.map(c => {
      peak = Math.max(peak, c);
      return c - peak;
    });
    const maxDrawdownUSD = drawdowns.length ? Math.min(...drawdowns) : 0;

    const durationsArr = results.map(t => t.durationMinutes);
    const maxTimeInTrade = durationsArr.length ? Math.max(...durationsArr) : 0;
    const avgTimeInTrade = durationsArr.length
      ? durationsArr.reduce((sum, v) => sum + v, 0) / durationsArr.length
      : 0;

    return {
      settings,
      result: {
        netProfit,
        netWithCommission,
        commission: commissionTotal.toFixed(2),
        totalPnL: totalPnL.toFixed(2) + '%',
        winRate: winRate + '%',
        totalProfit: totalProfit.toFixed(2),
        totalLoss: totalLoss.toFixed(2),
        profitFactor,
        countPosition: { qty: tradesCount, wins, losses },
        maxDrawdownUSD: maxDrawdownUSD.toFixed(2),
        maxTimeInTrade: `${maxTimeInTrade} min`,
        avgTimeInTrade: `${avgTimeInTrade.toFixed(2)} min`,
      }
    };
  } catch (error) {
    console.error(error);
  }
}

export default { backtest, configs };
