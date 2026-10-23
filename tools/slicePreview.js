/**
 * 开发期辅助：从 preview/index.html 中抽出指定的几个手机框，生成临时文件用于分段视觉检查。
 * 用法：node tools/slicePreview.js 4 5 6 7   （按 1 起的序号）
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'preview', 'index.html'), 'utf8');

const head = src.slice(0, src.indexOf('<main class="wall">'));
const mainStart = src.indexOf('<main class="wall">');
const mainEnd = src.indexOf('</main>');
const body = src.slice(mainStart + '<main class="wall">'.length, mainEnd);
const tail = src.slice(mainEnd);

const frames = body.split(/(?=<figure class="phone-wrap")/).filter((s) => s.trim());
const want = process.argv.slice(2).map(Number).filter(Boolean);
const picked = want.length ? want.map((n) => frames[n - 1]).filter(Boolean) : frames;

const html = head + '<main class="wall">' + picked.join('') + tail;
const out = path.join(root, '.tmp_shot', 'slice.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html, 'utf8');
console.log('已生成 .tmp_shot/slice.html，包含第 ' + (want.length ? want.join(',') : '全部') + ' 个页面（共 ' + frames.length + ' 个）');
