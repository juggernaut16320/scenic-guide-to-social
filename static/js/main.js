/* static/js/main.js —— 主逻辑：初始化、样例切换、转换流程 */

let currentSampleId = null;
let firstSample = null;

async function init() {
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
  } catch (e) {
    console.error('加载样例失败:', e);
  }

  document.getElementById('inputText').addEventListener('input', updateCharCount);
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

  // 智能判断：短文本需要先预处理
  let guideText = text;
  if (text.length < 100) {
    btn.textContent = '🔍 识别输入中……';
    try {
      const preRes = await fetch('/api/preprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const preData = await preRes.json();
      if (preData.error) {
        showError('预处理失败: ' + preData.error);
        btn.disabled = false;
        btn.textContent = '🚀 一键转换';
        return;
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
      btn.disabled = false;
      btn.textContent = '🚀 一键转换';
      return;
    }
  }

  // 执行转换
  btn.textContent = '⏳ 生成中……';

  ['outputXhs', 'outputDy', 'outputPyq'].forEach(id => {
    document.getElementById(id).className = 'output-card-body loading';
    document.getElementById(id).textContent = 'AI 正在生成……';
  });

  try {
    const res = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: guideText,
        xhs_style: document.getElementById('xhsStyle').value,
        dy_style: document.getElementById('dyStyle').value,
      })
    });
    const data = await res.json();

    if (data.error) {
      showError(data.error);
      resetOutputs();
      return;
    }

    renderXhs(data.xiaohongshu);
    renderDy(data.douyin);
    renderPyq(data.pengyouquan);

    document.getElementById('xhsCardStyle').style.display = 'inline';
    document.getElementById('dyCardStyle').style.display = 'inline';
    document.getElementById('xhsCardStyle').value = document.getElementById('xhsStyle').value;
    document.getElementById('dyCardStyle').value = document.getElementById('dyStyle').value;
    currentText = guideText;

    if (text.length >= 100) {
      extractEntities(guideText);
    }
  } catch (e) {
    showError('网络错误: ' + e.message);
    resetOutputs();
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 一键转换';
  }
}

init();
