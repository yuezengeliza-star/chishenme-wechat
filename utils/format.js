/**
 * 通用格式化 / 时间计算工具
 * 全部使用「实际用餐时间」语义，不使用上传时间
 */
const { mealTypeByHour, LEVELS, FOOD_EMOJI } = require('./constants.js');

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 时间戳 → 2026-10-07 */
function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 时间戳 → 12:30 */
function hhmm(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 当天 00:00 的时间戳 */
function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 相对日期前缀：今天 / 昨天 / 10月6日 */
function dayLabel(ts) {
  const today = startOfDay(Date.now());
  const target = startOfDay(ts);
  const diffDays = Math.round((today - target) / 86400000);
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays === 2) return '前天';
  if (diffDays === -1) return '明天';
  if (diffDays === -2) return '后天';
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 饭卡/详情使用：今天 12:30 / 10月6日 12:08 */
function mealTimeLabel(ts) {
  return `${dayLabel(ts)} ${hhmm(ts)}`;
}

/** 仅短时间：12:30 */
function shortTime(ts) {
  return hhmm(ts);
}

/** 金额：18 → ¥18，18.5 → ¥18.5，1286 → ¥1,286 */
function money(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (isNaN(num)) return '';
  const isInt = Math.abs(num % 1) < 0.0001;
  const s = isInt ? String(num) : num.toFixed(2).replace(/0$/, '');
  const parts = s.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '¥' + parts.join('.');
}

/** 千分位，不带符号 */
function thousands(n) {
  const num = Number(n) || 0;
  const isInt = Math.abs(num % 1) < 0.0001;
  const s = isInt ? String(num) : num.toFixed(2).replace(/0$/, '');
  const parts = s.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/** 当前时间对应的餐次 */
function currentMealType(ts) {
  const d = new Date(ts || Date.now());
  return mealTypeByHour(d.getHours());
}

/** 饭记数量 → 等级对象 */
function levelOf(count) {
  const c = count || 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (c >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

/** 距离展示：0.8km / 1.2km */
function distanceLabel(km) {
  if (km === null || km === undefined) return '';
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

/** 名称 → 兜底食物 Emoji（无图饭记统一视觉） */
function foodEmoji(name) {
  const n = name || '';
  for (const item of FOOD_EMOJI) {
    for (const kw of item.kw) {
      if (n.indexOf(kw) > -1) return item.emoji;
    }
  }
  return '🍽️';
}

/** 名称 → 稳定的浅色渐变（用于无图卡片/头像底色） */
const PALETTE = [
  ['#FFD8B5', '#FFB980'],
  ['#A8C79D', '#8FB884'],
  ['#F59A86', '#EE7E68'],
  ['#F7C56B', '#EFAE3F'],
  ['#B9C7E8', '#97A9D6'],
  ['#E3B7D2', '#CF93BC']
];

function hashOf(str) {
  let h = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) % 100000;
  }
  return h;
}

function avatarColors(seed) {
  const p = PALETTE[hashOf(seed) % PALETTE.length];
  return p;
}

/** 昵称 → 头像文字（取第一个字符） */
function avatarText(nickname) {
  const n = (nickname || '').trim();
  if (!n) return '饭';
  return n.slice(0, 1);
}

/** 生成今天/明天的日期 key */
function todayKey(offset) {
  return dateKey(Date.now() + (offset || 0) * 86400000);
}

/** 某月第一天 / 天数 */
function monthInfo(year, month /* 1-12 */) {
  const first = new Date(year, month - 1, 1);
  const days = new Date(year, month, 0).getDate();
  // 周日=0 → 周一为第一列时，前置空白数
  const firstWeekday = first.getDay();
  const lead = firstWeekday === 0 ? 6 : firstWeekday - 1;
  return { first, days, lead };
}

module.exports = {
  pad,
  dateKey,
  hhmm,
  startOfDay,
  dayLabel,
  mealTimeLabel,
  shortTime,
  money,
  thousands,
  currentMealType,
  levelOf,
  distanceLabel,
  foodEmoji,
  avatarColors,
  avatarText,
  todayKey,
  monthInfo
};
