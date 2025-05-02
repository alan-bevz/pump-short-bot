'use strict';

import http from 'http';
import { URL } from 'url';

const API_URL = 'http://162.55.133.208:2544/data/candles';
const YOUR_ACCESS_TOKEN = 'r4DFmRqfajarOXCz';
const TRADING_TYPE = {
  SPOT: 'spot',
  FUTURES: 'futures'
};

function fetchCandles({ symbol, from, to, timeframe = 1, tradingType = TRADING_TYPE.FUTURES }) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL);
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${YOUR_ACCESS_TOKEN}`
      },
      // rejectUnauthorized: false  ⛔ необов'язково: якщо самопідписаний сертифікат
    };

    url.searchParams.append('exchange', 'binance');
    url.searchParams.append('trading_type', tradingType);
    url.searchParams.append('symbol', symbol);
    url.searchParams.append('interval', `${timeframe}m`);
    url.searchParams.append('from', from);
    url.searchParams.append('to', to);

    const req = http.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            reject(new Error('Помилка парсингу JSON: ' + e.message));
          }
        } else {
          reject(new Error(`HTTP помилка! Статус: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Не вдалося отримати дані свічок для ${symbol}: ${e.message}`));
    });

    req.end();
  });
}


// Функція для створення масивів цін та обсягів
function processCandles(candlesData) {
  const openPrices = [];
  const closePrices = [];
  const highPrices = [];
  const lowPrices = [];
  const volumes = [];

  candlesData.forEach(candle => {
    const open = parseFloat(candle[1]);
    const high = parseFloat(candle[2]);
    const low = parseFloat(candle[3]);
    const close = parseFloat(candle[4]);
    const volume = parseFloat(candle[5]);

    openPrices.push(open);
    closePrices.push(close);
    highPrices.push(high);
    lowPrices.push(low);
    volumes.push(volume);
  });

  return {
 
    openPrices,
    closePrices,
    highPrices,
    lowPrices,
    volumes
  };
}

async function getCandles(symbol, dateFrom, dateTo, timeframe = 1, tradingType = TRADING_TYPE['FUTURES']) {
  const data = await fetchCandles({symbol, from: dateFrom, to: dateTo, timeframe, tradingType});
  const candles = data.data.sort((a, b) => a[0] - b[0]);

  if (!candles || candles.length === 0) {
    throw new Error(`Відсутні свічки за вибраний період ${symbol} Дата з: ${ new Date(dateFrom).toISOString()} Дата по: ${new Date(dateTo).toISOString()}`);
  }

  const convertCandles = processCandles(candles);
  const candlesFirstTime = candles[candles.length - 1][0];
  const candlesLastTime = candles[0][0];
  const currentPrice = candles[candles.length - 1][4];
  const currentVolume = parseFloat(candles[candles.length - 1][5]);

  return {
    currentPrice,
    currentVolume,
    symbol,
    dateFrom,
    dateTo,
    candles,
    openPrices: convertCandles.openPrices,
    closePrices: convertCandles.closePrices,
    highPrices: convertCandles.highPrices,
    lowPrices: convertCandles.lowPrices,
    volumes: convertCandles.volumes,
    candlesLastTime: new Date(candlesLastTime).toISOString(),
    candlesFirstTime: new Date(candlesFirstTime).toISOString(),
  }
}


export { getCandles };