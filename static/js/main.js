/* static/js/main.js —— 初始化 + 星图带入讲解词 + 自动串生成三平台 + 图片按需拉取 */

/* ── 自定义暗色下拉（内容风格）── */
function enhanceStyleSelects() {
  document.querySelectorAll('.style-group select').forEach(function (sel) {
    var wrap = document.createElement('div'); wrap.className = 'cust-select';
    var trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'cs-trigger';
    var label = document.createElement('span'); label.className = 'cs-label';
    var caret = document.createElement('span'); caret.className = 'cs-caret';
    trigger.append(label, caret);
    var menu = document.createElement('div'); menu.className = 'cs-menu';
    var syncLabel = function () { var o = sel.options[sel.selectedIndex]; label.textContent = o ? o.textContent : ''; };
    var markSel = function () { [].forEach.call(menu.children, function (it) { it.classList.toggle('sel', it.dataset.value === sel.value); }); };
    [].forEach.call(sel.options, function (opt) {
      var item = document.createElement('div'); item.className = 'cs-item';
      item.textContent = opt.textContent; item.dataset.value = opt.value;
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        if (sel.value !== opt.value) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        syncLabel(); markSel(); wrap.classList.remove('open');
      });
      menu.appendChild(item);
    });
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !wrap.classList.contains('open');
      document.querySelectorAll('.cust-select.open').forEach(function (w) { w.classList.remove('open'); });
      wrap.classList.toggle('open', willOpen);
    });
    sel.addEventListener('change', function () { syncLabel(); markSel(); });
    sel.style.display = 'none';
    sel.parentNode.insertBefore(wrap, sel.nextSibling);
    wrap.append(trigger, menu);
    syncLabel(); markSel();
  });
  document.addEventListener('click', function () {
    document.querySelectorAll('.cust-select.open').forEach(function (w) { w.classList.remove('open'); });
  });
}

function init() {
  enhanceStyleSelects();
  renderFx();
  var spot = (new URLSearchParams(location.search).get('spot') || '').trim();
  if (spot && spot.length <= 40) startFromSpot(spot);   // 从星图带景点进来
  document.getElementById('inputText').addEventListener('input', updateCharCount);
}

function updateCharCount() {
  var len = document.getElementById('inputText').value.length;
  var el = document.getElementById('charCount');
  el.textContent = len + ' 字'; el.className = 'char-count';
  if (len >= 300 && len <= 800) el.classList.add('good');
  else if (len > 0) el.classList.add('warn');
}

async function pasteText() {
  try { var t = await navigator.clipboard.readText(); if (t) { document.getElementById('inputText').value = t; updateCharCount(); } }
  catch (e) { showError('无法读取剪贴板，请手动粘贴'); }
}

function clearText() {
  document.getElementById('inputText').value = '';
  updateCharCount();
  document.getElementById('errorMsg').style.display = 'none';
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ── 取讲解词原文（星图景点 / 手动景点名）── */
async function fetchGuide(name) {
  try { return await (await fetch('/api/spot-guide?name=' + encodeURIComponent(name))).json(); }
  catch (e) { return { guide: name, category: '' }; }
}

async function startFromSpot(name) {
  var box = document.getElementById('inputText');
  box.value = '正在载入「' + name + '」的讲解词原文…';
  var g = await fetchGuide(name);
  spotName = name;
  currentText = g.guide || name;
  box.value = currentText; updateCharCount();
  await generateAll();
}

/* ── 主流程：点「生成内容」──*/
async function doConvert() {
  var text = document.getElementById('inputText').value.trim();
  if (!text) { showError('请先从「景点星图」选景点，或输入景点名'); return; }
  var btn = document.getElementById('submitBtn');
  document.getElementById('errorMsg').style.display = 'none';
  if (text.length < 60) {
    // 视为景点名 → 取预存讲解词原文
    btn.disabled = true; btn.textContent = '载入讲解词…';
    var g = await fetchGuide(text);
    spotName = text; currentText = g.guide || text;
    document.getElementById('inputText').value = currentText; updateCharCount();
  } else {
    currentText = text; spotName = spotName || text.slice(0, 8);
  }
  await generateAll();
}

/* ── 自动串生成三平台（生成完一个自动下一个）── */
async function generateAll() {
  resetGen();
  var btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = '生成中...';
  showInitialLoading();                // 仅首篇前一个极简 spinner
  renderFx();
  fetchImages();                       // 并行拉图，文字先出、图后淡入
  for (var i = 0; i < PLATFORMS.length; i++) {
    var ok = await genPlatform(PLATFORMS[i]);   // 好了自动显示；生成下一篇时保留当前画面
    if (!ok) break;
    updateAfterGen();
  }
  btn.disabled = false; btn.textContent = '重新生成';
}

function readStyle(plat) {
  if (plat === 'xiaohongshu') return document.getElementById('xhsStyle').value;
  if (plat === 'douyin') return document.getElementById('dyStyle').value;
  return document.getElementById('pyqStyle').value;
}

function resetGen() {
  genData = { xiaohongshu: null, douyin: null, pengyouquan: null };
  spotImages = []; currentPlat = null;
  document.getElementById('phoneActions').style.display = 'none';
  document.getElementById('genProgress').textContent = '';
  updateTabs(); renderFx();
}

// 仅首篇尚无内容时用一个极简 spinner；之后生成下一篇时保留当前画面，好了直接切
function showInitialLoading() {
  var s = document.getElementById('phoneScreen');
  s.className = 'phone-screen loading';
  s.innerHTML = '<div class="ps-loading"><div class="neon-ring"></div></div>';
}
function setBusy(on) {
  var s = document.getElementById('phoneScreen');
  if (s) s.classList.toggle('busy', on);
}

async function genPlatform(plat) {
  currentPlat = plat;
  try {
    var res = await fetch('/api/convert-single', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: currentText, platform: plat, style: readStyle(plat), custom_style: document.getElementById('customStyle').value })
    });
    var data = await res.json();
    if (data.error) { showError(data.error); setBusy(false); return false; }
    genData[plat] = { content: data.content, meta: buildMeta(plat), guide: currentText };
    renderPlatform(plat);
    return true;
  } catch (e) { showError('生成失败: ' + e.message); setBusy(false); return false; }
}

function updateAfterGen() {
  var done = PLATFORMS.filter(function (p) { return genData[p]; }).length;
  var pg = document.getElementById('genProgress');
  pg.textContent = done >= 3 ? '三平台已全部生成 ✓ 点上方标签切换' : ('已生成 ' + done + ' / 3');
  updateTabs();
}

async function fetchImages() {
  if (!spotName) return;
  try {
    var r = await fetch('/api/spot-images?name=' + encodeURIComponent(spotName));
    var d = await r.json();
    if (d.images && d.images.length) spotImages = d.images;
    if (d.avatars && d.avatars.length) avatars = d.avatars;
    renderFx();
    if (currentPlat && genData[currentPlat]) renderPlatform(currentPlat);  // 图片淡入
  } catch (e) { /* 配图失败不阻断文案 */ }
}

/* ── 本篇操作 ── */
function extractPlatText(plat) {
  var c = genData[plat].content;
  if (plat === 'xiaohongshu') return (c.title || '') + '\n' + (c.body || '') + '\n' + ((c.tags || []).map(function (t) { return '#' + t; }).join(' '));
  if (plat === 'douyin') return (c.hook || '') + '\n' + (c.narration || '') + '\n' + (c.ending || '');
  return c.text || '';
}

function actionRegen() { if (currentPlat) { setBusy(true); genPlatform(currentPlat).then(updateAfterGen); } }

function regenSingle(plat) {
  plat = plat || currentPlat;
  if (!plat || !genData[plat]) return;   // 仅对已生成的平台重生成
  currentPlat = plat; setBusy(true); genPlatform(plat);
}

function actionRefine(action) {
  if (!currentPlat || !genData[currentPlat]) return;
  var plat = currentPlat;
  setBusy(true);
  fetch('/api/refine', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: extractPlatText(plat), platform: plat, action: action })
  }).then(function (r) { return r.json(); }).then(function (data) {
    if (data.error) { showError(data.error); setBusy(false); return; }
    genData[plat].content = data.content; renderPlatform(plat);
  }).catch(function (e) { showError('操作失败: ' + e.message); setBusy(false); });
}

function actionCopy() {
  if (!currentPlat || !genData[currentPlat]) return;
  navigator.clipboard.writeText(extractPlatText(currentPlat)).then(function () {
    var b = document.querySelector('.btn-copy');
    if (b) { var o = b.textContent; b.textContent = '已复制'; setTimeout(function () { b.textContent = o; }, 1500); }
  }).catch(function () { showError('复制失败'); });
}

init();
