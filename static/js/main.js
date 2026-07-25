/* static/js/main.js —— 初始化、样例切换、转换流程 */

let currentSampleId = null;
let firstSample = null;

// 把「内容风格」原生 select 增强为自定义暗色下拉（保留 id/value 与 onchange 行为）
function enhanceStyleSelects() {
  document.querySelectorAll('.style-group select').forEach(sel => {
    const wrap = document.createElement('div');
    wrap.className = 'cust-select';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cs-trigger';
    const label = document.createElement('span');
    label.className = 'cs-label';
    const caret = document.createElement('span');
    caret.className = 'cs-caret';
    trigger.append(label, caret);
    const menu = document.createElement('div');
    menu.className = 'cs-menu';

    const syncLabel = () => {
      const o = sel.options[sel.selectedIndex];
      label.textContent = o ? o.textContent : '';
    };
    const markSel = () => {
      [...menu.children].forEach(it => it.classList.toggle('sel', it.dataset.value === sel.value));
    };

    [...sel.options].forEach(opt => {
      const item = document.createElement('div');
      item.className = 'cs-item';
      item.textContent = opt.textContent;
      item.dataset.value = opt.value;
      item.addEventListener('click', e => {
        e.stopPropagation();
        if (sel.value !== opt.value) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true })); // 触发原 onchange→regenSingle
        }
        syncLabel(); markSel();
        wrap.classList.remove('open');
      });
      menu.appendChild(item);
    });

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const willOpen = !wrap.classList.contains('open');
      document.querySelectorAll('.cust-select.open').forEach(w => w.classList.remove('open'));
      wrap.classList.toggle('open', willOpen);
    });
    // 外部代码改了 select.value 时保持显示同步
    sel.addEventListener('change', () => { syncLabel(); markSel(); });

    sel.style.display = 'none';
    sel.parentNode.insertBefore(wrap, sel.nextSibling);
    wrap.append(trigger, menu);
    syncLabel(); markSel();
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.cust-select.open').forEach(w => w.classList.remove('open'));
  });
}

async function init() {
  enhanceStyleSelects();
  try {
    const res = await fetch('/api/samples');
    const samples = await res.json();
    const container = document.getElementById('sampleTags');

    const seen = new Set();
    samples.forEach(s => {
      if (!firstSample) firstSample = s;
      if (seen.has(s.category)) return;
      seen.add(s.category);

      const tag = document.createElement('span');
      tag.className = 'sample-tag';
      tag.textContent = s.category;
      tag.title = s.title;
      tag.onclick = () => selectSample(s, tag);
      container.appendChild(tag);
    });

    if (firstSample) {
      const firstTag = container.querySelector('.sample-tag');
      if (firstTag) {
        firstTag.classList.add('active');
        currentSampleId = firstSample.id;
        document.getElementById('inputText').value = firstSample.text;
        updateCharCount();
        extractEntities(firstSample.text);
      }
    }

    // 从景点星图跳转而来：?spot=景点名 → 自动带入并生成
    // 限制长度，避免恶意分享链接静默触发大量 LLM 调用
    const spot = (new URLSearchParams(location.search).get('spot') || '').trim();
    if (spot && spot.length <= 40) {
      document.querySelectorAll('.sample-tag').forEach(t => t.classList.remove('active'));
      currentSampleId = null;
      document.getElementById('inputText').value = spot;
      updateCharCount();
      setTimeout(doConvert, 300);
    }
  } catch (e) {
    console.error('加载样例失败:', e);
  }

  document.getElementById('inputText').addEventListener('input', updateCharCount);
}

// 视图切换：卡片视图 / 明信片(胶片)视图
function setView(mode) {
  const area = document.getElementById('previewArea');
  const cardBtn = document.getElementById('viewCard');
  const filmBtn = document.getElementById('viewFilm');
  const film = mode === 'film';
  area.classList.toggle('filmstrip', film);
  cardBtn.classList.toggle('active', !film);
  filmBtn.classList.toggle('active', film);
}

function selectSample(sample, tagEl) {
  document.querySelectorAll('.sample-tag').forEach(t => t.classList.remove('active'));
  if (currentSampleId === sample.id) {
    currentSampleId = null;
    clearText();
    return;
  }
  tagEl.classList.add('active');
  currentSampleId = sample.id;
  document.getElementById('inputText').value = sample.text;
  updateCharCount();
  extractEntities(sample.text);
}

function updateCharCount() {
  const len = document.getElementById('inputText').value.length;
  const el = document.getElementById('charCount');
  el.textContent = len + ' 字';
  el.className = 'char-count';
  if (len >= 300 && len <= 800) el.classList.add('good');
  else if (len > 0) el.classList.add('warn');
}

async function pasteText() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      document.getElementById('inputText').value = text;
      updateCharCount();
    }
  } catch {
    showError('无法读取剪贴板，请手动粘贴');
  }
}

function clearText() {
  document.getElementById('inputText').value = '';
  updateCharCount();
  currentSampleId = null;
  document.querySelectorAll('.sample-tag').forEach(t => t.classList.remove('active'));
  document.getElementById('errorMsg').style.display = 'none';
  currentEntities = [];
  document.getElementById('entitySection').style.display = 'none';
}

async function doConvert() {
  const text = document.getElementById('inputText').value.trim();
  if (!text) {
    showError('请先输入讲解词内容');
    return;
  }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  document.getElementById('errorMsg').style.display = 'none';
  currentEntities = [];
  document.getElementById('entitySection').style.display = 'none';

  // 短文本预处理
  let guideText = text;
  if (text.length < 100) {
    btn.textContent = '识别输入中...';
    try {
      const preRes = await fetch('/api/preprocess', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const preData = await preRes.json();
      if (preData.error) {
        showError('预处理失败: ' + preData.error);
        btn.disabled = false; btn.textContent = '生成内容'; return;
      }
      guideText = preData.guide_text;
      if (preData.input_type !== 'guide_direct' && preData.input_type !== 'guide_detected') {
        document.getElementById('inputText').value = guideText;
        updateCharCount();
        extractEntities(guideText);
      }
      if (preData.matched_category) {
        highlightCategoryTag(preData.matched_category);
      }
    } catch (e) {
      showError('预处理网络错误: ' + e.message);
      btn.disabled = false; btn.textContent = '生成内容'; return;
    }
  }

  btn.textContent = 'AI 生成中...';

  // 初始化三列为 loading 状态
  ['colXhs', 'colDy', 'colPyq'].forEach(id => {
    const body = document.getElementById(id).querySelector('.output-col-body');
    body.innerHTML = '<div class="loading-state">AI 生成中<div class="neon-pipe"><span></span></div></div>';
    body.classList.remove('empty');
  });

  try {
    const res = await fetch('/api/convert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: guideText,
        xhs_style: document.getElementById('xhsStyle').value,
        dy_style: document.getElementById('dyStyle').value,
        pyq_style: document.getElementById('pyqStyle').value,
        custom_style: document.getElementById('customStyle').value,
      })
    });
    const data = await res.json();
    if (data.error) { showError(data.error); resetOutputs(); return; }

    renderXhs(data.xiaohongshu);
    renderDy(data.douyin);
    renderPyq(data.pengyouquan);
    currentText = guideText;

    if (text.length >= 100) extractEntities(guideText);
  } catch (e) {
    showError('网络错误: ' + e.message);
    resetOutputs();
  } finally {
    btn.disabled = false; btn.textContent = '生成内容';
  }
}

// 高亮匹配的分类标签
function highlightCategoryTag(category) {
  document.querySelectorAll('.sample-tag').forEach(t => {
    t.classList.toggle('active', t.textContent === category);
  });
}

init();
