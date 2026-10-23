/**
 * 全局常量：餐次、等级、区域、可见范围、食物 Emoji
 * 数值边界与产品交付说明 V1 保持一致
 */

// 餐次
const MEAL_TYPES = [
  { key: 'breakfast', label: '早餐', emoji: '🌅', short: '早' },
  { key: 'lunch', label: '午餐', emoji: '☀️', short: '午' },
  { key: 'dinner', label: '晚餐', emoji: '🌙', short: '晚' }
];

// 默认时间边界：早餐 05:00–10:59 / 午餐 11:00–15:59 / 晚餐 16:00–04:59
function mealTypeByHour(hour) {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  return 'dinner';
}

// 等级（只按有效真实饭记数量，私密饭记也计入）
const LEVELS = [
  { level: 1, name: '刚开饭', min: 0, max: 5 },
  { level: 2, name: '小饭友', min: 6, max: 20 },
  { level: 3, name: '常来吃饭', min: 21, max: 50 },
  { level: 4, name: '干饭柴', min: 51, max: 100 },
  { level: 5, name: '饭饭老友', min: 101, max: Infinity }
];

// 饭记可见范围
const MEAL_VISIBILITY = [
  { key: 'public', label: '公开', desc: '大家都可以看到' },
  { key: 'nearby', label: '仅附近可见', desc: '只进入附近饭流' },
  { key: 'private', label: '仅自己可见', desc: '只留在自己的饭历里' }
];

// 地点可见范围
const LOCATION_VISIBILITY = [
  { key: 'exact', label: '具体地点', desc: '显示食堂 / 店铺名称' },
  { key: 'fuzzy', label: '模糊区域', desc: '只显示学校 / 商圈级别' },
  { key: 'hidden', label: '不公开', desc: '不向其他人展示地点' }
];

// 感受可见范围
const MOOD_VISIBILITY = [
  { key: 'public', label: '公开', desc: '其他人可以看到' },
  { key: 'private', label: '仅自己可见', desc: '只有自己能看见' }
];

// 可手动选择的地域（首批运营以校园为主，架构不限定单一学校）
const REGIONS = [
  { key: 'wujiaochang', name: '五角场附近', sub: '上海 · 商圈' },
  { key: 'fudan', name: '某大学附近', sub: '上海 · 校园' },
  { key: 'lujiazui', name: '陆家嘴附近', sub: '上海 · 商圈' },
  { key: 'xuhui', name: '徐家汇附近', sub: '上海 · 商圈' },
  { key: 'zhongguancun', name: '中关村附近', sub: '北京 · 商圈' },
  { key: 'wudaokou', name: '五道口附近', sub: '北京 · 校园' }
];

const DEFAULT_REGION = REGIONS[0];
const NEARBY_RADIUS_KM = 3; // 附近默认约 3km

// 可选头像（位于 /assets/avatars/，由「图片.zip」压缩而来）
const AVATARS = [
  '/assets/avatars/avatar_1.png',
  '/assets/avatars/avatar_2.png',
  '/assets/avatars/avatar_3.png',
  '/assets/avatars/avatar_4.png',
  '/assets/avatars/avatar_5.png',
  '/assets/avatars/avatar_6.png',
  '/assets/avatars/avatar_7.png'
];

/**
 * 公共饭流的实时有效窗口
 * 交付说明 6.3：「历史补记不应污染『当下正在吃』的实时饭流；具体实时有效窗口待后续定义」。
 * V1 先取 36 小时（今天 + 昨天），保证「附近正在吃」里出现的都是还有参考价值的饭；
 * 后续可按运营数据调整这一个常量即可，页面层无需改动。
 */
const FEED_WINDOW_HOURS = 36;

// 餐单状态
const PLAN_STATUS = {
  planned: '待吃',
  completed: '已吃',
  cancelled: '已取消'
};

// 无图饭记的统一食物 Emoji 池（按名称关键词兜底匹配）
const FOOD_EMOJI = [
  { kw: ['面', '拉面', '米线', '粉'], emoji: '🍜' },
  { kw: ['饭', '盖饭', '炒饭', '煲'], emoji: '🍚' },
  { kw: ['三明治', '吐司', '贝果', '面包'], emoji: '🥪' },
  { kw: ['麻辣烫', '火锅', '冒菜'], emoji: '🌶️' },
  { kw: ['咖啡', '拿铁', '奶茶'], emoji: '☕' },
  { kw: ['蛋糕', '甜点', '布丁'], emoji: '🍰' },
  { kw: ['饺子', '包子', '馄饨'], emoji: '🥟' },
  { kw: ['鸡', '炸鸡', '烧鸟'], emoji: '🍗' },
  { kw: ['沙拉', '轻食'], emoji: '🥗' },
  { kw: ['水果'], emoji: '🍓' },
  { kw: ['粥', '汤'], emoji: '🥣' },
  { kw: ['汉堡'], emoji: '🍔' },
  { kw: ['披萨'], emoji: '🍕' },
  { kw: ['寿司'], emoji: '🍣' },
  { kw: ['烧烤', '串'], emoji: '🍢' }
];

module.exports = {
  MEAL_TYPES,
  mealTypeByHour,
  LEVELS,
  MEAL_VISIBILITY,
  LOCATION_VISIBILITY,
  MOOD_VISIBILITY,
  REGIONS,
  DEFAULT_REGION,
  NEARBY_RADIUS_KM,
  AVATARS,
  FEED_WINDOW_HOURS,
  PLAN_STATUS,
  FOOD_EMOJI
};
