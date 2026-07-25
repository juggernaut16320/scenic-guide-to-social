/* static/js/entities.js —— 实体提取、高亮弹窗、缓存 */

const introCache = {};
let currentPopup = null;

function dismissPopup() {
  if (currentPopup) { currentPopup.remove(); currentPopup = null; }
}

async function extractEntities(text) {
  const section = document.getElementById('entitySection');
  const badges = document.getElementById('entityBadges');

  section.style.display = 'block';
  badges.innerHTML = '<span class="entity-badge loading-badge">⏳ 识别中...</span>';
  currentEntities = [];

  try {
    const res = await fetch('/api/extract-entities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.error || !data.entities) {
      section.style.display = 'none';
      return;
    }
    currentEntities = data.entities;
    rehighlightAll();
    if (currentEntities.length === 0) {
      section.style.display = 'none';
      return;
    }
    badges.innerHTML = currentEntities.map(e => 
      `<span class="entity-badge type-${e.type}">${escHtml(e.name)}</span>`
    ).join('');
    section.style.display = 'block';
  } catch (e) {
    section.style.display = 'none';
    console.error('实体提取失败:', e);
  }
}

async function showEntityPopup(el) {
  dismissPopup();

  const name = el.dataset.entity;
  const type = el.dataset.type;

  const textNow = el.textContent.trim();
  if (textNow !== name) return;
  const cacheKey = name + '|' + type;
  const rect = el.getBoundingClientRect();

  const popup = document.createElement('div');
  popup.className = 'entity-popup';
  popup.style.left = rect.left + 'px';
  popup.style.top = (rect.bottom + 8) + 'px';
  popup.innerHTML = `
    <span class="popup-close" onclick="dismissPopup()">×</span>
    <div class="popup-type">${escHtml(type)}</div>
    <div class="popup-name">${escHtml(name)}</div>
    <div class="popup-spinner"></div>
    <div style="text-align:center;color:#999;font-size:12px;">查询中...</div>
  `;
  document.body.appendChild(popup);
  currentPopup = popup;

  // 防止超出屏幕右侧
  const popRect = popup.getBoundingClientRect();
  if (popRect.right > window.innerWidth - 16) {
    popup.style.left = (window.innerWidth - popRect.width - 16) + 'px';
  }

  // 命中缓存 → 直接显示
  if (introCache[cacheKey]) {
    popup.innerHTML = `
      <span class="popup-close" onclick="dismissPopup()">×</span>
      <div class="popup-type">${escHtml(type)}</div>
      <div class="popup-name">${escHtml(name)}</div>
      <div>${escHtml(introCache[cacheKey])}</div>
    `;
    return;
  }

  try {
    const res = await fetch('/api/entity-intro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type }),
    });
    const data = await res.json();
    if (data.error) {
      popup.innerHTML = `<span class="popup-close" onclick="dismissPopup()">×</span><div style="color:#e74c3c;">加载失败</div>`;
      return;
    }
    introCache[cacheKey] = data.intro;
    popup.innerHTML = `
      <span class="popup-close" onclick="dismissPopup()">×</span>
      <div class="popup-type">${escHtml(type)}</div>
      <div class="popup-name">${escHtml(name)}</div>
      <div>${escHtml(data.intro)}</div>
    `;
  } catch (e) {
    popup.innerHTML = `<span class="popup-close" onclick="dismissPopup()">×</span><div style="color:#e74c3c;">网络错误</div>`;
  }
}

// 事件委托：点击实体高亮文字
document.addEventListener('click', function(e) {
  const hl = e.target.closest('.entity-hl');
  if (hl) {
    e.stopPropagation();
    showEntityPopup(hl);
    return;
  }
  if (currentPopup && !e.target.closest('.entity-popup')) {
    dismissPopup();
  }
});

function highlightCategoryTag(category) {
  const tags = document.querySelectorAll('.sample-tag');
  tags.forEach(t => {
    if (t.textContent === category) {
      t.classList.add('active');
    }
  });
}
