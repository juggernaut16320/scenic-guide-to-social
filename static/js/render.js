/* static/js/render.js —— 三平台三列预览渲染 + 实体高亮 + 操作按钮 */

let savedXhsData = null;
let savedDyData = null;
let savedPyqData = null;
let currentText = '';
let currentEntities = [];
let activeTab = 'xiaohongshu';  // 用于 refine/regen 确定当前操作平台

function currentTab() { return activeTab; }

/* ── 工具：渲染到目标列 ── */

function renderToCol(colId, innerHtml) {
  const col = document.getElementById(colId);
  if (!col) return;
  const body = col.querySelector('.output-col-body');
  body.innerHTML = innerHtml;
  body.classList.remove('empty');
}

function overlayCol(colId, text) {
  const wrap = document.getElementById('wrap' + colId.replace('col', ''));
  if (!wrap) return;
  const overlay = document.createElement('div');
  overlay.className = 'card-loading-overlay';
  overlay.innerHTML = `<span class="loading-text">${text || '处理中...'}</span>`;
  wrap.appendChild(overlay);
  return overlay;
}

/* ── 设置激活平台 ── */
function setActivePlatform(platform) { activeTab = platform; }

/* ── 小红书 ── */
function renderXhs(xhs) {
  savedXhsData = xhs;
  if (!xhs || (!xhs.title && !xhs.body)) {
    renderToCol('colXhs', '<div class="preview-empty">暂无内容</div>');
    return;
  }
  const tagsHtml = (xhs.tags || []).filter(t => t.trim()).map(t => `<span class="xhs-tag">#${t.trim()}</span>`).join('');
  renderToCol('colXhs', `
    <div class="card-wrap" id="wrapXhs" onclick="setActivePlatform('xiaohongshu')">
      <div class="xhs-card">
        <div class="author">
          <div class="avatar"></div>
          <div class="author-info">
            <div class="author-name">旅行种草机</div>
            <div class="author-date">刚刚</div>
          </div>
        </div>
        <div class="xhs-title" contenteditable="true">${highlightText(xhs.title || '')}</div>
        <div class="xhs-body" contenteditable="true">${highlightText(xhs.body || '')}</div>
        <div class="xhs-tags">${tagsHtml}</div>
      </div>
    </div>`);
}

/* ── 抖音 ── */
function renderDy(dy) {
  savedDyData = dy;
  if (!dy || (!dy.hook && !dy.narration)) {
    renderToCol('colDy', '<div class="preview-empty">暂无内容</div>');
    return;
  }
  const narrationLines = (dy.narration || '').split('\n').filter(l => l.trim());
  const scenesHtml = narrationLines.map((line, i) => {
    const m = line.match(/【(.+?)】(.+)/);
    if (m) return `<div class="dy-scene-line"><span class="dot">${i + 1}</span><span class="text" contenteditable="true">${highlightText(m[2].trim())}</span></div>`;
    return `<div class="dy-scene-line"><span class="dot">${i + 1}</span><span class="text" contenteditable="true">${highlightText(line.trim())}</span></div>`;
  }).join('');
  renderToCol('colDy', `
    <div class="card-wrap" id="wrapDy" onclick="setActivePlatform('douyin')">
      <div class="dy-frame">
        <div class="dy-screen">
          <div class="dy-subtitle" style="width:100%;">
            ${dy.hook ? `<p class="dy-hook"><span contenteditable="true">${highlightText(dy.hook)}</span></p>` : ''}
            ${scenesHtml}
            ${dy.ending ? `<p class="dy-ending"><span contenteditable="true">${highlightText(dy.ending)}</span></p>` : ''}
          </div>
        </div>
      </div>
    </div>`);
}

/* ── 朋友圈 ── */
function renderPyq(pyq) {
  savedPyqData = pyq;
  if (!pyq || !pyq.text) {
    renderToCol('colPyq', '<div class="preview-empty">暂无内容</div>');
    return;
  }
  const images = pyq.images || [];
  const displayImgs = images.slice(0, 9);
  while (displayImgs.length < 3) displayImgs.push('');
  const gridHtml = displayImgs.map(img => {
    return `<div class="pyq-grid-item"><span>${img ? escHtml(img) : ''}</span></div>`;
  }).join('');

  renderToCol('colPyq', `
    <div class="card-wrap" id="wrapPyq" onclick="setActivePlatform('pengyouquan')">
      <div class="pyq-card">
        <div class="pyq-author">
          <div class="pyq-avatar"></div>
          <div class="pyq-name">行走的风景控</div>
        </div>
        <div class="pyq-text" contenteditable="true">${highlightText(pyq.text || '')}</div>
        <div class="pyq-grid">${gridHtml}</div>
        <div class="pyq-bar">
          <span>刚刚</span>
          <span>删除</span>
        </div>
      </div>
    </div>`);
}

function rehighlightAll() {
  if (savedXhsData) renderXhs(savedXhsData);
  if (savedDyData) renderDy(savedDyData);
  if (savedPyqData) renderPyq(savedPyqData);
}

function highlightText(text) {
  if (!currentEntities.length) return escHtml(text);
  const sorted = [...currentEntities].sort((a, b) => b.name.length - a.name.length);
  let html = escHtml(text);
  for (const e of sorted) {
    const escaped = escHtml(e.name);
    const attrEntity = escAttr(e.name);
    const attrType = escAttr(e.type);
    html = html.split(escaped).join(
      `<span class="entity-hl" data-entity="${attrEntity}" data-type="${attrType}">${escaped}</span>`
    );
  }
  return html;
}

function resetOutputs() {
  savedXhsData = savedDyData = savedPyqData = null;
  currentEntities = [];
  document.getElementById('entitySection').style.display = 'none';
  ['colXhs', 'colDy', 'colPyq'].forEach(id => {
    const body = document.getElementById(id).querySelector('.output-col-body');
    body.innerHTML = '<div class="preview-empty">选择样例并点击生成</div>';
    body.classList.add('empty');
  });
}

/* ── 操作按钮 ── */

function regenSingle(platform) {
  if (!currentText) return;
  platform = platform || activeTab;

  let style = '';
  if (platform === 'xiaohongshu') style = document.getElementById('xhsStyle').value;
  else if (platform === 'douyin') style = document.getElementById('dyStyle').value;
  else if (platform === 'pengyouquan') style = document.getElementById('pyqStyle').value;
  const customStyle = document.getElementById('customStyle').value;

  const wrapId = platform === 'xiaohongshu' ? 'wrapXhs' : platform === 'douyin' ? 'wrapDy' : 'wrapPyq';
  const overlay = overlayCol('col' + (platform === 'xiaohongshu' ? 'Xhs' : platform === 'douyin' ? 'Dy' : 'Pyq'), '重新生成中...');

  fetch('/api/convert-single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: currentText, platform, style, custom_style: customStyle }),
  }).then(r => r.json()).then(data => {
    if (data.error) { showError(data.error); if (overlay) overlay.remove(); return; }
    const content = data.content;
    if (platform === 'xiaohongshu') renderXhs(content);
    else if (platform === 'douyin') renderDy(content);
    else renderPyq(content);
    if (platform === 'xiaohongshu') document.getElementById('xhsStyle').value = style;
    else if (platform === 'douyin') document.getElementById('dyStyle').value = style;
  }).catch(e => { showError('重新生成失败: ' + e.message); if (overlay) overlay.remove(); });
}

function actionRegen() { regenSingle(activeTab); }

function actionCopy() {
  let colId = 'colXhs';
  if (activeTab === 'douyin') colId = 'colDy';
  else if (activeTab === 'pengyouquan') colId = 'colPyq';
  const body = document.getElementById(colId).querySelector('.output-col-body');
  const text = body.textContent.trim();
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    // 找到当前列的复制按钮
    const btn = document.getElementById(colId).querySelector('.btn-copy');
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = '已复制';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => showError('复制失败'));
}

function actionRefine(action) {
  if (!currentText) return;
  const platform = activeTab;
  const colId = 'col' + (platform === 'xiaohongshu' ? 'Xhs' : platform === 'douyin' ? 'Dy' : 'Pyq');
  const overlay = overlayCol(colId, '处理中...');

  // 取当前卡片里显示的文案，不是原始讲解词
  const col = document.getElementById(colId);
  const refText = col ? (col.textContent || '').trim() : currentText;

  fetch('/api/refine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: refText, platform, action }),
  }).then(r => r.json()).then(data => {
    if (data.error) { showError(data.error); if (overlay) overlay.remove(); return; }
    const content = data.content;
    if (platform === 'xiaohongshu') renderXhs(content);
    else if (platform === 'douyin') renderDy(content);
    else renderPyq(content);
  }).catch(e => { showError('操作失败: ' + e.message); if (overlay) overlay.remove(); });
}
