/* static/js/render.js —— 渲染函数：将结构化数据渲染为三平台预览卡片 */

let savedXhsData = null;
let savedDyData = null;
let savedPyqData = null;
let currentText = '';
let currentEntities = [];

function renderXhs(xhs) {
  savedXhsData = xhs;
  const el = document.getElementById('outputXhs');
  if (!xhs || (!xhs.title && !xhs.body)) {
    el.className = 'output-card-body empty';
    el.textContent = '暂无内容';
    return;
  }
  el.className = 'output-card-body';
  const tagsHtml = (xhs.tags || []).filter(t => t.trim()).map(t => `<span class="xhs-tag">#${t.trim()}</span>`).join('');
  el.innerHTML = `
    <div class="card-body-wrap" id="wrapXhs">
      <div class="xhs-card">
        <div class="author">
          <div class="avatar">🌸</div>
          <div>
            <div class="author-name">旅行种草机</div>
            <div class="author-date">刚刚</div>
          </div>
        </div>
        <div class="xhs-title" contenteditable="true">${highlightText(xhs.title || '')}</div>
        <div class="xhs-body" contenteditable="true">${highlightText(xhs.body || '')}</div>
        <div class="xhs-tags">${tagsHtml}</div>
      </div>
    </div>`;
}

function renderDy(dy) {
  savedDyData = dy;
  const el = document.getElementById('outputDy');
  if (!dy || (!dy.hook && !dy.narration)) {
    el.className = 'output-card-body empty';
    el.textContent = '暂无内容';
    return;
  }
  el.className = 'output-card-body';
  const narrationLines = (dy.narration || '').split('\n').filter(l => l.trim());
  const scenesHtml = narrationLines.map(line => {
    const m = line.match(/【(.+?)】(.+)/);
    if (m) return `<div class="dy-scene-line"><span class="label">🎬</span><span class="text" contenteditable="true">${highlightText(m[2].trim())}</span></div>`;
    return `<div class="dy-scene-line"><span class="label">🎬</span><span class="text" contenteditable="true">${highlightText(line.trim())}</span></div>`;
  }).join('');
  el.innerHTML = `
    <div class="card-body-wrap" id="wrapDy">
      <div class="dy-frame">
        <div class="dy-screen" style="justify-content:center; padding-top:24px;">
          <div class="dy-subtitle" style="width:100%;">
            ${dy.hook ? `<p class="dy-hook" style="font-size:14px;">🎯 <span contenteditable="true">${highlightText(dy.hook)}</span></p>` : ''}
            ${scenesHtml}
            ${dy.ending ? `<p class="dy-ending"><span contenteditable="true">${highlightText(dy.ending)}</span></p>` : ''}
          </div>
        </div>
      </div>
    </div>`;
}

function renderPyq(pyq) {
  savedPyqData = pyq;
  const el = document.getElementById('outputPyq');
  if (!pyq || !pyq.text) {
    el.className = 'output-card-body empty';
    el.textContent = '暂无内容';
    return;
  }
  el.className = 'output-card-body';
  const images = pyq.images || [];
  const displayImgs = images.slice(0, 9);
  while (displayImgs.length < 3) displayImgs.push('');
  const gridHtml = displayImgs.map(img => {
    const label = img ? escHtml(img) : '';
    return `<div class="pyq-grid-item"><span>${label || '📷'}</span></div>`;
  }).join('');

  el.innerHTML = `
    <div class="card-body-wrap" id="wrapPyq">
      <div class="pyq-card">
        <div class="pyq-author">
          <div class="pyq-avatar">🏔</div>
          <div class="pyq-name">行走的风景控</div>
        </div>
        <div class="pyq-text" contenteditable="true">${highlightText(pyq.text || '')}</div>
        <div class="pyq-grid">${gridHtml}
        </div>
        <div class="pyq-bar">
          <span>刚刚</span>
          <span>💬 评论</span>
        </div>
      </div>
    </div>`;
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
  ['outputXhs', 'outputDy', 'outputPyq'].forEach(id => {
    document.getElementById(id).className = 'output-card-body empty';
    document.getElementById(id).textContent = '选择样例并点击生成';
  });
  currentEntities = [];
  document.getElementById('entitySection').style.display = 'none';
}

async function regenSingle(platform) {
  if (!currentText) return;

  let style = '';
  if (platform === 'xiaohongshu') {
    style = document.getElementById('xhsStyle').value;
  } else if (platform === 'douyin') {
    style = document.getElementById('dyStyle').value;
  }

  const wrapId = platform === 'xiaohongshu' ? 'wrapXhs' : platform === 'douyin' ? 'wrapDy' : 'wrapPyq';
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  const overlay = document.createElement('div');
  overlay.className = 'card-loading-overlay';
  overlay.innerHTML = '<span class="loading-text">⏳ 重新生成中</span>';
  wrap.appendChild(overlay);

  try {
    const res = await fetch('/api/convert-single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: currentText, platform, style }),
    });
    const data = await res.json();
    if (data.error) { showError(data.error); overlay.remove(); return; }

    const content = data.content;
    if (platform === 'xiaohongshu') renderXhs(content);
    else if (platform === 'douyin') renderDy(content);
    else renderPyq(content);

    // 双向同步下拉框
    if (platform === 'xiaohongshu') {
      document.getElementById('xhsStyle').value = style;
      document.getElementById('xhsCardStyle').value = style;
    } else if (platform === 'douyin') {
      document.getElementById('dyStyle').value = style;
      document.getElementById('dyCardStyle').value = style;
    }
  } catch (e) {
    showError('单卡片生成失败: ' + e.message);
    overlay.remove();
  }
}
