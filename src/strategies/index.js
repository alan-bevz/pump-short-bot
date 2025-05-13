'use strict';
import pumpShortBot from './pump-short-bot.js';
import dropLongBot from './drop-long-bot.js';
import emaBreakoutStrategyBot from './ema-breakout-strategy.js';
import gridLongBot from './grid-long-bot.js';

export default {
  pumpShort: pumpShortBot,
  dropLong: dropLongBot,
  emaBreakoutStrategy: emaBreakoutStrategyBot,
  gridLong: gridLongBot
}