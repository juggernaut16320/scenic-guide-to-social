/* atlas.js —— Three.js 卡通低多边形地球：3D 起伏地形(山/海/雪) + 分类建筑 + 名字标签 + 同城聚簇连线 + 悬停亮暗 + 俯冲穿越 */
(function () {
"use strict";
if (!window.THREE) { console.error("THREE 未加载"); return; }
var THREE = window.THREE;
var RAW = window.GRAPH_DATA || { nodes: [], edges: [] };

var CAT_STYLE = {
  "古建筑类": { color: "#ff7a59", g: ["#ffab6b", "#e8604f"], emoji: "🏯" },
  "自然山水类": { color: "#57e0c4", g: ["#7bd8c6", "#3a9d8b"], emoji: "🏔️" },
  "历史遗迹类": { color: "#ffbf6b", g: ["#f6c56b", "#c98a3a"], emoji: "🏛️" },
  "古镇街区类": { color: "#5fa8ff", g: ["#8fb8ff", "#5a7de0"], emoji: "🏘️" },
  "宗教建筑类": { color: "#b892e0", g: ["#b8a0e0", "#7d5fc0"], emoji: "🛕" }
};
var DEFAULT_CAT = { color: "#9fb0ad", g: ["#9fb0ad", "#5f6f6c"], emoji: "📍" };
function catStyle(c) { return CAT_STYLE[c] || DEFAULT_CAT; }

var spotNodes = RAW.nodes.filter(function (n) { return n.type === "spot"; });
var cityCount = RAW.nodes.filter(function (n) { return n.type === "city"; }).length;
var cityOf = {};
RAW.edges.forEach(function (e) { if (e[0].indexOf("city:") === 0 && e[1].indexOf("spot:") === 0) cityOf[e[1].slice(5)] = e[0].slice(5); });

/* ── three 基础 ── */
var canvas = document.getElementById("graph");
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 4000);
camera.position.set(0, 0, 320);
function resize() { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
window.addEventListener("resize", resize); resize();

scene.add(new THREE.AmbientLight(0x8fa4c0, 0.9));
var key = new THREE.DirectionalLight(0xfff2e2, 1.2); key.position.set(-1, 0.9, 0.8); scene.add(key);
var fill = new THREE.DirectionalLight(0x57e0c4, 0.5); fill.position.set(1, -0.4, -0.5); scene.add(fill);

var Rs = 100, MTN = 24, BASE = 3, SEA = 0.02;
var globe = new THREE.Group(); scene.add(globe);

/* ── 位移噪声：大块大陆 + 多层起伏山脉 ── */
var NDX = [], NDY = [], NDZ = [], NFRQ = [], NPH = [], NAMP = [];
(function () {
  for (var k = 0; k < 7; k++) {
    var th = Math.random() * 6.2832, z = Math.random() * 2 - 1, r = Math.sqrt(1 - z * z);
    NDX.push(Math.cos(th) * r); NDY.push(Math.sin(th) * r); NDZ.push(z);
    NFRQ.push(0.8 * Math.pow(1.72, k)); NPH.push(Math.random() * 6.2832); NAMP.push(Math.pow(0.6, k));
  }
})();
function fbm3(x, y, z) { var s = 0, tot = 0; for (var k = 0; k < NDX.length; k++) { s += NAMP[k] * Math.sin((x * NDX[k] + y * NDY[k] + z * NDZ[k]) * NFRQ[k] + NPH[k]); tot += NAMP[k]; } return s / tot; }
function surfaceR(x, y, z) { var h = fbm3(x, y, z); return h > SEA ? Rs + BASE + (h - SEA) * MTN : Rs; }
/* 卡通配色：亮蓝海 + 清爽绿地 + 白极冠 */
function faceColor(h, ay) {
  var c = new THREE.Color();
  if (ay > 0.9) return c.set("#eef5f3");                 // 极地冰盖
  if (h <= SEA - 0.05) return c.set("#1f6fa8");          // 深海
  if (h <= SEA) return c.set("#2f9fd0");                 // 浅海
  var e = h - SEA;
  if (ay > 0.82) return c.set("#dfeaea");                // 近极：雪
  if (e < 0.02) return c.set("#ecdca0");                 // 沙滩
  if (e < 0.14) return c.set("#6cc35b");                 // 草原
  if (e < 0.3) return c.set("#4a9f45");                  // 森林
  if (e < 0.5) return c.set("#8a7d64");                  // 山岩
  return c.set("#f4f8f4");                               // 雪顶
}

/* ── 卡通低多边形地形球（chunky 平面着色，大陆抬升）── */
(function () {
  var geo = new THREE.IcosahedronGeometry(Rs, 5).toNonIndexed();
  var pos = geo.attributes.position, n = pos.count, colors = new Float32Array(n * 3);
  for (var i = 0; i < n; i += 3) {
    var vs = [], hs = [], cy = 0;
    for (var t = 0; t < 3; t++) { var vx = pos.getX(i + t), vy = pos.getY(i + t), vz = pos.getZ(i + t), L = Math.sqrt(vx * vx + vy * vy + vz * vz); var d = { x: vx / L, y: vy / L, z: vz / L }; vs.push(d); hs.push(fbm3(d.x, d.y, d.z)); cy += d.y / 3; }
    var avg = (hs[0] + hs[1] + hs[2]) / 3, col = faceColor(avg, Math.abs(cy));
    for (var u = 0; u < 3; u++) {
      var rr = hs[u] > SEA ? Rs + BASE + (hs[u] - SEA) * MTN : Rs;
      pos.setXYZ(i + u, vs[u].x * rr, vs[u].y * rr, vs[u].z * rr);
      colors[(i + u) * 3] = col.r; colors[(i + u) * 3 + 1] = col.g; colors[(i + u) * 3 + 2] = col.b;
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  globe.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 })));
})();

/* ── 蓬松低多边形云朵 ── */
var clouds = new THREE.Group(); globe.add(clouds);
var cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.95 });
for (var ci = 0; ci < 13; ci++) {
  var puff = new THREE.Group();
  for (var pj = 0; pj < 4; pj++) { var b = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + Math.random() * 3.5, 0), cloudMat); b.position.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 5); b.scale.y = 0.65; puff.add(b); }
  var th = Math.random() * 6.2832, z = Math.random() * 2 - 1, rr2 = Math.sqrt(1 - z * z);
  puff.position.set(Math.cos(th) * rr2, z, Math.sin(th) * rr2).multiplyScalar(Rs * 1.28);
  puff.lookAt(0, 0, 0); clouds.add(puff);
}
/* 大气光晕 */
scene.add(new THREE.Mesh(new THREE.SphereGeometry(Rs * 1.28, 48, 32), new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.12, side: THREE.BackSide })));
scene.add(new THREE.Mesh(new THREE.SphereGeometry(Rs * 1.5, 48, 32), new THREE.MeshBasicMaterial({ color: 0x3a86b0, transparent: true, opacity: 0.34, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })));

/* ── 手搓低多边形树（松树 / 圆冠），撒在绿地上 ── */
var trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, flatShading: true, roughness: 1 });
var leafMats = [0x4fa84a, 0x3f8f3a, 0x5fb85a, 0x2f7d38].map(function (c) { return new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 1 }); });
function makeTree() {
  var g = new THREE.Group(), lm = leafMats[Math.floor(Math.random() * leafMats.length)];
  var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.2, 5), trunkMat); trunk.position.y = 1.1; g.add(trunk);
  if (Math.random() < 0.55) { // 松树：三层锥
    var y = 3;[[2.2, 3], [1.7, 2.5], [1.1, 2]].forEach(function (s) { var c = new THREE.Mesh(new THREE.ConeGeometry(s[0], s[1], 6), lm); c.position.y = y; g.add(c); y += s[1] * 0.55; });
  } else { // 圆冠：低多边形球
    var f = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 0), lm); f.position.y = 3.7; f.scale.y = 1.15; g.add(f);
  }
  g.scale.setScalar(0.8 + Math.random() * 0.55);
  return g;
}
(function scatterTrees() {
  var placed = 0, tries = 0;
  while (placed < 80 && tries < 900) {
    tries++;
    var th = Math.random() * 6.2832, z = Math.random() * 2 - 1, r = Math.sqrt(1 - z * z);
    var dx = Math.cos(th) * r, dy = z, dz = Math.sin(th) * r, h = fbm3(dx, dy, dz);
    if (h <= SEA + 0.02 || h > SEA + 0.26 || Math.abs(dy) > 0.78) continue; // 只落草原/森林、避开极地
    var tree = makeTree(), dir = new THREE.Vector3(dx, dy, dz);
    tree.position.copy(dir.clone().multiplyScalar(surfaceR(dx, dy, dz)));
    tree.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    globe.add(tree); placed++;
  }
})();

/* ── 手搓低多边形小山丘 + 石头 ── */
var hillMats = [0x4a9f45, 0x3f8f3a, 0x6a705f, 0x7c8a5a].map(function (c) { return new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 1 }); });
var rockMat = new THREE.MeshStandardMaterial({ color: 0x8f8a83, flatShading: true, roughness: 1 });
var snowRockMat = new THREE.MeshStandardMaterial({ color: 0xd8ded9, flatShading: true, roughness: 1 });
function makeHill() {
  var m = hillMats[Math.floor(Math.random() * hillMats.length)];
  var h = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + Math.random() * 5, 1), m);
  h.position.y = 1.2; h.scale.set(1 + Math.random() * 0.7, 0.42 + Math.random() * 0.2, 1 + Math.random() * 0.7);
  return h;
}
function makeRock(snow) {
  var g = new THREE.Group(), mat = snow ? snowRockMat : rockMat, k = 1 + Math.floor(Math.random() * 2);
  for (var i = 0; i <= k; i++) { var r = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + Math.random() * 2.2, 0), mat); r.position.set((Math.random() - 0.5) * 3, 0.8 + Math.random(), (Math.random() - 0.5) * 3); r.scale.set(1, 0.7 + Math.random() * 0.5, 1); r.rotation.y = Math.random() * 6.28; g.add(r); }
  return g;
}
function scatterOn(count, tries, hLo, hHi, makeFn) {
  var placed = 0, t = 0;
  while (placed < count && t < tries) {
    t++;
    var th = Math.random() * 6.2832, z = Math.random() * 2 - 1, r = Math.sqrt(1 - z * z);
    var dx = Math.cos(th) * r, dy = z, dz = Math.sin(th) * r, h = fbm3(dx, dy, dz);
    if (h <= SEA + hLo || h > SEA + hHi || Math.abs(dy) > 0.86) continue;
    var o = makeFn(h), dir = new THREE.Vector3(dx, dy, dz);
    o.position.copy(dir.clone().multiplyScalar(surfaceR(dx, dy, dz)));
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    globe.add(o); placed++;
  }
}
scatterOn(24, 500, 0.03, 0.4, function () { return makeHill(); });               // 山丘：草原~山地
scatterOn(34, 700, 0.0, 0.62, function (h) { return makeRock(h > SEA + 0.42); }); // 石头：高处用雪石

/* ── 河流 / 湖泊 / 雪山 ── */
var riverMat = new THREE.MeshStandardMaterial({ color: 0x36a6d6, roughness: 0.25, metalness: 0.25 });
var lakeMat = new THREE.MeshStandardMaterial({ color: 0x2f9fd0, roughness: 0.2, metalness: 0.3 });
function makeLake() { var r = 4 + Math.random() * 5; var m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), lakeMat); m.rotation.x = -Math.PI / 2; m.position.y = 0.4; return m; }
var mtRockMat = new THREE.MeshStandardMaterial({ color: 0x6e6a5f, flatShading: true, roughness: 1 });
function makeSnowMt() {
  var g = new THREE.Group(), R = 5 + Math.random() * 3.5, H = 12 + Math.random() * 10;
  var base = new THREE.Mesh(new THREE.ConeGeometry(R, H, 6), mtRockMat); base.position.y = H / 2; g.add(base);
  var cap = new THREE.Mesh(new THREE.ConeGeometry(R * 0.42, H * 0.34, 6), snowRockMat); cap.position.y = H * 0.83; g.add(cap);
  g.scale.setScalar(0.9 + Math.random() * 0.5); return g;
}
scatterOn(8, 500, 0.02, 0.13, function () { return makeLake(); });    // 湖：低洼绿地
scatterOn(12, 600, 0.34, 0.75, function () { return makeSnowMt(); });  // 雪山：高地
/* 河流：从高地沿最陡下降走到海 */
(function () {
  var made = 0, attempts = 0;
  while (made < 6 && attempts < 260) {
    attempts++;
    var th = Math.random() * 6.2832, z = Math.random() * 2 - 1, rr = Math.sqrt(1 - z * z);
    var d = new THREE.Vector3(Math.cos(th) * rr, z, Math.sin(th) * rr);
    if (fbm3(d.x, d.y, d.z) < SEA + 0.28 || Math.abs(d.y) > 0.8) continue;
    var pts = [], steps = 0;
    while (steps < 48) {
      pts.push(d.clone());
      if (fbm3(d.x, d.y, d.z) <= SEA) break;
      var up = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      var t1 = new THREE.Vector3().crossVectors(up, d).normalize(), t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
      var best = null, bh = fbm3(d.x, d.y, d.z);
      for (var a = 0; a < 10; a++) { var ang = a / 10 * 6.2832; var nd = d.clone().addScaledVector(t1, Math.cos(ang) * 0.055).addScaledVector(t2, Math.sin(ang) * 0.055).normalize(); var nh = fbm3(nd.x, nd.y, nd.z); if (nh < bh) { bh = nh; best = nd; } }
      if (!best) break; d = best; steps++;
    }
    if (pts.length < 4) continue;
    var cp = pts.map(function (p) { return p.clone().multiplyScalar(surfaceR(p.x, p.y, p.z) + 0.5); });
    var tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), cp.length * 4, 1.1, 6, false);
    globe.add(new THREE.Mesh(tube, riverMat)); made++;
  }
})();

/* 星空 */
(function () {
  var g = new THREE.BufferGeometry(), n = 1400, p = new Float32Array(n * 3);
  for (var i = 0; i < n; i++) { var r = 800 + Math.random() * 600, th = Math.random() * 6.2832, ph = Math.acos(2 * Math.random() - 1); p[i * 3] = r * Math.sin(ph) * Math.cos(th); p[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); p[i * 3 + 2] = r * Math.cos(ph); }
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe9f1ef, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0.85 })));
})();

/* ── 景点：按城市聚簇分布 ── */
var GA = Math.PI * (3 - Math.sqrt(5));
var spots = spotNodes.map(function (n) { return { name: n.name, cat: n.cat, city: cityOf[n.name] || "", dir: null, surf: Rs, obj: null, hit: null, label: null, mats: [] }; });
var groups = {}; spots.forEach(function (s) { (groups[s.city || "?"] = groups[s.city || "?"] || []).push(s); });
var cityList = Object.keys(groups), NC = cityList.length;
cityList.forEach(function (city, ci) {
  var y = 1 - (ci / Math.max(NC - 1, 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = ci * GA;
  var base = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).normalize();
  var up = Math.abs(base.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  var t1 = new THREE.Vector3().crossVectors(up, base).normalize(), t2 = new THREE.Vector3().crossVectors(base, t1).normalize();
  var arr = groups[city];
  arr.forEach(function (s, k) {
    var ang = (k / arr.length) * 6.2832, rad = arr.length === 1 ? 0 : 0.15 + (k % 2) * 0.05;
    s.dir = base.clone().addScaledVector(t1, Math.cos(ang) * rad).addScaledVector(t2, Math.sin(ang) * rad).normalize();
    s.surf = surfaceR(s.dir.x, s.dir.y, s.dir.z) + 1;
  });
});

/* 分类 3D 建筑 */
function buildModel(cat) {
  var st = catStyle(cat), mat = new THREE.MeshToonMaterial({ color: new THREE.Color(st.color) }), accent = new THREE.MeshToonMaterial({ color: new THREE.Color(st.g[1]) });
  var g = new THREE.Group();
  function add(geo, m, x, y) { var me = new THREE.Mesh(geo, m || mat); me.position.set(x || 0, y || 0, 0); g.add(me); }
  if (cat === "自然山水类") { add(new THREE.ConeGeometry(4.5, 9, 6), mat, 0, 4.5); add(new THREE.ConeGeometry(3, 6, 6), mat, 3.4, 3); add(new THREE.ConeGeometry(2.4, 4.5, 6), mat, -3.2, 2.2); }
  else if (cat === "古建筑类") { add(new THREE.CylinderGeometry(3, 3.4, 1.2, 8), mat, 0, 0.6); add(new THREE.ConeGeometry(3.8, 1.6, 4), accent, 0, 1.8); add(new THREE.CylinderGeometry(2.3, 2.6, 1, 8), mat, 0, 3); add(new THREE.ConeGeometry(3, 1.5, 4), accent, 0, 4.1); add(new THREE.CylinderGeometry(1.5, 1.7, 1, 8), mat, 0, 5.3); add(new THREE.ConeGeometry(2.2, 1.5, 4), accent, 0, 6.4); }
  else if (cat === "历史遗迹类") { add(new THREE.CylinderGeometry(1.5, 1.7, 6.5, 10), mat, 0, 3.2); add(new THREE.BoxGeometry(5, 1.1, 2.4), accent, 0, 7); }
  else if (cat === "古镇街区类") { add(new THREE.BoxGeometry(3.2, 3, 3.2), mat, 0, 1.5); add(new THREE.ConeGeometry(2.6, 1.6, 4), accent, 0, 3.8); add(new THREE.BoxGeometry(2.4, 2.4, 2.4), mat, 3.2, 1.2); add(new THREE.ConeGeometry(2, 1.3, 4), accent, 3.2, 3.1); add(new THREE.BoxGeometry(2, 2, 2), mat, -2.8, 1); }
  else if (cat === "宗教建筑类") { add(new THREE.CylinderGeometry(3.2, 3.6, 2, 12), mat, 0, 1); add(new THREE.SphereGeometry(2.7, 16, 12, 0, 6.2832, 0, Math.PI / 2), accent, 0, 2); add(new THREE.ConeGeometry(0.6, 2.2, 8), mat, 0, 4.6); }
  else add(new THREE.ConeGeometry(3, 6, 6), mat, 0, 3);
  g.scale.setScalar(0.95);
  return g;
}
function roundRectC(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function makeLabel(text) {
  var fs = 46, pad = 10, c = document.createElement("canvas"), x = c.getContext("2d");
  x.font = '700 ' + fs + 'px "Noto Serif SC",serif'; var w = x.measureText(text).width;
  c.width = Math.ceil(w + pad * 2 + 10); c.height = fs + pad * 2;
  x = c.getContext("2d"); x.font = '700 ' + fs + 'px "Noto Serif SC",serif'; x.textBaseline = "middle";
  x.fillStyle = "rgba(7,15,18,.72)"; roundRectC(x, 0, 0, c.width, c.height, c.height / 2); x.fill();
  x.strokeStyle = "rgba(255,255,255,.14)"; x.lineWidth = 2; x.stroke();
  x.fillStyle = "#fff3e0"; x.fillText(text, pad + 5, c.height / 2 + 2);
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: true, depthWrite: false }));
  sp.scale.set(c.width / c.height * 7.5, 7.5, 1);
  return sp;
}

var hitList = [], beacons = [];
spots.forEach(function (s) {
  var col = new THREE.Color(catStyle(s.cat).color);
  var holder = new THREE.Group();
  holder.position.copy(s.dir.clone().multiplyScalar(s.surf));
  holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.dir);
  // 发光底座平台
  var base = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.2, 1.3, 14), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.4, flatShading: true, roughness: 0.7 }));
  base.position.y = 0.65; holder.add(base);
  // 建筑（放大更醒目）
  var mdl = buildModel(s.cat); mdl.scale.multiplyScalar(1.25); mdl.position.y = 1.3; holder.add(mdl);
  base.material.transparent = true; s.mats.push(base.material);
  mdl.traverse(function (o) { if (o.material) { o.material.transparent = true; s.mats.push(o.material); } });
  // 光柱信标 + 脉冲光环（不参与亮暗，始终可见）
  var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.6, 26, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.y = 15; holder.add(beam);
  var ring = new THREE.Mesh(new THREE.RingGeometry(5, 6.6, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; holder.add(ring);
  beacons.push({ ring: ring });
  var lab = makeLabel(s.name); lab.position.set(0, 16, 0); holder.add(lab); s.label = lab;
  globe.add(holder); s.obj = holder;
  var hb = new THREE.Mesh(new THREE.SphereGeometry(12, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  hb.position.copy(holder.position); hb.userData.spot = s; globe.add(hb); s.hit = hb; hitList.push(hb);
});

/* 同城连线（聚簇内成环，全都连上）*/
var arcs = [];
cityList.forEach(function (city) {
  var arr = groups[city]; if (arr.length < 2 || city === "?") return;
  for (var i = 0; i < arr.length; i++) {
    var a = arr[i].dir.clone().multiplyScalar(arr[i].surf + 4), b = arr[(i + 1) % arr.length].dir.clone().multiplyScalar(arr[(i + 1) % arr.length].surf + 4);
    var mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(Rs * 1.2);
    var curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    var mtl = new THREE.MeshStandardMaterial({ color: 0xcaf6ea, emissive: 0x57e0c4, emissiveIntensity: 0.95, transparent: true, opacity: 0.9, roughness: 0.4, metalness: 0 });
    var tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 26, 0.8, 6, false), mtl);
    globe.add(tube); arcs.push({ line: tube, city: city });
  }
});

/* ── 亮暗聚焦 ── */
function setFocus(f) {
  spots.forEach(function (s) {
    var on = !f || s === f || (s.city && s.city === f.city), op = on ? 1 : 0.12;
    s.mats.forEach(function (m) { m.opacity = op; });
    if (s.label) s.label.material.opacity = on ? 1 : 0.06;
  });
  arcs.forEach(function (a) { a.line.material.opacity = !f ? 0.82 : (a.city === f.city ? 0.98 : 0.08); });
}

/* ── 交互 ── */
globe.rotation.set(-0.15, 0.4, 0);
var dragging = false, last = null, moved = false, vy = 0, paused = false, downSpot = null;
var hidden = {}, searchTerm = "", selectedSpot = null, hoverSpot = null, focusQuat = null, focusN = 0, camTween = null, warping = false;
var raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
var tip = document.getElementById("tip");
function pickAt(cx, cy) {
  ndc.x = (cx / window.innerWidth) * 2 - 1; ndc.y = -(cy / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  var hits = raycaster.intersectObjects(hitList);
  for (var i = 0; i < hits.length; i++) { var s = hits[i].object.userData.spot; if (s && s.hit.visible) return s; }
  return null;
}
canvas.addEventListener("pointerdown", function (e) { dragging = true; last = [e.clientX, e.clientY]; moved = false; downSpot = pickAt(e.clientX, e.clientY); focusQuat = null; });
canvas.addEventListener("pointermove", function (e) {
  if (dragging) {
    var dx = e.clientX - last[0], dy = e.clientY - last[1];
    globe.rotation.y += dx * 0.005; globe.rotation.x = Math.max(-1.2, Math.min(1.2, globe.rotation.x + dy * 0.005));
    vy = dx * 0.005; last = [e.clientX, e.clientY]; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; return;
  }
  var s = pickAt(e.clientX, e.clientY); canvas.style.cursor = s ? "pointer" : "grab";
  if (s !== hoverSpot) { hoverSpot = s; setFocus(s || selectedSpot); }
  if (s) { tip.innerHTML = s.name + '<em>' + s.cat + '</em>'; tip.style.left = Math.min(e.clientX + 16, window.innerWidth - 200) + "px"; tip.style.top = (e.clientY - 8) + "px"; tip.classList.add("show"); }
  else tip.classList.remove("show");
});
window.addEventListener("pointerup", function (e) { if (dragging && !moved && downSpot && pickAt(e.clientX, e.clientY) === downSpot) openPanel(downSpot); dragging = false; });
canvas.addEventListener("wheel", function (e) { e.preventDefault(); camera.position.z = Math.max(150, Math.min(520, camera.position.z * (e.deltaY < 0 ? 0.9 : 1.1))); }, { passive: false });
canvas.addEventListener("dblclick", closePanel);

function loop() {
  clouds.rotation.y += 0.0004;
  var pt = performance.now() * 0.003;
  for (var bi = 0; bi < beacons.length; bi++) { var sc = 1 + Math.sin(pt + bi) * 0.28; beacons[bi].ring.scale.set(sc, sc, sc); beacons[bi].ring.material.opacity = 0.35 + (Math.sin(pt + bi) * 0.5 + 0.5) * 0.4; }
  if (warping) { camera.position.z += (camTween.z1 - camera.position.z) * 0.14; }
  else if (dragging) { /* 手动 */ }
  else if (focusQuat) { globe.quaternion.slerp(focusQuat, 0.08); if (++focusN > 46) focusQuat = null; }
  else { globe.rotation.y += ((paused || selectedSpot) ? 0 : 0.0016) + vy; vy *= 0.92; }  /* 打开景区时几乎不转 */
  if (camTween && !warping) { var e2 = Math.min((performance.now() - camTween.t0) / 550, 1), k = 1 - Math.pow(1 - e2, 3); camera.position.z = camTween.z0 + (camTween.z1 - camTween.z0) * k; if (e2 >= 1) camTween = null; }
  renderer.render(scene, camera); requestAnimationFrame(loop);
}
loop();

/* ── 面板 / 穿越 ── */
function esc(x) { return String(x).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
var panel = document.getElementById("panel");
function focusSpot(s) { focusQuat = new THREE.Quaternion().setFromUnitVectors(s.dir.clone(), new THREE.Vector3(0, 0, 1)); focusN = 0; }
function openPanel(s) {
  selectedSpot = s; setFocus(s); focusSpot(s);
  var stl = catStyle(s.cat), c = stl.color, th = document.getElementById("pThumb");
  th.style.background = "linear-gradient(135deg," + stl.g[0] + "," + stl.g[1] + ")"; th.textContent = stl.emoji;
  document.getElementById("pDot").style.background = c; document.getElementById("pDot").style.color = c;
  document.getElementById("pCatText").textContent = s.cat;
  document.getElementById("pName").textContent = s.name;
  document.getElementById("pBody").innerHTML =
    '<div class="pdesc">这是一处「' + esc(s.cat) + '」景点。点击下方按钮，穿越进「文旅转译局」，用它的讲解词原文一键生成小红书 / 抖音 / 朋友圈。</div>' +
    '<div class="p-rule"></div><button class="cta-gen" id="ctaGen">✦ 穿越去生成社交文案 →</button>' +
    '<div class="cta-hint">将带「' + esc(s.name) + '」进入生成台并自动开始</div>';
  document.getElementById("ctaGen").addEventListener("click", function () { warpDepart(s); });
  panel.classList.add("open");
}
function closePanel() { panel.classList.remove("open"); selectedSpot = null; setFocus(hoverSpot); }
document.getElementById("pclose").addEventListener("click", closePanel);
function warpDepart(s) {
  panel.classList.remove("open"); focusSpot(s);
  var v = new THREE.Vector3(); s.hit.getWorldPosition(v); v.project(camera);
  var sx = (v.x * 0.5 + 0.5) * window.innerWidth, sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
  warping = true; camTween = { z1: -40 };
  var ov = document.createElement("div"); ov.className = "warp-depart";
  ov.style.setProperty("--wx", (sx / window.innerWidth * 100) + "%"); ov.style.setProperty("--wy", (sy / window.innerHeight * 100) + "%");
  document.body.appendChild(ov);
  setTimeout(function () { window.location.href = "/studio?spot=" + encodeURIComponent(s.name) + "&from=atlas"; }, 720);
}

/* ── 图例 / 搜索 / 工具 ── */
function applyVis() { spots.forEach(function (s) { var vis = !hidden[s.cat] && (!searchTerm || s.name.toLowerCase().indexOf(searchTerm) >= 0); s.obj.visible = vis; s.hit.visible = vis; }); }
var legendItems = document.getElementById("legendItems");
Object.keys(CAT_STYLE).forEach(function (cat) {
  var st = CAT_STYLE[cat], cnt = spots.filter(function (s) { return s.cat === cat; }).length; if (!cnt) return;
  var d = document.createElement("div"); d.className = "li";
  d.innerHTML = '<span class="d" style="background:' + st.color + ';color:' + st.color + '"></span><span class="nm">' + cat.replace("类", "") + '</span><span class="ct">· ' + cnt + '</span>';
  d.addEventListener("click", function () { hidden[cat] = !hidden[cat]; d.classList.toggle("off"); applyVis(); });
  legendItems.appendChild(d);
});
var si = document.getElementById("search");
if (si) si.addEventListener("input", function (e) {
  searchTerm = e.target.value.trim().toLowerCase(); applyVis();
  if (searchTerm) {
    var m = spots.filter(function (s) { return !hidden[s.cat] && s.name.toLowerCase().indexOf(searchTerm) >= 0; })[0];
    if (m) { selectedSpot = null; setFocus(m); focusSpot(m); }  // 搜索 → 转到该景区
  } else setFocus(null);
});
document.getElementById("btnReset").addEventListener("click", function () { focusQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, 0.4, 0)); focusN = 0; camTween = { z0: camera.position.z, z1: 320, t0: performance.now() }; });
var bp = document.getElementById("btnPause");
bp.addEventListener("click", function () { paused = !paused; bp.textContent = paused ? "自转" : "静止"; });
document.getElementById("statN").textContent = spots.length;
document.getElementById("statE").textContent = cityCount;
})();
