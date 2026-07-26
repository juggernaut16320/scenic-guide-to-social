/* static/js/fx.js —— 生成台星座背景：星空粒子 + 鼠标连星 + 流星（暮青/珊瑚配色） */
(function () {
  var cv = document.getElementById('fxCanvas');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2), t = 0, mx = -9999, my = -9999;
  var CFG = { area: 9000, max: 150, speed: 0.18, rMin: 0.4, rMax: 1.9,
    dot: '233,241,239', link: '87,224,196', linkDist: 150, mouseDist: 220, attract: 0.5, glow: 6 };
  var ps = [], shoots = [];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function init() {
    resize();
    var n = Math.min(CFG.max, Math.floor(W * H / CFG.area));
    ps = [];
    for (var i = 0; i < n; i++) ps.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * CFG.speed, vy: (Math.random() - 0.5) * CFG.speed,
      r: CFG.rMin + Math.random() * (CFG.rMax - CFG.rMin), ph: Math.random() * 6.2832
    });
    shoots = [];
  }
  function frame() {
    t += 0.016; ctx.clearRect(0, 0, W, H);
    for (var k = 0; k < ps.length; k++) {
      var p = ps[k]; p.x += p.vx; p.y += p.vy;
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
      var dx = mx - p.x, dy = my - p.y, d2 = dx * dx + dy * dy;
      if (d2 < CFG.mouseDist * CFG.mouseDist && d2 > 1) {
        var d = Math.sqrt(d2), f = (1 - d / CFG.mouseDist) * CFG.attract * 0.02;
        p.vx += dx / d * f; p.vy += dy / d * f;
      }
      p.vx *= 0.99; p.vy *= 0.99;
      var sp = Math.hypot(p.vx, p.vy), mxs = CFG.speed * 2.2;
      if (sp > mxs) { p.vx *= mxs / sp; p.vy *= mxs / sp; }
    }
    ctx.lineWidth = 1;
    for (var i = 0; i < ps.length; i++) {
      var a = ps[i], md = Math.hypot(mx - a.x, my - a.y), aN = md < CFG.mouseDist;
      if (aN) {
        ctx.strokeStyle = 'rgba(' + CFG.link + ',' + ((1 - md / CFG.mouseDist) * 0.5) + ')';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mx, my); ctx.stroke();
      }
      for (var j = i + 1; j < ps.length; j++) {
        var b = ps[j], ddx = a.x - b.x, ddy = a.y - b.y, dd = Math.hypot(ddx, ddy);
        if (dd >= CFG.linkDist) continue;
        if (aN && Math.hypot(mx - b.x, my - b.y) < CFG.mouseDist) {
          ctx.strokeStyle = 'rgba(' + CFG.link + ',' + ((1 - dd / CFG.linkDist) * 0.6) + ')';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    for (var m = 0; m < ps.length; m++) {
      var q = ps[m], al = 0.45 + Math.sin(t * 2 + q.ph) * 0.4;
      ctx.shadowBlur = CFG.glow; ctx.shadowColor = 'rgba(' + CFG.dot + ',0.9)';
      ctx.fillStyle = 'rgba(' + CFG.dot + ',' + Math.max(0.1, al) + ')';
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.2832); ctx.fill();
    }
    ctx.shadowBlur = 0;
    // 流星（偶发，暖珊瑚色尾迹）
    if (shoots.length < 4 && Math.random() < 0.014)
      shoots.push({ x: Math.random() * W, y: Math.random() * H * 0.5, vx: 6 + Math.random() * 5, vy: 2.5 + Math.random() * 2, life: 1 });
    for (var s = shoots.length - 1; s >= 0; s--) {
      var sh = shoots[s]; sh.x += sh.vx; sh.y += sh.vy; sh.life -= 0.012;
      var g = ctx.createLinearGradient(sh.x, sh.y, sh.x - sh.vx * 4, sh.y - sh.vy * 4);
      g.addColorStop(0, 'rgba(255,214,150,' + Math.max(0, sh.life) + ')');
      g.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(sh.x - sh.vx * 4, sh.y - sh.vy * 4); ctx.stroke();
      if (sh.life <= 0 || sh.x > W + 60 || sh.y > H + 60) shoots.splice(s, 1);
    }
    ctx.lineWidth = 1;
    requestAnimationFrame(frame);
  }
  window.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; });
  window.addEventListener('pointerleave', function () { mx = -9999; my = -9999; });
  window.addEventListener('resize', init);
  init();
  requestAnimationFrame(frame);
})();
