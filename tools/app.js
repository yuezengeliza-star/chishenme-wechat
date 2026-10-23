/* ============================================================
   「吃什么」可交互网页版 —— 视图层
   由 tools/buildApp.js 与 utils/*.js（同一份数据层）拼装成 preview/app.html
   目的：不装微信开发者工具也能真实点一遍，逻辑和界面与小程序一致。
   ============================================================ */

const C = __require('constants.js');
const F = __require('format.js');
const store = __require('store.js');

/* 演示版：新选的照片只存在当前会话，不写进本地存储（避免撑爆 localStorage） */
const SESSION_IMAGES = {};

/* ---------------- 会话状态 ---------------- */
const now0 = Date.now();
const S = {
  tab: 'home',
  stack: [],
  toast: null,
  dialog: null,
  done: null,
  sheet: null,
  regionSheet: false,
  planSheet: null,
  planTarget: null,

  home: { mealType: F.currentMealType(now0), sort: 'recommend' },
  random: { source: '', mealType: F.currentMealType(now0), result: null, rolling: false },
  record: null,
  calendar: null,
  stats: { period: 'month' },
  plan: { day: 0 },
  settings: { tab: 'manual', openIndex: 100 },
  wishEdit: null,
  lastMeal: null
};

store.init();

/* ---------------- 通用小工具 ---------------- */
const esc = (s) =>
  String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const grad = (o) => `background:linear-gradient(150deg,${o.grad1} 0%,${o.grad2} 100%)`;

function avatar(u, cls) {
  if (!u) return '';
  const inner = u.hasAvatarImage
    ? `<img class="ava-img" src="${esc(u.avatarUrl)}" alt="">`
    : esc(u.avatarDisplay);
  return `<div class="ava ${cls || ''}" style="background:linear-gradient(140deg,${u.avatarColor1} 0%,${u.avatarColor2} 100%)">${inner}</div>`;
}

/** 演示版照片优先用会话内的 dataURL */
function coverOf(m) {
  const s = SESSION_IMAGES[m.id];
  return s || m.cover;
}

function hasPhoto(m) {
  return !!SESSION_IMAGES[m.id] || m.hasImage;
}

/* ---------------- 饭卡（与小程序 meal-card 组件一一对应） ---------------- */
function mealCard(m, mode) {
  const media = hasPhoto(m)
    ? `<img class="mc-media-img" src="${esc(coverOf(m))}" alt="">`
    : `<div class="mc-media-ph" style="${grad(m)}"><span>${esc(m.emoji)}</span></div>`;
  const foot =
    mode === 'author'
      ? `<div class="mc-foot"><span class="mc-time">${esc(m.dayLabel)}</span></div>`
      : `<div class="mc-foot">${avatar(m.author, 'ava-xs')}<span class="mc-author">${esc(m.authorName)}</span><span class="mc-sep">·</span><span class="mc-time">${esc(m.cardTime)}</span></div>`;
  const vis =
    mode === 'mine' && m.visibility !== 'public'
      ? `<div class="mc-vis">${m.visibility === 'private' ? '仅自己' : '仅附近'}</div>`
      : '';
  return `<div class="mc tap" data-act="open-meal" data-id="${m.id}">
    <div class="mc-media">${media}${vis}</div>
    <div class="mc-body">
      <div class="mc-name">${esc(m.name)}</div>
      <div class="mc-amount ${m.amountKnown ? '' : 'mc-amount--none'}">${esc(m.amountText)}</div>
      ${foot}
    </div>
  </div>`;
}

function mealGrid(list, mode) {
  if (!list.length) return '';
  return `<div class="grid">${list.map((m) => `<div class="grid-item">${mealCard(m, mode)}</div>`).join('')}</div>`;
}

/* 就吃这个 / 安排到餐单 的餐次选项（只显示当前仍有意义的餐次） */
function buildPlanOptions() {
  const h = new Date().getHours();
  const todayMeaningful = { breakfast: h < 11, lunch: h < 16, dinner: true };
  const groups = [
    { label: '今天', dateKey: F.todayKey(0), filter: todayMeaningful },
    { label: '明天', dateKey: F.todayKey(1), filter: { breakfast: true, lunch: true, dinner: true } }
  ];
  const plans = store.getPlans(F.todayKey(0)).concat(store.getPlans(F.todayKey(1)));
  return groups
    .map((g) => ({
      label: g.label,
      dateKey: g.dateKey,
      slots: C.MEAL_TYPES.filter((t) => g.filter[t.key]).map((t) => {
        const exist = plans.find((p) => p.date === g.dateKey && p.mealType === t.key);
        return { mealType: t.key, label: t.label, emoji: t.emoji, taken: !!exist, takenText: exist ? exist.name : '' };
      })
    }))
    .filter((g) => g.slots.length);
}

function planSheetHtml() {
  if (!S.planSheet) return '';
  const t = S.planSheet;
  const opts = buildPlanOptions();
  return `<div class="mask" data-act="close-sheet"></div>
  <div class="sheet-wrap">
    <div class="sheet-title">${esc(t.title)}</div>
    <div class="sheet-desc">${esc(t.desc)}</div>
    ${opts
      .map(
        (g) => `<div class="plan-group">
      <div class="plan-group__label">${g.label}</div>
      <div class="plan-slots">${g.slots
        .map(
          (s) => `<div class="plan-slot ${s.taken ? 'plan-slot--taken' : ''}" data-act="pick-plan" data-type="${s.mealType}" data-date="${g.dateKey}">
        <span class="plan-slot__emoji">${s.emoji}</span>
        <span class="plan-slot__label">${s.label}</span>
        ${s.taken ? `<span class="plan-slot__taken">已安排</span>` : ''}
      </div>`
        )
        .join('')}</div>
    </div>`
      )
      .join('')}
    <div class="sheet-close" data-act="close-sheet">取消</div>
  </div>`;
}

function regionSheetHtml() {
  if (!S.regionSheet) return '';
  const me = store.getMe();
  return `<div class="mask" data-act="close-sheet"></div>
  <div class="sheet-wrap">
    <div class="sheet-title">你在哪儿吃饭</div>
    <div class="sheet-desc">附近默认约 3km。位置用于匹配，不等于对外公开。</div>
    ${C.REGIONS.map(
      (r) => `<div class="st2-region ${me.regionKey === r.key ? 'st2-region--on' : ''}" data-act="pick-region" data-key="${r.key}">
      <div><div class="st2-region__name">${esc(r.name)}</div><div class="st2-region__sub">${esc(r.sub)}</div></div>
      <span class="st2-region__check">${me.regionKey === r.key ? '✓' : ''}</span>
    </div>`
    ).join('')}
    <div class="sheet-close" data-act="close-sheet">取消</div>
  </div>`;
}

function overlayHtml() {
  let h = '';
  if (S.done) {
    h += `<div class="mask"></div><div class="done-pop">
      <img class="wiggle" src="../assets/logo_main.png" alt="">
      <div class="done-pop__title">记下啦</div>
      <div class="done-pop__sub">${esc(S.done)}</div>
    </div>`;
  }
  if (S.dialog) {
    const d = S.dialog;
    h += `<div class="mask"></div><div class="dialog">
      <div class="dialog__title">${esc(d.title)}</div>
      ${d.body ? `<div class="dialog__body">${esc(d.body)}</div>` : ''}
      <div class="dialog__acts">
        ${d.cancelText ? `<button class="btn btn-ghost" data-act="dialog-cancel">${esc(d.cancelText)}</button>` : ''}
        <button class="btn btn-primary" data-act="dialog-ok">${esc(d.confirmText || '知道了')}</button>
      </div>
    </div>`;
  }
  if (S.toast) h += `<div class="toast">${esc(S.toast)}</div>`;
  return h;
}

/* =====================================================================
   1. 注册（昵称 + 头像）
   ===================================================================== */
const PRESETS = ['🐕', '🍜', '🍚', '🥐', '🧋', '🍊'];
const onboardDraft = { nickname: '', avatarEmoji: '🐕', avatarUrl: '' };

function screenOnboardProfile() {
  const editing = S.stack.some((p) => p.name === 'onboard-profile' && p.editing);
  return {
    title: editing ? '编辑资料' : '认识一下',
    plainNav: true,
    body: `<div class="screen-body" style="padding:16px 0 28px">
      <div style="text-align:center;padding:10px 0 22px">
        <img src="../assets/logo_main.png" style="width:96px;height:96px" alt="">
        <div style="font-size:12px;color:var(--text2);margin-top:2px">看看大家今天真的吃了什么</div>
      </div>

      <div class="card" style="padding:18px 16px">
        <div style="font-size:18px;font-weight:600">先给自己起个名字</div>
        <div style="font-size:12px;color:var(--text2);margin-top:5px;line-height:1.6">不需要真实姓名、年龄、性别或学校，随便叫什么都行。</div>

        <div style="display:flex;flex-direction:column;align-items:center;margin:18px 0 4px">
          <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(150deg,#FFEFE1,#FFD8B5);display:flex;align-items:center;justify-content:center;font-size:38px;border:2px solid #fff;box-shadow:0 3px 9px rgba(255,139,61,.16);overflow:hidden">
            ${onboardDraft.avatarUrl ? `<img src="${esc(onboardDraft.avatarUrl)}" style="width:100%;height:100%;object-fit:cover" alt="">` : esc(onboardDraft.avatarEmoji)}
          </div>
        </div>

        <div style="font-size:12px;color:var(--text2);text-align:center;margin:16px 0 9px">或者选一只柴犬小伙伴</div>
        <div style="display:flex;justify-content:center;gap:9px">
          ${PRESETS.map(
            (e) => `<div class="tap" data-act="pick-preset" data-emoji="${e}"
            style="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;background:${onboardDraft.avatarEmoji === e && !onboardDraft.avatarUrl ? 'var(--apricot-soft)' : '#F6F1EC'};border:1.5px solid ${onboardDraft.avatarEmoji === e && !onboardDraft.avatarUrl ? 'var(--primary)' : 'transparent'}">${e}</div>`
          ).join('')}
        </div>

        <div style="margin-top:18px">
          <div style="font-size:13px;color:var(--text2);margin-bottom:7px">昵称</div>
          <div class="field-box"><input class="ipt" id="nick-input" maxlength="12" placeholder="比如：小鱼" value="${esc(onboardDraft.nickname)}"></div>
        </div>

        <button class="btn btn-primary btn-block" style="margin-top:18px" data-act="onboard-next">${editing ? '保存' : '下一步'}</button>
        ${editing ? '' : `<div class="tap" style="text-align:center;font-size:13px;color:var(--text3);margin-top:14px;padding:6px 0" data-act="onboard-skip">先随便看看，稍后再设置</div>`}
      </div>

      ${editing ? '' : `<div style="display:flex;justify-content:center;gap:7px;margin-top:24px">
        <div style="width:18px;height:7px;border-radius:999px;background:var(--primary)"></div>
        <div style="width:7px;height:7px;border-radius:50%;background:var(--divider)"></div>
        <div style="width:7px;height:7px;border-radius:50%;background:var(--divider)"></div>
      </div>`}
    </div>`
  };
}

/* =====================================================================
   2. 位置
   ===================================================================== */
function screenOnboardLocation() {
  const me = store.getRawMe();
  return {
    title: '你在哪儿吃饭',
    plainNav: true,
    body: `<div class="screen-body" style="padding:16px 0 28px">
      <div style="text-align:center;padding:10px 0 22px">
        <img src="../assets/logo_main.png" style="width:96px;height:96px" alt="">
        <div style="font-size:12px;color:var(--text2);margin-top:2px">看看大家今天真的吃了什么</div>
      </div>

      <div class="card" style="padding:18px 16px">
        <div style="font-size:18px;font-weight:600">你在哪儿吃饭？</div>
        <div style="font-size:12px;color:var(--text2);margin-top:5px;line-height:1.6">我们会优先给你看附近约 3km 内大家刚吃过的饭。不开定位也能用。</div>

        <div style="display:flex;gap:8px;padding:12px;border-radius:10px;background:var(--sage-soft);margin:14px 0">
          <span style="font-size:16px">🔒</span>
          <div style="font-size:12px;color:#5C7A52;line-height:1.65">
            <b>系统用于匹配的位置 ≠ 对外公开的位置。</b><br>定位只用来帮你找附近的饭记，你自己的每一顿都可以单独决定要不要公开地点。
          </div>
        </div>

        <div class="st2-region ${me.regionKey === 'gps' ? 'st2-region--on' : ''}" data-act="use-gps">
          <div><div class="st2-region__name">📍 使用我的当前位置</div><div class="st2-region__sub">开启后优先推荐附近的真实饭记</div></div>
          <span class="st2-region__check">${me.regionKey === 'gps' ? '✓' : ''}</span>
        </div>

        <div style="font-size:12px;color:var(--text2);margin:16px 0 9px">或者手动选一个常吃饭的地方</div>
        ${C.REGIONS.map(
          (r) => `<div class="st2-region ${me.regionKey === r.key ? 'st2-region--on' : ''}" data-act="pick-onboard-region" data-key="${r.key}">
          <div><div class="st2-region__name">${esc(r.name)}</div><div class="st2-region__sub">${esc(r.sub)}</div></div>
          <span class="st2-region__check">${me.regionKey === r.key ? '✓' : ''}</span>
        </div>`
        ).join('')}

        <button class="btn btn-primary btn-block" style="margin-top:14px" data-act="onboard-loc-next">下一步</button>
      </div>

      <div style="display:flex;justify-content:center;gap:7px;margin-top:24px">
        <div style="width:7px;height:7px;border-radius:50%;background:var(--divider)"></div>
        <div style="width:18px;height:7px;border-radius:999px;background:var(--primary)"></div>
        <div style="width:7px;height:7px;border-radius:50%;background:var(--divider)"></div>
      </div>
    </div>`
  };
}

/* =====================================================================
   3. 欢迎信
   ===================================================================== */
const LETTER = [
  ['p', '嗨！我的朋友，到饭点了，想好吃什么了吗？'],
  ['p', '每次每次一到饭点，我说过，也听过最多的一句话，就是：'],
  ['q', '“待会儿吃什么？”'],
  ['p', '然后最怕空气突然安静下来。和朋友两两相望，但相顾无言，唯有“唉～”千声，哈哈哈。'],
  ['p', '“随便。” “都行。” “你定。” “那吃什么？”'],
  ['p', '于是又绕回了原点。'],
  ['p', '打开小某书，刷了半天——全是广告。打开大众点评，看见一家不错的，点进去一看人均——在下告辞。打开外卖软件，上下翻了好几遍——这不都吃过吗。'],
  ['q', '“如果吃饭这件事，可以简单一点就好了！”'],
  ['p', '我只需要看一眼：今天，和我一样生活着的人，都吃了些什么？'],
  ['p', '也许这些饭并不精致，也没有人专门给它们拍照、修图、写推荐语。但它们都是真的。'],
  ['p', '是某个人在今天这个普通的日子里，认真吃下的一顿饭。'],
  ['p', '你只需要很简单地说一句：“我今天吃了这个。”'],
  ['p', '因为我们可能永远不会认识彼此。但你今天随手记录下的一顿饭，却刚刚好替另一个陌生人解决了一个小小的烦恼。'],
  ['p', '这里没有那么多规矩。你可以看看别人今天吃了什么，也可以留下一顿属于自己的饭。'],
  ['sign', '那么——今天吃什么呢？']
];

function screenWelcome() {
  return {
    title: '欢迎信',
    body: `<div style="padding:6px 0 90px">
      <div style="text-align:center;padding:12px 0 18px">
        <img src="../assets/logo_main.png" style="width:90px;height:90px" alt="">
        <div style="font-size:20px;font-weight:600;margin-top:6px">给今天还不知道吃什么的你</div>
        <div style="font-size:12px;color:var(--text2);margin-top:6px">不用研究攻略，看看大家今天真的吃了什么</div>
      </div>
      <div class="card" style="padding:20px 16px">
        ${LETTER.map(([t, v]) =>
          t === 'q'
            ? `<div style="font-size:15px;line-height:1.9;color:var(--primary);font-weight:500;padding:2px 0 2px 12px;border-left:3px solid var(--apricot);margin:12px 0">${esc(v)}</div>`
            : t === 'sign'
              ? `<div style="font-size:16px;font-weight:600;text-align:right;margin-top:16px;padding-top:14px;border-top:1px dashed var(--divider)">${esc(v)}</div>`
              : `<p style="font-size:14.5px;line-height:2;color:#5A463A;margin:0 0 11px;text-align:justify">${esc(v)}</p>`
        ).join('')}
      </div>
      <div style="font-size:11px;color:var(--text3);text-align:center;margin-top:14px;line-height:1.7">这封信只出现这一次，以后可以在「我的 → 使用说明」里重新看。</div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-ghost" style="flex:1;height:44px;font-size:13.5px" data-act="welcome-manual">看看使用手册</button>
        <button class="btn btn-primary" style="flex:1;height:44px;font-size:13.5px" data-act="welcome-go">我自己逛逛 →</button>
      </div>
    </div>`
  };
}

/* =====================================================================
   4. 首页
   ===================================================================== */
function screenHome() {
  const me = store.getMe();
  const feed = store.getFeed({ mealType: S.home.mealType, sort: S.home.sort });
  const sorts = [
    ['recommend', '推荐'],
    ['latest', '最新'],
    ['eat', '跟吃较多']
  ];
  return {
    customNav: true,
    tab: 'home',
    body: `<div style="padding-top:44px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center">
          <img src="../assets/logo_main.png" style="width:32px;height:32px" alt="">
          <span style="font-size:20px;font-weight:600;margin-left:6px;letter-spacing:.5px">吃什么</span>
        </div>
        <div class="tap" data-act="open-region" style="display:flex;align-items:center;height:30px;padding:0 11px;border-radius:999px;background:#fff;border:1px solid var(--divider);font-size:12px;max-width:160px">
          <span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(me.region)}</span>
          <span style="color:var(--text2);font-size:11px;margin-left:4px">▾</span>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-top:5px">看看大家今天真的吃了什么</div>
    </div>

    <div class="meal-tabs" style="margin-top:12px">
      ${C.MEAL_TYPES.map((t) => `<div class="meal-tab ${S.home.mealType === t.key ? 'meal-tab--on' : ''}" data-act="home-meal" data-key="${t.key}">${t.label}</div>`).join('')}
    </div>

    <div class="rand tap" data-act="go-random" style="margin-top:12px">
      <img class="rand-dog" src="../assets/logo_main.png" alt="">
      <div>
        <div class="rand-q">实在不知道吃什么？</div>
        <div class="rand-a">随机帮我选 →</div>
      </div>
    </div>

    <div class="feed-head">
      <div class="feed-tabs">${sorts.map(([k, l]) => `<span class="feed-tab ${S.home.sort === k ? 'feed-tab--on' : ''}" data-act="home-sort" data-key="${k}">${l}</span>`).join('')}</div>
      <span class="feed-count">${feed.length} 顿</span>
    </div>

    <div class="feed-label"><i></i>附近正在吃</div>

    ${
      feed.length
        ? mealGrid(feed, 'feed')
        : `<div class="empty">
        <img class="empty__img" src="../assets/logo_main.png" alt="">
        <div class="empty__text">这个餐次还没有人记过饭</div>
        <div class="empty__text">要不要先留下你的这一顿？</div>
        <div class="empty__acts"><button class="btn btn-primary btn-sm" data-act="go-record">记下这一顿</button></div>
      </div>`
    }

    <div class="feed-tip">${
      S.home.sort === 'recommend'
        ? '排序：当前餐次 › 约 3km 距离 › 新鲜度 › 就吃这个次数'
        : S.home.sort === 'latest'
          ? '排序：按实际用餐时间，从近到远'
          : '排序：按「就吃这个」次数多少'
    }　·　只看最近 36 小时的饭记</div>
  </div>`
  };
}

/* =====================================================================
   5. 随机帮我选
   ===================================================================== */
function screenRandom() {
  const r = S.random;
  let body = '';

  if (!r.source) {
    body = `<div style="text-align:center;padding:20px 0 16px">
      <img src="../assets/logo_main.png" style="width:100px;height:100px" alt="">
      <div style="font-size:19px;font-weight:600;margin-top:4px">实在不知道吃什么？</div>
      <div style="font-size:12px;color:var(--text2);margin-top:5px">把决定交给随机，先从哪儿抽？</div>
    </div>
    <div class="card tap" data-act="random-source" data-source="nearby" style="display:flex;align-items:center;gap:10px;margin-bottom:11px">
      <div style="width:48px;height:48px;border-radius:12px;background:var(--apricot-soft);display:flex;align-items:center;justify-content:center;font-size:22px">🍚</div>
      <div class="grow"><div style="font-size:15.5px;font-weight:500">附近大家正在吃</div>
      <div style="font-size:11px;color:var(--text2);margin-top:4px;line-height:1.6">从当前餐次、附近约 3km 内大家刚吃过的真实饭记里随机一个</div></div>
      <span class="cell-arrow">›</span>
    </div>
    <div class="card tap" data-act="random-source" data-source="wish" style="display:flex;align-items:center;gap:10px">
      <div style="width:48px;height:48px;border-radius:12px;background:var(--apricot-soft);display:flex;align-items:center;justify-content:center;font-size:22px">💛</div>
      <div class="grow"><div style="font-size:15.5px;font-weight:500">我的想吃</div>
      <div style="font-size:11px;color:var(--text2);margin-top:4px;line-height:1.6">从你还没吃过的想吃清单里随机一个</div></div>
      <span class="cell-arrow">›</span>
    </div>`;
  } else if (r.rolling) {
    body = `<div style="text-align:center;padding:40px 0">
      <img class="wiggle" src="../assets/logo_main.png" style="width:90px;height:90px" alt="">
      <div style="font-size:12px;color:var(--text2);margin-top:6px">正在帮你翻一翻…</div>
    </div>`;
  } else {
    body = `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0 2px;font-size:12px;color:var(--text2)">
      <span class="tap" data-act="random-back">‹ 换个来源</span>
      <span>${r.source === 'wish' ? '我的想吃' : '附近大家正在吃'}</span>
    </div>
    ${r.source === 'nearby' ? `<div class="meal-tabs" style="margin-top:10px">
      ${C.MEAL_TYPES.map((t) => `<div class="meal-tab ${r.mealType === t.key ? 'meal-tab--on' : ''}" data-act="random-meal" data-key="${t.key}">${t.label}</div>`).join('')}
    </div>` : ''}`;

    const res = r.result;
    if (res) {
      const isWish = r.source === 'wish';
      body += `<div class="card" style="margin-top:14px;padding:14px">
        <div class="tap" data-act="${isWish ? 'noop' : 'open-meal'}" data-id="${isWish ? '' : res.id}" style="width:100%;height:180px;border-radius:10px;display:flex;align-items:center;justify-content:center;${grad(res)}">
          <span style="font-size:70px;line-height:1">${esc(res.emoji)}</span>
        </div>
        <div style="font-size:20px;font-weight:600;margin-top:14px">${esc(res.name)}</div>
        <div style="font-size:17px;font-weight:600;color:var(--primary);margin-top:5px">${
          isWish ? (res.amountText || '没填预计金额') : res.amountText
        }</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--divider)">
          ${
            isWish
              ? `<div class="grow"><div style="font-size:14px;font-weight:500">${esc(res.placeName || res.areaName || '没写地点')}</div>
                 <div style="font-size:11px;color:var(--text2);margin-top:2px">${esc(res.note || '来自我的想吃')}</div></div>`
              : `${avatar(res.author, 'ava-sm')}
                 <div class="grow"><div style="font-size:14px;font-weight:500">${esc(res.authorName)}</div>
                 <div style="font-size:11px;color:var(--text2);margin-top:2px">${esc(res.timeLabel)}</div></div>
                 <span class="tap" style="font-size:12px;color:var(--primary)" data-act="open-meal" data-id="${res.id}">看这一顿 ›</span>`
          }
        </div>
        <button class="btn btn-primary btn-block" style="margin-top:15px" data-act="random-plan">${isWish ? '安排到餐单' : '就吃这个'}</button>
        <div class="tap" style="text-align:center;font-size:14px;color:var(--text2);padding:13px 0 2px" data-act="random-roll">换一个</div>
      </div>
      <div style="font-size:10.5px;color:var(--text3);text-align:center;line-height:1.7;margin-top:18px">抽到的都是当前餐次、附近约 3km 内、大家今天真实吃过的饭。短时间内不会重复抽到同一条。</div>`;
    } else {
      body += `<div class="empty">
        <img class="empty__img" src="../assets/logo_main.png" alt="">
        <div class="empty__text">${r.source === 'wish' ? '你的想吃清单还是空的' : '这个餐次附近暂时没有可抽的饭记'}</div>
        <div class="empty__text">${r.source === 'wish' ? '先去记一个想吃的吧' : '换个餐次，或者晚点再来看看'}</div>
        <div class="empty__acts">${
          r.source === 'wish'
            ? `<button class="btn btn-primary btn-sm" data-act="go-wish-add">去记一个想吃的</button>`
            : `<button class="btn btn-ghost btn-sm" data-act="random-back">换个来源</button>`
        }</div>
      </div>`;
    }
  }

  return { title: '随机帮我选', body: `<div class="screen-body" style="padding:4px 0 28px">${body}</div>` };
}

/* =====================================================================
   6. 记一顿
   ===================================================================== */
function ensureRecordForm() {
  if (S.record) return S.record;
  const n = Date.now();
  S.record = {
    mealType: F.currentMealType(n),
    dateStr: F.dateKey(n),
    timeStr: F.hhmm(n),
    name: '',
    amount: '',
    amountUnknown: false,
    images: [],
    moodText: '',
    locMode: 'fuzzy',
    placeName: '',
    visibility: 'public',
    moodVisibility: 'public',
    settingsOpen: false,
    draftPlanId: '',
    timeSheet: false,
    locSheet: false
  };
  return S.record;
}

function screenRecord() {
  const d = ensureRecordForm();
  const me = store.getRawMe();
  const timeSummary = `${d.dateStr === F.todayKey(0) ? '今天' : d.dateStr.slice(5).replace('-', '月') + '日'} ${d.timeStr}`;
  const locText = {
    exact: d.placeName || '已关联当前位置',
    fuzzy: `已关联 ${me.region || C.DEFAULT_REGION.name}`,
    hidden: '已关联位置 · 不公开',
    none: '不使用位置'
  }[d.locMode];
  const publishSummary = `${(C.MEAL_VISIBILITY.find((x) => x.key === d.visibility) || {}).label} · ${
    (C.LOCATION_VISIBILITY.find((x) => x.key === d.locMode) || {}).label || '不使用位置'
  } · ${(C.MOOD_VISIBILITY.find((x) => x.key === d.moodVisibility) || {}).label}感受`;

  const body = `<div class="meal-tabs meal-tabs--seg" style="margin-top:12px">
      ${C.MEAL_TYPES.map((t) => `<div class="meal-tab ${d.mealType === t.key ? 'meal-tab--on' : ''}" data-act="rec-meal" data-key="${t.key}">${t.label}</div>`).join('')}
    </div>
    <div class="rec-time tap" data-act="rec-open-time" style="margin-top:11px">
      <span>🕒</span><span class="rec-time-text">${timeSummary}</span><span class="rec-time-caret">›</span>
    </div>

    <div class="field">
      <div class="field-label">今天吃了什么？</div>
      <div class="field-box"><input class="ipt" id="rec-name" maxlength="20" placeholder="例如：番茄肥牛饭" value="${esc(d.name)}"></div>
    </div>

    <div class="rec-images" style="margin-bottom:18px">
      ${d.images
        .map(
          (src, i) => `<div class="rec-img" style="background:none;border:1px solid var(--divider);overflow:hidden">
        <img src="${esc(src)}" style="width:100%;height:100%;object-fit:cover" alt="">
        <div class="tap" data-act="rec-remove-img" data-i="${i}" style="position:absolute;right:0;top:0;width:23px;height:23px;background:rgba(73,53,42,.55);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;border-bottom-left-radius:10px">✕</div>
      </div>`
        )
        .join('')}
      ${d.images.length < 3 ? `<div class="rec-img tap" data-act="rec-add-img">
        <span class="rec-img-plus">＋</span><span class="rec-img-label">添加照片</span><span class="rec-img-opt">（可选）</span>
      </div>` : ''}
    </div>

    <div class="field">
      <div class="field-label">金额</div>
      <div class="rec-amount" style="${d.amountUnknown ? 'opacity:.6' : ''}">
        <span class="rec-amount-sign">¥</span>
        <input class="ipt" id="rec-amount" type="text" inputmode="decimal" placeholder="例如 22" value="${esc(d.amount)}" ${d.amountUnknown ? 'disabled' : ''}>
        <div class="tap rec-amount-unknown ${d.amountUnknown ? 'rec-amount-unknown--on' : ''}" data-act="rec-amount-unknown">${d.amountUnknown ? '✓ ' : ''}不记金额</div>
      </div>
      <div class="rec-hint-inline">填了金额，就能自动生成你的周 / 月 / 年吃饭消费总结。</div>
    </div>

    <div class="field">
      <div class="field-label">今天这顿感觉怎么样？（可选）</div>
      <div class="field-box field-box--area">
        <textarea class="ipt" id="rec-mood" maxlength="50" placeholder="写一句也行，不写也行……">${esc(d.moodText)}</textarea>
      </div>
      <div class="counter"><span id="mood-count">${d.moodText.length}</span>/50</div>
    </div>

    <div class="rec-row tap" data-act="rec-open-loc">
      <div class="rec-row-left"><span>📍</span><span style="${d.locMode === 'none' ? 'color:var(--text2)' : ''}">${esc(locText)}</span></div>
      <span class="rec-row-caret">›</span>
    </div>

    <div style="margin-bottom:10px">
      <div class="rec-row tap" data-act="rec-toggle-settings" style="margin-bottom:0;${d.settingsOpen ? 'border-radius:10px 10px 0 0' : ''}">
        <div class="rec-row-left"><span>⚙️</span><span>发布设置</span></div>
        <div class="rec-row-left"><span class="rec-row-sum">${esc(publishSummary)}</span><span class="rec-row-caret">${d.settingsOpen ? '⌃' : '›'}</span></div>
      </div>
      ${
        d.settingsOpen
          ? `<div style="background:#fff;border:1px solid var(--divider);border-top:none;border-radius:0 0 10px 10px;padding:14px 12px">
        <div class="perm" style="margin-bottom:14px">
          <div class="perm__label" style="font-size:12.5px;color:var(--text2);margin-bottom:8px">饭记可见范围</div>
          <div class="chips">${C.MEAL_VISIBILITY.map((o) => `<div class="chip ${d.visibility === o.key ? 'chip--on' : ''}" data-act="rec-vis" data-key="${o.key}">${o.label}</div>`).join('')}</div>
        </div>
        <div class="perm" style="margin-bottom:14px">
          <div class="perm__label" style="font-size:12.5px;color:var(--text2);margin-bottom:8px">地点可见范围</div>
          <div class="chips">
            ${C.LOCATION_VISIBILITY.map((o) => `<div class="chip ${d.locMode === o.key ? 'chip--on' : ''}" data-act="rec-locmode" data-key="${o.key}">${o.label}</div>`).join('')}
            <div class="chip ${d.locMode === 'none' ? 'chip--on' : ''}" data-act="rec-locmode" data-key="none">不使用位置</div>
          </div>
        </div>
        <div class="perm">
          <div class="perm__label" style="font-size:12.5px;color:var(--text2);margin-bottom:8px">感受可见范围</div>
          <div class="chips">${C.MOOD_VISIBILITY.map((o) => `<div class="chip ${d.moodVisibility === o.key ? 'chip--on' : ''}" data-act="rec-moodvis" data-key="${o.key}">${o.label}</div>`).join('')}</div>
        </div>
        <div style="font-size:10.5px;color:var(--text3);margin-top:12px;line-height:1.6">三类权限相互独立：饭记公开不会连带公开你的地点和感受。</div>
      </div>`
          : ''
      }
    </div>

    <div style="font-size:10.5px;color:var(--text3);line-height:1.7;margin:6px 2px 16px">饭流、饭历和消费统计都按你填的「实际用餐时间」归档，所以晚上也能补记中午那一顿。</div>
    <button class="btn btn-primary btn-block" data-act="rec-submit">记下这一顿</button>`;

  let extra = '';
  if (d.timeSheet) {
    extra += `<div class="mask" data-act="close-sheet"></div><div class="sheet-wrap">
      <div class="sheet-title">这一顿是什么时候吃的</div>
      <div class="sheet-desc">系统按实际用餐时间归档，不是上传时间</div>
      <div class="pick-row"><span class="pick-row__k">日期</span>
        <input class="ipt" type="date" id="rec-date" value="${d.dateStr}" style="width:150px;text-align:right;font-size:15px">
      </div>
      <div class="pick-row"><span class="pick-row__k">时间</span>
        <input class="ipt" type="time" id="rec-time" value="${d.timeStr}" style="width:150px;text-align:right;font-size:15px">
      </div>
      <div class="pick-row" style="border-bottom:none"><span class="pick-row__k">餐次</span>
        <span class="pick-row__v">${(C.MEAL_TYPES.find((t) => t.key === d.mealType) || {}).label}（自动判断，可上面切换）</span>
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:14px" data-act="rec-confirm-time">确定</button>
    </div>`;
  }
  if (d.locSheet) {
    const opts = [
      ['exact', '具体地点', '显示食堂 / 店铺名称'],
      ['fuzzy', '模糊区域', `只显示「${me.region || C.DEFAULT_REGION.name}」这一级`],
      ['hidden', '不公开', '别人看不到地点，但仍可参与附近匹配'],
      ['none', '不使用位置', '这顿不进入基于距离的附近饭流']
    ];
    extra += `<div class="mask" data-act="close-sheet"></div><div class="sheet-wrap">
      <div class="sheet-title">这一顿的位置</div>
      <div class="sheet-desc">系统用它做附近匹配，和「对外公开多少」是两件事</div>
      ${opts
        .map(
          ([k, n, de]) => `<div class="loc-opt ${d.locMode === k ? 'loc-opt--on' : ''}" data-act="rec-pick-loc" data-key="${k}">
        <div><div class="loc-opt__name">${n}</div><div class="loc-opt__desc">${esc(de)}</div></div>
        <span class="loc-opt__check">${d.locMode === k ? '✓' : ''}</span>
      </div>`
        )
        .join('')}
      ${
        d.locMode === 'exact'
          ? `<input class="ipt field-box" id="rec-place" style="margin-top:8px;border:1px solid var(--divider);border-radius:10px;padding:12px 14px;font-size:15px" placeholder="写一下具体店名 / 食堂（可选）" value="${esc(d.placeName)}">`
          : ''
      }
      <button class="btn btn-primary btn-block" style="margin-top:14px" data-act="close-sheet">确定</button>
    </div>`;
  }

  return { title: '记一顿', tab: 'record', body: `<div class="screen-body" style="padding:0 0 28px">${body}</div>`, extra };
}

/* =====================================================================
   7. 饭记详情
   ===================================================================== */
function screenMealDetail(p) {
  const m = store.getMealById(p.id);
  if (!m) return { title: '这一顿', body: '<div class="empty"><div class="empty__text">这条饭记不见了</div></div>' };
  const isMine = m.authorId === 'u_me';
  const isSaved = store.isWished(m.id);
  const loc = m.location || {};

  let placeLine = '';
  if (loc.displayMode === 'exact') placeLine = loc.placeName || loc.areaName || '';
  else if (loc.displayMode === 'fuzzy') placeLine = (loc.areaName || '附近') + ' · 只显示大概区域';
  else if (loc.provided) placeLine = '附近 · 位置未公开';

  const moodLine = m.moodText && (m.moodVisibility === 'public' || isMine) ? m.moodText : '';

  const body = `
    <div style="padding-top:12px">
      ${
        hasPhoto(m)
          ? `<img src="${esc(coverOf(m))}" style="width:100%;height:280px;border-radius:14px;object-fit:cover;display:block" alt="">`
          : `<div style="width:100%;height:280px;border-radius:14px;display:flex;align-items:center;justify-content:center;${grad(m)}"><span style="font-size:100px;line-height:1">${esc(m.emoji)}</span></div>`
      }
    </div>
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-top:18px">
      <div style="font-size:22px;font-weight:600">${esc(m.name)}</div>
      <div style="font-size:20px;font-weight:600;color:var(--primary);${m.amountKnown ? '' : 'font-size:13px;font-weight:400;color:var(--text3)'}">${esc(m.amountText)}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:9px">
      <span class="tag tag-soft">${esc(m.mealTypeLabel)}</span>
      <span style="font-size:12px;color:var(--text2)">${esc(m.timeLabel)}</span>
    </div>

    <div class="tap card" data-act="open-author" data-id="${m.authorId}" style="display:flex;align-items:center;gap:10px;margin-top:18px">
      ${avatar(m.author, 'ava-md')}
      <div class="grow">
        <div style="font-size:16px;font-weight:600">${esc(m.authorName)}</div>
        <div style="display:flex;align-items:center;gap:7px;margin-top:4px">
          <span class="level">${esc(m.author.levelText)}</span>
          <span style="font-size:11px;color:var(--text2)">已记录 ${m.author.recordCount} 顿</span>
        </div>
      </div>
      <span class="cell-arrow">›</span>
    </div>

    ${
      placeLine
        ? `<div class="card" style="margin-top:14px;padding:14px">
      <div style="font-size:12.5px;color:var(--text2);margin-bottom:7px">📍 在哪儿吃的</div>
      <div style="font-size:15px;line-height:1.7">${esc(placeLine)}</div>
      ${m.distanceText ? `<div style="font-size:11px;color:var(--text3);margin-top:6px">距你约 ${esc(m.distanceText)}</div>` : ''}
    </div>`
        : ''
    }

    ${
      moodLine
        ? `<div class="card" style="margin-top:14px;padding:14px">
      <div style="font-size:12.5px;color:var(--text2);margin-bottom:7px">吃这一顿的时候</div>
      <div style="font-size:15px;line-height:1.7;color:#5A463A">${esc(moodLine)}</div>
    </div>`
        : ''
    }

    ${
      !placeLine && !moodLine
        ? `<div style="margin-top:14px;padding:14px;border:1px dashed var(--divider);border-radius:12px;font-size:12.5px;color:var(--text3);line-height:1.7">作者没有公开地点和感受，只留下了这一顿本身。</div>`
        : ''
    }

    <div style="font-size:10.5px;color:var(--text3);text-align:center;margin:18px 4px 6px;line-height:1.7">这里不显示点赞、评论和粉丝数。觉得不错，就默默吃一顿一样的。</div>
    <div style="height:74px"></div>`;

  const bar = isMine
    ? `<div style="position:absolute;left:0;right:0;bottom:0;padding:10px 16px 18px;background:rgba(255,248,241,.94);border-top:1px solid var(--divider);display:flex;align-items:center;justify-content:space-between;z-index:9">
      <span class="tag tag-sage">这是你记下的一顿</span>
      <span style="font-size:12px;color:var(--text2)">${esc(m.timeLabel)}</span>
    </div>`
    : `<div style="position:absolute;left:0;right:0;bottom:0;padding:10px 16px 18px;background:rgba(255,248,241,.94);border-top:1px solid var(--divider);display:flex;align-items:center;gap:10px;z-index:9">
      <div class="tap" data-act="toggle-save" data-id="${m.id}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:70px;height:44px;border-radius:22px;border:1px solid ${isSaved ? 'var(--apricot)' : 'var(--divider)'};background:${isSaved ? 'var(--apricot-soft)' : '#fff'}">
        <span style="font-size:15px;line-height:1;color:${isSaved ? 'var(--primary)' : 'var(--text2)'}">${isSaved ? '♥' : '♡'}</span>
        <span style="font-size:10px;color:${isSaved ? 'var(--primary)' : 'var(--text2)'};margin-top:2px">${isSaved ? '已收藏' : '收藏'}</span>
      </div>
      <button class="btn btn-primary grow" data-act="open-plan-sheet" data-id="${m.id}" data-name="${esc(m.name)}" data-author="${esc(m.authorName)}">就吃这个</button>
    </div>`;

  return { title: m.name, body: `<div class="screen-body" style="padding:0 16px 0">${body}</div>`, fixedBottom: bar };
}

/* =====================================================================
   8. 作者个人主页
   ===================================================================== */
function screenAuthor(p) {
  const user = store.getUser(p.id);
  if (!user) return { title: '吃饭档案', body: '<div class="empty"><div class="empty__text">找不到这个人</div></div>' };
  const isMe = p.id === 'u_me';
  const following = !isMe && store.isFollowing(p.id);
  const todayMeals = store.getMealsByAuthor(p.id, { dateKey: F.todayKey(0) });
  const recent = store.getMealsByAuthor(p.id).slice(0, 12);

  const body = `<div class="card" style="margin-top:12px;padding:16px 14px">
    <div style="display:flex;align-items:center;gap:13px">
      ${avatar(user, 'ava-xl')}
      <div class="grow">
        <div style="font-size:19px;font-weight:600">${esc(user.nickname)}</div>
        <div style="display:flex;align-items:center;gap:7px;margin-top:6px">
          <span class="level">${esc(user.levelText)}</span>
          <span style="font-size:11px;color:var(--text2)">已记录 ${user.recordCount} 顿</span>
        </div>
        ${user.bio ? `<div style="font-size:11.5px;color:var(--text2);margin-top:6px;line-height:1.6">${esc(user.bio)}</div>` : ''}
      </div>
    </div>
    ${
      isMe
        ? `<div style="margin-top:15px;height:44px;line-height:44px;border-radius:22px;background:var(--sage-soft);color:#5C7A52;text-align:center;font-size:14px">这是你自己的吃饭档案</div>`
        : `<button class="btn btn-block ${following ? 'btn-sage' : 'btn-primary'}" style="margin-top:15px" data-act="toggle-follow" data-id="${p.id}">${following ? '已跟吃 ✓' : '跟吃 TA'}</button>`
    }
    <div style="font-size:10.5px;color:var(--text3);text-align:center;margin-top:8px">${isMe ? '想回看更久以前，去「我的饭历」' : '以后多看看 TA 都吃些什么'}</div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">今天吃了什么</span></div>
    <div class="card" style="padding:0 12px">
      ${C.MEAL_TYPES.map((t) => {
        const hit = todayMeals.find((m) => m.mealType === t.key);
        return `<div class="${hit ? 'tap ' : ''}au-today-row" ${hit ? `data-act="open-meal" data-id="${hit.id}"` : ''}>
          <div class="au-today-left"><span>${t.emoji}</span><span class="au-today-label">${t.label}</span></div>
          <div class="au-today-right">${
            hit
              ? `<span class="au-today-name">${esc(hit.name)}</span><span class="au-today-amount">${esc(hit.amountText)}</span><span class="cell-arrow">›</span>`
              : `<span class="au-today-none">还没记录</span>`
          }</div>
        </div>`;
      }).join('')}
    </div>
  </div>

  <div class="section">
    <div class="section-head"><span class="section-title">最近吃过</span><span class="section-more">共 ${user.recordCount} 顿</span></div>
    ${recent.length ? mealGrid(recent, 'author') : '<div class="empty"><div class="empty__text">还没有记录</div></div>'}
  </div>

  <div style="font-size:10.5px;color:var(--text3);text-align:center;margin:22px 4px 10px;line-height:1.7">不显示粉丝数，也不做点赞竞争。这里只是一个吃饭档案。</div>`;

  return { title: user.nickname, body: `<div class="screen-body" style="padding:0 16px 28px">${body}</div>` };
}

/* =====================================================================
   9. 我的
   ===================================================================== */
function screenMine() {
  const me = store.getMe();
  const today = store.getTodaySummary();
  const entries = [
    ['calendar', '🗓', '我的饭历', '回看已经真实吃过的饭'],
    ['plan', '📋', '我的餐单', '今天和明天的三餐安排'],
    ['wish', '💛', '我的想吃', '以后可能想吃的都在这'],
    ['following', '👀', '我跟吃的人', '看看他们今天吃了什么']
  ];
  const body = `<div class="card" style="display:flex;align-items:center;gap:12px;margin-top:12px">
      ${avatar(me, 'ava-lg')}
      <div class="grow">
        <div style="font-size:18px;font-weight:600">${esc(me.nickname)}</div>
        <div style="display:flex;align-items:center;gap:7px;margin-top:5px">
          <span class="level">${esc(me.levelText)}</span>
          <span style="font-size:11px;color:var(--text2)">已记录 ${me.recordCount} 顿</span>
        </div>
      </div>
      <div class="tap" data-act="edit-profile" style="font-size:12px;color:var(--text2);padding:6px 11px;border-radius:999px;border:1px solid var(--divider)">编辑资料</div>
    </div>

    <div class="section">
      <div class="section-head"><span class="section-title">今天</span><span class="section-more">已记录 ${today.count} 顿 · ${esc(today.totalText)}</span></div>
      <div class="card today">
        ${today.slots
          .map(
            (s) => `<div class="tap today-slot ${s.recorded ? 'today-slot--on' : ''}" data-act="mine-slot" data-recorded="${s.recorded}">
          <span class="today-emoji">${s.emoji}</span>
          <span class="today-label">${s.label}</span>
          <span class="today-name">${esc(s.name)}</span>
          ${s.amountText ? `<span class="today-amount">${esc(s.amountText)}</span>` : ''}
        </div>`
          )
          .join('')}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:7px;padding-left:2px">${esc(today.pendingText)}</div>
    </div>

    <div class="tap card" data-act="go-stats" style="display:flex;align-items:center;margin-top:16px;background:linear-gradient(135deg,#FFF3E8,#FFE8D3);border-color:transparent">
      <div class="grow">
        <div style="font-size:12px;color:var(--text2)">本月吃饭</div>
        <div style="font-size:26px;font-weight:600;color:var(--primary);margin-top:3px;line-height:1.2">${esc(today.monthTotalText)}</div>
      </div>
      <span style="font-size:11px;color:var(--text2)">周 / 月 / 年</span><span class="cell-arrow">›</span>
    </div>

    <div class="section">
      <div class="card" style="padding:0 14px">
        ${entries
          .map(
            ([k, icon, title, desc]) => `<div class="tap entry-row" data-act="go-page" data-page="${k}">
          <span class="entry-icon">${icon}</span>
          <div class="grow"><div class="entry-title">${title}</div><div class="entry-desc">${desc}</div></div>
          <span class="cell-arrow">›</span>
        </div>`
          )
          .join('')}
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:24px">
      <span class="tap" style="font-size:13px;color:var(--text2)" data-act="go-settings">使用说明</span>
      <span style="color:var(--text3)">·</span>
      <span class="tap" style="font-size:13px;color:var(--text2)" data-act="go-settings">设置</span>
    </div>
    <div style="font-size:10.5px;color:var(--text3);text-align:center;margin-top:10px;line-height:1.7">等级只做轻量展示，不影响推荐。这里没有排行榜，也没有红点。</div>`;

  return { title: '我的', tab: 'mine', body: `<div class="screen-body" style="padding:0 16px 28px">${body}</div>` };
}

/* =====================================================================
   10. 我的饭历
   ===================================================================== */
function ensureCalendar() {
  if (S.calendar) return S.calendar;
  const n = new Date();
  S.calendar = { year: n.getFullYear(), month: n.getMonth() + 1, selectedKey: F.todayKey(0) };
  return S.calendar;
}

function screenCalendar() {
  const cs = ensureCalendar();
  const r = store.getCalendarMonth(cs.year, cs.month);
  const mi = F.monthInfo(cs.year, cs.month);
  const cells = [];
  for (let i = 0; i < mi.lead; i++) cells.push({ empty: true });
  for (let d = 1; d <= mi.days; d++) {
    const key = `${cs.year}-${F.pad(cs.month)}-${F.pad(d)}`;
    cells.push({ empty: false, day: d, key, has: !!r.byDay[key], today: key === F.todayKey(0) });
  }
  while (cells.length % 7 !== 0) cells.push({ empty: true });

  // 保证选中日期一定落在当前展示月份内（切换月份后不能沿用上个月的 key）
  const monthPrefix = `${cs.year}-${F.pad(cs.month)}-`;
  if (!cs.selectedKey || cs.selectedKey.indexOf(monthPrefix) !== 0) {
    const withRecord = Object.keys(r.byDay).sort();
    cs.selectedKey = withRecord.length ? withRecord[0] : monthPrefix + '01';
  }

  const sel = r.byDay[cs.selectedKey];
  const parts = cs.selectedKey.split('-');
  const now = new Date();
  const canNext = !(cs.year === now.getFullYear() && cs.month === now.getMonth() + 1);

  const body = `<div class="card" style="margin-top:12px;padding:12px 14px 14px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--divider)">
        <span class="tap cal-nav" data-act="cal-prev">‹</span>
        <span style="font-size:17px;font-weight:600">${cs.year}年${cs.month}月</span>
        <span class="tap cal-nav" data-act="cal-next" style="${canNext ? '' : 'opacity:.32'}">›</span>
      </div>
      <div style="display:flex;margin-top:12px">
        <div style="flex:1"><div style="font-size:11.5px;color:var(--text2)">本月已记录</div><div style="font-size:19px;font-weight:600;margin-top:3px">${r.count} 顿</div></div>
        <div class="tap" data-act="go-stats" style="flex:1"><div style="font-size:11.5px;color:var(--text2)">本月消费</div><div style="font-size:19px;font-weight:600;margin-top:3px;color:var(--primary)">${esc(r.totalText)}</div></div>
      </div>
    </div>

    <div class="card" style="margin-top:12px;padding:12px 8px 10px">
      <div class="cal-week">${['一', '二', '三', '四', '五', '六', '日'].map((w) => `<div class="cal-week-cell">${w}</div>`).join('')}</div>
      <div class="cal-grid">
        ${cells
          .map(
            (c) => `<div class="cal-cell ${c.empty ? 'cal-cell--empty' : ''} ${c.today ? 'cal-cell--today' : ''} ${!c.empty && c.key === cs.selectedKey ? 'cal-cell--on' : ''}" ${c.empty ? '' : `data-act="cal-day" data-key="${c.key}"`}>
          ${c.empty ? '' : `<span class="cal-day">${c.day}</span><span class="cal-dots">${c.has ? '<i></i>' : ''}</span>`}
        </div>`
          )
          .join('')}
      </div>
    </div>

    <div class="card" style="margin-top:12px;padding:0 14px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;padding:14px 0 10px;border-bottom:1px solid var(--divider)">
        <span style="font-size:16px;font-weight:600">${Number(parts[1])}月${Number(parts[2])}日</span>
        <span style="font-size:13px;color:${sel ? 'var(--primary)' : 'var(--text3)'};font-weight:${sel ? 500 : 400}">${sel ? '当天 ' + esc(sel.totalText) : '当天没有记录'}</span>
      </div>
      ${(sel ? sel.byType : C.MEAL_TYPES.map((t) => ({ label: t.label, emoji: t.emoji, meal: null })))
        .map(
          (s) => `<div class="${s.meal ? 'tap ' : ''}day-row" ${s.meal ? `data-act="open-meal" data-id="${s.meal.id}"` : ''}>
        <div class="day-row-left"><span class="day-emoji">${s.emoji}</span>
          <div><div class="day-type">${s.label}</div><div class="day-name">${s.meal ? esc(s.meal.name) : '还没记录'}</div></div>
        </div>
        <div class="day-row-right">${s.meal ? `<span class="day-amount">${esc(s.meal.amountText)}</span><span class="cell-arrow">›</span>` : ''}</div>
      </div>`
        )
        .join('')}
      ${sel ? `<div style="font-size:10.5px;color:var(--text3);padding:10px 0 14px;line-height:1.7">饭历只包含真实已经吃过的饭。收藏和餐单计划不会出现在这里。</div>` : ''}
    </div>`;

  return { title: '我的饭历', body: `<div class="screen-body" style="padding:0 16px 28px">${body}</div>` };
}

/* =====================================================================
   11. 我的餐单
   ===================================================================== */
function screenPlan() {
  const board = store.getPlanBoard();
  const day = board[S.plan.day];
  const body = `<div class="segment" style="margin-top:14px">
      ${board.map((b, i) => `<div class="segment-item ${S.plan.day === i ? 'segment-item--on' : ''}" data-act="plan-day" data-i="${i}">${b.label}</div>`).join('')}
    </div>
    <div style="font-size:12px;color:var(--text2);margin:12px 0 8px 4px">${day.label} · ${day.dateText}</div>

    ${day.slots
      .map(
        (s) => `<div class="card" style="margin-bottom:11px;padding:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px">
        <div style="display:flex;align-items:center;gap:6px"><span style="font-size:15px">${s.emoji}</span><span style="font-size:13.5px;color:var(--text2)">${s.mealTypeLabel}</span></div>
        <span class="tag ${s.status === 'completed' ? 'tag-sage' : s.status === 'planned' ? 'tag-apricot' : 'tag-plain'}">${s.statusLabel}</span>
      </div>
      ${
        s.hasPlan
          ? `<div class="${s.status === 'completed' ? 'tap ' : ''}" ${s.status === 'completed' && s.mealId ? `data-act="open-meal" data-id="${s.mealId}"` : ''} style="display:flex;align-items:center;gap:10px">
          <div style="width:52px;height:52px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;background:linear-gradient(150deg,${s.grad1},${s.grad2})"><span>${s.foodEmoji}</span></div>
          <div class="grow">
            <div style="font-size:16px;font-weight:500">${esc(s.name)}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
              ${s.sourceText ? `<span class="plan-slot-source">${esc(s.sourceText)}</span>` : ''}
              ${s.referenceAmountText ? `<span class="plan-slot-ref">${esc(s.referenceAmountText)}</span>` : ''}
            </div>
          </div>
          ${s.status === 'completed' ? '<span class="cell-arrow">›</span>' : ''}
        </div>
        ${
          s.status === 'planned'
            ? `<div style="display:flex;gap:8px;margin-top:11px">
          <button class="btn btn-soft btn-sm" data-act="plan-cancel" data-slot="${s.mealType}">取消</button>
          <button class="btn btn-primary btn-sm grow" data-act="plan-ate" data-slot="${s.mealType}">我吃了</button>
        </div>`
            : `<div style="font-size:11px;color:#5C7A52;margin-top:9px">已计入饭历和消费统计</div>`
        }`
          : `<div style="font-size:13px;color:var(--text3);margin-bottom:10px">还没想好吃什么</div>
        <div style="display:flex;gap:8px">
          <div class="tap" style="flex:1;height:38px;border-radius:10px;background:var(--apricot-soft);color:var(--primary);font-size:12px;display:flex;align-items:center;justify-content:center;gap:4px" data-act="go-home"><span>🍚</span>看看大家吃什么</div>
          <div class="tap" style="flex:1;height:38px;border-radius:10px;background:var(--apricot-soft);color:var(--primary);font-size:12px;display:flex;align-items:center;justify-content:center;gap:4px" data-act="go-random"><span>🎲</span>随机帮我选</div>
        </div>`
      }
    </div>`
      )
      .join('')}

    <div class="tap card card-soft" data-act="go-wish" style="display:flex;align-items:center;justify-content:center;padding:13px;font-size:13px;color:var(--primary)">从「我的想吃」里挑一个安排进来 →</div>

    <div style="font-size:10.5px;color:var(--text3);line-height:1.75;margin:14px 4px 0">餐单管的是「准备吃什么」，不是「已经吃过什么」。参考价格不会计入真实消费；只有点「我吃了」并完成记一顿，才会进入饭历与消费统计。</div>`;

  return { title: '我的餐单', body: `<div class="screen-body" style="padding:0 16px 28px">${body}</div>` };
}

/* =====================================================================
   12. 我的想吃
   ===================================================================== */
function screenWish() {
  const wishes = store.getWishes();
  const body = `<div class="tap" data-act="go-wish-add" style="display:flex;align-items:center;justify-content:center;gap:6px;height:48px;border-radius:12px;background:var(--primary);color:#fff;margin-top:14px;font-size:15px;font-weight:500">
      <span style="font-size:18px;line-height:1">＋</span><span>记一个想吃的</span>
    </div>

    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-top:20px">
      <span style="font-size:16px;font-weight:600">我的想吃</span><span style="font-size:11px;color:var(--text3)">${wishes.length} 个</span>
    </div>
    <div style="font-size:11px;color:var(--text2);margin-top:5px;line-height:1.7">私人饮食愿望清单。收藏别人的饭记，或者自己随手记下路过的小馆子。</div>

    ${
      wishes.length
        ? wishes
            .map(
              (w) => `<div class="card" style="margin-top:11px;padding:12px">
      <div style="display:flex;gap:10px">
        <div style="width:66px;height:66px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:29px;flex-shrink:0;background:linear-gradient(150deg,${w.grad1},${w.grad2})"><span>${w.emoji}</span></div>
        <div class="grow">
          <div style="font-size:16px;font-weight:500">${esc(w.name)}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
            ${w.placeName || w.areaName ? `<span style="font-size:11.5px;color:var(--text2)">${esc(w.placeName || w.areaName)}</span>` : ''}
            ${w.amountText ? `<span style="font-size:11.5px;color:var(--primary)">${esc(w.amountText)}</span>` : ''}
          </div>
          ${w.note ? `<div style="font-size:11px;color:var(--text2);margin-top:4px;line-height:1.6">“${esc(w.note)}”</div>` : ''}
          <div class="${w.sourceType === 'savedMeal' ? 'tap ' : ''}" style="font-size:10.5px;color:var(--text3);margin-top:5px" ${w.sourceType === 'savedMeal' && w.sourceMealId ? `data-act="open-meal" data-id="${w.sourceMealId}"` : ''}>${esc(w.sourceText)}${w.sourceType === 'savedMeal' ? ' ›' : ''}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:11px;padding-top:10px;border-top:1px solid var(--divider)">
        <span class="tap" style="font-size:12px;color:var(--text2)" data-act="wish-ate" data-id="${w.id}">我吃过了</span>
        <span class="tap" style="font-size:12px;color:var(--coral)" data-act="wish-remove" data-id="${w.id}">移除</span>
        <button class="btn btn-primary btn-sm grow" data-act="wish-plan" data-id="${w.id}">安排到餐单</button>
      </div>
    </div>`
            )
            .join('')
        : `<div class="empty">
      <img class="empty__img" src="../assets/logo_main.png" alt="">
      <div class="empty__text">还没有想吃的</div>
      <div class="empty__text">看到别人吃的饭记，点个「收藏」就会出现在这里。</div>
    </div>`
    }`;

  return { title: '我的想吃', body: `<div class="screen-body" style="padding:0 16px 28px">${body}</div>` };
}

/* =====================================================================
   13. 想吃录入
   ===================================================================== */
function ensureWishEdit() {
  if (!S.wishEdit) S.wishEdit = { name: '', placeName: '', expectedAmount: '', images: [], note: '' };
  return S.wishEdit;
}

function screenWishEdit() {
  const d = ensureWishEdit();
  const body = `<div class="card card-soft" style="margin-top:14px;font-size:12px;color:#8A4A17;line-height:1.7">
      想吃的不用是探店推荐。路过的小馆子、朋友说好吃的、突然想吃的，都可以先记下来。
    </div>

    <div class="field" style="margin-top:16px">
      <div class="field-label">想吃什么 / 店名</div>
      <div class="field-box"><input class="ipt" id="we-name" maxlength="24" placeholder="例如：老王牛肉面" value="${esc(d.name)}"></div>
    </div>

    <div class="field">
      <div class="field-label">地点（选填）</div>
      <div class="field-box"><input class="ipt" id="we-place" maxlength="24" placeholder="例如：五角场" value="${esc(d.placeName)}"></div>
    </div>

    <div class="field">
      <div class="field-label">预计金额（选填）</div>
      <div class="rec-amount"><span class="rec-amount-sign">¥</span><input class="ipt" id="we-amount" inputmode="decimal" placeholder="例如 25" value="${esc(d.expectedAmount)}"></div>
      <div class="rec-hint-inline">预计金额只是参考，不会计入你的真实消费统计。</div>
    </div>

    <div class="field">
      <div class="field-label">图片（选填）</div>
      <div class="rec-images" style="margin-bottom:0">
        ${
          d.images.length
            ? `<div class="rec-img" style="background:none;border:1px solid var(--divider);overflow:hidden">
          <img src="${esc(d.images[0])}" style="width:100%;height:100%;object-fit:cover" alt="">
          <div class="tap" data-act="we-remove-img" style="position:absolute;right:0;top:0;width:23px;height:23px;background:rgba(73,53,42,.55);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;border-bottom-left-radius:10px">✕</div>
        </div>`
            : `<div class="rec-img tap" data-act="we-add-img">
          <span class="rec-img-plus">＋</span><span class="rec-img-label">添加照片</span><span class="rec-img-opt">（可选）</span>
        </div>`
        }
      </div>
    </div>

    <div class="field">
      <div class="field-label">备注（选填）</div>
      <div class="field-box field-box--area"><textarea class="ipt" id="we-note" maxlength="60" placeholder="比如：朋友说他家辣椒油很好吃">${esc(d.note)}</textarea></div>
      <div class="counter"><span id="we-note-count">${d.note.length}</span>/60</div>
    </div>

    <button class="btn btn-primary btn-block" data-act="we-submit">收进我的想吃</button>`;

  return { title: '记一个想吃的', body: `<div class="screen-body" style="padding:0 16px 28px">${body}</div>` };
}

/* =====================================================================
   14. 我跟吃的人
   ===================================================================== */
function screenFollowing() {
  const list = store.getFollowingList();
  const body = `<div style="font-size:20px;font-weight:600;margin-top:16px;line-height:1.4">我最近在跟吃 ${list.length} 个人</div>
    <div style="font-size:11.5px;color:var(--text2);margin-top:7px;line-height:1.7">跟吃只是「我觉得 TA 的口味有参考价值」。这里不显示对方有多少粉丝。</div>

    ${
      list.length
        ? `<div class="card" style="margin-top:16px;padding:0 14px">
      ${list
        .map(
          (u) => `<div class="tap entry-row" data-act="open-author" data-id="${u.id}" style="gap:10px">
        ${avatar(u, 'ava-md')}
        <div class="grow">
          <div style="font-size:15.5px;font-weight:500">${esc(u.nickname)}</div>
          <div style="font-size:11.5px;color:${u.todayMeal.tone === 'primary' ? 'var(--primary)' : 'var(--text2)'};margin-top:3px">${esc(u.todayMeal.text)}</div>
        </div>
        <div class="tap" data-act="unfollow" data-id="${u.id}" data-name="${esc(u.nickname)}" style="font-size:11px;color:var(--text2);padding:5px 10px;border-radius:999px;background:#F6F1EC">已跟吃 ✓</div>
      </div>`
        )
        .join('')}
    </div>`
        : `<div class="empty">
      <img class="empty__img" src="../assets/logo_main.png" alt="">
      <div class="empty__text">还没有跟吃的人</div>
      <div class="empty__text">看到喜欢的饭记，点进作者主页就能跟吃 TA。</div>
    </div>`
    }`;

  return { title: '我跟吃的人', body: `<div class="screen-body" style="padding:0 16px 28px">${body}</div>` };
}

/* =====================================================================
   15. 消费统计
   ===================================================================== */
function screenStats() {
  const st = store.getStats(S.stats.period);
  st.trend = st.trend.map((t) => Object.assign({}, t, { barHeight: t.value > 0 ? Math.max(8, t.percent) : 0 }));
  const periods = [
    ['week', '周'],
    ['month', '月'],
    ['year', '年']
  ];
  const body = `<div class="segment" style="margin-top:14px">
      ${periods.map(([k, l]) => `<div class="segment-item ${S.stats.period === k ? 'segment-item--on' : ''}" data-act="stats-period" data-key="${k}">${l}</div>`).join('')}
    </div>

    <div class="card" style="margin-top:12px;background:linear-gradient(135deg,#FFF3E8,#FFE8D3);border-color:transparent">
      <div style="font-size:12px;color:var(--text2)">${esc(st.label)}</div>
      <div style="font-size:34px;font-weight:600;color:var(--primary);margin-top:4px;line-height:1.15">${esc(st.totalText)}</div>
      <div style="font-size:11.5px;color:var(--text2);margin-top:5px">共 ${st.count} 顿 · 平均每顿 ${esc(st.avgText)}</div>
    </div>

    <div class="section">
      <div class="section-head"><span class="section-title">${S.stats.period === 'year' ? '每月趋势' : '每天趋势'}</span><span class="section-more">最高 ${st.maxValue} 元</span></div>
      ${
        st.hasData
          ? `<div class="card" style="padding:14px 10px 8px">
        <div class="st-bars">${st.trend
          .map(
            (t) => `<div class="st-bar">
          <div class="st-bar-col"><div class="st-bar-value" style="height:${t.barHeight}%"></div></div>
          <span class="st-bar-label">${esc(t.label)}</span>
        </div>`
          )
          .join('')}</div>
      </div>`
          : `<div class="card" style="padding:30px 14px;text-align:center">
        <div style="font-size:12px;color:var(--text3);line-height:1.8">这个时间段还没有记录金额</div>
        <div style="font-size:12px;color:var(--text3);line-height:1.8">记一顿的时候填上金额，这里就会自动帮你算</div>
      </div>`
      }
    </div>

    <div class="section">
      <div class="section-head"><span class="section-title">餐次统计</span><span class="section-more">${esc(st.label)}</span></div>
      <div class="card" style="padding:4px 14px">
        ${st.types
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

    <div class="tap" data-act="go-calendar" style="font-size:10.5px;color:var(--text3);line-height:1.8;margin:18px 4px 10px;text-align:center">
      只统计「真实吃过 + 完成记录 + 填了实际金额」的饭记。餐单里的参考价和想吃的预计金额都不算。去我的饭历看看 →
    </div>`;

  return { title: '消费统计', body: `<div class="screen-body" style="padding:0 16px 28px">${body}</div>` };
}

/* =====================================================================
   16. 使用说明与设置
   ===================================================================== */
const MANUAL = [
  ['1. 第一次打开', '用微信登录。给自己选一个昵称和头像，不需要使用真实身份。选择是否授权定位，开启后会优先帮你找附近约 3km 内的真实饭记；不想开启也没关系，可以手动选择区域。'],
  ['2. 首页怎么玩', '首页先给你看「饭」，不是先给你看博主。系统会根据时间自动帮你切到早餐、午餐或晚餐，你也可以自己改。每张饭卡只展示：饭名、金额、图片（如果有）、发布者、实际吃饭时间。'],
  ['3. 什么是「记一顿」', '吃完了，顺手把这一顿留下来就好。这里不是写攻略，不需要精心创作。餐次和金额可以填，图片和心情都可以不填。忘了当场记录也可以补记，饭历和消费统计会按你填的「实际用餐时间」归档。'],
  ['4. 我不想公开位置，可以吗？', '当然可以。你可以公开具体店铺或食堂，也可以只显示「五角场附近」这类模糊区域，也可以完全不向其他人展示地点。如果你允许系统使用位置，即使不公开具体地点，这顿饭仍然可以参与附近匹配。'],
  ['5. 一顿饭要不要分享，由你决定', '公开：大家都可以看到；仅附近可见：只进入附近饭流；仅自己可见：只留在自己的饭历里。你的吃饭心情和地点还有各自独立的公开设置。'],
  ['6. 收藏、跟吃，有什么区别？', '收藏 = 这个我以后可能想吃 → 放进「我的想吃」，不绑定时间。跟吃 = 我已经决定近期要吃这个 → 选择今天或明天的一餐，加入「我的餐单」。我吃了 = 我真的已经吃过 → 进入「记一顿」，确认后才算数。所以它们是一条很简单的路线：想吃 → 安排 → 吃过。'],
  ['7. 随机帮我选', '实在不想想了，就把决定交给随机。可以从附近大家正在吃的饭里随机一个，也可以从你自己的「我的想吃」里随机一个。不喜欢就点「换一个」；喜欢就直接加入餐单。'],
  ['8. 我的餐单', '餐单管的是「准备吃什么」，不是「已经吃过什么」。分成今天和明天，每天有早餐、午餐、晚餐三个位置。状态只有：已吃 / 待吃 / 未安排。吃完后点「我吃了」，再确认实际金额、时间等信息，才会进入饭历。'],
  ['9. 我的想吃', '它是你的私人美食愿望清单。可以收藏别人的饭记，也可以自己录入平时路过的小馆子、朋友推荐的店，或者某个突然想吃的东西。'],
  ['10. 我的饭历', '饭历只记录你真实已经吃过的饭。默认按月历查看，点某一天就能看到当天的早餐、午餐、晚餐，同时显示当天消费合计。'],
  ['11. 吃饭花了多少钱？', '只要你在记饭时留下实际金额，我们会帮你自动整理本周、本月、今年花了多少。餐单里的参考价格和「想吃」的预计金额不会算进真实消费。'],
  ['12. 常见问题', '一定要发照片吗？不用，没有照片也可以记饭。晚上才想起中午忘记记了怎么办？可以补记，并把实际用餐时间改成中午。不开定位还能用吗？可以，手动选择地区即可。「附近」大概是多远？目前默认约 3km。收藏会算我吃过了吗？不会。跟吃会算进消费吗？不会。']
];

function screenSettings() {
  const me = store.getMe();
  const t = S.settings;
  let body;
  if (t.tab === 'manual') {
    body = `<div class="card card-soft" style="margin-top:14px;font-size:12px;color:#8A4A17;line-height:1.7">这不是一份必须读完的说明书。想看就看，不想看也可以直接去逛。</div>
    <div style="margin-top:12px">
      ${MANUAL.map(
        ([title, text], i) => `<div class="card" style="margin-bottom:9px;padding:13px 14px">
        <div class="tap" data-act="manual-toggle" data-i="${i}" style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:14.5px;font-weight:500">${title}</span>
          <span style="font-size:13px;color:var(--text3);margin-left:10px">${t.openIndex === i ? '⌃' : '⌄'}</span>
        </div>
        ${t.openIndex === i ? `<div style="font-size:12.5px;color:var(--text2);line-height:1.85;margin-top:9px;padding-top:9px;border-top:1px dashed var(--divider)">${text}</div>` : ''}
      </div>`
      ).join('')}
    </div>
    <div class="card" style="margin-top:6px;padding:16px 14px;text-align:center">
      <div style="font-size:15px;font-weight:600">关于这只小狗</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.8;margin-top:7px;text-align:left">它是一只可爱俏皮的柴犬，是「吃什么」的小伙伴。它想传递的感觉不是「教你怎么吃」，而是「陪你一起想今天吃什么」。</div>
      <img src="../assets/logo_main.png" style="width:80px;height:80px;margin-top:8px" alt="">
    </div>
    <div class="tap" data-act="read-letter" style="text-align:center;font-size:13px;color:var(--primary);padding:20px 0 10px">重看一遍欢迎信 ›</div>`;
  } else {
    body = `<div class="card" style="margin-top:14px;padding:0 14px">
      <div class="tap entry-row" data-act="open-region">
        <div class="grow"><div class="entry-title" style="font-size:15px">我的区域</div><div class="entry-desc">用于匹配附近约 3km 的饭记</div></div>
        <span style="font-size:13px;color:var(--text2)">${esc(me.region || '未选择')}</span><span class="cell-arrow">›</span>
      </div>
      <div class="tap entry-row" data-act="privacy-rules">
        <div class="grow"><div class="entry-title" style="font-size:15px">隐私与公开规则</div><div class="entry-desc">三类权限相互独立</div></div>
        <span class="cell-arrow">›</span>
      </div>
      <div class="tap entry-row" data-act="read-letter">
        <div class="grow"><div class="entry-title" style="font-size:15px">欢迎信</div><div class="entry-desc">给今天还不知道吃什么的你</div></div>
        <span class="cell-arrow">›</span>
      </div>
    </div>

    <div class="card" style="margin-top:12px;padding:0 14px">
      <div class="tap entry-row" data-act="reset-demo">
        <div class="grow"><div class="entry-title" style="font-size:15px">重置演示数据</div><div class="entry-desc">恢复初始假数据，重新走一遍完整流程</div></div>
        <span class="cell-arrow">›</span>
      </div>
    </div>

    <div style="font-size:10.5px;color:var(--text3);text-align:center;line-height:1.8;margin-top:20px">
      <div>「吃什么」V1 演示版 · 本地假数据</div>
      <div>正式版接入真实后端后，本页的演示数据入口即可移除</div>
    </div>`;
  }

  return {
    title: '使用说明与设置',
    body: `<div class="screen-body" style="padding:0 16px 28px">
    <div class="segment" style="margin-top:14px">
      <div class="segment-item ${t.tab === 'manual' ? 'segment-item--on' : ''}" data-act="settings-tab" data-key="manual">使用说明</div>
      <div class="segment-item ${t.tab === 'setting' ? 'segment-item--on' : ''}" data-act="settings-tab" data-key="setting">设置</div>
    </div>
    ${body}
  </div>`
  };
}

/* =====================================================================
   路由
   ===================================================================== */
const SCREENS = {
  home: screenHome,
  record: screenRecord,
  mine: screenMine,
  random: screenRandom,
  'meal-detail': screenMealDetail,
  author: screenAuthor,
  calendar: screenCalendar,
  plan: screenPlan,
  wish: screenWish,
  'wish-edit': screenWishEdit,
  following: screenFollowing,
  stats: screenStats,
  settings: screenSettings,
  'onboard-profile': screenOnboardProfile,
  'onboard-location': screenOnboardLocation,
  welcome: screenWelcome
};

const TAB_TITLES = { home: '吃什么', record: '记一顿', mine: '我的' };

function current() {
  return S.stack.length ? S.stack[S.stack.length - 1] : { name: S.tab, params: {} };
}

function go(name, params) {
  S.stack.push({ name, params: params || {} });
  render();
}
function back() {
  S.stack.pop();
  render();
}
function switchTab(name) {
  S.tab = name;
  S.stack = [];
  render();
}

/* ---------------- 渲染 ---------------- */
function render() {
  // 未完成引导：任何 tab 页都先回首次进入流程
  const cur = current();
  const onboardPages = ['onboard-profile', 'onboard-location', 'welcome'];
  if (!store.hasOnboarded() && onboardPages.indexOf(cur.name) === -1) {
    S.stack = [{ name: 'onboard-profile', params: {} }];
  }

  const c = current();
  const build = SCREENS[c.name] || screenHome;
  const v = build(c.params || {});

  const showTab = !!v.tab && S.stack.length === 0;
  const activeTab = showTab ? v.tab : '';
  const tabs = [
    { key: 'home', label: '首页' },
    { key: 'record', label: '记一顿' },
    { key: 'mine', label: '我的' }
  ];

  const nav = v.customNav
    ? ''
    : `<div class="navbar ${v.plainNav ? 'navbar--plain' : ''}">
        ${S.stack.length ? `<div class="navbar__back" data-act="back">‹</div>` : ''}
        <div class="nav-title">${esc(v.title || TAB_TITLES[c.name] || '')}</div>
        <div class="nav-right"></div>
      </div>`;

  const tabbar = showTab
    ? `<div class="tabbar">${tabs
        .map((t) =>
          t.key === 'record'
            ? `<div class="tap tab tab-center" data-act="switch-tab" data-key="record">
                <div class="fab"><i></i></div><div class="tab-label tab-label--fab">${t.label}</div>
              </div>`
            : `<div class="tap tab ${activeTab === t.key ? 'tab--on' : ''}" data-act="switch-tab" data-key="${t.key}">
                <div class="tab-icon tab-icon--${t.key} ${activeTab === t.key ? 'is-on' : ''}"></div>
                <div class="tab-label">${t.label}</div>
              </div>`
        )
        .join('')}</div>`
    : '';

  const app = document.getElementById('app');
  app.innerHTML = `${nav}<div class="screen ${showTab ? 'screen--tab' : ''}">${v.body}</div>${tabbar}${v.fixedBottom || ''}`;

  // 浮层（遮罩 / 底部面板 / 弹窗 / Toast）挂在 #app 内部，跟随手机圆角裁切
  let ov = document.getElementById('overlay-layer');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'overlay-layer';
    ov.className = 'overlay-layer';
  }
  app.appendChild(ov);
  ov.innerHTML = regionSheetHtml() + planSheetHtml() + (v.extra || '') + overlayHtml();
}

/* ---------------- 交互动作 ---------------- */
const ACT = {
  /* 路由 */
  back: () => back(),
  'switch-tab': (el) => switchTab(el.dataset.key),
  'go-home': () => switchTab('home'),
  'go-record': () => switchTab('record'),
  'go-stats': () => go('stats'),
  'go-calendar': () => go('calendar'),
  'go-wish': () => go('wish'),
  'go-wish-add': () => {
    S.wishEdit = null;
    go('wish-edit');
  },
  'go-random': () => go('random'),
  'go-settings': () => go('settings'),
  'go-page': (el) => go(el.dataset.page),
  'read-letter': () => go('welcome'),
  'open-meal': (el) => {
    if (!el.dataset.id) return;
    go('meal-detail', { id: el.dataset.id });
  },
  'open-author': (el) => go('author', { id: el.dataset.id }),
  noop: () => {},

  /* 首次进入 */
  'pick-preset': (el) => {
    onboardDraft.avatarEmoji = el.dataset.emoji;
    onboardDraft.avatarUrl = '';
    render();
  },
  'onboard-next': () => {
    const input = document.getElementById('nick-input');
    const nickname = ((input && input.value) || '').trim() || onboardDraft.nickname;
    if (!nickname) return toast('先给自己起个名字吧');
    onboardDraft.nickname = nickname.slice(0, 12);
    store.saveMe({ nickname: onboardDraft.nickname, avatarEmoji: onboardDraft.avatarEmoji });
    const editing = S.stack.some((p) => p.name === 'onboard-profile' && p.editing);
    if (editing) {
      toast('已保存');
      return setTimeout(() => back(), 400);
    }
    go('onboard-location');
  },
  'onboard-skip': () => {
    store.saveMe({ nickname: '小橙', avatarEmoji: '🐕' });
    go('onboard-location');
  },
  'pick-onboard-region': (el) => {
    const r = C.REGIONS.find((x) => x.key === el.dataset.key);
    store.saveMe({ region: r.name, regionKey: r.key, locationAuthorized: false });
    render();
  },
  'use-gps': () => {
    if (!navigator.geolocation) {
      store.saveMe({ region: '当前位置附近', regionKey: 'gps', locationAuthorized: true });
      toast('演示环境没有定位权限，已按「当前位置附近」继续');
      return render();
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        store.saveMe({ region: '当前位置附近', regionKey: 'gps', locationAuthorized: true });
        toast('已开启附近匹配');
        render();
      },
      () => {
        toast('没拿到位置，可以先手动选');
      },
      { timeout: 6000 }
    );
  },
  'onboard-loc-next': () => {
    const me = store.getRawMe();
    if (!me.regionKey) return toast('选一个你常吃饭的地方');
    go('welcome');
  },
  'welcome-manual': () => {
    store.completeOnboarding();
    S.stack = [{ name: 'settings', params: {} }];
    S.settings.tab = 'manual';
    S.tab = 'mine';
    render();
  },
  'welcome-go': () => {
    store.completeOnboarding();
    switchTab('home');
  },

  /* 首页 */
  'home-meal': (el) => {
    S.home.mealType = el.dataset.key;
    render();
  },
  'home-sort': (el) => {
    S.home.sort = el.dataset.key;
    render();
  },
  'open-region': () => {
    S.regionSheet = true;
    render();
  },
  'pick-region': (el) => {
    const r = C.REGIONS.find((x) => x.key === el.dataset.key);
    store.saveMe({ region: r.name, regionKey: r.key, locationAuthorized: false });
    S.regionSheet = false;
    render();
  },

  /* 随机 */
  'random-source': (el) => {
    S.random.source = el.dataset.source;
    S.random.rolling = true;
    render();
    setTimeout(() => {
      S.random.result =
        S.random.source === 'wish' ? store.randomWish() : store.randomNearby(S.random.mealType);
      S.random.rolling = false;
      render();
    }, 300);
  },
  'random-back': () => {
    S.random.source = '';
    S.random.result = null;
    render();
  },
  'random-meal': (el) => {
    S.random.mealType = el.dataset.key;
    S.random.result = store.randomNearby(S.random.mealType);
    render();
  },
  'random-roll': () => {
    S.random.rolling = true;
    render();
    setTimeout(() => {
      S.random.result =
        S.random.source === 'wish' ? store.randomWish() : store.randomNearby(S.random.mealType);
      S.random.rolling = false;
      render();
    }, 300);
  },
  'random-plan': () => {
    const r = S.random.result;
    if (!r) return;
    S.planTarget = {
      name: r.name,
      amount: S.random.source === 'wish' ? r.expectedAmount : r.amount,
      sourceType: S.random.source === 'wish' ? 'wish' : 'meal',
      sourceId: r.id,
      sourceUserName: S.random.source === 'meal' ? r.authorName : ''
    };
    S.planSheet = { title: '就吃这个', desc: `${r.name} · 这只是计划，不算已经吃过` };
    render();
  },

  /* 饭记详情 */
  'toggle-save': (el) => {
    const on = store.toggleSaveMeal(el.dataset.id);
    toast(on ? '已放进我的想吃' : '已取消收藏');
    render();
  },
  'open-plan-sheet': (el) => {
    S.planTarget = {
      name: el.dataset.name,
      amount: store.getMealById(el.dataset.id).amount,
      sourceType: 'meal',
      sourceId: el.dataset.id,
      sourceUserName: el.dataset.author
    };
    S.planSheet = { title: '就吃这个', desc: `${el.dataset.name} · 这只是计划，不算已经吃过` };
    render();
  },
  'pick-plan': (el) => {
    const t = S.planTarget;
    if (!t) return;
    store.addPlan({
      date: el.dataset.date,
      mealType: el.dataset.type,
      name: t.name,
      referenceAmount: t.amount,
      sourceType: t.sourceType,
      sourceId: t.sourceId,
      sourceUserName: t.sourceUserName
    });
    const label = (C.MEAL_TYPES.find((x) => x.key === el.dataset.type) || {}).label;
    const day = el.dataset.date === F.todayKey(0) ? '今天' : '明天';
    S.planSheet = null;
    S.planTarget = null;
    render();
    dialog({
      title: `已加入我的餐单`,
      body: `${day}${label} · ${t.name}\n\n这只是计划，吃完后点「我吃了」并完成记录，才会进入饭历和消费统计。`,
      confirmText: '去餐单看看',
      cancelText: '知道了',
      onOk: () => go('plan')
    });
  },

  /* 记一顿 */
  'rec-meal': (el) => {
    ensureRecordForm().mealType = el.dataset.key;
    render();
  },
  'rec-open-time': () => {
    ensureRecordForm().timeSheet = true;
    render();
  },
  'rec-confirm-time': () => {
    const d = ensureRecordForm();
    const dateEl = document.getElementById('rec-date');
    const timeEl = document.getElementById('rec-time');
    if (dateEl && dateEl.value) d.dateStr = dateEl.value;
    if (timeEl && timeEl.value) d.timeStr = timeEl.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dateStr) || !/^\d{2}:\d{2}$/.test(d.timeStr)) {
      d.timeSheet = false;
      return render();
    }
    const dp = d.dateStr.split('-').map(Number);
    const tp = d.timeStr.split(':').map(Number);
    const ts = new Date(dp[0], dp[1] - 1, dp[2], tp[0], tp[1], 0, 0).getTime();
    d.mealType = F.currentMealType(ts); // 补记时按实际时间自动校正餐次
    d.timeSheet = false;
    render();
    toast(`已按 ${d.timeStr} 归档，餐次自动切到${(C.MEAL_TYPES.find((t) => t.key === d.mealType) || {}).label}`);
  },
  'rec-amount-unknown': () => {
    const d = ensureRecordForm();
    d.amountUnknown = !d.amountUnknown;
    if (d.amountUnknown) d.amount = '';
    render();
  },
  'rec-add-img': () => pickImage(false),
  'we-add-img': () => pickImage(true),
  'rec-remove-img': (el) => {
    ensureRecordForm().images.splice(Number(el.dataset.i), 1);
    render();
  },
  'we-remove-img': () => {
    ensureWishEdit().images = [];
    render();
  },
  'rec-open-loc': () => {
    ensureRecordForm().locSheet = true;
    render();
  },
  'rec-pick-loc': (el) => {
    const d = ensureRecordForm();
    const placeEl = document.getElementById('rec-place');
    if (placeEl) d.placeName = placeEl.value;
    d.locMode = el.dataset.key;
    render();
  },
  'rec-toggle-settings': () => {
    const d = ensureRecordForm();
    d.settingsOpen = !d.settingsOpen;
    render();
  },
  'rec-vis': (el) => {
    ensureRecordForm().visibility = el.dataset.key;
    render();
  },
  'rec-locmode': (el) => {
    ensureRecordForm().locMode = el.dataset.key;
    render();
  },
  'rec-moodvis': (el) => {
    ensureRecordForm().moodVisibility = el.dataset.key;
    render();
  },
  'rec-submit': () => {
    const d = ensureRecordForm();
    const nameEl = document.getElementById('rec-name');
    const amountEl = document.getElementById('rec-amount');
    const moodEl = document.getElementById('rec-mood');
    const placeEl = document.getElementById('rec-place');
    if (nameEl) d.name = nameEl.value;
    if (amountEl) d.amount = amountEl.value;
    if (moodEl) d.moodText = moodEl.value;
    if (placeEl) d.placeName = placeEl.value;

    if (!d.name.trim()) return toast('先写一下吃了什么');

    const me = store.getRawMe();
    const dp = d.dateStr.split('-').map(Number);
    const tp = d.timeStr.split(':').map(Number);
    const eatenAt = new Date(dp[0], dp[1] - 1, dp[2], tp[0], tp[1], 0, 0).getTime();

    const location =
      d.locMode === 'none'
        ? { placeName: '', areaName: '', displayMode: 'hidden', distanceKm: null, provided: false }
        : {
            placeName: d.locMode === 'exact' ? d.placeName || '未命名小馆' : '',
            areaName: me.region || C.DEFAULT_REGION.name,
            displayMode: d.locMode,
            distanceKm: 0.3,
            provided: true
          };

    const meal = store.addMeal({
      mealType: d.mealType,
      eatenAt,
      name: d.name,
      amount: d.amount,
      amountUnknown: d.amountUnknown || d.amount === '',
      imageUrls: [],
      moodText: d.moodText,
      moodVisibility: d.moodVisibility,
      visibility: d.visibility,
      location
    });

    if (d.images.length) SESSION_IMAGES[meal.id] = d.images[0];
    if (d.draftPlanId) store.completePlan(d.draftPlanId);

    const isPrivate = d.visibility === 'private';
    S.lastMeal = meal;
    S.record = null;
    S.done = meal.name;
    render();

    setTimeout(() => {
      S.done = null;
      if (isPrivate) {
        S.calendar = null;
        go('calendar');
      } else {
        S.home.mealType = meal.mealType;
        switchTab('home');
      }
    }, 1500);
  },

  /* 作者 */
  'toggle-follow': (el) => {
    const on = store.toggleFollow(el.dataset.id);
    toast(on ? '以后多看看 TA 吃什么' : '已取消跟吃');
    render();
  },

  /* 我的 */
  'edit-profile': () => {
    const me = store.getRawMe();
    onboardDraft.nickname = me.nickname;
    onboardDraft.avatarEmoji = me.avatarEmoji || '🐕';
    S.stack.push({ name: 'onboard-profile', params: {}, editing: true });
    render();
  },
  'mine-slot': (el) => go(el.dataset.recorded === 'true' ? 'calendar' : 'plan'),

  /* 饭历 */
  'cal-prev': () => {
    const cs = ensureCalendar();
    cs.month -= 1;
    if (cs.month < 1) {
      cs.month = 12;
      cs.year -= 1;
    }
    cs.selectedKey = '';
    render();
  },
  'cal-next': () => {
    const cs = ensureCalendar();
    const n = new Date();
    if (cs.year === n.getFullYear() && cs.month === n.getMonth() + 1) return;
    cs.month += 1;
    if (cs.month > 12) {
      cs.month = 1;
      cs.year += 1;
    }
    cs.selectedKey = '';
    render();
  },
  'cal-day': (el) => {
    const cs = ensureCalendar();
    const r = store.getCalendarMonth(cs.year, cs.month);
    cs.selectedKey = el.dataset.key;
    if (!r.byDay[el.dataset.key]) cs.selectedKey = el.dataset.key;
    render();
  },

  /* 餐单 */
  'plan-day': (el) => {
    S.plan.day = Number(el.dataset.i);
    render();
  },
  'plan-cancel': (el) => {
    const board = store.getPlanBoard();
    const slot = board[S.plan.day].slots.find((s) => s.mealType === el.dataset.slot);
    if (!slot) return;
    dialog({
      title: '取消这一餐？',
      body: '取消后不会留下任何饭历记录。',
      confirmText: '取消安排',
      cancelText: '再想想',
      onOk: () => {
        store.cancelPlan(slot.planId);
        render();
      }
    });
  },
  'plan-ate': (el) => {
    const board = store.getPlanBoard();
    const slot = board[S.plan.day].slots.find((s) => s.mealType === el.dataset.slot);
    if (!slot) return;
    const d = ensureRecordForm();
    d.name = slot.name;
    d.mealType = slot.mealType;
    d.dateStr = board[S.plan.day].key;
    d.amount = slot.referenceAmountText ? slot.referenceAmountText.replace(/[^\d.]/g, '') : '';
    d.amountUnknown = false;
    d.draftPlanId = slot.planId;
    S.record = d;
    switchTab('record');
    toast('已帮你填好这一顿，确认金额就能记下');
  },

  /* 想吃 */
  'wish-plan': (el) => {
    const w = store.getWishes().find((x) => x.id === el.dataset.id);
    if (!w) return;
    S.planTarget = {
      name: w.name,
      amount: w.expectedAmount,
      sourceType: 'wish',
      sourceId: w.id,
      sourceUserName: ''
    };
    S.planSheet = { title: '安排到餐单', desc: `${w.name} · 这只是计划，不算已经吃过` };
    render();
  },
  'wish-ate': (el) => {
    const w = store.getWishes().find((x) => x.id === el.dataset.id);
    if (!w) return;
    const d = ensureRecordForm();
    d.name = w.name;
    d.amount = w.expectedAmount ? String(w.expectedAmount) : '';
    d.locMode = w.placeName ? 'exact' : 'fuzzy';
    d.placeName = w.placeName || '';
    S.record = d;
    switchTab('record');
    toast('已帮你填好这一顿');
  },
  'wish-remove': (el) => {
    dialog({
      title: '从我的想吃里移除？',
      body: '移除后不会影响你的饭历和消费统计。',
      confirmText: '移除',
      cancelText: '留下',
      onOk: () => {
        store.removeWish(el.dataset.id);
        render();
      }
    });
  },
  'we-submit': () => {
    const d = ensureWishEdit();
    const nameEl = document.getElementById('we-name');
    const placeEl = document.getElementById('we-place');
    const amountEl = document.getElementById('we-amount');
    const noteEl = document.getElementById('we-note');
    if (nameEl) d.name = nameEl.value;
    if (placeEl) d.placeName = placeEl.value;
    if (amountEl) d.expectedAmount = amountEl.value;
    if (noteEl) d.note = noteEl.value;
    if (!d.name.trim()) return toast('写点什么想吃的');

    const me = store.getRawMe();
    const w = store.addWish({
      name: d.name,
      placeName: d.placeName,
      areaName: me.region || '',
      expectedAmount: d.expectedAmount,
      note: d.note
    });
    if (d.images.length) SESSION_IMAGES[w.id] = d.images[0];
    S.wishEdit = null;
    toast('已经放进我的想吃');
    setTimeout(() => back(), 500);
  },

  /* 跟吃 */
  unfollow: (el) => {
    dialog({
      title: `取消跟吃 ${el.dataset.name}？`,
      body: '取消后他/她的饭记不再优先出现在你的饭流里。',
      confirmText: '取消跟吃',
      cancelText: '继续跟吃',
      onOk: () => {
        store.toggleFollow(el.dataset.id);
        render();
      }
    });
  },

  /* 统计 */
  'stats-period': (el) => {
    S.stats.period = el.dataset.key;
    render();
  },

  /* 设置 */
  'settings-tab': (el) => {
    S.settings.tab = el.dataset.key;
    render();
  },
  'manual-toggle': (el) => {
    const i = Number(el.dataset.i);
    S.settings.openIndex = S.settings.openIndex === i ? -1 : i;
    render();
  },
  'privacy-rules': () =>
    dialog({
      title: '内容与公开规则',
      body: '饭记可见范围：公开 / 仅附近可见 / 仅自己可见。\n地点可见范围：具体地点 / 模糊区域 / 不公开。\n感受可见范围：公开 / 仅自己可见。\n三类权限相互独立，每一顿都可以单独设置。',
      confirmText: '知道了'
    }),
  'reset-demo': () =>
    dialog({
      title: '重置演示数据？',
      body: '会把昵称、头像、饭记、餐单、想吃全部恢复成初始假数据，用于重新走一遍完整流程。',
      confirmText: '确认重置',
      cancelText: '取消',
      onOk: () => {
        store.reset();
        S.stack = [];
        S.tab = 'home';
        S.record = null;
        S.calendar = null;
        S.home.mealType = F.currentMealType();
        Object.keys(SESSION_IMAGES).forEach((k) => delete SESSION_IMAGES[k]);
        render();
        toast('已重置');
      }
    }),

  /* 通用 */
  'close-sheet': () => {
    S.regionSheet = false;
    S.planSheet = null;
    S.planTarget = null;
    if (S.record) {
      const d = S.record;
      const placeEl = document.getElementById('rec-place');
      if (placeEl && d.locSheet) d.placeName = placeEl.value;
      d.timeSheet = false;
      d.locSheet = false;
      const dateEl = document.getElementById('rec-date');
      const timeEl = document.getElementById('rec-time');
      if (dateEl && dateEl.value && /^\d{4}-\d{2}-\d{2}$/.test(dateEl.value)) d.dateStr = dateEl.value;
      if (timeEl && timeEl.value && /^\d{2}:\d{2}$/.test(timeEl.value)) d.timeStr = timeEl.value;
    }
    render();
  },
  'dialog-ok': () => {
    const d = S.dialog;
    S.dialog = null;
    render();
    if (d && d.onOk) setTimeout(d.onOk, 10);
  },
  'dialog-cancel': () => {
    S.dialog = null;
    render();
  }
};

/* ---------------- 轻量 UI ---------------- */
let toastTimer = null;
function toast(text) {
  S.toast = text;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    S.toast = null;
    render();
  }, 1700);
}

function dialog(opt) {
  S.dialog = {
    title: opt.title,
    body: opt.body || '',
    confirmText: opt.confirmText,
    cancelText: opt.cancelText,
    onOk: opt.onOk
  };
  render();
}

/* 演示版选图：读成 dataURL，只存在会话里 */
function pickImage(isWish) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const target = isWish ? ensureWishEdit() : ensureRecordForm();
      if (isWish) target.images = [reader.result];
      else if (target.images.length < 3) target.images.push(reader.result);
      render();
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

/* ---------------- 事件绑定 ---------------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  e.stopPropagation();
  fn(el);
});

// 表单输入：只更新状态，不重渲染（否则会丢焦点）
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.id) return;
  if (t.id === 'nick-input') {
    onboardDraft.nickname = t.value;
    return;
  }
  const d = S.record;
  if (d) {
    if (t.id === 'rec-name') d.name = t.value;
    if (t.id === 'rec-amount') d.amount = t.value;
    if (t.id === 'rec-place') d.placeName = t.value;
    if (t.id === 'rec-mood') {
      d.moodText = t.value;
      const c = document.getElementById('mood-count');
      if (c) c.textContent = String(t.value.length);
    }
    if (t.id === 'rec-date') d.dateStr = t.value;
    if (t.id === 'rec-time') d.timeStr = t.value;
  }
  const w = S.wishEdit;
  if (w) {
    if (t.id === 'we-name') w.name = t.value;
    if (t.id === 'we-place') w.placeName = t.value;
    if (t.id === 'we-amount') w.expectedAmount = t.value;
    if (t.id === 'we-note') {
      w.note = t.value;
      const c = document.getElementById('we-note-count');
      if (c) c.textContent = String(t.value.length);
    }
  }
});

/* ---------------- 演示工具条 ---------------- */
function bindDemoBar() {
  const bar = document.getElementById('demo-bar');
  if (!bar) return;
  bar.addEventListener('click', (e) => {
    const el = e.target.closest('[data-demo]');
    if (!el) return;
    const act = el.dataset.demo;
    if (act === 'onboard') {
      store.saveMe({ onboarded: false, regionKey: '', region: '' });
      S.stack = [{ name: 'onboard-profile', params: {} }];
      render();
    }
    if (act === 'letter') go('welcome');
    if (act === 'manual') {
      S.settings.tab = 'manual';
      go('settings');
    }
    if (act === 'reset') ACT['reset-demo']();
  });
}

/* ---------------- 启动 ---------------- */
store.completeOnboarding(); // 演示默认已登录，可从工具条「重走首次进入」体验完整引导
render();
bindDemoBar();
