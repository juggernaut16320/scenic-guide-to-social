/* atlas.js —— 景点星图：力导向 Canvas，节点为景点照片瓦片，点击景点→生成台 */
(function(){
"use strict";

/* 数据由 atlas.html 内联注入 window.GRAPH_DATA（来自后端真实城市→景点） */
const RAW = window.GRAPH_DATA || {nodes:[],edges:[]};

/* 类别 → 图标 / 颜色 / 渐变（照片瓦片风） */
const CAT_STYLE = {
  "古建筑类": {emoji:"🏯", color:"#ff7a59", g:["#ffab6b","#e8604f"]},
  "自然山水类": {emoji:"🏔️", color:"#57e0c4", g:["#7bd8c6","#3a9d8b"]},
  "历史遗迹类": {emoji:"🏛️", color:"#ffbf6b", g:["#f6c56b","#c98a3a"]},
  "古镇街区类": {emoji:"🏘️", color:"#5fa8ff", g:["#8fb8ff","#5a7de0"]},
  "宗教建筑类": {emoji:"🛕", color:"#b892e0", g:["#b8a0e0","#7d5fc0"]},
};
const DEFAULT_CAT = {emoji:"📍", color:"#9fb0ad", g:["#9fb0ad","#5f6f6c"]};
const CITY_COLOR = "#ffbf6b", CENTER_COLOR = "#fff0d6";
const catStyle = c => CAT_STYLE[c] || DEFAULT_CAT;
const nodeColor = n => n.type==="center"?CENTER_COLOR : n.type==="city"?CITY_COLOR : catStyle(n.cat).color;

/* ── 画布与状态 ── */
const canvas = document.getElementById("graph"), ctx = canvas.getContext("2d");
let W=0, H=0, DPR=Math.min(window.devicePixelRatio||1, 2);

const rOf = n => n.type==="center" ? 22 : n.type==="city" ? 13+n.w*4 : 14+n.w*5;
const nodes = RAW.nodes.map(n => ({...n, x:0, y:0, vx:0, vy:0, r:rOf(n)}));
const byId = Object.fromEntries(nodes.map(n=>[n.id,n]));
const edges = RAW.edges.map(([a,b])=>({a:byId[a], b:byId[b]})).filter(e=>e.a&&e.b);
const neighbors = {}; nodes.forEach(n=>neighbors[n.id]=new Set());
edges.forEach(e=>{neighbors[e.a.id].add(e.b.id); neighbors[e.b.id].add(e.a.id);});

const view = {x:0, y:0, scale:1};
const hiddenCats = new Set();               // 隐藏的类别（图例过滤，仅作用于景点）
let hoverNode=null, selectedNode=null, dragNode=null, dragMoved=false;
let panning=false, panStart=null, searchTerm="", physicsOn=true;
let bootTime=performance.now(), seeded=false;

/* 相机：点击节点→跟随居中；退出→补间回「中国景点」中心 */
let camFollow=null;   // {node, t0, dur}
let camTween=null;    // {x0,y0,s0,tx,ty,ts,t0,dur}
const PANEL_W=380;
const panelSpace=()=> W<=860 ? 0 : PANEL_W;
function focusNode(n){ camTween=null; camFollow={node:n, t0:performance.now(), dur:750}; }
function animateView(tx,ty,ts){ camFollow=null; camTween={x0:view.x,y0:view.y,s0:view.scale,tx,ty,ts,t0:performance.now(),dur:650}; }
function stopCamera(){ camFollow=null; camTween=null; }
function updateCamera(now){
  if(camTween){
    const p=Math.min((now-camTween.t0)/camTween.dur,1), e=1-Math.pow(1-p,3);
    view.x=camTween.x0+(camTween.tx-camTween.x0)*e;
    view.y=camTween.y0+(camTween.ty-camTween.y0)*e;
    view.scale=camTween.s0+(camTween.ts-camTween.s0)*e;
    if(p>=1) camTween=null;
  } else if(camFollow){
    const n=camFollow.node, dX=(W-panelSpace())/2, dY=H/2;
    const txv=dX-(n.x-W/2)*view.scale-W/2, tyv=dY-(n.y-H/2)*view.scale-H/2;
    view.x+=(txv-view.x)*.14; view.y+=(tyv-view.y)*.14;
    if(now-camFollow.t0>camFollow.dur) camFollow=null;
  }
}

function catOf(n){ return n.type==="spot" ? n.cat : n.type; }
function visible(n){ return n.type!=="spot" || !hiddenCats.has(n.cat); }

function resize(){
  W=window.innerWidth; H=window.innerHeight;
  canvas.width=W*DPR; canvas.height=H*DPR;
  canvas.style.width=W+"px"; canvas.style.height=H+"px";
  if(!seeded){ seed(); seeded=true; }
}
function seed(){
  const cx=W/2, cy=H/2;
  const cities = nodes.filter(n=>n.type==="city");
  nodes.forEach(n=>{
    if(n.type==="center"){ n.x=cx; n.y=cy; return; }
    if(n.type==="city"){
      const i=cities.indexOf(n), a=i/cities.length*Math.PI*2;
      n.x=cx+Math.cos(a)*260; n.y=cy+Math.sin(a)*220;
      return;
    }
    // 景点撒在其城市附近
    const city = byId[[...neighbors[n.id]][0]];
    const a=Math.random()*Math.PI*2, d=70+Math.random()*40;
    n.x=(city?city.x:cx)+Math.cos(a)*d; n.y=(city?city.y:cy)+Math.sin(a)*d;
  });
}
window.addEventListener("resize", ()=>{ seeded=false; resize(); });

/* ── 力导向 ── */
function simulate(){
  if(!physicsOn) return;
  const cx=W/2, cy=H/2, vis=nodes.filter(visible);
  for(let i=0;i<vis.length;i++) for(let j=i+1;j<vis.length;j++){
    const a=vis[i], b=vis[j];
    let dx=b.x-a.x, dy=b.y-a.y, d2=dx*dx+dy*dy;
    if(d2<1){d2=1;dx=.5;dy=.5;}
    const d=Math.sqrt(d2), f=5000*(a.w+b.w)*.5/d2, fx=dx/d*f, fy=dy/d*f;
    a.vx-=fx; a.vy-=fy; b.vx+=fx; b.vy+=fy;
  }
  edges.forEach(e=>{
    if(!visible(e.a)||!visible(e.b)) return;
    const dx=e.b.x-e.a.x, dy=e.b.y-e.a.y, d=Math.max(Math.hypot(dx,dy),1);
    const ideal = e.a.type==="center"||e.b.type==="center" ? 230 : 84+(e.a.r+e.b.r)*1.4;
    const f=(d-ideal)*.014, fx=dx/d*f, fy=dy/d*f;
    e.a.vx+=fx; e.a.vy+=fy; e.b.vx-=fx; e.b.vy-=fy;
  });
  const center = byId["center"];
  vis.forEach(n=>{
    if(n.type==="center"){ n.vx+=(cx-n.x)*.05; n.vy+=(cy-n.y)*.05; return; }
    n.vx+=(cx-n.x)*.0026; n.vy+=(cy-n.y)*.0026;
  });
  vis.forEach(n=>{
    if(n===dragNode){ n.vx=0; n.vy=0; return; }
    n.vx*=.86; n.vy*=.86;
    const sp=Math.hypot(n.vx,n.vy);
    if(sp>14){ n.vx*=14/sp; n.vy*=14/sp; }
    n.x+=n.vx; n.y+=n.vy;
  });
}

/* ── 坐标变换 ── */
const w2s=(x,y)=>[(x-W/2)*view.scale+W/2+view.x,(y-H/2)*view.scale+H/2+view.y];
const s2w=(x,y)=>[(x-W/2-view.x)/view.scale+W/2,(y-H/2-view.y)/view.scale+H/2];

function nodeAlpha(n){
  const f=hoverNode||selectedNode; let a=1;
  if(f) a=(n===f||neighbors[f.id].has(n.id))?1:.12;
  if(searchTerm){
    const hit=n.name.toLowerCase().includes(searchTerm);
    a=Math.min(a, hit?1:.07);
  }
  return a;
}
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}

/* ── 渲染 ── */
function draw(now){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,W,H);
  const boot=Math.min((now-bootTime)/1500,1), ease=1-Math.pow(1-boot,3);
  const focus=hoverNode||selectedNode, t=now*.001;

  // 边
  edges.forEach(e=>{
    if(!visible(e.a)||!visible(e.b)) return;
    let alpha=Math.min(nodeAlpha(e.a),nodeAlpha(e.b))*.5*ease;
    const lit=focus&&(e.a===focus||e.b===focus); if(lit) alpha=.95;
    const[x1,y1]=w2s(e.a.x,e.a.y),[x2,y2]=w2s(e.b.x,e.b.y);
    const mx=(x1+x2)/2+(y2-y1)*.06, my=(y1+y2)/2-(x2-x1)*.06;
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo(mx,my,x2,y2);
    if(lit){
      const g=ctx.createLinearGradient(x1,y1,x2,y2);
      g.addColorStop(0,nodeColor(e.a)); g.addColorStop(1,nodeColor(e.b));
      ctx.strokeStyle=g; ctx.lineWidth=1.5; ctx.globalAlpha=alpha;
    } else {
      ctx.strokeStyle="rgba(87,224,196,1)"; ctx.lineWidth=.6; ctx.globalAlpha=alpha*.4;
    }
    ctx.stroke(); ctx.globalAlpha=1;
    if(lit){
      const p=(t*.45+(e.a.x+e.b.y)*.001)%1, q=1-p;
      const px=q*q*x1+2*q*p*mx+p*p*x2, py=q*q*y1+2*q*p*my+p*p*y2;
      ctx.beginPath(); ctx.arc(px,py,2,0,7); ctx.fillStyle="#fff6ea"; ctx.globalAlpha=.9; ctx.fill(); ctx.globalAlpha=1;
    }
  });

  // 节点
  nodes.forEach(n=>{
    if(!visible(n)) return;
    const alpha=nodeAlpha(n)*ease, [sx,sy]=w2s(n.x,n.y), color=nodeColor(n);
    const r=n.r*view.scale, isF=n===focus, breathe=1+Math.sin(t*1.5+n.x*.01)*.06;

    // 光晕
    const glowR=r*(isF?2.6:1.9)*breathe;
    const gg=ctx.createRadialGradient(sx,sy,r*.3,sx,sy,glowR);
    gg.addColorStop(0,color); gg.addColorStop(1,"transparent");
    ctx.globalAlpha=alpha*(isF?.5:.24);
    ctx.beginPath(); ctx.arc(sx,sy,glowR,0,7); ctx.fillStyle=gg; ctx.fill();
    ctx.globalAlpha=alpha;

    if(n.type==="spot"){
      // 照片瓦片
      const st=catStyle(n.cat), s=r*1.7, x=sx-s/2, y=sy-s/2, rad=s*.26;
      const grad=ctx.createLinearGradient(x,y,x+s,y+s);
      grad.addColorStop(0,st.g[0]); grad.addColorStop(1,st.g[1]);
      ctx.save(); rr(ctx,x,y,s,s,rad);
      if(isF||n===selectedNode){ ctx.shadowColor=color; ctx.shadowBlur=18; }
      ctx.fillStyle=grad; ctx.fill(); ctx.shadowBlur=0;
      ctx.lineWidth=1.4; ctx.strokeStyle="rgba(255,255,255,"+(.28*alpha)+")"; ctx.stroke(); ctx.clip();
      ctx.globalAlpha=alpha; ctx.font=(s*.6)+"px serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText(st.emoji, sx, sy+s*.04); ctx.restore();
      if(n===selectedNode){ rr(ctx,x-4,y-4,s+8,s+8,rad+3); ctx.strokeStyle=color; ctx.lineWidth=1.2;
        ctx.setLineDash([3,5]); ctx.lineDashOffset=-t*14; ctx.stroke(); ctx.setLineDash([]); }
    } else {
      // 城市 / 中心：发光圆核 + emoji
      ctx.beginPath(); ctx.arc(sx,sy,r*.9,0,7); ctx.fillStyle=color;
      if(isF){ ctx.shadowColor=color; ctx.shadowBlur=16; } ctx.fill(); ctx.shadowBlur=0;
      ctx.font=(r*1.05)+"px serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText(n.emoji, sx, sy);
      if(n===selectedNode){ ctx.beginPath(); ctx.arc(sx,sy,r+7,0,7); ctx.strokeStyle=color; ctx.lineWidth=1.2;
        ctx.setLineDash([3,5]); ctx.lineDashOffset=-t*14; ctx.stroke(); ctx.setLineDash([]); }
    }

    // 标签
    const show = n.type!=="spot" || isF || (focus&&neighbors[focus.id].has(n.id)) || view.scale>1.4 || searchTerm;
    if(show && alpha>.28){
      const fs=Math.max(11, (n.type==="city"?15:12) * Math.min(view.scale,1.3));
      ctx.font=(n.type!=="spot"?"700 ":"")+fs+'px "Noto Serif SC",serif';
      ctx.textAlign="center"; ctx.textBaseline="alphabetic";
      ctx.globalAlpha=alpha*.95; ctx.fillStyle=isF?"#fff3e0":"#dfeae7";
      ctx.shadowColor="rgba(7,15,18,.95)"; ctx.shadowBlur=6;
      const off = n.type==="spot" ? n.r*view.scale*.9+fs+5 : r+fs+5;
      ctx.fillText(n.name, sx, sy+off); ctx.shadowBlur=0;
    }
    ctx.globalAlpha=1;
  });
}
function loop(now){ simulate(); updateCamera(now); draw(now); requestAnimationFrame(loop); }
resize(); requestAnimationFrame(loop);

/* ── 拾取 / 交互 ── */
function pick(mx,my){
  const[wx,wy]=s2w(mx,my); let best=null, bd=1e9;
  nodes.forEach(n=>{ if(!visible(n)) return;
    const d=Math.hypot(n.x-wx,n.y-wy);
    if(d<n.r*1.2+8 && d<bd){ best=n; bd=d; } });
  return best;
}
const tip=document.getElementById("tip");
canvas.addEventListener("mousemove", e=>{
  const mx=e.clientX, my=e.clientY;
  if(dragNode){ const[wx,wy]=s2w(mx,my); dragNode.x=wx; dragNode.y=wy; dragMoved=true; return; }
  if(panning){ view.x+=mx-panStart[0]; view.y+=my-panStart[1]; panStart=[mx,my]; return; }
  hoverNode=pick(mx,my); canvas.style.cursor=hoverNode?"pointer":"crosshair";
  if(hoverNode){
    const sub = hoverNode.type==="spot" ? hoverNode.cat : hoverNode.type==="city" ? "城市 · "+neighbors[hoverNode.id].size+"景点" : "";
    tip.innerHTML=hoverNode.name+(sub?'<em>'+sub+'</em>':'');
    tip.style.left=Math.min(mx+16,W-210)+"px"; tip.style.top=(my-8)+"px"; tip.classList.add("show");
  } else tip.classList.remove("show");
});
canvas.addEventListener("mousedown", e=>{
  stopCamera();                    // 用户接管：停止相机动画
  const n=pick(e.clientX,e.clientY);
  if(n){ dragNode=n; dragMoved=false; } else { panning=true; panStart=[e.clientX,e.clientY]; }
});
window.addEventListener("mouseup", ()=>{
  if(dragNode){ if(!dragMoved) openPanel(dragNode); dragNode=null; }
  panning=false;
});
canvas.addEventListener("wheel", e=>{
  e.preventDefault();
  stopCamera();                    // 手动缩放时停止相机动画
  const f=e.deltaY<0?1.12:1/1.12, ns=Math.min(Math.max(view.scale*f,.4),3.2);
  const mx=e.clientX-W/2, my=e.clientY-H/2;
  view.x=mx-(mx-view.x)*(ns/view.scale); view.y=my-(my-view.y)*(ns/view.scale); view.scale=ns;
}, {passive:false});
canvas.addEventListener("dblclick", closePanel);

/* ── 详情面板 ── */
const panel=document.getElementById("panel");
function studioURL(name){ return "/studio?spot="+encodeURIComponent(name); }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function openPanel(n){
  selectedNode=n;
  const th=document.getElementById("pThumb");
  const c=nodeColor(n);
  if(n.type==="spot"){ const st=catStyle(n.cat); th.style.background="linear-gradient(135deg,"+st.g[0]+","+st.g[1]+")"; th.textContent=st.emoji; }
  else{ th.style.background="linear-gradient(135deg,"+c+",rgba(0,0,0,.28))"; th.textContent=n.emoji; }
  const catEl=document.getElementById("pCat");
  const dot=document.getElementById("pDot");
  dot.style.background=c; dot.style.color=c;
  const body=document.getElementById("pBody");
  if(n.type==="spot"){
    catEl.querySelector("#pCatText").textContent=n.cat;
    document.getElementById("pName").textContent=n.name;
    body.innerHTML='<div class="pdesc">这是一处「'+esc(n.cat)+'」景点。点击下方按钮，让 AI 把它的讲解词一键转成小红书 / 抖音 / 朋友圈文案。</div>'
      +'<div class="p-rule"></div>'
      +'<a class="cta-gen" href="'+studioURL(n.name)+'">✦ 用它生成社交文案 →</a>'
      +'<div class="cta-hint">将跳转到生成台并自动带入「'+esc(n.name)+'」</div>';
  } else if(n.type==="city"){
    catEl.querySelector("#pCatText").textContent="城市";
    document.getElementById("pName").textContent=n.name;
    const spots=[...neighbors[n.id]].map(id=>byId[id]).filter(m=>m.type==="spot");
    let links='<div class="p-links-title">该城市景点 · '+spots.length+'</div>';
    spots.forEach(m=>{ const st=catStyle(m.cat);
      links+='<div class="p-link" data-go="'+studioURL(m.name)+'"><span class="li-emo">'+st.emoji+'</span><span class="li-nm">'+esc(m.name)+'</span><span class="li-go">生成 →</span></div>'; });
    body.innerHTML='<div class="pdesc">从这座城市的星座里挑一个景点，点它直接去生成台。</div>'+links;
    body.querySelectorAll(".p-link").forEach(el=>el.addEventListener("click",()=>{ window.location.href=el.dataset.go; }));
  } else {
    catEl.querySelector("#pCatText").textContent="星图中心";
    document.getElementById("pName").textContent=n.name;
    body.innerHTML='<div class="pdesc">这是整张星图的引力中心。拖动城市与景点，或直接点任意景点开始创作。</div>';
  }
  panel.classList.add("open");
  focusNode(n);                    // 点击的节点平滑移到视图中心
}
function closePanel(){ panel.classList.remove("open"); selectedNode=null; animateView(0,0,1); } // 退出→回归「中国景点」中心
document.getElementById("pclose").addEventListener("click", closePanel);

/* ── 图例（按类别过滤景点）── */
const legendItems=document.getElementById("legendItems");
Object.entries(CAT_STYLE).forEach(([cat,st])=>{
  const cnt=nodes.filter(n=>n.type==="spot"&&n.cat===cat).length;
  if(cnt===0) return;
  const d=document.createElement("div"); d.className="li";
  d.innerHTML='<span class="d" style="background:'+st.color+';color:'+st.color+'"></span><span class="nm">'+cat.replace("类","")+'</span><span class="ct">· '+cnt+'</span>';
  d.addEventListener("click", ()=>{
    hiddenCats.has(cat)?hiddenCats.delete(cat):hiddenCats.add(cat);
    d.classList.toggle("off");
    if(selectedNode&&selectedNode.type==="spot"&&hiddenCats.has(selectedNode.cat)) closePanel();
    if(hoverNode&&hoverNode.type==="spot"&&hiddenCats.has(hoverNode.cat)) hoverNode=null;
  });
  legendItems.appendChild(d);
});

/* ── 搜索 ── */
const searchInput=document.getElementById("search");
if(searchInput) searchInput.addEventListener("input", e=>{ searchTerm=e.target.value.trim().toLowerCase(); });

/* ── 工具按钮 ── */
document.getElementById("btnReset").addEventListener("click", ()=>{ animateView(0,0,1); }); // 复位→回归「中国景点」中心
const bp=document.getElementById("btnPause");
bp.addEventListener("click", ()=>{ physicsOn=!physicsOn; bp.textContent=physicsOn?"静止":"流动"; });

/* ── 统计 ── */
document.getElementById("statN").textContent=nodes.filter(n=>n.type==="spot").length;
document.getElementById("statE").textContent=nodes.filter(n=>n.type==="city").length;
})();
