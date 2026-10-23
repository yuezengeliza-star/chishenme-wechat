/**
 * 全局数据层（本地假数据版）
 *
 * 设计原则（对应交付说明）：
 *  1. 收藏 = 以后可能想吃 → 进「我的想吃」，不计消费
 *  2. 就吃这个 = 决定近期吃 → 进「我的餐单」，仍是计划，不计消费
 *  3. 我吃了 + 完成记一顿 → 才进饭历与消费统计
 *  4. 饭流 / 饭历 / 消费全部按「实际用餐时间」归档
 *  5. 系统用于匹配的位置 ≠ 对外公开的位置
 *
 * 后续接入真实后端时，只需把这里的方法逐个替换成请求即可，
 * 页面层不需要改动。
 */
const C = require('./constants.js');
const F = require('./format.js');
const { buildSeed } = require('./mock.js');
// 云端调用模块（仅在 initCloud / 写操作上报时用到 wx.cloud；其余逻辑同步，页面调用方式不变）
const cloudapi = require('./cloudapi.js');

const DB_KEY = 'cs_db_v1';
const NEARBY_KM = C.NEARBY_RADIUS_KM;

let db = null;

/* ------------------------------------------------------------------ */
/* 初始化 & 持久化                                                     */
/* ------------------------------------------------------------------ */

function init(force) {
  if (!force) {
    try {
      const cached = wx.getStorageSync(DB_KEY);
      if (cached && cached.meals && cached.meals.length) {
        db = cached;
        return db;
      }
    } catch (e) {
      // ignore
    }
  }
  db = buildSeed();
  flush();
  return db;
}

function flush() {
  try {
    wx.setStorageSync(DB_KEY, db);
  } catch (e) {
    console.error('[store] 写入缓存失败', e);
  }
}

function reset() {
  init(true);
}

/* ================================================================== */
/* 云端同步层（默认开启；云端不可用自动降级到本地种子）                */
/*                                                                    */
/* 设计：读方法（getFeed/getWishes/getPlanBoard/...）逻辑完全不变，    */
/*       仍读内存 db；云端把 raw 文档映射进本地 db 做缓存。            */
/*       写方法本地落库 + 异步上报云端（fire-and-forget）。            */
/*       页面层无需任何改动即可在多用户间共享数据。                    */
/* ================================================================== */

let cloudReady = false;      // 是否已成功登录并拉到云端数据
let cloudMeId = null;        // 云端「我」的真实 id（本地统一用 u_me 标识「我」）
let _syncing = false;
let _lastSyncAt = 0;
let _readyWaiters = [];

function isCloudReady() { return cloudReady; }
function getCloudMeId() { return cloudMeId; }
function onCloudReady(cb) {
  if (cloudReady) { try { cb(); } catch (e) {} }
  else _readyWaiters.push(cb);
}

function normalizeMeal(m) {
  return Object.assign({}, m, {
    location: m.location || { displayMode: 'hidden', provided: false },
    imageUrls: m.imageUrls || []
  });
}

/** 把云端 raw 快照映射进本地 db（保持 store 业务逻辑不变） */
function applyCloudSnapshot(snap) {
  try {
    // 1) 我的档案：保留本地 id 'u_me'，同步云端字段
    if (snap && snap.me) {
      const m = snap.me;
      const me = db.me;
      me.nickname = m.nickname || me.nickname;
      me.bio = m.bio || '';
      me.school = m.school || '';
      me.avatarUrl = m.avatarUrl || '';
      me.region = m.region || me.region;
      me.regionKey = m.regionKey || me.regionKey;
      me.locationAuthorized = !!m.locationAuthorized;
      me.followEatUserIds = Array.isArray(m.followEatUserIds) ? m.followEatUserIds.slice() : [];
      me.onboarded = !!m.onboarded;
      me.recordCount = m.recordCount || me.recordCount;
    }

    // 2) 用户档案（他人），排除云端「我」的 id（避免与 db.me 重复）
    if (snap && Array.isArray(snap.users)) {
      db.users = snap.users.filter((u) => u.id !== cloudMeId);
    }

    // 3) 饭记：社区（他人 public/nearby）+ 我的（authorId 统一映射为 u_me）
    //已删除的（云端软删除 deletedAt，或 visibility='deleted'）在这里统一拦掉，
    // 否则会从「我的饭历/统计」里复活，同一顿又出现。
    const meals = [];
    const alive = (m) => m && !m.deletedAt && m.visibility !== 'deleted';
    if (snap && Array.isArray(snap.community)) {
      snap.community.forEach((m) => {
        if (!alive(m)) return;
        if (m.authorId === cloudMeId) return; // 我的饭记走 myMeals 分支
        meals.push(normalizeMeal(m));
      });
    }
    if (snap && Array.isArray(snap.myMeals)) {
      snap.myMeals.forEach((m) => {
        if (!alive(m)) return;
        const x = normalizeMeal(m);
        x.authorId = 'u_me'; // 本地「我」统一标识
        meals.push(x);
      });
    }
    if (meals.length) db.meals = meals;

    // 4) 想吃：云端用 done 字段，本地用 status
    if (snap && Array.isArray(snap.wishes)) {
      db.wishes = snap.wishes.map((w) =>
        Object.assign({}, w, { status: w.status || (w.done ? 'done' : 'want') })
      );
    }

    // 5) 餐单
    if (snap && Array.isArray(snap.plans)) {
      db.plans = snap.plans.slice();
    }

    flush();
  } catch (e) {
    console.error('[store] 云端快照映射失败，保留本地', e);
  }
}

function snapshotFromCloud() {
  return Promise.all([
    cloudapi.getFeed({ mealType: 'all', sort: 'recommend', limit: 60 }).catch(() => []),
    (cloudMeId ? cloudapi.getMealsByAuthor(cloudMeId) : Promise.resolve(null)).then((r) => (r && r.meals) || []),
    cloudapi.getWishes().catch(() => []),
    cloudapi.getPlanBoard().catch(() => []),
    cloudapi.getUsers().catch(() => [])
  ]).then(([community, myMeals, wishes, plans, users]) => ({
    community: community || [],
    myMeals: myMeals || [],
    wishes: wishes || [],
    plans: plans || [],
    users: users || []
  }));
}

function syncFromCloud() {
  if (!cloudReady || _syncing) return Promise.resolve(false);
  const now = Date.now();
  if (now - _lastSyncAt < 15000) return Promise.resolve(false); // 节流 15s
  _syncing = true;
  _lastSyncAt = now;
  return snapshotFromCloud()
    .then((snap) => { applyCloudSnapshot(snap); return true; })
    .catch((e) => { console.error('[store] 同步失败，保留本地', e); return false; })
    .then((ok) => { _syncing = false; return ok; });
}

function initCloud() {
  try {
    cloudapi.init();
  } catch (e) {
    console.warn('[store] 云初始化跳过（将使用本地数据）', e);
    return;
  }
  cloudapi.login()
    .then((res) => {
      const data = res || {};
      const me = data.me || null;
      cloudMeId = me ? me.id : null;
      cloudReady = true;
      applyCloudSnapshot({ me }); // 先应用我的档案
      return syncFromCloud().then(() => {
        const waiters = _readyWaiters;
        _readyWaiters = [];
        waiters.forEach((cb) => { try { cb(); } catch (e) {} });
      });
    })
    .catch((e) => {
      cloudReady = false;
      console.warn('[store] 云端登录失败，使用本地数据', e);
    });
}

/** 写操作上报（fire-and-forget，失败不影响本地）。idKey 用于把本地 id 映射成云端 id */
function report(action, payload, idKey) {
  if (!cloudReady) return;
  let p = payload;
  if (idKey && payload && payload[idKey] != null && _idMap[payload[idKey]]) {
    p = Object.assign({}, payload, { [idKey]: _idMap[payload[idKey]] });
  }
  try {
    cloudapi.call(action, p).catch((e) => console.warn('[store] 上报失败', action, e));
  } catch (e) {
    // ignore
  }
}

/** 写后把本地对象 id 替换为云端 id（避免与后续云同步重复） */
function adoptCloudId(localRef, promise) {
  if (!promise) return;
  promise.then((doc) => {
    if (localRef && doc && doc.id) {
      localRef.id = doc.id;
      if (doc.createdAt) localRef.createdAt = doc.createdAt;
      flush();
    }
  }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* 视图模型装饰：WXML 不做逻辑，全部在这里算好                          */
/* ------------------------------------------------------------------ */

function decorateUser(user) {
  if (!user) return null;
  const c = F.avatarColors(user.avatarEmoji || user.id);
  const lv = F.levelOf(user.recordCount);
  return Object.assign({}, user, {
    avatarText: F.avatarText(user.nickname),
    // 头像三种形态：上传图片 > 柴犬预设 Emoji > 昵称首字
    hasAvatarImage: !!user.avatarUrl,
    avatarDisplay: user.avatarUrl ? '' : (user.avatarEmoji || F.avatarText(user.nickname)),
    avatarColor1: c[0],
    avatarColor2: c[1],
    level: lv.level,
    levelName: lv.name,
    levelText: `Lv.${lv.level} · ${lv.name}`
  });
}

function decorateWish(w) {
  const c = F.avatarColors(w.name);
  // 收藏来源的作者昵称（用于「收藏自 @某某」）
  let sourceAuthor = '';
  if (w.sourceType === 'savedMeal' && w.sourceMealId) {
    const m = db.meals.find((x) => x.id === w.sourceMealId);
    const u = m ? getUserRaw(m.authorId) : null;
    sourceAuthor = u ? u.nickname : '';
  }
  return Object.assign({}, w, {
    emoji: F.foodEmoji(w.name),
    grad1: c[0],
    grad2: c[1],
    amountText: w.expectedAmount ? '约 ' + F.money(w.expectedAmount) : '',
    sourceAuthor,
    sourceText:
      w.sourceType === 'savedMeal'
        ? sourceAuthor
          ? `收藏自 @${sourceAuthor}`
          : '收藏自别人的饭记'
        : '自己添加'
  });
}

/**
 * 饭记 → 饭卡视图模型
 * 卡片只带 5 项信息：图片/饭名/金额/作者/实际用餐时间
 */
function decorateMeal(meal) {
  if (!meal) return null;
  const author = decorateUser(db.users.concat([db.me]).find((u) => u.id === meal.authorId));
  const c = F.avatarColors(meal.name);
  const hasImg = !!(meal.imageUrls && meal.imageUrls.length);
  const loc = meal.location || {};
  const dayLabel = F.dayLabel(meal.eatenAt);
  const shortTime = F.shortTime(meal.eatenAt);
  return Object.assign({}, meal, {
    author,
    authorName: author ? author.nickname : '匿名',
    emoji: F.foodEmoji(meal.name),
    grad1: c[0],
    grad2: c[1],
    hasImage: hasImg,
    cover: hasImg ? meal.imageUrls[0] : '',
    amountText: meal.amountUnknown || meal.amount === null || meal.amount === undefined
      ? '未记金额'
      : F.money(meal.amount),
    amountKnown: !meal.amountUnknown && meal.amount !== null && meal.amount !== undefined,
    timeLabel: F.mealTimeLabel(meal.eatenAt),
    dayLabel,
    shortTime,
    // 饭卡时间：今天只显示时刻，跨天补上「昨天 / 10月6日」
    cardTime: dayLabel === '今天' ? shortTime : dayLabel + ' ' + shortTime,
    dateKey: F.dateKey(meal.eatenAt),
    mealTypeLabel: mealTypeLabel(meal.mealType),
    // 位置对外展示：exact → 具体地点 / fuzzy → 模糊区域 / hidden → 不展示
    placeText: loc.displayMode === 'exact'
      ? (loc.placeName || loc.areaName || '')
      : loc.displayMode === 'fuzzy'
        ? (loc.areaName || '附近')
        : '',
    distanceText: loc.distanceKm === null || loc.distanceKm === undefined ? '' : F.distanceLabel(loc.distanceKm),
    isMine: meal.authorId === 'u_me',
    moodVisible: meal.moodVisibility === 'public' || meal.authorId === 'u_me'
  });
}

function mealTypeLabel(key) {
  const t = C.MEAL_TYPES.find((x) => x.key === key);
  return t ? t.label : '';
}

function mealTypeEmoji(key) {
  const t = C.MEAL_TYPES.find((x) => x.key === key);
  return t ? t.emoji : '🍽️';
}

/* ------------------------------------------------------------------ */
/* 用户                                                                */
/* ------------------------------------------------------------------ */

function getMe() {
  return getUser('u_me');
}

function getRawMe() {
  return db.me;
}

function saveMe(patch) {
  Object.assign(db.me, patch);
  flush();
  report('me.save', { patch });
  return getMe();
}

function completeOnboarding() {
  db.me.onboarded = true;
  flush();
  report('me.save', { patch: { onboarded: true } });
}

function hasOnboarded() {
  return !!db.me.onboarded;
}

function getUser(id) {
  const u = getUserRaw(id);
  if (!u) return null;
  const decorated = decorateUser(u);
  if (id === 'u_me') {
    // 我自己的真实饭记数：以实际记录为准，保证等级会随记录增长
    const count = myMeals().length;
    const lv = F.levelOf(count);
    decorated.recordCount = count;
    decorated.level = lv.level;
    decorated.levelName = lv.name;
    decorated.levelText = `Lv.${lv.level} · ${lv.name}`;
  }
  return decorated;
}

function getUserRaw(id) {
  if (id === 'u_me') return db.me;
  return db.users.find((u) => u.id === id) || null;
}

/* ------------------------------------------------------------------ */
/* 收藏 / 跟吃                                                         */
/* ------------------------------------------------------------------ */

function isFollowing(userId) {
  return db.me.followEatUserIds.indexOf(userId) > -1;
}

function toggleFollow(userId) {
  const list = db.me.followEatUserIds;
  const i = list.indexOf(userId);
  if (i > -1) {
    list.splice(i, 1);
  } else {
    list.push(userId);
  }
  flush();
  report('follow.toggle', { userId });
  return i === -1;
}

function getFollowingList() {
  return db.me.followEatUserIds.map((id) => {
    const u = getUser(id);
    if (!u) return null;
    // 「今天最近一顿公开饭记」
    const recent = db.meals
      .filter((m) => m.authorId === id && m.visibility === 'public')
      .sort((a, b) => b.eatenAt - a.eatenAt)[0];
    u.todayMeal = recent
      ? {
          text: `${F.dayLabel(recent.eatenAt)}${F.dayLabel(recent.eatenAt) === '今天' ? mealTypeLabel(recent.mealType) : ''}：${recent.name}`,
          name: recent.name,
          tone: F.dayLabel(recent.eatenAt) === '今天' ? 'primary' : 'muted'
        }
      : { text: '今天还没记录', name: '', tone: 'muted' };
    return u;
  }).filter(Boolean);
}

function isWished(mealId) {
  return db.wishes.some((w) => w.sourceMealId === mealId);
}

/* ------------------------------------------------------------------ */
/* 饭记                                                                */
/* ------------------------------------------------------------------ */

function myMeals() {
  return db.meals.filter((m) => m.authorId === 'u_me');
}

/** 我可见的全部饭记（含他人公开/附近、我的全部） */
function visibleMeals() {
  return db.meals.filter((m) => {
    if (m.authorId === 'u_me') return true;
    return m.visibility === 'public' || m.visibility === 'nearby';
  });
}

function sortFeed(list, sort, currentType) {
  const arr = list.slice();
  if (sort === 'latest') {
    return arr.sort((a, b) => b.eatenAt - a.eatenAt);
  }
  if (sort === 'eat') {
    return arr.sort((a, b) => {
      if (b.eatCount !== a.eatCount) return b.eatCount - a.eatCount;
      return b.eatenAt - a.eatenAt;
    });
  }
  // 推荐：当前餐次 > 约 3km 距离 > 新鲜度 > 就吃这个次数
  const now = Date.now();
  return arr.sort((a, b) => score(b, now, currentType) - score(a, now, currentType));
}

function score(m, now, currentType) {
  let s = 0;
  if (m.mealType === currentType) s += 10000;

  const d = m.location ? m.location.distanceKm : null;
  if (d !== null && d !== undefined && d <= NEARBY_KM) {
    s += 3000 - Math.round(d * 300);
  }

  const hoursAgo = (now - m.eatenAt) / 3600000;
  s += Math.max(0, 2000 - Math.round(hoursAgo * 120));

  s += Math.min(m.eatCount || 0, 30) * 30;
  return s;
}

/**
 * 首页饭流
 * @param {object} opts { mealType, sort, windowHours }
 *
 * 只保留实时有效窗口内的饭记（默认 36 小时，见 constants.FEED_WINDOW_HOURS），
 * 避免几十天前的旧饭记混进「附近正在吃」。
 */
function getFeed(opts) {
  const o = opts || {};
  const sort = o.sort || 'recommend';
  const windowHours =
    o.windowHours === undefined ? C.FEED_WINDOW_HOURS : o.windowHours;
  const earliest = windowHours > 0 ? Date.now() - windowHours * 3600000 : 0;

  // 「完全不提供位置」的饭记不进入基于距离的附近推荐
  let list = visibleMeals().filter(
    (m) => !(sort === 'recommend' && m.location && m.location.provided === false)
  );
  if (earliest) {
    list = list.filter((m) => m.eatenAt >= earliest && m.eatenAt <= Date.now());
  }
  if (o.mealType) {
    list = list.filter((m) => m.mealType === o.mealType);
  }
  return sortFeed(list, sort, o.mealType || F.currentMealType()).map(decorateMeal);
}

/** 他人的饭流（作者主页用） */
function getMealsByAuthor(authorId, opts) {
  const o = opts || {};
  let list = db.meals.filter((m) => m.authorId === authorId);
  if (authorId !== 'u_me') {
    list = list.filter((m) => m.visibility === 'public');
  }
  if (o.mealType) list = list.filter((m) => m.mealType === o.mealType);
  if (o.dateKey) list = list.filter((m) => F.dateKey(m.eatenAt) === o.dateKey);
  list.sort((a, b) => b.eatenAt - a.eatenAt);
  return list.map(decorateMeal);
}

function getMealById(id) {
  const m = db.meals.find((x) => x.id === id);
  return m ? decorateMeal(m) : null;
}

function getRawMealById(id) {
  return db.meals.find((x) => x.id === id) || null;
}

/**
 * 新增饭记
 * @returns 新增的饭记（已装饰）
 */
function addMeal(input) {
  const now = Date.now();
  const meal = {
    id: 'm_new_' + now,
    authorId: 'u_me',
    mealType: input.mealType,
    eatenAt: input.eatenAt || now,
    name: (input.name || '').trim(),
    amount: input.amountUnknown ? null : Number(input.amount),
    amountUnknown: !!input.amountUnknown,
    imageUrls: input.imageUrls || [],
    moodText: (input.moodText || '').trim(),
    moodVisibility: input.moodVisibility || 'public',
    visibility: input.visibility || 'public',
    location: input.location || { placeName: '', areaName: '', displayMode: 'hidden', distanceKm: null, provided: false },
    eatCount: 0,
    createdAt: now
  };
  db.meals.push(meal);
  flush();
  // ⚠️ 只写云端一次。
  // 旧代码这里既 report('meal.add') 又 cloudapi.addMeal()，是同一个接口调两遍，
  // 导致同一条饭记在云端落了两份（首页饭流里出现两条一样的）。
  // 现在只用 cloudapi.addMeal()，它的返回值还能用来 adoptCloudId。
  adoptCloudId(meal, cloudReady ? cloudapi.addMeal(input).catch(() => null) : null);
  return decorateMeal(meal);
}

/** 删除饭记（仅限自己的）。云端用软删除，避免前端缓存里残留 */
function deleteMeal(id) {
  const i = db.meals.findIndex((x) => x.id === id);
  if (i === -1) return false;
  const m = db.meals[i];
  if (m.authorId !== 'u_me') return false; // 别人的饭记不可删
  db.meals.splice(i, 1);
  // 关联清理：把这条饭记收藏的「想吃」也去掉，避免详情页悬空
  db.wishes = db.wishes.filter((w) => w.sourceMealId !== id);
  flush();
  report('meal.delete', { id: id }, 'id');
  return true;
}

function updateMeal(id, patch) {
  const m = db.meals.find((x) => x.id === id);
  if (!m) return null;
  Object.assign(m, patch);
  flush();
  report('meal.update', { id: id, patch: patch });
  return decorateMeal(m);
}

/* ------------------------------------------------------------------ */
/* 我的想吃                                                            */
/* ------------------------------------------------------------------ */

function getWishes() {
  return db.wishes
    .filter((w) => w.status === 'want')
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(decorateWish);
}

function addWish(input) {
  const w = {
    id: 'w_' + Date.now(),
    userId: 'u_me',
    sourceType: input.sourceMealId ? 'savedMeal' : 'manual',
    sourceMealId: input.sourceMealId || '',
    name: (input.name || '').trim(),
    placeName: input.placeName || '',
    areaName: input.areaName || '',
    expectedAmount: input.expectedAmount === '' || input.expectedAmount === undefined ? null : Number(input.expectedAmount),
    imageUrl: input.imageUrl || '',
    note: input.note || '',
    status: 'want',
    createdAt: Date.now()
  };
  db.wishes.unshift(w);
  flush();
  report('wish.add', {
    input: {
      name: w.name,
      expectedAmount: w.expectedAmount,
      note: w.note,
      sourceType: w.sourceType,
      sourceMealId: w.sourceMealId
    }
  });
  adoptCloudId(w, cloudReady ? cloudapi.addWish({ input: { name: w.name, expectedAmount: w.expectedAmount, note: w.note, sourceType: w.sourceType, sourceMealId: w.sourceMealId } }).catch(() => null) : null);
  return decorateWish(w);
}

/** 收藏 / 取消收藏一条饭记 */
function toggleSaveMeal(mealId) {
  const i = db.wishes.findIndex((w) => w.sourceMealId === mealId);
  if (i > -1) {
    db.wishes.splice(i, 1);
    flush();
    report('wish.toggleSave', { mealId });
    return false;
  }
  const meal = db.meals.find((m) => m.id === mealId);
  if (!meal) return false;
  // 收藏 = 进「我的想吃」；云端走「就吃这个」接口（作者 eatCount +1）
  const w = {
    id: 'w_' + Date.now(),
    userId: 'u_me',
    sourceType: 'savedMeal',
    sourceMealId: mealId,
    name: meal.name,
    placeName: meal.location ? meal.location.placeName : '',
    areaName: meal.location ? meal.location.areaName : '',
    expectedAmount: meal.amount,
    imageUrl: '',
    note: '',
    status: 'want',
    createdAt: Date.now()
  };
  db.wishes.unshift(w);
  flush();
  report('wish.toggleSave', { mealId });
  adoptCloudId(w, cloudReady ? cloudapi.toggleSaveMeal(mealId).then((r) => (r && r.wish) || null).catch(() => null) : null);
  return true;
}

function removeWish(id) {
  db.wishes = db.wishes.filter((w) => w.id !== id);
  flush();
  report('wish.remove', { id: id }, 'id');
}

/* ------------------------------------------------------------------ */
/* 我的餐单                                                            */
/* ------------------------------------------------------------------ */

function getPlans(dateKey) {
  return db.plans
    .filter((p) => p.date === dateKey && p.status !== 'cancelled')
    .map((p) => Object.assign({}, p, { mealTypeLabel: mealTypeLabel(p.mealType) }));
}

/** 今天 / 明天的三餐餐位 */
function getPlanBoard() {
  const today = F.todayKey(0);
  const tomorrow = F.todayKey(1);
  return [
    { key: today, label: '今天', dateText: dateText(today), slots: buildSlots(today) },
    { key: tomorrow, label: '明天', dateText: dateText(tomorrow), slots: buildSlots(tomorrow) }
  ];
}

function dateText(key) {
  const parts = key.split('-');
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

function buildSlots(dateKey) {
  return C.MEAL_TYPES.map((t) => {
    const plan = db.plans.find((p) => p.date === dateKey && p.mealType === t.key && p.status !== 'cancelled');
    // 「已吃」的餐位要关联到真实饭记
    let meal = null;
    if (plan && plan.status === 'completed') {
      meal = db.meals.find(
        (m) => m.authorId === 'u_me' && m.mealType === t.key && F.dateKey(m.eatenAt) === dateKey
      );
    }
    const c = F.avatarColors(plan ? plan.name : t.key);
    return {
      mealType: t.key,
      mealTypeLabel: t.label,
      emoji: t.emoji,
      hasPlan: !!plan,
      planId: plan ? plan.id : '',
      name: plan ? plan.name : '',
      status: plan ? plan.status : 'none',
      statusLabel: plan ? C.PLAN_STATUS[plan.status] : '未安排',
      sourceType: plan ? plan.sourceType : '',
      sourceText: plan && plan.sourceType === 'meal' && plan.sourceUserName ? `来自 @${plan.sourceUserName}` : plan && plan.sourceType === 'wish' ? '来自我的想吃' : '',
      referenceAmountText: plan && plan.referenceAmount ? '约 ' + F.money(plan.referenceAmount) : '',
      mealId: meal ? meal.id : '',
      grad1: c[0],
      grad2: c[1],
      foodEmoji: F.foodEmoji(plan ? plan.name : '')
    };
  });
}

function addPlan(input) {
  const date = input.date || F.todayKey(0);
  const exist = db.plans.find(
    (p) => p.date === date && p.mealType === input.mealType && p.status !== 'cancelled'
  );
  let fresh = null;
  if (exist) {
    Object.assign(exist, {
      name: input.name,
      referenceAmount: input.referenceAmount || null,
      sourceType: input.sourceType || 'manual',
      sourceId: input.sourceId || '',
      sourceUserName: input.sourceUserName || '',
      status: 'planned'
    });
  } else {
    fresh = {
      id: 'p_' + Date.now(),
      userId: 'u_me',
      date,
      mealType: input.mealType,
      sourceType: input.sourceType || 'manual',
      sourceId: input.sourceId || '',
      sourceUserName: input.sourceUserName || '',
      name: input.name,
      referenceAmount: input.referenceAmount || null,
      status: 'planned',
      createdAt: Date.now()
    };
    db.plans.push(fresh);
  }
  flush();
  // 仅新建时上报云端；更新场景以云端同步结果为准
  if (fresh) {
    report('plan.add', { input: input });
    adoptCloudId(fresh, cloudReady ? cloudapi.addPlan({ input: input }).catch(() => null) : null);
  }
}

function cancelPlan(planId) {
  const p = db.plans.find((x) => x.id === planId);
  if (p) {
    p.status = 'cancelled';
    flush();
    report('plan.cancel', { id: planId }, 'id');
  }
}

function completePlan(planId) {
  const p = db.plans.find((x) => x.id === planId);
  if (p) {
    p.status = 'completed';
    flush();
    report('plan.complete', { id: planId }, 'id');
  }
}

/* ------------------------------------------------------------------ */
/* 我的饭历                                                            */
/* ------------------------------------------------------------------ */

/** 某月所有「真实吃过」的饭记，按日期分组 */
function getCalendarMonth(year, month) {
  const prefix = `${year}-${F.pad(month)}`;
  const list = db.meals
    .filter((m) => m.authorId === 'u_me' && F.dateKey(m.eatenAt).indexOf(prefix) === 0)
    .sort((a, b) => a.eatenAt - b.eatenAt);

  const byDay = {};
  let total = 0;
  let count = 0;
  list.forEach((m) => {
    const k = F.dateKey(m.eatenAt);
    if (!byDay[k]) byDay[k] = { dateKey: k, meals: [], total: 0, count: 0, hasAmountUnknown: false };
    byDay[k].meals.push(decorateMeal(m));
    byDay[k].count += 1;
    count += 1;
    if (m.amount !== null && m.amount !== undefined && !m.amountUnknown) {
      byDay[k].total += Number(m.amount);
      total += Number(m.amount);
    } else {
      byDay[k].hasAmountUnknown = true;
    }
  });

  Object.keys(byDay).forEach((k) => {
    byDay[k].totalText = F.money(byDay[k].total);
    byDay[k].byType = C.MEAL_TYPES.map((t) => {
      const m = byDay[k].meals.find((x) => x.mealType === t.key);
      return { label: t.label, emoji: t.emoji, meal: m || null };
    });
  });

  return { byDay, total, count, totalText: F.money(total) };
}

/* ------------------------------------------------------------------ */
/* 消费统计                                                            */
/* ------------------------------------------------------------------ */

function statsRange(period) {
  const now = new Date();
  let from;
  let label;
  if (period === 'week') {
    const day = now.getDay() === 0 ? 7 : now.getDay();
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1, 0, 0, 0, 0);
    label = '本周';
  } else if (period === 'year') {
    from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    label = now.getFullYear() + '年';
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    label = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  }
  return { from: from.getTime(), to: Date.now() + 1, label };
}

function getStats(period) {
  const key = period || 'month';
  const range = statsRange(key);
  const list = db.meals.filter(
    (m) =>
      m.authorId === 'u_me' &&
      m.eatenAt >= range.from &&
      m.eatenAt < range.to &&
      m.amount !== null &&
      m.amount !== undefined &&
      !m.amountUnknown
  );

  let total = 0;
  const buckets = {};
  const byType = { breakfast: 0, lunch: 0, dinner: 0 };
  const typeCount = { breakfast: 0, lunch: 0, dinner: 0 };

  list.forEach((m) => {
    const amt = Number(m.amount);
    total += amt;
    byType[m.mealType] += amt;
    typeCount[m.mealType] += 1;

    let bucketKey;
    if (key === 'year') {
      bucketKey = String(new Date(m.eatenAt).getMonth() + 1);
    } else if (key === 'month') {
      bucketKey = String(new Date(m.eatenAt).getDate());
    } else {
      bucketKey = ['一', '二', '三', '四', '五', '六', '日'][new Date(m.eatenAt).getDay() === 0 ? 6 : new Date(m.eatenAt).getDay() - 1];
    }
    if (!buckets[bucketKey]) buckets[bucketKey] = { label: bucketKey, value: 0, count: 0 };
    buckets[bucketKey].value += amt;
    buckets[bucketKey].count += 1;
  });

  // 按维度排序并补齐空桶
  const trend = buildTrend(key, buckets, range);
  const maxValue = trend.reduce((m, x) => Math.max(m, x.value), 0);

  const types = C.MEAL_TYPES.map((t) => ({
    key: t.key,
    label: t.label,
    emoji: t.emoji,
    value: Math.round(byType[t.key] * 100) / 100,
    valueText: F.money(Math.round(byType[t.key] * 100) / 100),
    count: typeCount[t.key],
    percent: total > 0 ? Math.round((byType[t.key] / total) * 100) : 0
  }));

  return {
    period: key,
    label: range.label,
    total: Math.round(total * 100) / 100,
    totalText: F.money(Math.round(total * 100) / 100),
    count: list.length,
    avgText: list.length ? F.money(Math.round((total / list.length) * 100) / 100) : F.money(0),
    trend: trend.map((x) => Object.assign({}, x, { percent: maxValue > 0 ? Math.round((x.value / maxValue) * 100) : 0 })),
    types,
    maxValue,
    hasData: list.length > 0
  };
}

function buildTrend(key, buckets, range) {
  const out = [];
  const now = new Date();

  if (key === 'week') {
    const labels = ['一', '二', '三', '四', '五', '六', '日'];
    const day = now.getDay() === 0 ? 7 : now.getDay();
    for (let i = 0; i < day; i++) {
      const b = buckets[labels[i]] || { value: 0, count: 0 };
      out.push({ label: labels[i], value: b.value, count: b.count });
    }
  } else if (key === 'month') {
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const today = now.getDate();
    for (let i = 1; i <= today; i++) {
      const b = buckets[String(i)] || { value: 0, count: 0 };
      // 刻度只标 1 号、整五日和今天，避免 30 个标签挤在一起
      out.push({ label: i === 1 || i % 5 === 0 || i === today ? String(i) : '', value: b.value, count: b.count });
    }
    void days;
  } else {
    for (let i = 1; i <= 12; i++) {
      const b = buckets[String(i)] || { value: 0, count: 0 };
      out.push({ label: i + '月', value: b.value, count: b.count });
    }
  }
  return out;
}

/** 「我的」页今日状态 */
function getTodaySummary() {
  const key = F.todayKey(0);
  const list = db.meals.filter((m) => m.authorId === 'u_me' && F.dateKey(m.eatenAt) === key);
  let total = 0;
  list.forEach((m) => {
    if (m.amount !== null && m.amount !== undefined && !m.amountUnknown) total += Number(m.amount);
  });
  const types = list.map((m) => m.mealType);
  const pending = C.MEAL_TYPES.filter((t) => types.indexOf(t.key) === -1).map((t) => t.label);

  // 今天三餐的轻量状态卡
  const slots = C.MEAL_TYPES.map((t) => {
    const m = list.filter((x) => x.mealType === t.key).sort((a, b) => b.eatenAt - a.eatenAt)[0];
    const d = m ? decorateMeal(m) : null;
    return {
      mealType: t.key,
      label: t.label,
      emoji: t.emoji,
      recorded: !!d,
      name: d ? d.name : '还没记',
      amountText: d ? (d.amountKnown ? d.amountText : '未记金额') : ''
    };
  });

  const monthStats = getStats('month');

  return {
    count: list.length,
    total,
    totalText: F.money(total),
    pendingText: pending.length ? pending.join(' / ') + '还没记' : '今天三餐都记好啦',
    slots,
    monthTotalText: monthStats.totalText,
    level: getUser('u_me')
  };
}

/* ------------------------------------------------------------------ */
/* 随机帮我选                                                          */
/* ------------------------------------------------------------------ */

let recentRandom = [];

function randomNearby(mealType) {
  const type = mealType || F.currentMealType();
  const nearestPool = (hours) =>
    visibleMeals().filter(
      (m) =>
        m.mealType === type &&
        m.location &&
        m.location.provided !== false &&
        m.location.distanceKm !== null &&
        m.location.distanceKm !== undefined &&
        m.location.distanceKm <= NEARBY_KM &&
        m.authorId !== 'u_me' &&
        m.eatenAt <= Date.now() &&
        m.eatenAt >= Date.now() - hours * 3600000
    );

  // 优先「今天大家正在吃」；今天这个餐次还没人记时，退回到最近 36 小时
  let pool = nearestPool(24);
  if (!pool.length) pool = nearestPool(C.FEED_WINDOW_HOURS);
  if (!pool.length) return null;

  const fresh = pool.filter((m) => recentRandom.indexOf(m.id) === -1);
  const use = fresh.length ? fresh : pool;
  const picked = use[Math.floor(Math.random() * use.length)];
  recentRandom.push(picked.id);
  if (recentRandom.length > 5) recentRandom.shift();
  return decorateMeal(picked);
}

function randomWish() {
  const list = db.wishes.filter((w) => w.status === 'want');
  if (!list.length) return null;
  const fresh = list.filter((w) => recentRandom.indexOf(w.id) === -1);
  const use = fresh.length ? fresh : list;
  const picked = use[Math.floor(Math.random() * use.length)];
  recentRandom.push(picked.id);
  if (recentRandom.length > 5) recentRandom.shift();
  return decorateWish(picked);
}

/* ------------------------------------------------------------------ */
/* 导出                                                                */
/* ------------------------------------------------------------------ */

module.exports = {
  init,
  reset,
  flush,

  getMe,
  getRawMe,
  saveMe,
  completeOnboarding,
  hasOnboarded,
  getUser,
  getUserRaw,

  isFollowing,
  toggleFollow,
  getFollowingList,
  isWished,

  getFeed,
  getMealsByAuthor,
  getMealById,
  getRawMealById,
  addMeal,
  updateMeal,
  deleteMeal,

  getWishes,
  addWish,
  toggleSaveMeal,
  removeWish,

  getPlans,
  getPlanBoard,
  addPlan,
  cancelPlan,
  completePlan,

  getCalendarMonth,
  getStats,
  getTodaySummary,

  randomNearby,
  randomWish,

  // 云端同步层（默认开启；失败自动降级本地）
  initCloud,
  syncFromCloud,
  isCloudReady,
  getCloudMeId,
  onCloudReady,

  decorateMeal,
  decorateWish,
  mealTypeLabel,
  mealTypeEmoji
};
