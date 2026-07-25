/* static/js/render.js —— 手机 App 预览渲染：小红书 / 抖音 / 朋友圈 三个真实 UI
   含真实图轮播（走马灯）+ 评论模板。生成流程在 main.js。 */

var PLATFORMS = ['xiaohongshu', 'douyin', 'pengyouquan'];
var PLAT_NAME = { xiaohongshu: '小红书', douyin: '抖音', pengyouquan: '朋友圈' };

/* 共享状态（main.js 也会读写） */
var genData = { xiaohongshu: null, douyin: null, pengyouquan: null }; // {content, meta}
var spotName = '';
var spotImages = [];
var avatars = [];
var currentPlat = null;
var currentText = '';        // 当前讲解词（refine/regen 用）
var currentEntities = [];    // 兼容 entities.js

/* entities.js 兼容：新 UI 不做实体高亮，留空实现避免报错 */
function rehighlightAll() {}
function currentTab() { return currentPlat || 'xiaohongshu'; }

/* ── 小工具 ── */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rndCount(scale) {
  scale = scale || 1;
  var b = Math.random();
  var n = Math.floor((150 + b * b * 26000) * scale);
  return n >= 10000 ? (n / 10000).toFixed(1) + '万' : '' + n;
}
var NICKS = {
  xiaohongshu: ['斜杠族Miu猪', '爱拍照的小鹿', '山野旅人', '城市漫游家', '桃子汽水', '一颗柠檬'],
  douyin: ['考拉爱上树', '追光的阿泽', '说走就走的老王', '镜头里的中国', '一路向南', '风一样的丸子'],
  pengyouquan: ['行走的风景控', '我在路上', '慢慢来的日子', '人间烟火气', '晚风与你']
};
var TOPICS = ['踏青好去处', '旅行的意义', '风景在路上', '周末去哪儿', 'citywalk日记'];
var CMT_TPL = ['这是{地}吗？太美了吧😍', '求{地}的具体位置🙏', '上周刚去{地}，实物更绝！',
  '已加入{地}愿望清单✅', '{地}的日落一定要看！', '拍出了电影感📷太会了'];

function fillTpl(t) { return t.replace(/\{地\}/g, spotName || '这里'); }

function avatarSrc(i) { return avatars.length ? avatars[Math.abs(i) % avatars.length] : null; }
function avatarHtml(i, cls) {
  var s = avatarSrc(i);
  if (s) return '<img class="' + cls + '" src="' + s + '" alt="" draggable="false">';
  var emo = ['🦊', '🐨', '🐼', '🐧', '🐳', '🌸', '🦉', '🐢'];
  return '<div class="' + cls + ' av-fb" style="background:hsl(' + ((i * 57) % 360) + ',55%,62%)">' + emo[Math.abs(i) % emo.length] + '</div>';
}

/* 生成并缓存一个平台的稳定 meta（用户名、计数、评论），供多次重渲染保持一致 */
function buildMeta(plat) {
  var seed = [];
  for (var k = 0; k < 3; k++) seed.push({ name: pick(NICKS.xiaohongshu.concat(NICKS.douyin)), text: fillTpl(CMT_TPL[(k * 2) % CMT_TPL.length]), like: Math.floor(Math.random() * 120), av: k + 3 });
  return {
    name: pick(NICKS[plat]), avatar: 1,
    like: rndCount(), star: rndCount(0.7), comment: rndCount(0.35), share: rndCount(0.3),
    time: pick(['刚刚', '1小时前', '今天 12:0' + Math.floor(Math.random() * 9), '昨天']),
    topic: pick(TOPICS), join: (Math.random() * 30 + 2).toFixed(1),
    comments: seed
  };
}

/* ── 轮播（走马灯）slides ── */
function slidesHtml() {
  if (!spotImages.length) return '<div class="car-slide"><div class="img-shimmer"></div></div>';
  return spotImages.map(function (u) {
    return '<div class="car-slide"><img src="' + u + '" alt="" draggable="false"></div>';
  }).join('');
}
function carouselHtml(extraClass) {
  var n = spotImages.length || 1;
  var dots = n > 1 ? '<div class="car-dots"></div>' : '';
  var counter = n > 1 ? '<div class="car-count"><span class="cc-i">1</span>/' + n + '</div>' : '';
  return '<div class="carousel ' + (extraClass || '') + '">' +
    '<div class="car-track">' + slidesHtml() + '</div>' +
    counter + dots +
    (n > 1 ? '<div class="car-arrow car-prev">‹</div><div class="car-arrow car-next">›</div>' : '') +
    '</div>';
}

/* ── 评论区（模板 + 列表），xhs / pyq 用 ── */
function commentsHtml(plat, dark) {
  var m = genData[plat].meta;
  var list = m.comments.map(function (c, j) {
    return '<div class="cmt-item">' + avatarHtml(c.av, 'cmt-av') +
      '<div class="cmt-body"><div class="cmt-name">' + escHtml(c.name) + '</div>' +
      '<div class="cmt-txt">' + escHtml(c.text) + '</div></div>' +
      '<div class="cmt-like">♡ ' + c.like + '</div></div>';
  }).join('');
  var chips = CMT_TPL.map(function (t, j) {
    return '<span class="cmt-chip" data-tpl="' + j + '">' + escHtml(fillTpl(t)) + '</span>';
  }).join('');
  return '<div class="cmt-block' + (dark ? ' dark' : '') + '">' +
    '<div class="cmt-hd">共 ' + m.comment + ' 条评论</div>' +
    '<div class="cmt-tpls">' + chips + '</div>' +
    '<div class="cmt-list">' + list + '</div></div>';
}

/* ══════════ 小红书 ══════════ */
function buildXhs(c, m) {
  var tags = (c.tags || []).filter(function (t) { return t && t.trim(); })
    .map(function (t) { return '<span class="xhs-tag">#' + escHtml(t.trim()) + '</span>'; }).join('');
  return '<div class="xhs-app">' +
    '<div class="xhs-top"><span class="ic-back">‹</span>' +
      '<div class="xhs-user">' + avatarHtml(m.avatar, 'top-av') + '<span class="u-name">' + escHtml(m.name) + '</span></div>' +
      '<button class="btn-follow">关注</button><span class="ic-share">↗</span></div>' +
    '<div class="xhs-scroll">' +
      carouselHtml('xhs-car') +
      '<div class="xhs-content">' +
        '<div class="xhs-title">' + escHtml(c.title || '') + '</div>' +
        '<div class="xhs-text">' + escHtml(c.body || '') + '</div>' +
        '<div class="xhs-tags">' + tags + '</div>' +
        '<div class="xhs-post-meta">' + escHtml(m.time) + ' · ' + escHtml(spotName || '') + '</div>' +
        commentsHtml('xiaohongshu', false) +
      '</div>' +
    '</div>' +
    '<div class="xhs-bottom"><div class="cmt-input">说点什么...</div>' +
      '<span class="bi">♡<b>' + m.like + '</b></span>' +
      '<span class="bi">⭐<b>' + m.star + '</b></span>' +
      '<span class="bi">💬<b>' + m.comment + '</b></span></div>' +
    '</div>';
}

/* ══════════ 抖音（图文版 · 白底）══════════ */
function buildDy(c, m) {
  var lines = (c.narration || '').split('\n').filter(function (l) { return l.trim(); })
    .map(function (l) { var mm = l.match(/【(.+?)】(.+)/); return mm ? mm[2].trim() : l.trim(); });
  var desc = lines.slice(0, 4).map(function (l) { return '<div class="dy-line">' + escHtml(l) + '</div>'; }).join('');
  return '<div class="dy-app">' +
    '<div class="dy-top"><span class="ic-back">‹</span>' +
      '<div class="dy-user">' + avatarHtml(m.avatar, 'top-av') +
        '<div class="dy-un"><span class="u-name">' + escHtml(m.name) + '</span><span class="u-loc">📍 ' + escHtml(spotName || '此刻') + '</span></div></div>' +
      '<button class="btn-follow">关注</button><span class="ic-search">🔍</span></div>' +
    '<div class="dy-scroll">' +
      carouselHtml('dy-car') +
      '<div class="dy-content">' +
        '<div class="dy-topic"><span class="dt-hash">#</span><span class="dt-tag">' + escHtml(m.topic) + '</span><span class="dt-join">' + m.join + '万人参与</span><span class="dt-go">去发布 ›</span></div>' +
        '<div class="dy-title">' + escHtml(c.hook || '') + '</div>' +
        '<div class="dy-desc">' + desc + (c.ending ? '<div class="dy-end">' + escHtml(c.ending) + '</div>' : '') + '</div>' +
        commentsHtml('douyin', false) +
      '</div>' +
    '</div>' +
    '<div class="dy-bottom"><div class="cmt-input">说点什么...</div>' +
      '<span class="bi">♡<b>' + m.like + '</b></span>' +
      '<span class="bi">💬<b>' + m.comment + '</b></span>' +
      '<span class="bi">⭐<b>' + m.star + '</b></span>' +
      '<span class="bi">↗<b>' + m.share + '</b></span></div>' +
    '</div>';
}

/* ══════════ 朋友圈 ══════════ */
function buildPyq(c, m) {
  var imgs = (spotImages.length ? spotImages : [null]).slice(0, 9);
  var grid = imgs.map(function (u) {
    return u ? '<div class="pg-item"><img src="' + u + '" alt="" draggable="false"></div>'
             : '<div class="pg-item"><div class="img-shimmer"></div></div>';
  }).join('');
  var gridClass = imgs.length === 1 ? 'one' : (imgs.length === 4 ? 'four' : 'multi');
  var likeNames = ['考拉爱上树', '追光的阿泽', 'Miu猪', '山野旅人', '晚风'].slice(0, 3 + Math.floor(Math.random() * 2)).join('，');
  var cmts = m.comments.map(function (cc) {
    return '<div class="pyq-cmt"><span class="pc-name">' + escHtml(cc.name) + '</span>：<span class="pc-txt">' + escHtml(cc.text) + '</span></div>';
  }).join('');
  return '<div class="pyq-app">' +
    '<div class="pyq-top"><span class="ic-back">‹</span><span class="pyq-tt">详情</span><span class="ic-more">···</span></div>' +
    '<div class="pyq-scroll"><div class="pyq-post">' +
      '<div class="pyq-head">' + avatarHtml(m.avatar, 'pyq-av') +
        '<div class="pyq-hn"><div class="p-name">' + escHtml(m.name) + '</div></div></div>' +
      '<div class="pyq-text">' + escHtml(c.text || '') + '</div>' +
      '<div class="pyq-grid ' + gridClass + '">' + grid + '</div>' +
      '<div class="pyq-loc">📍 ' + escHtml(spotName || '') + '</div>' +
      '<div class="pyq-bar"><span class="p-time">' + escHtml(m.time) + '</span><span class="p-ops">❤ 赞　💬 评论</span></div>' +
      '<div class="pyq-inter">' +
        '<div class="pyq-likes"><span class="hl-ic">♥</span> ' + escHtml(likeNames) + '</div>' +
        '<div class="pyq-cmts">' + cmts + '</div>' +
      '</div>' +
    '</div></div>' +
    '</div>';
}

/* ── 渲染某平台到手机屏 ── */
function renderPlatform(plat) {
  currentPlat = plat;
  var screen = document.getElementById('phoneScreen');
  var d = genData[plat];
  if (!d) return;
  var html = plat === 'xiaohongshu' ? buildXhs(d.content, d.meta)
    : plat === 'douyin' ? buildDy(d.content, d.meta)
    : buildPyq(d.content, d.meta);
  screen.className = 'phone-screen app-' + plat;
  screen.innerHTML = html;
  // 淡入
  screen.classList.remove('screen-in'); void screen.offsetWidth; screen.classList.add('screen-in');
  initCarousels(screen);
  wireComments(screen, plat);
  updateTabs();
  renderFx();
  // 底部本篇操作栏
  document.getElementById('phoneActions').style.display = 'flex';
}

/* ── 右侧「取材灵感墙」（真实图 + 进度）── */
function renderFx() {
  var fx = document.getElementById('stageFx');
  if (!fx) return;
  var imgs = spotImages.length ? spotImages.slice(0, 6) : [null, null, null, null];
  var deck = imgs.map(function (u, i) {
    var inner = u ? '<img src="' + u + '" alt="" draggable="false">' : '<div class="img-shimmer"></div>';
    return '<div class="fx-card" style="--i:' + i + '">' + inner + '</div>';
  }).join('');
  var steps = PLATFORMS.map(function (p) {
    var st = genData[p] ? 'done' : (p === currentPlat ? 'cur' : 'todo');
    return '<div class="fx-step ' + st + '"><span class="fx-dot"></span><span class="fx-nm">' + PLAT_NAME[p] + '</span>' +
      '<span class="fx-flag">' + (st === 'done' ? '✓' : st === 'cur' ? '生成中' : '待生成') + '</span></div>';
  }).join('');
  fx.innerHTML =
    '<div class="fx-orb o1"></div><div class="fx-orb o2"></div>' +
    '<div class="fx-hd">✦ 取材灵感墙</div>' +
    '<div class="fx-spot">' + (spotName ? escHtml(spotName) : '待生成') + '</div>' +
    '<div class="fx-deck">' + deck + '</div>' +
    '<div class="fx-tip">' + (spotImages.length ? '共 ' + spotImages.length + ' 张实拍配图' : '文案生成后自动配图') + '</div>' +
    '<div class="fx-steps">' + steps + '</div>';
}

/* ── 平台切换（点标签）── */
function switchPlat(plat) {
  if (!genData[plat]) return;
  currentText = genData[plat].guide || currentText;
  renderPlatform(plat);
}

function updateTabs() {
  document.querySelectorAll('.plat-tab').forEach(function (t) {
    var p = t.dataset.plat;
    t.disabled = !genData[p];
    t.classList.toggle('active', p === currentPlat);
    t.classList.toggle('done', !!genData[p]);
  });
}

/* ── 轮播交互（拖拽 + 箭头 + 圆点）── */
function initCarousels(root) {
  root.querySelectorAll('.carousel').forEach(function (car) {
    var track = car.querySelector('.car-track');
    var slides = track.children.length;
    var dotsWrap = car.querySelector('.car-dots');
    var counter = car.querySelector('.cc-i');
    var idx = 0;
    if (dotsWrap) {
      var dh = '';
      for (var j = 0; j < slides; j++) dh += '<span class="car-dot' + (j === 0 ? ' on' : '') + '"></span>';
      dotsWrap.innerHTML = dh;
    }
    function go(i) {
      idx = Math.max(0, Math.min(slides - 1, i));
      track.style.transform = 'translateX(' + (-idx * 100) + '%)';
      if (dotsWrap) [].forEach.call(dotsWrap.children, function (d, j) { d.classList.toggle('on', j === idx); });
      if (counter) counter.textContent = idx + 1;
    }
    var prev = car.querySelector('.car-prev'), next = car.querySelector('.car-next');
    if (prev) prev.addEventListener('click', function (e) { e.stopPropagation(); go(idx - 1); });
    if (next) next.addEventListener('click', function (e) { e.stopPropagation(); go(idx + 1); });
    if (dotsWrap) [].forEach.call(dotsWrap.children, function (d, j) { d.addEventListener('click', function () { go(j); }); });
    // 拖拽
    var sx = 0, dragging = false;
    car.addEventListener('pointerdown', function (e) { dragging = true; sx = e.clientX; track.style.transition = 'none'; });
    car.addEventListener('pointerup', function (e) {
      if (!dragging) return; dragging = false; track.style.transition = '';
      var dx = e.clientX - sx;
      if (dx > 40) go(idx - 1); else if (dx < -40) go(idx + 1); else go(idx);
    });
    car.addEventListener('pointerleave', function () { if (dragging) { dragging = false; track.style.transition = ''; go(idx); } });
    go(0);
  });
}

/* ── 评论模板点击 → 追加评论 ── */
function wireComments(root, plat) {
  root.querySelectorAll('.cmt-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var tpl = CMT_TPL[+chip.dataset.tpl] || chip.textContent;
      var text = fillTpl(tpl);
      genData[plat].meta.comments.push({ name: '你', text: text, like: 0, av: 9 });
      genData[plat].meta.comment = (parseInt(genData[plat].meta.comment) || 20) + 1;
      chip.classList.add('sent');
      renderPlatform(plat);
    });
  });
}
