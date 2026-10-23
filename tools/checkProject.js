/**
 * 工程完整性自检：页面文件、tabBar 路径、跳转地址、组件引用
 * 用法：node tools/checkProject.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
let bad = 0;

console.log('== 页面文件完整性 ==');
app.pages.forEach((p) => {
  ['js', 'json', 'wxml', 'wxss'].forEach((ext) => {
    const f = path.join(root, p + '.' + ext);
    if (!fs.existsSync(f)) {
      console.log('  缺失: ' + p + '.' + ext);
      bad++;
    }
  });
});
console.log('  共 ' + app.pages.length + ' 个页面');

console.log('== tabBar 路径 ==');
app.tabBar.list.forEach((t) => {
  if (app.pages.indexOf(t.pagePath) === -1) {
    console.log('  tabBar 路径未注册: ' + t.pagePath);
    bad++;
  }
});
console.log('  OK');

console.log('== 跳转地址校验 ==');
const files = [];
(function walk(d) {
  fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const f = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== 'tools') walk(f);
    } else if (/\.(js|wxml)$/.test(e.name)) {
      files.push(f);
    }
  });
})(root);

const urls = new Set();
files.forEach((f) => {
  const s = fs.readFileSync(f, 'utf8');
  const re = /['"]\/pages\/([a-zA-Z0-9_\-/]+)\/?(?:\?[^'"]*)?['"]/g;
  let m;
  while ((m = re.exec(s))) urls.add('/pages/' + m[1]);
});
[...urls].sort().forEach((u) => {
  const p = u.replace(/^\//, '');
  if (app.pages.indexOf(p) === -1) {
    console.log('  无效跳转: ' + u);
    bad++;
  }
});
console.log('  共 ' + urls.size + ' 个跳转目标');

console.log('== 组件引用校验 ==');
app.pages.forEach((p) => {
  const j = JSON.parse(fs.readFileSync(path.join(root, p + '.json'), 'utf8'));
  Object.keys(j.usingComponents || {}).forEach((k) => {
    const f = path.join(root, (j.usingComponents[k] || '').replace(/^\//, '') + '.js');
    if (!fs.existsSync(f)) {
      console.log('  组件缺失: ' + p + ' -> ' + j.usingComponents[k]);
      bad++;
    }
  });
});
console.log('  OK');

console.log('== 自定义 tabBar ==');
['custom-tab-bar/index.js', 'custom-tab-bar/index.json', 'custom-tab-bar/index.wxml', 'custom-tab-bar/index.wxss'].forEach((f) => {
  if (!fs.existsSync(path.join(root, f))) {
    console.log('  缺失: ' + f);
    bad++;
  }
});
console.log('  OK');

console.log('== 本地资源引用校验 ==');
const assets = new Set();
files.forEach((f) => {
  const s = fs.readFileSync(f, 'utf8');
  const re = /['"]\/assets\/([a-zA-Z0-9_\-./]+)['"]/g;
  let m;
  while ((m = re.exec(s))) assets.add(m[1]);
});
[...assets].forEach((a) => {
  if (!fs.existsSync(path.join(root, 'assets', a))) {
    console.log('  资源缺失: assets/' + a);
    bad++;
  }
});
console.log('  共 ' + assets.size + ' 个资源引用');

console.log('== WXML 事件处理函数校验 ==');
// 每个 .wxml 里 bind*/catch* 绑定的方法，必须在同名的 .js 里存在
const wxmls = [];
(function walkWxml(d) {
  fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const f = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== 'tools') walkWxml(f);
    } else if (e.name.endsWith('.wxml')) {
      wxmls.push(f);
    }
  });
})(root);

let handlerCount = 0;
let handlerBad = 0;
wxmls.forEach((f) => {
  const jsPath = f.replace(/\.wxml$/, '.js');
  if (!fs.existsSync(jsPath)) {
    console.log('  缺少对应 JS: ' + path.relative(root, f));
    handlerBad++;
    return;
  }
  const wxml = fs.readFileSync(f, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const re = /\b(?:bind|catch|capture-bind|capture-catch)[:]?([a-zA-Z]+)\s*=\s*"([^"{}]+)"/g;
  let m;
  while ((m = re.exec(wxml))) {
    const handler = m[2].trim();
    if (!handler) continue;
    handlerCount++;
    // 方法可以写成 `name(` 、`name:` 、`name =` 三种
    const re2 = new RegExp('(^|[\\s,{])' + handler + '\\s*[(:]', 'm');
    if (!re2.test(js)) {
      console.log('  处理函数未定义: ' + path.relative(root, f) + ' → ' + handler);
      handlerBad++;
    }
  }
});
if (handlerBad) bad += handlerBad;
console.log('  共 ' + handlerCount + ' 个事件绑定，缺失 ' + handlerBad + ' 个');

console.log('\n总异常: ' + bad);
process.exit(bad ? 1 : 0);
