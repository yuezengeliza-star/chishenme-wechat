/**
 * 假数据种子
 * 交付说明 22.3：所有页面先使用假数据跑通完整流程。
 * 这里生成「其他用户当天饭记 + 我自己的近 30 天饭历」，保证首页、饭历、
 * 消费统计、餐单、想吃、跟吃都有内容可看。
 */
const { REGIONS, AVATARS } = require('./constants.js');

/* ---------------- 确定性伪随机（保证每次冷启动数据一致） ---------------- */
function lcg(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const DAY = 86400000;

function at(dayOffset, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/* ---------------- 用户 ---------------- */
const USERS = [
  {
    id: 'u_yu',
    nickname: '小鱼',
    bio: '喜欢在普通的日子里认真吃饭。',
    school: '某大学 · 新闻系',
    recordCount: 37
  },
  {
    id: 'u_momo',
    nickname: 'momo',
    bio: '',
    school: '',
    recordCount: 22
  },
  {
    id: 'u_alin',
    nickname: '阿琳',
    bio: '无辣不欢，但最近在养生。',
    school: '某大学 · 设计学院',
    recordCount: 55
  },
  {
    id: 'u_zhishi',
    nickname: '芝士',
    bio: '',
    school: '',
    recordCount: 104
  },
  {
    id: 'u_paofu',
    nickname: '泡芙',
    bio: '一天中最期待的就是吃饭。',
    school: '某大学 · 中文系',
    recordCount: 12
  },
  {
    id: 'u_ajie',
    nickname: '阿杰',
    bio: '',
    school: '',
    recordCount: 63
  }
];

/* ---------------- 他人当天饭记 ---------------- */
// d = 到当前位置的距离（km）；place = 具体地点；area = 模糊区域
const OTHER_MEALS = [
  // 早餐
  { a: 'u_alin', mt: 'breakfast', t: [0, 8, 20], name: '鸡胸三明治', amount: 12, d: 1.2, place: '某大学第一食堂', area: '五角场附近', mood: '早八前的固定搭配。', eat: 6 },
  { a: 'u_ajie', mt: 'breakfast', t: [0, 7, 45], name: '豆浆油条', amount: 6, d: 0.6, place: '校门口早点摊', area: '五角场附近', mood: '', eat: 11 },
  { a: 'u_paofu', mt: 'breakfast', t: [0, 9, 5], name: '小笼包', amount: 9, d: 2.4, place: '', area: '五角场附近', mood: '', eat: 3 },
  { a: 'u_zhishi', mt: 'breakfast', t: [0, 9, 30], name: '贝果 + 拿铁', amount: 18, d: 0.2, place: '图书馆一楼咖啡角', area: '五角场附近', mood: '论文日，需要咖啡。', eat: 8 },

  // 午餐
  { a: 'u_yu', mt: 'lunch', t: [0, 12, 8], name: '红烧牛肉面', amount: 18, d: 0.4, place: '五角场老街面馆', area: '五角场附近', mood: '今天上午上课特别累，本来想随便点的，结果意外地好吃。', eat: 12 },
  { a: 'u_momo', mt: 'lunch', t: [0, 11, 56], name: '鸡胸三明治', amount: 12, d: 0.9, place: '公司楼下轻食店', area: '五角场附近', mood: '', eat: 5 },
  { a: 'u_alin', mt: 'lunch', t: [0, 12, 3], name: '番茄肥牛饭', amount: 22, d: 0.4, place: '第一食堂二楼', area: '五角场附近', mood: '番茄味很浓，汤泡饭很香。', eat: 9 },
  { a: 'u_zhishi', mt: 'lunch', t: [0, 11, 49], name: '麻辣烫', amount: 16, d: 1.8, place: '', area: '五角场附近', mood: '', eat: 7 },
  { a: 'u_ajie', mt: 'lunch', t: [0, 12, 20], name: '食堂大众餐', amount: 11, d: 0.3, place: '第一食堂一楼', area: '五角场附近', mood: '省钱的一天。', eat: 4 },
  { a: 'u_paofu', mt: 'lunch', t: [0, 12, 35], name: '酸菜鱼米线', amount: 24, d: 2.6, place: '', area: '五角场附近', mood: '', eat: 3 },
  { a: 'u_yu', mt: 'lunch', t: [0, 12, 40], name: '海南鸡饭', amount: 26, d: 1.1, place: '南门美食广场', area: '五角场附近', mood: '', eat: 5 },
  { a: 'u_zhishi', mt: 'lunch', t: [0, 13, 2], name: '豚骨拉面', amount: 28, d: 2.1, place: '', area: '五角场附近', mood: '', eat: 2 },

  // 晚餐
  { a: 'u_yu', mt: 'dinner', t: [0, 18, 10], name: '日式豚骨拉面', amount: 28, d: 0.5, place: '五角场面馆', area: '五角场附近', mood: '汤很浓，适合降温的晚上。', eat: 10 },
  { a: 'u_momo', mt: 'dinner', t: [0, 18, 40], name: '蒜香排骨饭', amount: 20, d: 1.4, place: '', area: '五角场附近', mood: '', eat: 4 },
  { a: 'u_zhishi', mt: 'dinner', t: [0, 19, 5], name: '麻辣香锅', amount: 32, d: 2.2, place: '学府路小馆', area: '五角场附近', mood: '和室友一起，人均不便宜但很爽。', eat: 8 },
  { a: 'u_alin', mt: 'dinner', t: [0, 19, 30], name: '螺蛳粉', amount: 15, d: 1.6, place: '', area: '五角场附近', mood: '', eat: 6 },
  { a: 'u_paofu', mt: 'dinner', t: [0, 20, 15], name: '番茄鸡蛋面', amount: 13, d: 0.0, place: '宿舍楼下小超市', area: '五角场附近', mood: '', eat: 1 },
  { a: 'u_ajie', mt: 'dinner', t: [0, 20, 40], name: '炸鸡 + 可乐', amount: 29, d: 3.6, place: '', area: '五角场附近', mood: '加班到很晚，随便点了个外卖。', eat: 2 },

  // 昨天（让「最新」饭流有跨天内容）
  { a: 'u_yu', mt: 'dinner', t: [-1, 18, 20], name: '番茄牛腩煲', amount: 34, d: 0.8, place: '五角场老街面馆', area: '五角场附近', mood: '', eat: 12 },
  { a: 'u_alin', mt: 'lunch', t: [-1, 12, 15], name: '石锅拌饭', amount: 25, d: 1.0, place: '', area: '五角场附近', mood: '', eat: 7 },
  { a: 'u_zhishi', mt: 'breakfast', t: [-1, 8, 50], name: '手抓饼 + 豆浆', amount: 8, d: 0.9, place: '', area: '五角场附近', mood: '', eat: 5 },

  // 供「我的想吃 → 收藏自」示例（index 21）
  { a: 'u_momo', mt: 'lunch', t: [-2, 12, 30], name: '老王牛肉面', amount: 25, d: 1.3, place: '五角场老街面馆', area: '五角场附近', mood: '辣椒油真的很香，但有点辣。', eat: 14 }
];

const SAVED_MEAL_ID = 'm_o_21';

// 各餐次的时间窗口起点（与交付说明 4.3 的默认时间边界一致）
const WINDOW_START = { breakfast: [5, 5], lunch: [11, 5], dinner: [16, 5] };

/**
 * 把当天但时间还没到的饭记，挪到「刚刚吃过」的时间；
 * 若整个餐次今天还没开始，则这条饭记今天不出现。
 * 保证「附近正在吃」永远是真实已经发生过的饭。
 */
function resolveToday(meal, i, now) {
  if (meal.eatenAt <= now) return meal;

  const target = new Date(meal.eatenAt);
  if (target.toDateString() !== new Date(now).toDateString()) return meal;

  const ws = WINDOW_START[meal.mealType];
  const start = new Date(now);
  start.setHours(ws[0], ws[1], 0, 0);
  if (start.getTime() > now) return null; // 这个餐次今天还没开始

  const shifted = now - (6 + (i % 8) * 4) * 60000;
  meal.eatenAt = Math.max(shifted, start.getTime() + 60000);
  meal.createdAt = meal.eatenAt;
  return meal;
}

/* ---------------- 我自己的历史饭历（近 30 天） ---------------- */
const MY_LUNCH_POOL = [
  { name: '牛肉面', amount: 16, place: '第一食堂二楼' },
  { name: '番茄肥牛饭', amount: 22, place: '第一食堂二楼' },
  { name: '麻辣烫', amount: 16, place: '学府路小馆' },
  { name: '酸菜鱼米线', amount: 24, place: '南门美食广场' },
  { name: '鸡腿饭', amount: 15, place: '第一食堂一楼' },
  { name: '海南鸡饭', amount: 26, place: '南门美食广场' },
  { name: '石锅拌饭', amount: 25, place: '学府路小馆' }
];
const MY_DINNER_POOL = [
  { name: '麻辣烫', amount: 22, place: '学府路小馆' },
  { name: '日式豚骨拉面', amount: 28, place: '五角场面馆' },
  { name: '蒜香排骨饭', amount: 20, place: '第一食堂二楼' },
  { name: '番茄鸡蛋面', amount: 13, place: '宿舍楼下小超市' },
  { name: '炸鸡', amount: 29, place: '五角场商圈' },
  { name: '螺蛳粉', amount: 15, place: '南门美食广场' }
];
const MY_BREAKFAST_POOL = [
  { name: '贝果 + 拿铁', amount: 18, place: '图书馆一楼咖啡角' },
  { name: '豆浆油条', amount: 6, place: '校门口早点摊' },
  { name: '小笼包', amount: 9, place: '第一食堂一楼' }
];

const MY_MOODS = [
  '今天吃得有点急。',
  '和同学一起，聊了很久。',
  '还是这家的味道最稳。',
  '',
  '',
  '价格比想象中便宜。',
  ''
];

/**
 * 生成我自己的历史饭记
 * 最近 30 天：每天 2 顿（午 + 晚），约 70% 概率有早餐；今天的晚餐留空给用户自己记
 */
function buildMyMeals() {
  const meals = [];
  const now = Date.now();
  let idx = 0;

  for (let day = -29; day <= 0; day++) {
    const rnd = lcg(9001 + day * 131); // 每天固定种子，数据稳定

    // 早餐（约 70% 概率）
    if (rnd() < 0.7) {
      const p = MY_BREAKFAST_POOL[Math.floor(rnd() * MY_BREAKFAST_POOL.length)];
      pushMine(meals, makeMine(day, 8, 10 + Math.floor(rnd() * 40), p, 'breakfast', 0.15, idx++), now);
    }

    // 午餐
    const lp = MY_LUNCH_POOL[Math.floor(rnd() * MY_LUNCH_POOL.length)];
    pushMine(meals, makeMine(day, 12, Math.floor(rnd() * 45), lp, 'lunch', 0.25, idx++), now);

    // 晚餐：今天不预生成（留给用户自己记）
    if (day !== 0) {
      const dp = MY_DINNER_POOL[Math.floor(rnd() * MY_DINNER_POOL.length)];
      pushMine(meals, makeMine(day, 18, 10 + Math.floor(rnd() * 120), dp, 'dinner', 0.3, idx++), now);
    }
  }
  return meals;
}

/** 未来的饭记不能算「已经吃过」，直接丢弃（当前时刻之后的今天三餐留空给用户记录） */
function pushMine(list, meal, now) {
  if (meal.eatenAt > now) return;
  list.push(meal);
}

function makeMine(dayOffset, hour, minute, pool, mealType, distance, seq) {
  // 每 11 顿里有 1 顿不记金额，模拟「不记金额」场景
  const amountUnknown = seq % 11 === 7;
  // 约 1/5 设为仅自己可见（私密饭记同样计入等级）
  const visibility = seq % 5 === 3 ? 'private' : 'public';
  const mood = MY_MOODS[seq % MY_MOODS.length];
  return {
    id: 'm_me_' + seq,
    authorId: 'u_me',
    mealType,
    eatenAt: at(dayOffset, hour, minute),
    name: pool.name,
    amount: amountUnknown ? null : pool.amount,
    amountUnknown,
    imageUrls: [],
    moodText: mood,
    moodVisibility: 'public',
    visibility,
    location: {
      placeName: pool.place,
      areaName: '五角场附近',
      displayMode: 'exact',
      distanceKm: distance,
      provided: true
    },
    eatCount: 0,
    createdAt: at(dayOffset, hour, minute + 5)
  };
}

/**
 * 生成完整种子数据
 * 返回 { users, meals, plans, wishes, me }
 */
function buildSeed() {
  const now = Date.now();

  const users = USERS.map((u, i) => ({
    id: u.id,
    nickname: u.nickname,
    bio: u.bio,
    school: u.school,
    avatarUrl: AVATARS[i % AVATARS.length],
    recordCount: u.recordCount,
    followEatUserIds: []
  }));

  // 我：近 30 天约 90 顿真实饭记（buildMyMeals 生成），等级由这个数量推导 → 大约 Lv.3~Lv.4
  const me = {
    id: 'u_me',
    nickname: '小橙',
    bio: '',
    school: '',
    avatarUrl: AVATARS[AVATARS.length - 1],
    region: REGIONS[0].name,
    locationAuthorized: false,
    followEatUserIds: ['u_yu', 'u_alin', 'u_zhishi', 'u_momo', 'u_paofu', 'u_ajie'],
    onboarded: false,
    createdAt: now
  };

  const others = OTHER_MEALS.map((m, i) => {
    const [dOff, h, mi] = m.t;
    const noLocation = i % 9 === 4; // 少量饭记完全不提供位置
    return {
      id: 'm_o_' + i,
      authorId: m.a,
      mealType: m.mt,
      eatenAt: at(dOff, h, mi),
      name: m.name,
      amount: m.amount,
      amountUnknown: false,
      imageUrls: [],
      moodText: m.mood || '',
      moodVisibility: 'public',
      visibility: 'public',
      location: {
        placeName: noLocation ? '' : m.place,
        areaName: m.area,
        displayMode: noLocation ? 'hidden' : m.place ? 'exact' : 'fuzzy',
        distanceKm: noLocation ? null : m.d,
        provided: !noLocation
      },
      eatCount: m.eat,
      createdAt: at(dOff, h, mi + 3)
    };
  })
    // 今天还没到饭点的饭记不能出现（否则「刚刚吃了什么」会穿越）
    .map((meal, i) => resolveToday(meal, i, now))
    .filter(Boolean);

  const myMeals = buildMyMeals();

  // 我的餐单：今天午餐已吃（对应一条真实饭记）、今天晚餐待吃、明天早餐待吃
  const todayLunch = myMeals.filter((m) => m.mealType === 'lunch').pop();
  const plans = [
    {
      id: 'p_1',
      userId: 'u_me',
      date: dateKeyOf(0),
      mealType: 'lunch',
      sourceType: 'meal',
      sourceId: todayLunch ? todayLunch.id : null,
      name: todayLunch ? todayLunch.name : '牛肉面',
      referenceAmount: todayLunch ? todayLunch.amount : 16,
      status: 'completed',
      createdAt: todayLunch ? todayLunch.eatenAt : now
    },
    {
      id: 'p_2',
      userId: 'u_me',
      date: dateKeyOf(0),
      mealType: 'dinner',
      sourceType: 'meal',
      sourceId: 'm_o_12',
      name: '日式豚骨拉面',
      referenceAmount: 28,
      sourceUserName: '小鱼',
      status: 'planned',
      createdAt: now
    },
    {
      id: 'p_3',
      userId: 'u_me',
      date: dateKeyOf(1),
      mealType: 'breakfast',
      sourceType: 'wish',
      sourceId: 'w_2',
      name: '草莓蛋糕',
      referenceAmount: 35,
      sourceUserName: '',
      status: 'planned',
      createdAt: now
    }
  ];

  // 我的想吃
  const wishes = [
    {
      id: 'w_1',
      userId: 'u_me',
      sourceType: 'savedMeal',
      sourceMealId: SAVED_MEAL_ID,
      name: '老王牛肉面',
      placeName: '五角场',
      areaName: '五角场附近',
      expectedAmount: 25,
      imageUrl: '',
      note: '朋友说他家辣椒油很好吃',
      status: 'want',
      createdAt: now - 3 * DAY
    },
    {
      id: 'w_2',
      userId: 'u_me',
      sourceType: 'manual',
      sourceMealId: '',
      name: '日式豚骨拉面',
      placeName: '五角场',
      areaName: '五角场附近',
      expectedAmount: 28,
      imageUrl: '',
      note: '想挑个不太去吃饭的时间去',
      status: 'want',
      createdAt: now - 2 * DAY
    },
    {
      id: 'w_3',
      userId: 'u_me',
      sourceType: 'manual',
      sourceMealId: '',
      name: '草莓蛋糕',
      placeName: '五角场商圈',
      areaName: '五角场附近',
      expectedAmount: 35,
      imageUrl: '',
      note: '看起来很好吃！',
      status: 'want',
      createdAt: now - DAY
    }
  ];

  return { me, users, meals: others.concat(myMeals), plans, wishes };
}

function dateKeyOf(offset) {
  const d = new Date(Date.now() + offset * DAY);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

module.exports = { buildSeed, dateKeyOf, lcg, at };
