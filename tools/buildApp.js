/**
 * 可交互网页版生成器
 *
 * 把 utils/*.js（小程序真实数据层）+ tools/app.js（视图层）+ 样式，拼成一个自包含的
 * preview/app.html —— 不装微信开发者工具也能真实点一遍。
 *
 * 用法：node tools/buildApp.js
 *
 * 注意：数据层不会被打包成假数据，而是直接内联 utils/constants.js、format.js、mock.js、store.js，
 *      所以这里改 store 的规则，网页版和小程序会同步变化。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const UP = path.join(root, 'utils');

/* ---------------- 1. 把小程序数据层包成浏览器模块 ---------------- */
function wrapModule(name, file) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/<\/script>/gi, '<\\/script>');
  return `__def(${JSON.stringify(name)}, function (module, exports, require) {\n${code}\n});\n`;
}

const runtime = `
/* ---- 极简 CommonJS 运行时，用来原样复用小程序的 utils/*.js ---- */
var __mods = {}, __cache = {};
function __def(name, fn) { __mods[name] = fn; }
function __require(name) {
  var key = String(name).replace(/^\\.\\//, '');
  if (__cache[key]) return __cache[key].exports;
  var m = { exports: {} };
  __cache[key] = m;
  if (!__mods[key]) throw new Error('模块不存在: ' + name);
  __mods[key](m, m.exports, __require);
  return m.exports;
}
/* ---- 打桩 wx：优先用 localStorage，不可用时退回内存（file:// 下 Chrome 会禁用 localStorage） ---- */
window.__memStore = window.__memStore || {};
window.__storageMode = (function () {
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
    return 'localStorage';
  } catch (e) {
    return 'memory';
  }
})();

window.wx = {
  getStorageSync: function (k) {
    if (window.__storageMode === 'localStorage') {
      try { var v = localStorage.getItem('cs_' + k); return v ? JSON.parse(v) : ''; } catch (e) { return ''; }
    }
    return k in window.__memStore ? window.__memStore[k] : '';
  },
  setStorageSync: function (k, v) {
    if (window.__storageMode === 'localStorage') {
      try { localStorage.setItem('cs_' + k, JSON.stringify(v)); return; } catch (e) {}
    }
    window.__memStore[k] = JSON.parse(JSON.stringify(v));
  },
  removeStorageSync: function (k) {
    if (window.__storageMode === 'localStorage') {
      try { localStorage.removeItem('cs_' + k); return; } catch (e) {}
    }
    delete window.__memStore[k];
  }
};

/* 暴露给自动化测试用（只读，便于在无头浏览器里断言数据层状态） */
window.__readDb = function () {
  var raw = window.wx.getStorageSync('cs_db_v1');
  return raw && raw.meals ? raw : null;
};
`;

const modules =
  wrapModule('constants.js', path.join(UP, 'constants.js')) +
  wrapModule('format.js', path.join(UP, 'format.js')) +
  wrapModule('mock.js', path.join(UP, 'mock.js')) +
  wrapModule('store.js', path.join(UP, 'store.js'));

/* ---------------- 2. 视图层 ---------------- */
let appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
appJs = appJs.replace(/<\/script>/gi, '<\\/script>');

/* ---------------- 3. 样式 ---------------- */
const css =
  fs.readFileSync(path.join(__dirname, 'preview.css'), 'utf8') +
  '\n/* ===== 交互层 ===== */\n' +
  fs.readFileSync(path.join(__dirname, 'app.css'), 'utf8');

/* ---------------- 4. 组装 ---------------- */
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FFF8F1">
<title>吃什么 · 可交互演示</title>
<style>
${css}
</style>
</head>
<body class="app-body">

<div class="demo-bar" id="demo-bar">
  <div class="demo-bar__brand">
    <img src="../assets/logo_main.png" alt="">
    <span>吃什么 · 可交互演示</span>
  </div>
  <div class="demo-bar__hint">
    点着玩就行，行为和真机一致（数据存在本机浏览器里）。手机上打开会自动全屏。
  </div>
  <button class="demo-btn" data-demo="onboard">重走首次进入</button>
  <button class="demo-btn" data-demo="letter">看欢迎信</button>
  <button class="demo-btn demo-btn--ghost" data-demo="reset">重置演示数据</button>
</div>

<div class="device">
  <div class="device__notch"></div>
  <div class="phone" id="app"></div>
</div>

<div class="device-note">
  这是用小程序同一份数据层（utils/store.js）与同一套样式渲染出来的可交互版本，
  用于在不打开微信开发者工具的情况下真实走一遍流程。<br>
  正式小程序源码在 <code>chishenme-miniprogram/</code>。
</div>

<script>
${runtime}
${modules}
${appJs}
</script>
</body>
</html>
`;

const outDir = path.join(root, 'preview');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'app.html'), html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('可交互演示已生成：preview/app.html（' + kb + ' KB）');
