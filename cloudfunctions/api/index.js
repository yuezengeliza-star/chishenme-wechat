/**
 * 「吃什么」云函数 · 单路由入口
 *
 * 设计要点：
 *  1. 所有集合读写都走云函数（集合权限设为「仅创建者可读写」，天然防越权）
 *  2. 首次调用 login 时自动建集合 + 灌入演示用户/演示饭记（真实用户数据为空）
 *  3. 业务文档字段与前端 utils/mock.js 完全同构，页面装饰层（decorate*）不改
 *  4. 收藏 / 餐单 / 饭历 / 统计 的业务规则与 utils/store.js 保持一致：
 *     - 收藏 = 想吃，不计消费
 *     - 餐单 = 计划，不计消费
 *     - 饭记 = 进饭历与消费统计
 *     - 饭流实时窗口 36h
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const DAY = 86400000;
const FEED_WINDOW_MS = 36 * 3600 * 1000; // 饭流实时窗口，与 store.js 一致
const COLLECTIONS = ['users', 'meals', 'wishes', 'plans', 'follows'];

/* ---------------- 工具 ---------------- */

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function mealTypeByHour(h) {
  if (h < 5) return 'breakfast'; // 凌晨那顿算前一天夜宵场景，这里简化归早餐
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  return 'dinner';
}

function dateKeyOf(ts) {
  const d = new Date(ts);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

async function ensureCollections() {
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
    } catch (e) {
      // 集合已存在会报错，忽略
    }
  }
}

/**
 * 软删除过滤条件。
 * 删除饭记时只写 deletedAt（保留数据可追溯），所有读接口都要带上这个条件，
 * 否则被删的饭记会继续出现在饭流、饭历、统计里。
 */
const NOT_DELETED = { deletedAt: _.eq(null), visibility: _.neq('deleted') };

/** 把 NOT_DELETED 合并进 where 条件（condition 可以是对象或已经是 command 的复合条件） */
function aliveCond(condition) {
  return Object.assign({}, condition, NOT_DELETED);
}

/* ---------------- 演示数据（他人内容，供饭流冷启动） ---------------- */

const DEMO_USERS = [
  { id: 'u_yu', nickname: '小鱼', bio: '喜欢在普通的日子里认真吃饭。', recordCount: 37 },
  { id: 'u_momo', nickname: 'momo', bio: '', recordCount: 22 },
  { id: 'u_alin', nickname: '阿琳', bio: '无辣不欢，但最近在养生。', recordCount: 55 },
  { id: 'u_zhishi', nickname: '芝士', bio: '', recordCount: 104 },
  { id: 'u_paofu', nickname: '泡芙', bio: '一天中最期待的就是吃饭。', recordCount: 12 },
  { id: 'u_ajie', nickname: '阿杰', bio: '', recordCount: 63 }
];

// t: [日偏移, 时, 分]，d: 距离km，place/area: 位置
const DEMO_MEALS = [
  { a: 'u_alin', mt: 'breakfast', t: [0, 8, 20], name: '鸡胸三明治', amount: 12, d: 1.2, place: '某大学第一食堂', mood: '早八前的固定搭配。', eat: 6 },
  { a: 'u_ajie', mt: 'breakfast', t: [0, 7, 45], name: '豆浆油条', amount: 6, d: 0.6, place: '校门口早点摊', mood: '', eat: 11 },
  { a: 'u_zhishi', mt: 'breakfast', t: [0, 9, 30], name: '贝果 + 拿铁', amount: 18, d: 0.2, place: '图书馆一楼咖啡角', mood: '论文日，需要咖啡。', eat: 8 },
  { a: 'u_yu', mt: 'lunch', t: [0, 12, 8], name: '红烧牛肉面', amount: 18, d: 0.4, place: '五角场老街面馆', mood: '今天上午上课特别累，本来想随便点的，结果意外地好吃。', eat: 12 },
  { a: 'u_momo', mt: 'lunch', t: [0, 11, 56], name: '鸡胸三明治', amount: 12, d: 0.9, place: '公司楼下轻食店', mood: '', eat: 5 },
  { a: 'u_alin', mt: 'lunch', t: [0, 12, 3], name: '番茄肥牛饭', amount: 22, d: 0.4, place: '第一食堂二楼', mood: '番茄味很浓，汤泡饭很香。', eat: 9 },
  { a: 'u_zhishi', mt: 'lunch', t: [0, 11, 49], name: '麻辣烫', amount: 16, d: 1.8, place: '', mood: '', eat: 7 },
  { a: 'u_ajie', mt: 'lunch', t: [0, 12, 20], name: '食堂大众餐', amount: 11, d: 0.3, place: '第一食堂一楼', mood: '省钱的一天。', eat: 4 },
  { a: 'u_yu', mt: 'lunch', t: [0, 12, 40], name: '海南鸡饭', amount: 26, d: 1.1, place: '南门美食广场', mood: '', eat: 5 },
  { a: 'u_yu', mt: 'dinner', t: [0, 18, 10], name: '日式豚骨拉面', amount: 28, d: 0.5, place: '五角场面馆', mood: '汤很浓，适合降温的晚上。', eat: 10 },
  { a: 'u_momo', mt: 'dinner', t: [0, 18, 40], name: '蒜香排骨饭', amount: 20, d: 1.4, place: '', mood: '', eat: 4 },
  { a: 'u_zhishi', mt: 'dinner', t: [0, 19, 5], name: '麻辣香锅', amount: 32, d: 2.2, place: '学府路小馆', mood: '和室友一起，人均不便宜但很爽。', eat: 8 },
  { a: 'u_alin', mt: 'dinner', t: [0, 19, 30], name: '螺蛳粉', amount: 15, d: 1.6, place: '', mood: '', eat: 6 },
  { a: 'u_yu', mt: 'dinner', t: [-1, 18, 20], name: '番茄牛腩煲', amount: 34, d: 0.8, place: '五角场老街面馆', mood: '', eat: 12 },
  { a: 'u_alin', mt: 'lunch', t: [-1, 12, 15], name: '石锅拌饭', amount: 25, d: 1.0, place: '', mood: '', eat: 7 },
  { a: 'u_momo', mt: 'lunch', t: [-2, 12, 30], name: '老王牛肉面', amount: 25, d: 1.3, place: '五角场老街面馆', mood: '辣椒油真的很香，但有点辣。', eat: 14 }
];

function demoMealDoc(m, i) {
  const [dOff, h, mi] = m.t;
  const ts = new Date().setHours(h, mi, 0, 0) + dOff * DAY;
  const noLocation = i % 9 === 4;
  return {
    id: uid('m'),
    authorId: m.a,
    mealType: m.mt,
    eatenAt: ts,
    name: m.name,
    amount: m.amount,
    amountUnknown: false,
    imageUrls: [],
    moodText: m.mood || '',
    moodVisibility: 'public',
    visibility: 'public',
    location: {
      placeName: noLocation ? '' : m.place,
      areaName: '五角场附近',
      displayMode: noLocation ? 'hidden' : m.place ? 'exact' : 'fuzzy',
      distanceKm: noLocation ? null : m.d,
      provided: !noLocation
    },
    eatCount: m.eat,
    createdAt: ts + 3000
  };
}

async function seedDemoData() {
  for (const u of DEMO_USERS) {
    const found = await db.collection('users').where({ id: u.id }).count();
    if (!found.total) {
      await db.collection('users').add({
        data: Object.assign({}, u, {
          school: '',
          avatarUrl: '',
          openid: '',
          followEatUserIds: [],
          createdAt: Date.now()
        })
      });
    }
  }
  const cnt = await db.collection('meals').where({ authorId: _.in(DEMO_USERS.map((u) => u.id)) }).count();
  if (!cnt.total) {
    for (let i = 0; i < DEMO_MEALS.length; i++) {
      const m = DEMO_MEALS[i];
      const doc = demoMealDoc(m, i);
      if (doc.eatenAt > Date.now()) continue; // 未来时间不灌
      await db.collection('meals').add({ data: doc });
    }
  }
}

/* ---------------- 用户 ---------------- */

async function getUserByOpenid(openid) {
  const r = await db.collection('users').where({ openid }).limit(1).get();
  return r.data[0] || null;
}

async function doLogin(openid) {
  await ensureCollections();
  let me = await getUserByOpenid(openid);
  let isNew = false;
  if (!me) {
    isNew = true;
    const doc = {
      id: uid('u'),
      openid,
      nickname: '',
      bio: '',
      school: '',
      avatarUrl: '',
      region: '五角场附近',
      locationAuthorized: false,
      followEatUserIds: [],
      onboarded: false,
      recordCount: 0,
      createdAt: Date.now()
    };
    await db.collection('users').add({ data: doc });
    me = doc;
  }
  await seedDemoData();
  return { me, isNew };
}

/* ---------------- 饭记查询 ---------------- */

function feedWhere() {
  const now = Date.now();
  return aliveCond({
    visibility: 'public',
    eatenAt: _.gte(now - FEED_WINDOW_MS).and(_.lte(now))
  });
}

async function getFeed(openid, p) {
  const me = await getUserByOpenid(openid);
  const r = await db.collection('meals')
    .where(feedWhere())
    .orderBy('eatenAt', 'desc')
    .limit(60)
    .get();
  let list = r.data;
  if (p.regionName) {
    list = list.filter((m) => !m.location || !m.location.areaName || m.location.areaName === p.regionName);
  }
  if (p.mealType && p.mealType !== 'all') {
    list = list.filter((m) => m.mealType === p.mealType);
  }
  const follows = (me && me.followEatUserIds) || [];
  const now = Date.now();
  if (p.sort === 'latest') {
    list.sort((a, b) => b.eatenAt - a.eatenAt);
  } else if (p.sort === 'eat') {
    list.sort((a, b) => (b.eatCount || 0) - (a.eatCount || 0));
  } else {
    // 推荐：同餐次加成 + 跟吃的人加成 + 新近度
    const score = (m) =>
      (m.mealType === p.mealType ? 30 : 0) +
      (follows.indexOf(m.authorId) >= 0 ? 20 : 0) +
      Math.max(0, 60 - Math.floor((now - m.eatenAt) / 60000)) * 0.1 +
      (m.eatCount || 0) * 0.5;
    list.sort((a, b) => score(b) - score(a));
  }
  return list.slice(0, p.limit || 30);
}

async function randomNearby(openid, p) {
  const me = await getUserByOpenid(openid);
  const now = Date.now();
  const dayStart = new Date(now).setHours(0, 0, 0, 0);
  const cond = {
    visibility: 'public',
    eatenAt: _.gte(dayStart).and(_.lte(now)),
    authorId: _.neq(me ? me.id : ''),
    deletedAt: _.eq(null)
  };
  if (p.mealType) cond.mealType = p.mealType;
  const r = await db.collection('meals').where(cond).limit(50).get();
  let list = r.data;
  if (p.regionName) {
    const inRegion = list.filter((m) => m.location && m.location.areaName === p.regionName);
    if (inRegion.length) list = inRegion;
  }
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

async function getMealDetail(openid, p) {
  const r = await db.collection('meals').where(aliveCond({ id: p.id })).limit(1).get();
  const meal = r.data[0];
  if (!meal) return null;
  // 私密饭记只有作者本人能看
  const me = await getUserByOpenid(openid);
  if (meal.visibility === 'private' && (!me || meal.authorId !== me.id)) return null;
  return meal;
}

async function addMeal(openid, p) {
  const me = await getUserByOpenid(openid);
  const input = p.input || {};
  const now = Date.now();
  const doc = {
    id: uid('m'),
    authorId: me.id,
    mealType: input.mealType || mealTypeByHour(new Date(now).getHours()),
    eatenAt: input.eatenAt || now,
    name: (input.name || '').slice(0, 30),
    amount: input.amountUnknown ? null : input.amount,
    amountUnknown: !!input.amountUnknown,
    imageUrls: (input.imageUrls || []).slice(0, 3),
    moodText: (input.moodText || '').slice(0, 100),
    moodVisibility: input.moodVisibility || 'public',
    visibility: input.visibility || 'public',
    location: input.location || { displayMode: 'hidden', provided: false },
    eatCount: 0,
    createdAt: now
  };
  await db.collection('meals').add({ data: doc });
  await db.collection('users').where({ id: me.id }).update({
    data: { recordCount: _.inc(1) }
  });
  return doc;
}

async function updateMeal(openid, p) {
  const me = await getUserByOpenid(openid);
  const patch = {};
  const allowed = ['moodText', 'moodVisibility', 'visibility', 'amount', 'amountUnknown'];
  for (const k of allowed) if (k in p.patch) patch[k] = p.patch[k];
  const r = await db.collection('meals').where({ id: p.id, authorId: me.id }).update({ data: patch });
  return r.stats.updated > 0;
}

/** 删除自己的饭记：软删除（deletedAt），并回退用户记录数 */
async function deleteMeal(openid, p) {
  const me = await getUserByOpenid(openid);
  // where 带上 authorId = me.id，从数据库层保证只能删自己的
  const target = await db.collection('meals').where({ id: p.id, authorId: me.id }).limit(1).get();
  if (!target.data.length) return { ok: false, reason: 'not_found' };

  await db.collection('meals').where({ id: p.id, authorId: me.id }).update({
    data: { deletedAt: Date.now(), visibility: 'deleted' }
  });
  await db.collection('users').where({ id: me.id }).update({
    data: { recordCount: _.inc(-1) }
  });
  // 顺带清掉指向这条饭记的收藏
  await db.collection('wishes').where({ sourceMealId: p.id, userId: me.id }).remove();
  return { ok: true };
}

async function getMealsByAuthor(openid, p) {
  const me = await getUserByOpenid(openid);
  const cond = { authorId: p.authorId };
  if (!me || me.id !== p.authorId) cond.visibility = 'public';
  const r = await db.collection('meals')
    .where(aliveCond(cond))
    .orderBy('eatenAt', 'desc')
    .limit(50)
    .get();
  const ur = await db.collection('users').where({ id: p.authorId }).limit(1).get();
  return { author: ur.data[0] || null, meals: r.data };
}

/* ---------------- 跟吃 ---------------- */

async function toggleFollow(openid, p) {
  const me = await getUserByOpenid(openid);
  const has = (me.followEatUserIds || []).indexOf(p.userId) >= 0;
  const next = has
    ? me.followEatUserIds.filter((x) => x !== p.userId)
    : me.followEatUserIds.concat([p.userId]);
  await db.collection('users').where({ id: me.id }).update({ data: { followEatUserIds: next } });
  // follows 集合存关系明细（作者页展示「跟吃 TA 的人数」可用）
  if (has) {
    await db.collection('follows').where({ followerId: me.id, followeeId: p.userId }).remove();
  } else {
    await db.collection('follows').add({
      data: { followerId: me.id, followeeId: p.userId, createdAt: Date.now() }
    });
  }
  return { following: !has };
}

async function getFollowingList(openid) {
  const me = await getUserByOpenid(openid);
  const ids = (me && me.followEatUserIds) || [];
  if (!ids.length) return [];
  const ur = await db.collection('users').where({ id: _.in(ids) }).get();
  const now = Date.now();
  const dayStart = new Date(now).setHours(0, 0, 0, 0);
  const mr = await db.collection('meals')
    .where({ authorId: _.in(ids), visibility: 'public', eatenAt: _.gte(dayStart).and(_.lte(now)), deletedAt: _.eq(null) })
    .orderBy('eatenAt', 'desc')
    .get();
  return ur.data.map((u) => ({
    user: u,
    todayMeals: mr.data.filter((m) => m.authorId === u.id)
  }));
}

/* ---------------- 想吃 ---------------- */

async function getWishes(openid) {
  const me = await getUserByOpenid(openid);
  const r = await db.collection('wishes')
    .where({ userId: me.id })
    .orderBy('createdAt', 'desc')
    .get();
  return r.data;
}

async function addWish(openid, p) {
  const me = await getUserByOpenid(openid);
  const doc = {
    id: uid('w'),
    userId: me.id,
    name: (p.input.name || '').slice(0, 30),
    expectedAmount: p.input.expectedAmount === undefined ? null : p.input.expectedAmount,
    note: (p.input.note || '').slice(0, 60),
    sourceType: p.input.sourceType || 'self',
    sourceMealId: p.input.sourceMealId || null,
    done: false,
    createdAt: Date.now()
  };
  await db.collection('wishes').add({ data: doc });
  return doc;
}

async function toggleSaveMeal(openid, p) {
  const me = await getUserByOpenid(openid);
  const exist = await db.collection('wishes')
    .where({ userId: me.id, sourceMealId: p.mealId })
    .get();
  if (exist.data.length) {
    await db.collection('wishes').where({ userId: me.id, sourceMealId: p.mealId }).remove();
    return { saved: false };
  }
  const mr = await db.collection('meals').where({ id: p.mealId }).limit(1).get();
  const meal = mr.data[0];
  if (!meal) throw new Error('饭记不存在');
  const doc = {
    id: uid('w'),
    userId: me.id,
    name: meal.name,
    expectedAmount: meal.amount,
    note: meal.moodText || '',
    sourceType: 'savedMeal',
    sourceMealId: meal.id,
    done: false,
    createdAt: Date.now()
  };
  await db.collection('wishes').add({ data: doc });
  // 顺便给作者加一次「就吃」计数
  await db.collection('meals').where({ id: meal.id }).update({ data: { eatCount: _.inc(1) } });
  return { saved: true, wish: doc };
}

async function removeWish(openid, p) {
  const me = await getUserByOpenid(openid);
  const r = await db.collection('wishes').where({ id: p.id, userId: me.id }).remove();
  return r.stats.removed > 0;
}

/* ---------------- 餐单 ---------------- */

async function getPlanBoard(openid) {
  const me = await getUserByOpenid(openid);
  const r = await db.collection('plans')
    .where({ userId: me.id, date: _.in([dateKeyOf(Date.now()), dateKeyOf(Date.now() + DAY)]) })
    .orderBy('createdAt', 'asc')
    .get();
  return r.data;
}

async function addPlan(openid, p) {
  const me = await getUserByOpenid(openid);
  const doc = {
    id: uid('p'),
    userId: me.id,
    date: p.input.date,
    mealType: p.input.mealType,
    sourceType: p.input.sourceType || 'self',
    sourceId: p.input.sourceId || null,
    name: (p.input.name || '').slice(0, 30),
    referenceAmount: p.input.referenceAmount === undefined ? null : p.input.referenceAmount,
    sourceUserName: p.input.sourceUserName || '',
    status: 'planned',
    createdAt: Date.now()
  };
  await db.collection('plans').add({ data: doc });
  return doc;
}

async function setPlanStatus(openid, p, status) {
  const me = await getUserByOpenid(openid);
  const r = await db.collection('plans')
    .where({ id: p.id, userId: me.id })
    .update({ data: { status } });
  return r.stats.updated > 0;
}

/* ---------------- 饭历 / 统计 / 今日 ---------------- */

async function getCalendarMonth(openid, p) {
  const me = await getUserByOpenid(openid);
  const start = new Date(p.month + '-01T00:00:00+08:00').getTime();
  const end = start + 31 * DAY;
  const r = await db.collection('meals')
    .where(aliveCond({ authorId: me.id, eatenAt: _.gte(start).and(_.lt(end)) }))
    .orderBy('eatenAt', 'asc')
    .get();
  return r.data;
}

async function getStats(openid, p) {
  const me = await getUserByOpenid(openid);
  const now = new Date();
  let start, buckets;
  if (p.period === 'week') {
    start = now.getTime() - 6 * DAY;
    buckets = Array.from({ length: 7 }, (_, i) => dateKeyOf(start + i * DAY));
  } else if (p.period === 'year') {
    start = new Date(now.getFullYear(), 0, 1).getTime();
    buckets = Array.from({ length: 12 }, (_, i) => String(now.getFullYear() + '-' + (i + 1 < 10 ? '0' + (i + 1) : i + 1)));
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    buckets = Array.from({ length: days }, (_, i) => dateKeyOf(start + i * DAY));
  }
  const r = await db.collection('meals')
    .where(aliveCond({ authorId: me.id, eatenAt: _.gte(start).and(_.lte(Date.now())) }))
    .get();
  const meals = r.data;
  const byBucket = buckets.map((k) => {
    const list = meals.filter((m) =>
      p.period === 'year' ? dateKeyOf(m.eatenAt).slice(0, 7) === k : dateKeyOf(m.eatenAt) === k
    );
    return {
      key: k,
      count: list.length,
      amount: list.reduce((s, m) => s + (m.amount || 0), 0)
    };
  });
  const byMealType = ['breakfast', 'lunch', 'dinner'].map((mt) => {
    const list = meals.filter((m) => m.mealType === mt);
    return {
      mealType: mt,
      count: list.length,
      amount: list.reduce((s, m) => s + (m.amount || 0), 0)
    };
  });
  const total = meals.reduce((s, m) => s + (m.amount || 0), 0);
  return { total, count: meals.length, byBucket, byMealType };
}

async function getTodaySummary(openid) {
  const me = await getUserByOpenid(openid);
  const now = Date.now();
  const dayStart = new Date(now).setHours(0, 0, 0, 0);
  const r = await db.collection('meals')
    .where({ authorId: me.id, eatenAt: _.gte(dayStart).and(_.lte(now)) })
    .get();
  return {
    dateKey: dateKeyOf(now),
    meals: r.data,
    total: r.data.reduce((s, m) => s + (m.amount || 0), 0)
  };
}

/* ---------------- 路由 ---------------- */

const ROUTES = {
  'login': doLogin,
  'me.get': async (o) => getUserByOpenid(o),
  'me.save': async (o, p) => {
    const me = await getUserByOpenid(o);
    const patch = {};
    for (const k of ['nickname', 'bio', 'school', 'avatarUrl', 'region', 'locationAuthorized']) {
      if (k in p.patch) patch[k] = p.patch[k];
    }
    if (p.patch.onboarded) patch.onboarded = true;
    await db.collection('users').where({ id: me.id }).update({ data: patch });
    return getUserByOpenid(o);
  },
  'feed.get': getFeed,
  'random.nearby': randomNearby,
  'meal.detail': getMealDetail,
  'meal.add': addMeal,
  'meal.update': updateMeal,
  'meal.delete': deleteMeal,
  'author.page': getMealsByAuthor,
  'follow.toggle': toggleFollow,
  'follow.list': getFollowingList,
  'wish.list': getWishes,
  'wish.add': addWish,
  'wish.toggleSave': toggleSaveMeal,
  'wish.remove': removeWish,
  'plan.board': getPlanBoard,
  'plan.add': addPlan,
  'plan.cancel': (o, p) => setPlanStatus(o, p, 'cancelled'),
  'plan.complete': (o, p) => setPlanStatus(o, p, 'completed'),
  'calendar.month': getCalendarMonth,
  'stats.get': getStats,
  'today.summary': getTodaySummary,
  'users.list': async (o) => {
    const r = await db.collection('users').limit(100).get();
    return r.data;
  }
};

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action;
  const fn = ROUTES[action];
  if (!fn) return { ok: false, error: 'unknown action: ' + action };
  try {
    const payload = event.payload || {};
    if (action !== 'login' && OPENID) {
      const me = await getUserByOpenid(OPENID);
      if (!me) return { ok: false, error: 'NOT_LOGGED_IN', code: 401 };
    }
    const data = await fn(OPENID, payload);
    return { ok: true, data };
  } catch (e) {
    console.error('[api]', action, e);
    return { ok: false, error: e.message || String(e) };
  }
};
