/**
 * 云端数据层（前端调用模块）
 *
 * 与 utils/store.js 同名同参，但返回 Promise。
 * 页面切换到云端时的用法：
 *   const api = require('../../utils/cloudapi.js');
 *   // onShow 里：
 *   api.getFeed({ mealType, sort, regionName }).then((list) => {
 *     this.setData({ feed: list.map(store.decorateMeal) });  // 装饰逻辑复用 store
 *   });
 *
 * 上线前请在 app.js 的 onLaunch 里调用 cloudapi.init()。
 */
const DEFAULT_ENV = ''; // 运行前通过 setEnv(envId) 配置云开发环境 ID

let ENV = DEFAULT_ENV;

function setEnv(envId) {
  ENV = envId;
}

function init(envId) {
  if (envId) setEnv(envId);
  if (!wx.cloud) {
    console.error('[cloudapi] 基础库过低，请升级微信 / 基础库 >= 2.2.3');
    return;
  }
  wx.cloud.init({
    env: ENV || undefined, // 不填则用默认环境
    traceUser: true
  });
}

function call(action, payload) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'api',
      data: { action, payload: payload || {} }
    })
      .then((res) => {
        const r = res.result || {};
        if (r.ok) {
          resolve(r.data);
        } else if (r.code === 401) {
          // 未登录：静默重新 login 一次再重放
          login()
            .then(() => call(action, payload))
            .then(resolve)
            .catch(reject);
        } else {
          reject(new Error(r.error || '云端错误'));
        }
      })
      .catch(reject);
  });
}

/* ---------------- 登录 / 我 ---------------- */

function login() {
  return call('login');
}

function getMe() {
  return call('me.get');
}

function saveMe(patch) {
  return call('me.save', { patch });
}

function completeOnboarding() {
  return saveMe({ onboarded: true });
}

/* ---------------- 饭流 / 饭记 ---------------- */

function getFeed(opts) {
  return call('feed.get', {
    sort: opts.sort || 'recommend',
    mealType: opts.mealType,
    regionName: opts.regionName,
    limit: opts.limit
  });
}

function randomNearby(opts) {
  return call('random.nearby', opts || {});
}

function getMealById(id) {
  return call('meal.detail', { id });
}

function addMeal(input) {
  return call('meal.add', { input });
}

function updateMeal(id, patch) {
  return call('meal.update', { id, patch });
}

function getMealsByAuthor(authorId) {
  return call('author.page', { authorId });
}

/* ---------------- 跟吃 ---------------- */

function toggleFollow(userId) {
  return call('follow.toggle', { userId });
}

function getFollowingList() {
  return call('follow.list');
}

/* ---------------- 想吃 ---------------- */

function getWishes() {
  return call('wish.list');
}

function addWish(input) {
  return call('wish.add', { input });
}

function toggleSaveMeal(mealId) {
  return call('wish.toggleSave', { mealId });
}

function removeWish(id) {
  return call('wish.remove', { id });
}

/* ---------------- 餐单 ---------------- */

function getPlanBoard() {
  return call('plan.board');
}

function addPlan(input) {
  return call('plan.add', { input });
}

function cancelPlan(id) {
  return call('plan.cancel', { id });
}

function completePlan(id) {
  return call('plan.complete', { id });
}

/* ---------------- 饭历 / 统计 / 今日 ---------------- */

function getCalendarMonth(month) {
  return call('calendar.month', { month }); // 'YYYY-MM'
}

function getStats(period) {
  return call('stats.get', { period }); // 'week' | 'month' | 'year'
}

function getTodaySummary() {
  return call('today.summary');
}

/** 全部用户档案（供饭流作者展示，演示数据 + 真实用户） */
function getUsers() {
  return call('users.list');
}

module.exports = {
  init,
  setEnv,
  call,

  login,
  getMe,
  saveMe,
  completeOnboarding,

  getFeed,
  randomNearby,
  getMealById,
  addMeal,
  updateMeal,
  getMealsByAuthor,

  toggleFollow,
  getFollowingList,

  getWishes,
  addWish,
  toggleSaveMeal,
  removeWish,

  getPlanBoard,
  addPlan,
  cancelPlan,
  completePlan,

  getCalendarMonth,
  getStats,
  getTodaySummary,
  getUsers
};
