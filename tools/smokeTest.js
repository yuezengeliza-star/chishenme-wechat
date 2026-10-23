/**
 * 可交互演示的冒烟测试
 *
 * 做法：把 preview/app.html 复制一份，在末尾注入一段脚本，用合成点击事件把主要流程点一遍，
 *      再把结果写进 DOM 输出。配合 headless Chrome 的 --dump-dom 即可看到结果。
 *
 * 用法：
 *   node tools/smokeTest.js
 *   chrome --headless=new --disable-gpu --virtual-time-budget=8000 --dump-dom file:///.../.tmp_smoke.html
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'preview', 'app.html'), 'utf8');

const testScript = `
<div id="testout" style="display:none"></div>
<script>
(function () {
  var out = [];
  var errors = [];
  window.onerror = function (m, s, l, c) { errors.push(m + ' @' + l + ':' + c); flush(); };
  window.addEventListener('unhandledrejection', function (e) {
    errors.push('unhandled: ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
    flush();
  });

  var finished = false;
  function flush() {
    var fail = out.filter(function (x) { return x.indexOf('FAIL') === 0; }).length;
    var head = '=== SMOKE RESULT: ' + (out.length - fail) + ' passed, ' + fail + ' failed, ' + errors.length + ' js errors ==='
      + (finished ? '' : ' (RUNNING)');
    var tail = errors.length ? ['JS ERRORS: ' + errors.join(' ;; ')] : [];
    var el = document.getElementById('testout');
    if (el) el.textContent = '\\n' + head + '\\n' + out.join('\\n') + (tail.length ? '\\n' + tail.join('\\n') : '') + '\\n=== END ===';
    document.title = 'SMOKE ' + (finished && fail === 0 && errors.length === 0 ? 'OK' : 'FAIL');
  }
  function log(name, cond, extra) {
    out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' | ' + extra : ''));
    flush();
  }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function click(sel) {
    var el = typeof sel === 'string' ? q(sel) : sel;
    if (!el) return null;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return el;
  }
  function text() { return document.getElementById('app').textContent; }
  function db() { return window.__readDb && window.__readDb(); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function run() {
    await wait(80);

    // ---- 首页 ----
    log('首页渲染出饭流', text().indexOf('附近正在吃') > -1);
    log('首页有饭卡', qa('[data-act="open-meal"]').length > 0, qa('[data-act="open-meal"]').length);
    var beforeCount = qa('.mc').length;
    click('[data-act="home-meal"][data-key="dinner"]');
    await wait(30);
    log('切换餐次后仍是晚餐选中', !!q('.meal-tab--on'), q('.meal-tab--on') && q('.meal-tab--on').textContent);
    click('[data-act="home-sort"][data-key="latest"]');
    await wait(30);
    log('切换排序生效', text().indexOf('从近到远') > -1);
    click('[data-act="home-sort"][data-key="recommend"]');
    await wait(30);
    log('切回推荐排序', text().indexOf('就吃这个次数') > -1);

    // ---- 区域选择 ----
    click('[data-act="open-region"]');
    await wait(30);
    log('打开区域面板', !!q('.sheet-wrap') && text().indexOf('你在哪儿吃饭') > -1);
    click('[data-act="pick-region"][data-key="lujiazui"]');
    await wait(30);
    log('切换区域后标题栏更新', text().indexOf('陆家嘴附近') > -1);
    click('[data-act="pick-region"][data-key="wujiaochang"]');
    await wait(30);

    // ---- 饭记详情 ----
    var card = q('[data-act="open-meal"]');
    var mealId = card && card.dataset.id;
    click(card);
    await wait(40);
    log('进入饭记详情', !!q('[data-act="toggle-save"]') || text().indexOf('这是你记下的一顿') > -1);
    log('详情页有返回按钮', !!q('[data-act="back"]'));

    if (q('[data-act="toggle-save"]')) {
      var wBefore = (db().wishes || []).length;
      click('[data-act="toggle-save"]');
      await wait(40);
      var wAfter = (db().wishes || []).length;
      log('收藏写入数据层', wAfter === wBefore + 1, wBefore + ' -> ' + wAfter);

      // 就吃这个 → 选明天午餐
      click('[data-act="open-plan-sheet"]');
      await wait(40);
      var slots = qa('[data-act="pick-plan"]');
      log('就吃这个弹出餐次选择', slots.length >= 3, slots.map(function (s) { return s.textContent.trim(); }).join('/'));
      var tomorrowLunch = slots.filter(function (s) { return s.dataset.date !== slots[0].dataset.date; });
      var pBefore = (db().plans || []).length;
      click(tomorrowLunch[0] || slots[0]);
      await wait(40);
      log('餐单新增一条计划', (db().plans || []).length === pBefore + 1);
      log('弹出「已加入我的餐单」', !!q('.dialog'));
      click('[data-act="dialog-cancel"]');
      await wait(30);
      log('关掉弹窗回到详情', !!q('[data-act="back"]'));
    }

    click('[data-act="back"]');
    await wait(30);
    log('返回首页', text().indexOf('附近正在吃') > -1);

    // ---- 记一顿 ----
    click('[data-act="switch-tab"][data-key="record"]');
    await wait(40);
    log('进入记一顿', !!q('#rec-name'));

    var nameEl = q('#rec-name');
    nameEl.value = '冒烟测试红烧肉';
    nameEl.dispatchEvent(new Event('input', { bubbles: true }));
    var amtEl = q('#rec-amount');
    amtEl.value = '33';
    amtEl.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(20);

    var before = db().meals.length;
    click('[data-act="rec-submit"]');
    await wait(60);
    log('提交后新增饭记', db().meals.length === before + 1, before + ' -> ' + db().meals.length);
    log('出现柴犬成功反馈', !!q('.done-pop'));

    await wait(1700);
    var added = db().meals.filter(function (m) { return m.name === '冒烟测试红烧肉'; })[0];
    log('新饭记金额正确', added && Number(added.amount) === 33, added && added.amount);
    log('记完回到首页', text().indexOf('附近正在吃') > -1);
    log('新饭记出现在首页饭流', text().indexOf('冒烟测试红烧肉') > -1);

    // ---- 发布设置：不记金额 + 私密 ----
    click('[data-act="switch-tab"][data-key="record"]');
    await wait(40);
    click('[data-act="rec-toggle-settings"]');
    await wait(30);
    log('展开发布设置', text().indexOf('三类权限相互独立') > -1);
    click('[data-act="rec-vis"][data-key="private"]');
    await wait(30);
    log('选中「仅自己可见」', text().indexOf('仅自己可见 · 模糊区域 · 公开感受') > -1);
    click('[data-act="rec-amount-unknown"]');
    await wait(30);
    var n2 = q('#rec-name');
    n2.value = '私密的宵夜';
    n2.dispatchEvent(new Event('input', { bubbles: true }));
    var mBefore = db().meals.length;
    click('[data-act="rec-submit"]');
    await wait(60);
    var priv = db().meals.filter(function (m) { return m.name === '私密的宵夜'; })[0];
    log('私密 + 不记金额记录成功', !!priv && priv.visibility === 'private' && priv.amount === null, priv && (priv.visibility + '/' + priv.amount));
    log('私密记录条数 +1', db().meals.length === mBefore + 1);
    await wait(1700);

    // ---- 饭历 ----
    click('[data-act="switch-tab"][data-key="mine"]');
    await wait(40);
    log('进入我的', text().indexOf('本月吃饭') > -1);
    click('[data-act="go-page"][data-page="calendar"]');
    await wait(50);
    log('进入饭历', text().indexOf('本月已记录') > -1);
    log('饭历显示当天三餐', text().indexOf('早餐') > -1 && text().indexOf('晚餐') > -1);
    var selBefore = text();
    click('[data-act="cal-prev"]');
    await wait(40);
    log('切到上个月不报错', text().indexOf('年月') > -1 && /\\d{4}年\\d{1,2}月/.test(text()), (text().match(/\\d{4}年\\d{1,2}月/) || [''])[0]);
    click('[data-act="cal-next"]');
    await wait(40);
    var dayCells = qa('[data-act="cal-day"]');
    click(dayCells[5]);
    await wait(30);
    log('点某一天有响应', text().indexOf('当天') > -1);
    click('[data-act="back"]');
    await wait(30);

    // ---- 餐单 ----
    click('[data-act="go-page"][data-page="plan"]');
    await wait(40);
    log('进入餐单', text().indexOf('我的餐单') > -1 && text().indexOf('今天') > -1);
    click('[data-act="plan-day"][data-i="1"]');
    await wait(30);
    log('切到明天', text().indexOf('明天 ·') > -1);
    click('[data-act="plan-day"][data-i="0"]');
    await wait(30);
    var planned = qa('[data-act="plan-ate"]');
    log('有「我吃了」按钮', planned.length > 0, planned.length);
    if (planned.length) {
      click(planned[0]);
      await wait(50);
      log('跳到记一顿且已预填', !!q('#rec-name') && q('#rec-name').value.length > 0, q('#rec-name') && q('#rec-name').value);
      click('[data-act="switch-tab"][data-key="mine"]');
      await wait(30);
    }

    // ---- 想吃 ----
    click('[data-act="go-page"][data-page="wish"]');
    await wait(40);
    log('进入想吃', text().indexOf('私人饮食愿望清单') > -1);
    var wishCount = qa('[data-act="wish-plan"]').length;
    log('想吃的条目带来源', text().indexOf('收藏自 @') > -1 || text().indexOf('自己添加') > -1);
    if (wishCount) {
      click('[data-act="wish-plan"]');
      await wait(40);
      log('安排到餐单弹窗', text().indexOf('这只是计划') > -1);
      click('[data-act="close-sheet"]');
      await wait(30);
    }
    click('[data-act="go-wish-add"]');
    await wait(40);
    log('进入想吃录入', !!q('#we-name'));
    var weName = q('#we-name');
    weName.value = '冒烟测试小笼包';
    weName.dispatchEvent(new Event('input', { bubbles: true }));
    var wb = db().wishes.length;
    click('[data-act="we-submit"]');
    await wait(60);
    log('新增想吃的', db().wishes.length === wb + 1, wb + ' -> ' + db().wishes.length);
    await wait(600);
    log('提交后返回想吃列表', text().indexOf('私人饮食愿望清单') > -1);

    // ---- 跟吃 ----
    click('[data-act="back"]');
    await wait(30);
    click('[data-act="go-page"][data-page="following"]');
    await wait(40);
    log('进入我跟吃的人', text().indexOf('我最近在跟吃') > -1);
    var followRows = qa('[data-act="open-author"]');
    log('跟吃列表有内容', followRows.length > 0, followRows.length);
    if (followRows.length) {
      click(followRows[0]);
      await wait(40);
      log('进入作者主页', text().indexOf('最近吃过') > -1);
      var fBtn = q('[data-act="toggle-follow"]');
      if (fBtn) {
        var wasFollowing = fBtn.textContent.indexOf('已跟吃') > -1;
        click(fBtn);
        await wait(40);
        var nowBtn = q('[data-act="toggle-follow"]');
        log('跟吃状态可切换', nowBtn && (nowBtn.textContent.indexOf('已跟吃') > -1) !== wasFollowing);
      }
      click('[data-act="back"]');
      await wait(30);
    }
    click('[data-act="back"]');
    await wait(30);

    // ---- 统计 ----
    click('[data-act="go-stats"]');
    await wait(50);
    log('进入消费统计', text().indexOf('本月吃饭') === -1 && text().indexOf('平均每顿') > -1);
    log('有餐次统计', text().indexOf('餐次统计') > -1 && text().indexOf('早餐') > -1);
    log('有趋势柱状', qa('.st-bar-value').length > 0, qa('.st-bar-value').length);
    click('[data-act="stats-period"][data-key="week"]');
    await wait(40);
    log('切到周视图', text().indexOf('本周') > -1);
    click('[data-act="stats-period"][data-key="year"]');
    await wait(40);
    log('切到年视图', /\\d{4}年/.test(text()) && text().indexOf('每月趋势') > -1);
    click('[data-act="stats-period"][data-key="month"]');
    await wait(40);

    // ---- 设置 ----
    click('[data-act="back"]');
    await wait(30);
    click('[data-act="go-settings"]');
    await wait(40);
    log('进入设置', text().indexOf('使用说明') > -1);
    click('[data-act="manual-toggle"][data-i="2"]');
    await wait(30);
    log('使用说明可展开', text().indexOf('这里不是写攻略') > -1);
    click('[data-act="settings-tab"][data-key="setting"]');
    await wait(30);
    log('切到设置页', text().indexOf('重置演示数据') > -1);
    click('[data-act="back"]');
    await wait(30);

    // ---- 随机 ----
    click('[data-act="go-home"]');
    await wait(40);
    click('[data-act="go-random"]');
    await wait(40);
    log('进入随机', text().indexOf('把决定交给随机') > -1);
    click('[data-act="random-source"][data-source="nearby"]');
    await wait(500);
    log('抽到结果', text().indexOf('就吃这个') > -1 || text().indexOf('还没') > -1);
    var rollText = text();
    click('[data-act="random-roll"]');
    await wait(500);
    log('可以换一个', text().indexOf('就吃这个') > -1);
    void rollText;

    // ---- 首次进入流程 ----
    document.querySelector('[data-demo="onboard"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wait(50);
    log('重走首次进入 → 注册页', text().indexOf('先给自己起个名字') > -1);
    var nick = q('#nick-input');
    nick.value = '冒烟君';
    nick.dispatchEvent(new Event('input', { bubbles: true }));
    click('[data-act="onboard-next"]');
    await wait(50);
    log('进入位置页', text().indexOf('你在哪儿吃饭') > -1 && text().indexOf('系统用于匹配的位置') > -1);
    click('[data-act="pick-onboard-region"][data-key="fudan"]');
    await wait(30);
    click('[data-act="onboard-loc-next"]');
    await wait(50);
    log('进入欢迎信', text().indexOf('给今天还不知道吃什么的你') > -1 && text().indexOf('待会儿吃什么') > -1);
    click('[data-act="welcome-go"]');
    await wait(60);
    log('欢迎信后可进首页', text().indexOf('附近正在吃') > -1);
    log('昵称已保存', db().me.nickname === '冒烟君', db().me.nickname);

    // ---- 重置 ----
    click('[data-act="switch-tab"][data-key="mine"]');
    await wait(30);
    click('[data-act="go-settings"]');
    await wait(30);
    click('[data-act="settings-tab"][data-key="setting"]');
    await wait(30);
    click('[data-act="reset-demo"]');
    await wait(40);
    click('[data-act="dialog-ok"]');
    await wait(80);
    log('重置后回到首页', text().indexOf('附近正在吃') > -1);
    log('重置后昵称恢复', db().me.nickname === '小橙', db().me.nickname);

    // ---- 汇总 ----
    finished = true;
    flush();
  }

  window.addEventListener('load', function () {
    run().catch(function (e) {
      errors.push('run() 抛错: ' + (e && e.message ? e.message : e));
      out.push('FAIL 流程中断（见 JS ERRORS）');
      finished = true;
      flush();
    });
  });
})();
</script>
`;

html = html.replace('</body>', testScript + '</body>');
fs.writeFileSync(path.join(root, '.tmp_smoke.html'), html, 'utf8');
console.log('冒烟测试页已生成：.tmp_smoke.html');
