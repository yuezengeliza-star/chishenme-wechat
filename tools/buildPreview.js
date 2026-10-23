/**
 * 界面预览页生成器
 * 用法：node tools/buildPreview.js
 *
 * 直接复用小程序的数据层（utils/store.js）算出真实内容，再渲染成一个自包含的 HTML：
 * preview/index.html —— 用手机框把关键页面并排还原出来，
 * 方便在不打开微信开发者工具的情况下先审一遍视觉与信息结构。
 *
 * 数据层或样式改动后重新跑一次即可。
 */
const fs = require('fs');
const path = require('path');

/* ---------------- 模拟微信运行环境 ---------------- */
const memory = {};
global.wx = {
  getStorageSync: (k) => (k in memory ? memory[k] : ''),
  setStorageSync: (k, v) => {
    memory[k] = JSON.parse(JSON.stringify(v));
  },
  removeStorageSync: (k) => {
    delete memory[k];
  }
};

const root = path.join(__dirname, '..');
const store = require(path.join(root, 'utils', 'store.js'));
const C = require(path.join(root, 'utils', 'constants.js'));
const F = require(path.join(root, 'utils', 'format.js'));

store.init();
store.completeOnboarding();

/* ---------------- 小工具 ---------------- */
const esc = (s) =>
  String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const grad = (m) => `background:linear-gradient(150deg,${m.grad1} 0%,${m.grad2} 100%)`;
const avatarGrad = (u) => `background:linear-gradient(140deg,${u.avatarColor1} 0%,${u.avatarColor2} 100%)`;

function avatar(u, cls) {
  if (!u) return '';
  const inner = u.hasAvatarImage
    ? `<img class="ava-img" src="${esc(u.avatarUrl)}" alt="">`
    : esc(u.avatarDisplay);
  return `<div class="ava ${cls || ''}" style="${avatarGrad(u)}">${inner}</div>`;
}

function mealCard(m, mode) {
  const media = m.hasImage
    ? `<img class="mc-media-img" src="${esc(m.cover)}" alt="">`
    : `<div class="mc-media-ph" style="${grad(m)}"><span>${esc(m.emoji)}</span></div>`;
  const foot =
    mode === 'author'
      ? `<div class="mc-foot"><span class="mc-time">${esc(m.dayLabel)}</span></div>`
      : `<div class="mc-foot">${avatar(m.author, 'ava-xs')}<span class="mc-author">${esc(m.authorName)}</span><span class="mc-sep">·</span><span class="mc-time">${esc(m.cardTime)}</span></div>`;
  return `<div class="mc">
    <div class="mc-media">${media}</div>
    <div class="mc-body">
      <div class="mc-name">${esc(m.name)}</div>
      <div class="mc-amount ${m.amountKnown ? '' : 'mc-amount--none'}">${esc(m.amountText)}</div>
      ${foot}
    </div>
  </div>`;
}

function navbar(title, opts) {
  const o = opts || {};
  return `<div class="navbar">
    <div class="nav-left">${o.left || ''}</div>
    <div class="nav-title">${esc(title)}</div>
    <div class="nav-right">${o.right || ''}</div>
  </div>`;
}

const STATUS_BAR = `<div class="statusbar"><span class="sb-time">9:41</span><span class="sb-icons">●●●● ▮</span></div><div class="capsule"><span>···</span><i></i></div>`;

const TABBAR = (active) => {
  const tabs = [
    { key: 'home', label: '首页', icon: 'home' },
    { key: 'record', label: '记一顿', icon: 'fab' },
    { key: 'mine', label: '我的', icon: 'user' }
  ];
  return `<div class="tabbar">
    ${tabs
      .map((t) => {
        if (t.icon === 'fab') {
          return `<div class="tab tab-center"><div class="fab"><i></i></div><div class="tab-label tab-label--fab">${t.label}</div></div>`;
        }
        return `<div class="tab ${active === t.key ? 'tab--on' : ''}">
          <div class="tab-icon tab-icon--${t.icon} ${active === t.key ? 'is-on' : ''}"></div>
          <div class="tab-label">${t.label}</div>
        </div>`;
      })
      .join('')}
  </div>`;
};

function frame(id, num, title, subtitle, body, opts) {
  const o = opts || {};
  return `<figure class="phone-wrap" id="${id}">
    <div class="phone">
      ${STATUS_BAR}
      ${o.nav === false ? '' : navbar(o.navTitle || title, o.navOpts)}
      <div class="screen ${o.tab ? 'screen--tab' : ''}">${body}</div>
      ${o.tab ? TABBAR(o.tab) : ''}
    </div>
    <figcaption>
      <span class="cap-num">${num}</span>
      <span class="cap-title">${esc(title)}</span>
      <span class="cap-sub">${esc(subtitle)}</span>
    </figcaption>
  </figure>`;
}

/* =================================================================
   1. 首页
   ================================================================= */
const me = store.getMe();
const curType = F.currentMealType();
const curLabel = store.mealTypeLabel(curType);
const feed = store.getFeed({ mealType: curType, sort: 'recommend' });

const homeBody = `
<div class="hd" style="padding-top:44px">
  <div class="hd-row">
    <div class="hd-brand"><img class="hd-logo" src="../assets/logo_main.png" alt=""><span class="hd-name">吃什么</span></div>
    <div class="hd-region"><span>${esc(me.region)}</span><span class="hd-caret">▾</span></div>
  </div>
  <div class="hd-slogan">看看大家今天真的吃了什么</div>
</div>
<div class="meal-tabs">
  ${C.MEAL_TYPES.map((t) => `<div class="meal-tab ${t.key === curType ? 'meal-tab--on' : ''}">${t.label}</div>`).join('')}
</div>
<div class="rand">
  <img class="rand-dog" src="../assets/logo_main.png" alt="">
  <div>
    <div class="rand-q">实在不知道吃什么？</div>
    <div class="rand-a">随机帮我选 →</div>
  </div>
</div>
<div class="feed-head">
  <div class="feed-tabs"><span class="feed-tab feed-tab--on">推荐</span><span class="feed-tab">最新</span><span class="feed-tab">跟吃较多</span></div>
  <span class="feed-count">${feed.length} 顿</span>
</div>
<div class="feed-label"><i></i>附近正在吃</div>
<div class="grid">${feed.slice(0, 8).map((m) => `<div class="grid-item">${mealCard(m, 'feed')}</div>`).join('')}</div>
<div class="feed-tip">排序：当前餐次 › 约 3km 距离 › 新鲜度 › 就吃这个次数</div>
`;

/* =================================================================
   2. 记一顿
   ================================================================= */
const recordBody = `
<div class="meal-tabs meal-tabs--seg">
  ${C.MEAL_TYPES.map((t) => `<div class="meal-tab ${t.key === curType ? 'meal-tab--on' : ''}">${t.label}</div>`).join('')}
</div>
<div class="rec-time"><span>🕒</span><span class="rec-time-text">今天 ${F.hhmm(Date.now())}</span><span class="rec-time-caret">›</span></div>

<div class="field">
  <div class="field-label">今天吃了什么？</div>
  <div class="input input--ph">例如：番茄肥牛饭</div>
</div>

<div class="rec-images">
  <div class="rec-img rec-img--add"><span class="rec-img-plus">＋</span><span class="rec-img-label">添加照片</span><span class="rec-img-opt">（可选）</span></div>
</div>

<div class="field">
  <div class="field-label">金额</div>
  <div class="rec-amount">
    <span class="rec-amount-sign">¥</span>
    <span class="rec-amount-ph">例如 22</span>
    <span class="rec-amount-unknown">不记金额</span>
  </div>
  <div class="rec-hint-inline">填了金额，就能自动生成你的周 / 月 / 年吃饭消费总结。</div>
</div>

<div class="field">
  <div class="field-label">今天这顿感觉怎么样？（可选）</div>
  <div class="input input--area input--ph">写一句也行，不写也行……</div>
  <div class="counter">0/50</div>
</div>

<div class="rec-row">
  <div class="rec-row-left"><span>📍</span><span>已关联 ${esc(me.region)}</span></div>
  <span class="rec-row-caret">›</span>
</div>

<div class="rec-row">
  <div class="rec-row-left"><span>⚙️</span><span>发布设置</span></div>
  <div class="rec-row-left"><span class="rec-row-sum">公开 · 模糊区域 · 公开感受</span><span class="rec-row-caret">›</span></div>
</div>

<div class="rec-hint">饭流、饭历和消费统计都按你填的「实际用餐时间」归档，所以晚上也能补记中午那一顿。</div>
<button class="btn btn-primary btn-block">记下这一顿</button>
`;

/* =================================================================
   3. 饭记详情
   ================================================================= */
// 详情页挑一条「别人的、有公开感受」的饭记，才能展示到地点 / 感受 / 收藏 / 就吃这个
const detailMeal =
  feed.find((m) => m.moodText && m.placeText && !m.isMine) ||
  feed.find((m) => !m.isMine) ||
  feed[0];

const detailBody = `
<div class="detail-hero" style="${grad(detailMeal)}"><span class="detail-hero-emoji">${esc(detailMeal.emoji)}</span></div>

<div class="detail-head">
  <div class="detail-name">${esc(detailMeal.name)}</div>
  <div class="detail-amount">${esc(detailMeal.amountText)}</div>
</div>
<div class="detail-meta"><span class="tag tag-soft">${esc(detailMeal.mealTypeLabel)}</span><span class="detail-meta-time">${esc(detailMeal.timeLabel)}</span></div>

<div class="card detail-author">
  ${avatar(detailMeal.author, 'ava-md')}
  <div class="grow">
    <div class="detail-author-name">${esc(detailMeal.authorName)}</div>
    <div class="detail-author-sub">
      <span class="level">${esc(detailMeal.author.levelText)}</span>
      <span class="detail-author-count">已记录 ${detailMeal.author.recordCount} 顿</span>
    </div>
  </div>
  <span class="cell-arrow">›</span>
</div>

<div class="card detail-block">
  <div class="detail-block-title">📍 在哪儿吃的</div>
  <div class="detail-block-body">${esc(detailMeal.placeText || '附近 · 位置未公开')}</div>
  ${detailMeal.distanceText ? `<div class="detail-block-note">距你约 ${esc(detailMeal.distanceText)}</div>` : ''}
</div>

${detailMeal.moodText ? `<div class="card detail-block">
  <div class="detail-block-title">吃这一顿的时候</div>
  <div class="detail-block-body detail-block-body--mood">${esc(detailMeal.moodText)}</div>
</div>` : ''}

<div class="detail-foot-tip">这里不显示点赞、评论和粉丝数。觉得不错，就默默吃一顿一样的。</div>
<div class="actionbar actionbar--spacer"></div>
`;

/* =================================================================
   4. 随机帮我选
   ================================================================= */
const randomPick = store.randomNearby(curType) || feed[0];
const randomBody = `
<div class="rd-bar"><span class="rd-back">‹ 换个来源</span><span class="rd-source-name">附近大家正在吃</span></div>
<div class="meal-tabs meal-tabs--seg">
  ${C.MEAL_TYPES.map((t) => `<div class="meal-tab ${t.key === randomPick.mealType ? 'meal-tab--on' : ''}">${t.label}</div>`).join('')}
</div>

<div class="card rd-card">
  <div class="rd-media" style="${grad(randomPick)}"><span class="rd-media-emoji">${esc(randomPick.emoji)}</span></div>
  <div class="rd-name">${esc(randomPick.name)}</div>
  <div class="rd-amount">${esc(randomPick.amountText)}</div>
  <div class="rd-meta">
    ${avatar(randomPick.author, 'ava-sm')}
    <div class="grow">
      <div class="rd-author">${esc(randomPick.authorName)}</div>
      <div class="rd-time">${esc(randomPick.timeLabel)}</div>
    </div>
    <span class="rd-more">看这一顿 ›</span>
  </div>
  <button class="btn btn-primary btn-block rd-plan">就吃这个</button>
  <div class="rd-again">换一个</div>
</div>

<div class="rd-note">抽到的都是当前餐次、附近约 3km 内、大家今天真实吃过的饭。短时间内不会重复抽到同一条。</div>
`;

/* =================================================================
   5. 作者个人主页
   ================================================================= */
const authorId = detailMeal.authorId;
const author = store.getUser(authorId);
const authorToday = store.getMealsByAuthor(authorId, { dateKey: F.todayKey(0) });
const authorRecent = store.getMealsByAuthor(authorId).slice(0, 6);

const authorBody = `
<div class="card au-card">
  <div class="au-top">
    ${avatar(author, 'ava-xl')}
    <div class="grow au-info">
      <div class="au-name">${esc(author.nickname)}</div>
      <div class="au-row"><span class="level">${esc(author.levelText)}</span><span class="au-count">已记录 ${author.recordCount} 顿</span></div>
      ${author.bio ? `<div class="au-bio">${esc(author.bio)}</div>` : ''}
    </div>
  </div>
  <button class="btn ${store.isFollowing(authorId) ? 'btn-sage' : 'btn-primary'} btn-block au-follow">${store.isFollowing(authorId) ? '已跟吃 ✓' : '跟吃 TA'}</button>
  <div class="au-hint">以后多看看 TA 都吃些什么</div>
</div>

<div class="section">
  <div class="section-head"><span class="section-title">今天吃了什么</span></div>
  <div class="card au-today">
    ${C.MEAL_TYPES.map((t) => {
      const hit = authorToday.find((m) => m.mealType === t.key);
      return `<div class="au-today-row">
        <div class="au-today-left"><span>${t.emoji}</span><span class="au-today-label">${t.label}</span></div>
        <div class="au-today-right">${
          hit
            ? `<span class="au-today-name">${esc(hit.name)}</span><span class="au-today-amount">${esc(hit.amountText)}</span>`
            : `<span class="au-today-none">还没记录</span>`
        }</div>
      </div>`;
    }).join('')}
  </div>
</div>

<div class="section">
  <div class="section-head"><span class="section-title">最近吃过</span><span class="section-more">共 ${author.recordCount} 顿</span></div>
  <div class="grid">${authorRecent.map((m) => `<div class="grid-item">${mealCard(m, 'author')}</div>`).join('')}</div>
</div>

<div class="au-foot">不显示粉丝数，也不做点赞竞争。这里只是一个吃饭档案。</div>
`;

/* =================================================================
   6. 我的
   ================================================================= */
const today = store.getTodaySummary();
const monthStats = store.getStats('month');

const mineBody = `
<div class="card me-card">
  ${avatar(me, 'ava-lg')}
  <div class="grow">
    <div class="me-name">${esc(me.nickname)}</div>
    <div class="me-sub"><span class="level">${esc(me.levelText)}</span><span class="me-count">已记录 ${me.recordCount} 顿</span></div>
  </div>
  <div class="me-edit">编辑资料</div>
</div>

<div class="section">
  <div class="section-head"><span class="section-title">今天</span><span class="section-more">已记录 ${today.count} 顿 · ${esc(today.totalText)}</span></div>
  <div class="card today">
    ${today.slots
      .map(
        (s) => `<div class="today-slot ${s.recorded ? 'today-slot--on' : ''}">
      <span class="today-emoji">${s.emoji}</span>
      <span class="today-label">${s.label}</span>
      <span class="today-name">${esc(s.name)}</span>
      ${s.amountText ? `<span class="today-amount">${esc(s.amountText)}</span>` : ''}
    </div>`
      )
      .join('')}
  </div>
  <div class="today-hint">${esc(today.pendingText)}</div>
</div>

<div class="card month-card">
  <div class="grow">
    <div class="month-label">本月吃饭</div>
    <div class="month-value">${esc(monthStats.totalText)}</div>
  </div>
  <div class="month-right"><span class="month-more">周 / 月 / 年</span><span class="cell-arrow">›</span></div>
</div>

<div class="section">
  <div class="card entry">
    ${[
      { icon: '🗓', title: '我的饭历', desc: '回看已经真实吃过的饭' },
      { icon: '📋', title: '我的餐单', desc: '今天和明天的三餐安排' },
      { icon: '💛', title: '我的想吃', desc: '以后可能想吃的都在这' },
      { icon: '👀', title: '我跟吃的人', desc: '看看他们今天吃了什么' }
    ]
      .map(
        (e) => `<div class="entry-row">
      <span class="entry-icon">${e.icon}</span>
      <div class="grow"><div class="entry-title">${e.title}</div><div class="entry-desc">${e.desc}</div></div>
      <span class="cell-arrow">›</span>
    </div>`
      )
      .join('')}
  </div>
</div>

<div class="foot"><span>使用说明</span><span class="foot-dot">·</span><span>设置</span></div>
<div class="foot-tip">等级只做轻量展示，不影响推荐。这里没有排行榜，也没有红点。</div>
`;

/* =================================================================
   7. 我的饭历
   ================================================================= */
const nowD = new Date();
const calData = store.getCalendarMonth(nowD.getFullYear(), nowD.getMonth() + 1);
const mi = F.monthInfo(nowD.getFullYear(), nowD.getMonth() + 1);
const selectedKey =
  calData.byDay[F.todayKey(0)]
    ? F.todayKey(0)
    : Object.keys(calData.byDay).sort().pop();
const selDay = calData.byDay[selectedKey];

const calCells = [];
for (let i = 0; i < mi.lead; i++) calCells.push({ empty: true });
for (let d = 1; d <= mi.days; d++) {
  const key = `${nowD.getFullYear()}-${F.pad(nowD.getMonth() + 1)}-${F.pad(d)}`;
  calCells.push({ empty: false, day: d, key, has: !!calData.byDay[key], today: key === F.todayKey(0), on: key === selectedKey });
}
while (calCells.length % 7 !== 0) calCells.push({ empty: true });

const calSelParts = selectedKey.split('-');

const calendarBody = `
<div class="card cal-head">
  <div class="cal-head-row"><span class="cal-nav">‹</span><span class="cal-head-month">${nowD.getFullYear()}年${nowD.getMonth() + 1}月</span><span class="cal-nav">›</span></div>
  <div class="cal-head-stat">
    <div><div class="cal-stat-label">本月已记录</div><div class="cal-stat-value">${calData.count} 顿</div></div>
    <div><div class="cal-stat-label">本月消费</div><div class="cal-stat-value cal-stat-value--primary">${esc(calData.totalText)}</div></div>
  </div>
</div>

<div class="card cal">
  <div class="cal-week">${['一', '二', '三', '四', '五', '六', '日'].map((w) => `<div class="cal-week-cell">${w}</div>`).join('')}</div>
  <div class="cal-grid">
    ${calCells
      .map(
        (c) => `<div class="cal-cell ${c.empty ? 'cal-cell--empty' : ''} ${c.today ? 'cal-cell--today' : ''} ${c.on ? 'cal-cell--on' : ''}">
      ${c.empty ? '' : `<span class="cal-day">${c.day}</span><span class="cal-dots">${c.has ? '<i></i>' : ''}</span>`}
    </div>`
      )
      .join('')}
  </div>
</div>

<div class="card day">
  <div class="day-head"><span class="day-date">${Number(calSelParts[1])}月${Number(calSelParts[2])}日</span><span class="day-total">当天 ${esc(selDay.totalText)}</span></div>
  ${selDay.byType
    .map(
      (s) => `<div class="day-row">
    <div class="day-row-left"><span class="day-emoji">${s.emoji}</span>
      <div><div class="day-type">${s.label}</div><div class="day-name">${s.meal ? esc(s.meal.name) : '还没记录'}</div></div>
    </div>
    <div class="day-row-right">${s.meal ? `<span class="day-amount">${esc(s.meal.amountText)}</span><span class="cell-arrow">›</span>` : ''}</div>
  </div>`
    )
    .join('')}
  <div class="day-tip">饭历只包含真实已经吃过的饭。收藏和餐单计划不会出现在这里。</div>
</div>
`;

/* =================================================================
   8. 我的餐单
   ================================================================= */
const board = store.getPlanBoard();
const planBody = `
<div class="segment plan-seg"><div class="segment-item segment-item--on">今天</div><div class="segment-item">明天</div></div>
<div class="plan-date">今天 · ${board[0].dateText}</div>
${board[0].slots
  .map(
    (s) => `<div class="card plan-slot-card">
  <div class="plan-slot-head">
    <div class="plan-slot-left"><span>${s.emoji}</span><span class="plan-slot-label">${s.mealTypeLabel}</span></div>
    <span class="tag ${s.status === 'completed' ? 'tag-sage' : s.status === 'planned' ? 'tag-apricot' : 'tag-plain'}">${s.statusLabel}</span>
  </div>
  ${
    s.hasPlan
      ? `<div class="plan-slot-body">
      <div class="plan-slot-thumb" style="background:linear-gradient(150deg,${s.grad1} 0%,${s.grad2} 100%)"><span>${s.foodEmoji}</span></div>
      <div class="grow">
        <div class="plan-slot-name">${esc(s.name)}</div>
        <div class="plan-slot-sub">${s.sourceText ? `<span class="plan-slot-source">${esc(s.sourceText)}</span>` : ''}${s.referenceAmountText ? `<span class="plan-slot-ref">${esc(s.referenceAmountText)}</span>` : ''}</div>
      </div>
    </div>
    ${
      s.status === 'planned'
        ? `<div class="plan-slot-actions"><button class="btn btn-soft btn-sm">取消</button><button class="btn btn-primary btn-sm grow">我吃了</button></div>`
        : `<div class="plan-slot-done">已计入饭历和消费统计</div>`
    }`
      : `<div class="plan-slot-empty">还没想好吃什么</div>
    <div class="plan-slot-quick">
      <div class="quick-btn"><span>🍚</span><span>看看大家吃什么</span></div>
      <div class="quick-btn"><span>🎲</span><span>随机帮我选</span></div>
    </div>`
  }
</div>`
  )
  .join('')}
<div class="card card-soft plan-foot"><span>从「我的想吃」里挑一个安排进来 →</span></div>
<div class="plan-tip">餐单管的是「准备吃什么」。参考价格不会计入真实消费；只有点「我吃了」并完成记一顿，才会进入饭历与消费统计。</div>
`;

/* =================================================================
   9. 我的想吃
   ================================================================= */
const wishes = store.getWishes();

const wishBody = `
<div class="wish-add"><span class="wish-add-plus">＋</span><span>记一个想吃的</span></div>
<div class="wish-head"><span class="wish-head-title">我的想吃</span><span class="wish-head-count">${wishes.length} 个</span></div>
<div class="wish-head-desc">私人饮食愿望清单。收藏别人的饭记，或者自己随手记下路过的小馆子。</div>

${wishes
  .map(
    (w) => `<div class="card wish">
  <div class="wish-main">
    <div class="wish-thumb" style="background:linear-gradient(150deg,${w.grad1} 0%,${w.grad2} 100%)"><span>${w.emoji}</span></div>
    <div class="grow">
      <div class="wish-name">${esc(w.name)}</div>
      <div class="wish-meta">
        ${w.placeName || w.areaName ? `<span class="wish-place">${esc(w.placeName || w.areaName)}</span>` : ''}
        ${w.amountText ? `<span class="wish-amount">${esc(w.amountText)}</span>` : ''}
      </div>
      ${w.note ? `<div class="wish-note">“${esc(w.note)}”</div>` : ''}
      <div class="wish-source">${esc(w.sourceText)}${w.sourceType === 'savedMeal' ? ' ›' : ''}</div>
    </div>
  </div>
  <div class="wish-actions">
    <span class="wish-link">我吃过了</span>
    <span class="wish-link wish-link--danger">移除</span>
    <button class="btn btn-primary btn-sm grow">安排到餐单</button>
  </div>
</div>`
  )
  .join('')}
`;

/* =================================================================
   10. 消费统计
   ================================================================= */
const stats = store.getStats('month');
stats.trend = stats.trend.map((t) => Object.assign({}, t, { barHeight: t.value > 0 ? Math.max(8, t.percent) : 0 }));

const statsBody = `
<div class="segment st-seg"><div class="segment-item">周</div><div class="segment-item segment-item--on">月</div><div class="segment-item">年</div></div>

<div class="card st-total">
  <div class="st-total-label">${esc(stats.label)}</div>
  <div class="st-total-value">${esc(stats.totalText)}</div>
  <div class="st-total-sub">共 ${stats.count} 顿 · 平均每顿 ${esc(stats.avgText)}</div>
</div>

<div class="section">
  <div class="section-head"><span class="section-title">每天趋势</span><span class="section-more">最高 ${stats.maxValue} 元</span></div>
  <div class="card st-chart">
    <div class="st-bars">
      ${stats.trend
        .map(
          (t) => `<div class="st-bar">
        <div class="st-bar-col"><div class="st-bar-value" style="height:${t.barHeight}%"></div></div>
        <span class="st-bar-label">${esc(t.label)}</span>
      </div>`
        )
        .join('')}
    </div>
  </div>
</div>

<div class="section">
  <div class="section-head"><span class="section-title">餐次统计</span><span class="section-more">${esc(stats.label)}</span></div>
  <div class="card st-types">
    ${stats.types
      .map(
        (t) => `<div class="st-type">
      <div class="st-type-head">
        <div class="st-type-left"><span>${t.emoji}</span><span class="st-type-label">${t.label}</span><span class="st-type-count">${t.count} 顿</span></div>
        <div class="st-type-right"><span class="st-type-value">${esc(t.valueText)}</span><span class="st-type-percent">${t.percent}%</span></div>
      </div>
      <div class="st-type-track"><div class="st-type-fill" style="width:${t.percent}%"></div></div>
    </div>`
      )
      .join('')}
  </div>
</div>

<div class="st-tip">只统计「真实吃过 + 完成记录 + 填了实际金额」的饭记。餐单里的参考价和想吃的预计金额都不算。</div>
`;

/* =================================================================
   11. 欢迎信
   ================================================================= */
const welcomeBody = `
<div class="wl-head">
  <img class="wl-logo" src="../assets/logo_main.png" alt="">
  <div class="wl-title">给今天还不知道吃什么的你</div>
  <div class="wl-sub">不用研究攻略，看看大家今天真的吃了什么</div>
</div>
<div class="wl-paper">
  <p>嗨！我的朋友，到饭点了，想好吃什么了吗？</p>
  <p>每次每次一到饭点，我说过，也听过最多的一句话，就是：</p>
  <div class="wl-q">“待会儿吃什么？”</div>
  <p>然后最怕空气突然安静下来。和朋友两两相望，但相顾无言，唯有“唉～”千声，哈哈哈。</p>
  <p>“随便。” “都行。” “你定。” “那吃什么？”</p>
  <p>于是又绕回了原点。</p>
  <p>打开小某书，刷了半天——全是广告。打开大众点评，看见一家不错的，点进去一看人均——在下告辞。打开外卖软件，上下翻了好多遍——这不都吃过吗。</p>
  <div class="wl-q">“如果吃饭这件事，可以简单一点就好了！”</div>
  <p>我只需要看一眼：今天，和我一样生活着的人，都吃了些什么？</p>
  <p>也许这些饭并不精致，也没有人专门给它们拍照、修图、写推荐语。但它们都是真的。</p>
  <div class="wl-sign">那么——今天吃什么呢？</div>
</div>
<div class="wl-tip">这封信只出现这一次，以后可以在「我的 → 使用说明」里重新看。</div>
<div class="wl-bar"><button class="btn btn-ghost">看看使用手册</button><button class="btn btn-primary">我自己逛逛 →</button></div>
`;

/* =================================================================
   组装
   ================================================================= */
const frames = [
  frame('f-home', '01', '首页', '当前餐次饭流 · 双列规整饭卡（自定义导航，品牌行避开胶囊）', homeBody, { nav: false, tab: 'home' }),
  frame('f-record', '02', '记一顿', '单屏完成 · 三类隐私独立设置', recordBody, { tab: 'record' }),
  frame('f-detail', '03', '饭记详情', '大图 / 饭名金额 / 作者 / 地点 / 感受 / 收藏 · 就吃这个', detailBody, { nav: false }),
  frame('f-random', '04', '随机帮我选', '附近大家正在吃 / 我的想吃', randomBody, { navTitle: '随机帮我选' }),
  frame('f-author', '05', '作者个人主页', '吃饭档案 · 跟吃 TA', authorBody, { navTitle: author.nickname }),
  frame('f-mine', '06', '我的', '轻量个人生活仪表盘', mineBody, { tab: 'mine', navTitle: '我的' }),
  frame('f-calendar', '07', '我的饭历', '月历 + 当天三餐 + 当日合计', calendarBody, { navTitle: '我的饭历' }),
  frame('f-plan', '08', '我的餐单', '今天 / 明天 × 三餐 · 已吃 / 待吃 / 未安排', planBody, { navTitle: '我的餐单' }),
  frame('f-wish', '09', '我的想吃', '私人饮食愿望清单', wishBody, { navTitle: '我的想吃' }),
  frame('f-stats', '10', '消费统计', '周 / 月 / 年 · 趋势与餐次占比', statsBody, { navTitle: '消费统计' }),
  frame('f-welcome', '11', '欢迎信', '首次进入仅展示一次', welcomeBody, { navTitle: '欢迎信' })
];

const css = fs.readFileSync(path.join(__dirname, 'preview.css'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>「吃什么」微信小程序 · 界面预览</title>
<style>
${css}
</style>
</head>
<body>
<header class="top">
  <div class="top-brand">
    <img src="../assets/logo_main.png" alt="吃什么">
    <div>
      <h1>「吃什么」微信小程序 · 界面预览</h1>
      <p>看看大家今天真的吃了什么 · 奶油杏橙视觉基准 · V1 演示数据</p>
    </div>
  </div>
  <div class="top-note">
    <b>这是静态预览。</b>真正的可点击小程序在 <code>chishenme-miniprogram/</code> 目录里，
    用微信开发者工具导入即可完整跑通「注册 → 首页 → 收藏 / 就吃这个 → 餐单 → 我吃了 → 饭历 → 消费统计」闭环。
    预览页内容由同一份数据层生成，所以数字与真机一致。
  </div>
  <nav class="top-nav">
    ${[
      ['f-home', '首页'],
      ['f-record', '记一顿'],
      ['f-detail', '饭记详情'],
      ['f-random', '随机帮我选'],
      ['f-author', '作者主页'],
      ['f-mine', '我的'],
      ['f-calendar', '饭历'],
      ['f-plan', '餐单'],
      ['f-wish', '想吃'],
      ['f-stats', '消费统计'],
      ['f-welcome', '欢迎信']
    ]
      .map(([id, name]) => `<a href="#${id}">${name}</a>`)
      .join('')}
  </nav>
</header>

<main class="wall">
${frames.join('\n')}
</main>

<footer class="bottom">
  <div>共 ${frames.length} 个页面预览 · 由 <code>tools/buildPreview.js</code> 从数据层实时生成</div>
  <div>完整页面清单：注册 · 位置 · 欢迎信 · 首页 · 随机帮我选 · 记一顿 · 饭记详情 · 作者主页 · 我的 · 我的饭历 · 我的餐单 · 我的想吃 · 想吃录入 · 我跟吃的人 · 消费统计 · 使用说明与设置</div>
</footer>
</body>
</html>
`;

const outDir = path.join(root, 'preview');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');

console.log('预览页已生成：preview/index.html');
console.log('  页面数：' + frames.length);
console.log('  首页饭卡数：' + feed.length + '（当前餐次：' + curLabel + '）');
console.log('  本月消费：' + monthStats.totalText + '，共 ' + monthStats.count + ' 顿');
console.log('  文件大小：' + (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1) + ' KB');
