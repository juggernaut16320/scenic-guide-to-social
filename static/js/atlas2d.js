/* atlas2d.js —— 2D 力导向知识图谱（第一版星图）：中心+城市枢纽+景点瓦片+蛛丝连线，拖节点/缩放/hover亮暗，点击穿越 */
(function () {
"use strict";
var RAW = window.GRAPH_DATA || { nodes: [], edges: [] };

var CAT_STYLE = {
  "古建筑类": { emoji: "🏯", color: "#ff7a59", g: ["#ffab6b", "#e8604f"] },
  "自然山水类": { emoji: "🏔️", color: "#57e0c4", g: ["#7bd8c6", "#3a9d8b"] },
  "历史遗迹类": { emoji: "🏛️", color: "#ffbf6b", g: ["#f6c56b", "#c98a3a"] },
  "古镇街区类": { emoji: "🏘️", color: "#5fa8ff", g: ["#8fb8ff", "#5a7de0"] },
  "宗教建筑类": { emoji: "🛕", color: "#b892e0", g: ["#b8a0e0", "#7d5fc0"] }
};
var DEF = { emoji: "📍", color: "#9fb0ad", g: ["#9fb0ad", "#5f6f6c"] };
var CITY_COLOR = "#ffbf6b", CENTER_COLOR = "#fff0d6";
function catStyle(c) { return CAT_STYLE[c] || DEF; }
function nodeColor(n) { return n.type === "center" ? CENTER_COLOR : n.type === "city" ? CITY_COLOR : catStyle(n.cat).color; }

var canvas = document.getElementById("graph"), ctx = canvas.getContext("2d");
var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
var rOf = function (n) { return n.type === "center" ? 22 : n.type === "city" ? 13 + n.w * 4 : 14 + n.w * 5; };
var nodes = RAW.nodes.map(function (n) { return Object.assign({}, n, { x: 0, y: 0, vx: 0, vy: 0, r: rOf(n) }); });
var byId = {}; nodes.forEach(function (n) { byId[n.id] = n; });
var edges = RAW.edges.map(function (e) { return { a: byId[e[0]], b: byId[e[1]] }; }).filter(function (e) { return e.a && e.b; });
var neighbors = {}; nodes.forEach(function (n) { neighbors[n.id] = {}; });
edges.forEach(function (e) { neighbors[e.a.id][e.b.id] = 1; neighbors[e.b.id][e.a.id] = 1; });
var cityCount = nodes.filter(function (n) { return n.type === "city"; }).length;

var view = { x: 0, y: 0, scale: 1 }, hiddenCats = {};
var hoverNode = null, selectedNode = null, dragNode = null, dragMoved = false;
var panning = false, panStart = null, searchTerm = "", physicsOn = true;
var bootTime = performance.now(), seeded = false, t = 0, camTween = null;

function visible(n) { return n.type !== "spot" || !hiddenCats[n.cat]; }
function resize() { W = window.innerWidth; H = window.innerHeight; canvas.width = W * DPR; canvas.height = H * DPR; canvas.style.width = W + "px"; canvas.style.height = H + "px"; if (!seeded) { seed(); seeded = true; } }
function seed() {
  var cx = W / 2, cy = H / 2, cities = nodes.filter(function (n) { return n.type === "city"; });
  nodes.forEach(function (n, i) {
    if (n.type === "center") { n.x = cx; n.y = cy; return; }
    if (n.type === "city") { var idx = cities.indexOf(n), a = idx / cities.length * 6.2832; n.x = cx + Math.cos(a) * 240; n.y = cy + Math.sin(a) * 200; return; }
    var city = byId[Object.keys(neighbors[n.id])[0]]; var a2 = Math.random() * 6.2832, d = 70 + Math.random() * 40;
    n.x = (city ? city.x : cx) + Math.cos(a2) * d; n.y = (city ? city.y : cy) + Math.sin(a2) * d;
  });
}
window.addEventListener("resize", function () { seeded = false; resize(); }); resize();

function simulate() {
  if (!physicsOn) return;
  var cx = W / 2, cy = H / 2, vis = nodes.filter(visible);
  for (var i = 0; i < vis.length; i++) for (var j = i + 1; j < vis.length; j++) {
    var a = vis[i], b = vis[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (d2 < 1) { d2 = 1; dx = 0.5; dy = 0.5; } var d = Math.sqrt(d2), f = 5000 * (a.w + b.w) * 0.5 / d2, fx = dx / d * f, fy = dy / d * f;
    a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
  }
  edges.forEach(function (e) {
    if (!visible(e.a) || !visible(e.b)) return; var dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.max(Math.hypot(dx, dy), 1);
    var ideal = e.a.type === "center" || e.b.type === "center" ? 230 : 84 + (e.a.r + e.b.r) * 1.4;
    var f = (d - ideal) * 0.014, fx = dx / d * f, fy = dy / d * f; e.a.vx += fx; e.a.vy += fy; e.b.vx -= fx; e.b.vy -= fy;
  });
  vis.forEach(function (n) { if (n.type === "center") { n.vx += (cx - n.x) * 0.05; n.vy += (cy - n.y) * 0.05; return; } n.vx += (cx - n.x) * 0.0026; n.vy += (cy - n.y) * 0.0026; });
  vis.forEach(function (n) { if (n === dragNode) { n.vx = 0; n.vy = 0; return; } n.vx *= 0.86; n.vy *= 0.86; var sp = Math.hypot(n.vx, n.vy); if (sp > 14) { n.vx *= 14 / sp; n.vy *= 14 / sp; } n.x += n.vx; n.y += n.vy; });
}
function w2s(x, y) { return [(x - W / 2) * view.scale + W / 2 + view.x, (y - H / 2) * view.scale + H / 2 + view.y]; }
function s2w(x, y) { return [(x - W / 2 - view.x) / view.scale + W / 2, (y - H / 2 - view.y) / view.scale + H / 2]; }
function nodeAlpha(n) { var f = hoverNode || selectedNode, a = 1; if (f) a = (n === f || neighbors[f.id][n.id]) ? 1 : 0.12; if (searchTerm) a = Math.min(a, n.name.toLowerCase().indexOf(searchTerm) >= 0 ? 1 : 0.08); return a; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

function draw(now) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  var boot = Math.min((now - bootTime) / 1400, 1), ease = 1 - Math.pow(1 - boot, 3), focus = hoverNode || selectedNode; t = now * 0.001;
  edges.forEach(function (e) {
    if (!visible(e.a) || !visible(e.b)) return; var alpha = Math.min(nodeAlpha(e.a), nodeAlpha(e.b)) * 0.5 * ease, lit = focus && (e.a === focus || e.b === focus); if (lit) alpha = 0.95;
    var s1 = w2s(e.a.x, e.a.y), s2 = w2s(e.b.x, e.b.y), mx = (s1[0] + s2[0]) / 2 + (s2[1] - s1[1]) * 0.06, my = (s1[1] + s2[1]) / 2 - (s2[0] - s1[0]) * 0.06;
    ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.quadraticCurveTo(mx, my, s2[0], s2[1]);
    if (lit) { var g = ctx.createLinearGradient(s1[0], s1[1], s2[0], s2[1]); g.addColorStop(0, nodeColor(e.a)); g.addColorStop(1, nodeColor(e.b)); ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.globalAlpha = alpha; }
    else { ctx.strokeStyle = "rgba(87,224,196,1)"; ctx.lineWidth = 0.7; ctx.globalAlpha = alpha * 0.45; }
    ctx.stroke(); ctx.globalAlpha = 1;
    if (lit) { var p = (t * 0.45 + (e.a.x + e.b.y) * 0.001) % 1, q = 1 - p, px = q * q * s1[0] + 2 * q * p * mx + p * p * s2[0], py = q * q * s1[1] + 2 * q * p * my + p * p * s2[1]; ctx.beginPath(); ctx.arc(px, py, 2, 0, 6.2832); ctx.fillStyle = "#fff6ea"; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1; }
  });
  nodes.forEach(function (n) {
    if (!visible(n)) return; var alpha = nodeAlpha(n) * ease, s = w2s(n.x, n.y), sx = s[0], sy = s[1], color = nodeColor(n), r = n.r * view.scale, isF = n === focus, breathe = 1 + Math.sin(t * 1.5 + n.x * 0.01) * 0.06;
    var glowR = r * (isF ? 2.6 : 1.9) * breathe, gg = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, glowR); gg.addColorStop(0, color); gg.addColorStop(1, "transparent");
    ctx.globalAlpha = alpha * (isF ? 0.5 : 0.24); ctx.beginPath(); ctx.arc(sx, sy, glowR, 0, 6.2832); ctx.fillStyle = gg; ctx.fill(); ctx.globalAlpha = alpha;
    if (n.type === "spot") {
      var st = catStyle(n.cat), side = r * 1.7, bx = sx - side / 2, by = sy - side / 2, rad = side * 0.26; ctx.save(); rr(ctx, bx, by, side, side, rad);
      if (isF || n === selectedNode) { ctx.shadowColor = color; ctx.shadowBlur = 18; } var grad = ctx.createLinearGradient(bx, by, bx + side, by + side); grad.addColorStop(0, st.g[0]); grad.addColorStop(1, st.g[1]); ctx.fillStyle = grad; ctx.fill(); ctx.shadowBlur = 0;
      ctx.lineWidth = 1.4; ctx.strokeStyle = "rgba(255,255,255," + (0.28 * alpha) + ")"; ctx.stroke(); ctx.clip(); ctx.globalAlpha = alpha; ctx.font = (side * 0.6) + "px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(st.emoji, sx, sy + side * 0.04); ctx.restore();
      if (n === selectedNode) { rr(ctx, bx - 4, by - 4, side + 8, side + 8, rad + 3); ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash([3, 5]); ctx.lineDashOffset = -t * 14; ctx.stroke(); ctx.setLineDash([]); }
    } else {
      ctx.beginPath(); ctx.arc(sx, sy, r * 0.9, 0, 6.2832); ctx.fillStyle = color; if (isF) { ctx.shadowColor = color; ctx.shadowBlur = 16; } ctx.fill(); ctx.shadowBlur = 0;
      ctx.font = (r * 1.05) + "px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(n.emoji, sx, sy);
      if (n === selectedNode) { ctx.beginPath(); ctx.arc(sx, sy, r + 7, 0, 6.2832); ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash([3, 5]); ctx.lineDashOffset = -t * 14; ctx.stroke(); ctx.setLineDash([]); }
    }
    var show = n.type !== "spot" || isF || (focus && neighbors[focus.id][n.id]) || view.scale > 1.4 || searchTerm;
    if (show && alpha > 0.28) { var fs = Math.max(11, (n.type === "city" ? 15 : 12) * Math.min(view.scale, 1.3)); ctx.font = (n.type !== "spot" ? "700 " : "") + fs + 'px "Noto Serif SC",serif'; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.globalAlpha = alpha * 0.95; ctx.fillStyle = isF ? "#fff3e0" : "#dfeae7"; ctx.shadowColor = "rgba(7,15,18,.95)"; ctx.shadowBlur = 6; var off = n.type === "spot" ? n.r * view.scale * 0.9 + fs + 5 : r + fs + 5; ctx.fillText(n.name, sx, sy + off); ctx.shadowBlur = 0; }
    ctx.globalAlpha = 1;
  });
}
function loop(now) {
  simulate();
  if (camTween) { var e = Math.min((now - camTween.t0) / 550, 1), k = 1 - Math.pow(1 - e, 3); view.x = camTween.x0 + (camTween.tx - camTween.x0) * k; view.y = camTween.y0 + (camTween.ty - camTween.y0) * k; view.scale = camTween.s0 + (camTween.ts - camTween.s0) * k; if (e >= 1) camTween = null; }
  draw(now); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function pick(mx, my) { var w = s2w(mx, my), best = null, bd = 1e9; nodes.forEach(function (n) { if (!visible(n)) return; var d = Math.hypot(n.x - w[0], n.y - w[1]); if (d < n.r * 1.2 + 8 && d < bd) { best = n; bd = d; } }); return best; }
var tip = document.getElementById("tip");
canvas.addEventListener("pointerdown", function (e) { camTween = null; var n = pick(e.clientX, e.clientY); if (n) { dragNode = n; dragMoved = false; } else { panning = true; panStart = [e.clientX, e.clientY]; } });
canvas.addEventListener("pointermove", function (e) {
  var mx = e.clientX, my = e.clientY;
  if (dragNode) { var w = s2w(mx, my); dragNode.x = w[0]; dragNode.y = w[1]; dragMoved = true; return; }
  if (panning) { view.x += mx - panStart[0]; view.y += my - panStart[1]; panStart = [mx, my]; return; }
  hoverNode = pick(mx, my); canvas.style.cursor = hoverNode ? "pointer" : "grab";
  if (hoverNode) { var sub = hoverNode.type === "spot" ? hoverNode.cat : hoverNode.type === "city" ? "城市" : ""; tip.innerHTML = hoverNode.name + (sub ? '<em>' + sub + '</em>' : ''); tip.style.left = Math.min(mx + 16, W - 200) + "px"; tip.style.top = (my - 8) + "px"; tip.classList.add("show"); } else tip.classList.remove("show");
});
window.addEventListener("pointerup", function () { if (dragNode) { if (!dragMoved) openPanel(dragNode); dragNode = null; } panning = false; });
canvas.addEventListener("wheel", function (e) { e.preventDefault(); var f = e.deltaY < 0 ? 1.12 : 1 / 1.12, ns = Math.min(Math.max(view.scale * f, 0.4), 3.2), mx = e.clientX - W / 2, my = e.clientY - H / 2; view.x = mx - (mx - view.x) * (ns / view.scale); view.y = my - (my - view.y) * (ns / view.scale); view.scale = ns; }, { passive: false });
canvas.addEventListener("dblclick", closePanel);

function esc(x) { return String(x).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
function studioURL(name) { return "/studio?spot=" + encodeURIComponent(name) + "&from=atlas"; }
var panel = document.getElementById("panel");
function openPanel(n) {
  selectedNode = n; focusOn(n);
  var c = nodeColor(n), th = document.getElementById("pThumb");
  if (n.type === "spot") { var st = catStyle(n.cat); th.style.background = "linear-gradient(135deg," + st.g[0] + "," + st.g[1] + ")"; th.textContent = st.emoji; }
  else { th.style.background = "linear-gradient(135deg," + c + ",rgba(0,0,0,.28))"; th.textContent = n.emoji; }
  document.getElementById("pDot").style.background = c; document.getElementById("pDot").style.color = c;
  document.getElementById("pName").textContent = n.name;
  var body = document.getElementById("pBody"), catEl = document.getElementById("pCatText");
  if (n.type === "spot") {
    catEl.textContent = n.cat;
    body.innerHTML = '<div class="pdesc">这是一处「' + esc(n.cat) + '」景点。点击下方按钮，穿越进「文旅转译局」一键生成小红书 / 抖音 / 朋友圈。</div><div class="p-rule"></div><button class="cta-gen" id="ctaGen">✦ 穿越去生成社交文案 →</button><div class="cta-hint">将带「' + esc(n.name) + '」进入生成台并自动开始</div>';
    document.getElementById("ctaGen").addEventListener("click", function () { warpDepart(n); });
  } else if (n.type === "city") {
    catEl.textContent = "城市";
    var ss = Object.keys(neighbors[n.id]).map(function (id) { return byId[id]; }).filter(function (m) { return m.type === "spot"; });
    var links = '<div class="p-links-title">该城市景点 · ' + ss.length + '</div>';
    ss.forEach(function (m) { var st = catStyle(m.cat); links += '<div class="p-link" data-go="' + studioURL(m.name) + '"><span class="li-emo">' + st.emoji + '</span><span class="li-nm">' + esc(m.name) + '</span><span class="li-go">穿越 →</span></div>'; });
    body.innerHTML = '<div class="pdesc">从这座城市的星座里挑一个景点，点它穿越去生成台。</div>' + links;
    body.querySelectorAll(".p-link").forEach(function (el) { el.addEventListener("click", function () { warpDepartUrl(el.dataset.go); }); });
  } else {
    catEl.textContent = "星图中心";
    body.innerHTML = '<div class="pdesc">这是整张星图的引力中心。拖动城市与景点探索，点任意景点穿越去创作。</div>';
  }
  panel.classList.add("open");
}
function closePanel() { panel.classList.remove("open"); selectedNode = null; }
document.getElementById("pclose").addEventListener("click", closePanel);
function focusOn(n) { var s = w2s(n.x, n.y); var tx = view.x + (W / 2 - s[0]) * 0.9 - 100, ty = view.y + (H / 2 - s[1]) * 0.9; camTween = { x0: view.x, y0: view.y, tx: tx, ty: ty, s0: view.scale, ts: Math.max(view.scale, 1.1), t0: performance.now() }; }
function warpBurst(sx, sy) { var ov = document.createElement("div"); ov.className = "warp-depart"; ov.style.setProperty("--wx", (sx / W * 100) + "%"); ov.style.setProperty("--wy", (sy / H * 100) + "%"); document.body.appendChild(ov); }
function warpDepart(n) { panel.classList.remove("open"); var s = w2s(n.x, n.y); warpBurst(s[0], s[1]); setTimeout(function () { window.location.href = studioURL(n.name); }, 680); }
function warpDepartUrl(url) { panel.classList.remove("open"); warpBurst(W / 2, H / 2); setTimeout(function () { window.location.href = url; }, 680); }

var legendItems = document.getElementById("legendItems");
Object.keys(CAT_STYLE).forEach(function (cat) { var st = CAT_STYLE[cat], cnt = nodes.filter(function (n) { return n.type === "spot" && n.cat === cat; }).length; if (!cnt) return; var d = document.createElement("div"); d.className = "li"; d.innerHTML = '<span class="d" style="background:' + st.color + ';color:' + st.color + '"></span><span class="nm">' + cat.replace("类", "") + '</span><span class="ct">· ' + cnt + '</span>'; d.addEventListener("click", function () { hiddenCats[cat] = !hiddenCats[cat]; d.classList.toggle("off"); if (selectedNode && selectedNode.type === "spot" && hiddenCats[selectedNode.cat]) closePanel(); if (hoverNode && hoverNode.type === "spot" && hiddenCats[hoverNode.cat]) hoverNode = null; }); legendItems.appendChild(d); });
var si = document.getElementById("search"); if (si) si.addEventListener("input", function (e) { searchTerm = e.target.value.trim().toLowerCase(); });
document.getElementById("btnReset").addEventListener("click", function () { camTween = { x0: view.x, y0: view.y, tx: 0, ty: 0, s0: view.scale, ts: 1, t0: performance.now() }; });
var bp = document.getElementById("btnPause"); bp.addEventListener("click", function () { physicsOn = !physicsOn; bp.textContent = physicsOn ? "静止" : "流动"; });
document.getElementById("statN").textContent = nodes.filter(function (n) { return n.type === "spot"; }).length;
document.getElementById("statE").textContent = cityCount;
})();
