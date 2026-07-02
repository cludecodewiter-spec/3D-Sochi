# 自包含单文件 HTML 交互 demo v3:
# HMI 触摸屏(PLC 仿真)+ 全部件鼠标拖拽插拔 + 逐步教程(安全门)+ 响应式 UI。
# 用法:在本目录执行 `npm i three@0.147.0`,然后 `python3 build_demo.py`;
# 产物写入 docs/webdemo/(unitC-demo.html 自包含 / unitC-web.html 走 CDN)。
import base64, pathlib, json, sys

HERE = pathlib.Path(__file__).resolve().parent      # tools/webdemo
ROOT = HERE.parent.parent                           # 仓库根
OUT  = ROOT / 'docs' / 'webdemo'                    # 产物目录(与仓库现状一致)

# 防止内嵌文本(JS 库/清单 JSON)出现 </script 提前闭合脚本标签
def safe(s): return s.replace('</script', '<\\/script')

NM = HERE / 'node_modules'
if not (NM / 'three').exists():
    sys.exit('缺少依赖:请先在 tools/webdemo 目录执行 npm i three@0.147.0')

tj  = safe((NM/'three/build/three.min.js').read_text(encoding='utf-8'))
orb = safe((NM/'three/examples/js/controls/OrbitControls.js').read_text(encoding='utf-8'))
gl  = safe((NM/'three/examples/js/loaders/GLTFLoader.js').read_text(encoding='utf-8'))
env = safe((NM/'three/examples/js/environments/RoomEnvironment.js').read_text(encoding='utf-8'))
glb = base64.b64encode((ROOT/'content/unitC/models/unitC.glb').read_bytes()).decode()
manifest_js = json.dumps(json.loads((ROOT/'content/unitC/manifest.json').read_text(encoding='utf-8')), ensure_ascii=False)

APP = r'''
const MANIFEST = __MANIFEST__;
const GLB_B64 = "__GLB__";
let lang = 'zh';
const L = (t) => (t && (t[lang] || t.zh || t.ja)) || '';
const partObjs = {}, origPos = {}, animTarget = {};
// 步骤 targetPart 引用 parts[].id,而 3D 对象按 glTF 节点名(parts[].node)索引;此处建立映射
const nodeOfId = {}; MANIFEST.parts.forEach(p => { nodeOfId[p.id] = p.node; });
const nodeOf = (id) => nodeOfId[id] || id;
let highlighted = null, renderer=null, scene=null, camera=null, controls=null;
let center = new THREE.Vector3(), radius = 2;

/* ================= PLC 仿真(与 Core/Plc/PlcSimulator.cs 同一套逻辑) ================= */
const PLC = {
  valveOpen:false, estop:false, running:false, alarm:false, beacon:false,
  p:0, f:0, runSec:0, clock:0,
  start(){ if(this.estop || !this.valveOpen || this.alarm) return false; this.running=true; return true; },
  stop(){ this.running=false; },
  resetAlarm(){ if(this.estop) return false; this.alarm=false; return true; },
  tick(dt){
    this.clock += dt;
    if(this.estop){ this.alarm=true; this.running=false; }              // 急停:锁存报警并切断运转
    else if(this.running && !this.valveOpen){ this.running=false; this.alarm=true; } // 联锁:运转中阀被关 → 跳报警
    const pT = this.running ? 250 : 0;
    this.p += (pT - this.p) * (1 - Math.exp(-dt/2.5));                  // 一阶惯性:压力缓升缓降
    const fT = (this.valveOpen && this.p > 5) ? 42*Math.min(1, this.p/250) : 0;
    this.f += (fT - this.f) * (1 - Math.exp(-dt/1.2));
    if(this.running) this.runSec += dt;
    this.beacon = this.alarm ? (this.clock%(1/3) < 1/6) : (this.running && this.clock%1 < 0.5);
  }
};

/* ================= HMI 触摸屏 ================= */
const hmiTxt = {
  zh:{run:'启动',stop:'停止',reset:'复位',estop:'急停',valve:'进气阀',open:'开',close:'关',
      p:'压力',f:'流量',lampRun:'运转',lampAlm:'报警',t:'HMI 触摸屏'},
  ja:{run:'起動',stop:'停止',reset:'リセット',estop:'非常停止',valve:'給気バルブ',open:'開',close:'閉',
      p:'圧力',f:'流量',lampRun:'運転',lampAlm:'警報',t:'HMI タッチパネル'}
};
function hmiL(k){ return hmiTxt[lang][k]; }

function buildHmi(){
  const T = hmiL;
  document.getElementById('hmiTitle').textContent = T('t');
  document.getElementById('bRun').textContent = T('run');
  document.getElementById('bStop').textContent = T('stop');
  document.getElementById('bReset').textContent = T('reset');
  document.getElementById('bEstop').textContent = T('estop');
  document.getElementById('lblValve').textContent = T('valve');
  document.getElementById('bValve').textContent = PLC.valveOpen ? T('open') : T('close');
  document.getElementById('lblRun').textContent = T('lampRun');
  document.getElementById('lblAlm').textContent = T('lampAlm');
  document.getElementById('lblP').textContent = T('p');
  document.getElementById('lblF').textContent = T('f');
}
let wheelTarget = 0; // 阀门手轮目标转角
document.getElementById('bRun').onclick   = ()=> PLC.start();
document.getElementById('bStop').onclick  = ()=> PLC.stop();
document.getElementById('bReset').onclick = ()=> PLC.resetAlarm();
document.getElementById('bEstop').onclick = ()=>{
  PLC.estop = !PLC.estop;
  document.getElementById('bEstop').classList.toggle('pressed', PLC.estop);
};
document.getElementById('bValve').onclick = ()=>{
  PLC.valveOpen = !PLC.valveOpen;
  wheelTarget += (PLC.valveOpen ? 1 : -1) * Math.PI * 4;   // 开/关各转两圈
  document.getElementById('bValve').textContent = PLC.valveOpen ? hmiL('open') : hmiL('close');
  document.getElementById('bValve').classList.toggle('on', PLC.valveOpen);
};
function updateHmi(){
  document.getElementById('lampRun').classList.toggle('on', PLC.running);
  document.getElementById('lampAlm').classList.toggle('alm', PLC.alarm && PLC.beacon);
  document.getElementById('pv').textContent = PLC.p.toFixed(0) + ' kPa';
  document.getElementById('fv').textContent = PLC.f.toFixed(1) + ' L/min';
  document.getElementById('pbar').style.width = Math.min(100, PLC.p/300*100) + '%';
  document.getElementById('fbar').style.width = Math.min(100, PLC.f/50*100) + '%';
}

/* ================= 面板内容(不依赖 WebGL) ================= */
const steps = MANIFEST.procedure.steps.slice().sort((a,b)=>a.order-b.order);
let idx = 0, checked = [];

function buildPartList(){
  const box = document.getElementById('parts'); box.innerHTML = '';
  MANIFEST.parts.forEach(p => {
    const row = document.createElement('div'); row.className='part'; row.dataset.node=p.node;
    const eye = document.createElement('input'); eye.type='checkbox'; eye.checked=true;
    eye.onclick = (e)=>{ e.stopPropagation(); if(partObjs[p.node]) partObjs[p.node].visible=eye.checked; };
    const nm = document.createElement('span'); nm.className='pn'; nm.textContent=L(p.name);
    row.appendChild(eye); row.appendChild(nm);
    row.onclick = ()=> setHighlight(p.node);
    box.appendChild(row);
  });
}
function setHighlight(node){
  if(highlighted && partObjs[highlighted]) partObjs[highlighted].traverse(m=>{ if(m.isMesh&&m.material&&m.userData._e!==undefined){ m.material.emissive.setHex(m.userData._e); delete m.userData._e; }});
  highlighted = node;
  if(node && partObjs[node]) partObjs[node].traverse(m=>{ if(m.isMesh&&m.material&&m.material.emissive){ m.userData._e=m.material.emissive.getHex(); m.material.emissive.setHex(0x1e5bb8); }});
  document.querySelectorAll('.part').forEach(el=>el.classList.toggle('sel', el.dataset.node===node));
}
function renderStep(){
  const s = steps[idx];
  document.getElementById('title').textContent = L(MANIFEST.procedure.title);
  document.getElementById('prog').textContent = (lang==='zh'?'步骤 ':'ステップ ')+(idx+1)+'/'+steps.length;
  document.getElementById('instr').textContent = s ? L(s.instruction) : '';
  checked = (s?s.safetyChecks:[]).map(()=>false);
  const sc = document.getElementById('safety'); sc.innerHTML='';
  (s?s.safetyChecks:[]).forEach((chk,i)=>{
    const row=document.createElement('label'); row.className='chk';
    const cb=document.createElement('input'); cb.type='checkbox';
    cb.onchange=()=>{ checked[i]=cb.checked; updateGate(); };
    const tx=document.createElement('span'); tx.textContent=L(chk.text);
    row.appendChild(cb); row.appendChild(tx);
    if(chk.required){ const b=document.createElement('b'); b.className='req'; b.textContent=lang==='zh'?'必填':'必須'; row.appendChild(b); }
    sc.appendChild(row);
  });
  if(s) setHighlight(nodeOf(s.targetPart));
  updateGate();
}
function allReq(){ const s=steps[idx]; return !s || s.safetyChecks.every((c,i)=>!c.required||checked[i]); }
function updateGate(){
  const done = idx>=steps.length, blocked = !done && !allReq();
  document.getElementById('next').disabled = done || blocked;
  const g = document.getElementById('gate');
  // 安全门提示:被拦下时明确告知原因(冻结项:安全确认不可绕过)
  g.textContent = blocked ? (lang==='zh'?'⚠ 请先完成全部必填安全确认':'⚠ 必須の安全確認をすべて完了してください') : '';
  g.style.display = blocked ? 'block' : 'none';
}
function next(){
  const s=steps[idx]; if(!s||!allReq()) return;   // 安全门:必填确认未齐一律拒绝前进
  const tn = nodeOf(s.targetPart);
  if(s.action==='remove'&&s.removeOffset&&origPos[tn]){ const o=origPos[tn]; animTarget[tn]=new THREE.Vector3(o.x+s.removeOffset[0],o.y+s.removeOffset[1],o.z+s.removeOffset[2]); }
  if(idx<steps.length) idx++;
  document.getElementById('done').style.display = idx>=steps.length?'block':'none';
  renderStep();
}
function prev(){ if(idx===0) return; idx--; document.getElementById('done').style.display='none'; const s=steps[idx]; const tn=s?nodeOf(s.targetPart):null; if(tn&&origPos[tn]) animTarget[tn]=origPos[tn].clone(); renderStep(); }
function explodeAll(){ steps.forEach(s=>{ const tn=nodeOf(s.targetPart); if(s.action==='remove'&&s.removeOffset&&origPos[tn]){ const o=origPos[tn]; animTarget[tn]=new THREE.Vector3(o.x+s.removeOffset[0]*1.1,o.y+s.removeOffset[1]*1.1,o.z+s.removeOffset[2]*1.1);} }); }
function reassemble(){ Object.keys(origPos).forEach(n=> animTarget[n]=origPos[n].clone()); }

document.getElementById('next').onclick=next;
document.getElementById('prev').onclick=prev;
document.getElementById('explode').onclick=explodeAll;
document.getElementById('reset').onclick=()=>{ reassemble(); if(camera) resetView(); };
document.getElementById('lang').onclick=()=>{ lang = lang==='zh'?'ja':'zh'; buildPartList(); renderStep(); buildHmi(); document.getElementById('lang').textContent = lang==='zh'?'日本語':'中文'; };

buildPartList(); renderStep(); buildHmi();

/* ================= 3D ================= */
const canvas = document.getElementById('c');
function resetView(){ const dd=radius*2.1; camera.position.set(center.x+dd*0.7,center.y+dd*0.4,center.z+dd*0.95); controls.target.copy(center); controls.update(); }
function b64ToBuf(b){ const s=atob(b),n=s.length,a=new Uint8Array(n); for(let i=0;i<n;i++)a[i]=s.charCodeAt(i); return a.buffer; }

// PLC 驱动的 3D 动画对象(按材质名定位独立子网格)
const anim = { needle:null, flowFloat:null, beacon:null, ledG:null, ledA:null, ledR:null, wheel:null };
let floatBaseY = 0, wheelAngle = 0;

function partOf(o){ let n=o; while(n){ if(partObjs[n.name]) return n.name; n=n.parent; } return null; }

function init3D(){
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x262b33);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const k=new THREE.DirectionalLight(0xffffff,1.9); k.position.set(3,5,4); scene.add(k);
  const f=new THREE.DirectionalLight(0xaecbe0,0.65); f.position.set(-4,1.5,2); scene.add(f);
  const r=new THREE.DirectionalLight(0xbcd0e0,0.65); r.position.set(.5,3,-5); scene.add(r);
  const g=new THREE.GridHelper(10,20,0x424a55,0x333a44); g.position.y=-1.16; scene.add(g);

  new THREE.GLTFLoader().parse(b64ToBuf(GLB_B64), '', (gltf)=>{
    const root = gltf.scene; scene.add(root);
    // 材质按 mesh 克隆:避免共享材质导致「高亮一个、全体变色」
    root.traverse(o => { if (o.isMesh && o.material) o.material = o.material.clone(); });
    MANIFEST.parts.forEach(p=>{ const o=root.getObjectByName(p.node); if(o){ partObjs[p.node]=o; origPos[p.node]=o.position.clone(); animTarget[p.node]=o.position.clone(); }});
    // 定位 PLC 动画子网格(独立材质 → 独立 mesh)
    root.traverse(o=>{
      if(!o.isMesh || !o.material) return;
      const mn = o.material.name || '', pn = partOf(o);
      if(mn==='needle') anim.needle=o;
      else if(mn==='beacon') anim.beacon=o;
      else if(mn==='led_g') anim.ledG=o;
      else if(mn==='led_a') anim.ledA=o;
      else if(mn==='led_r') anim.ledR=o;
      else if(mn==='red_paint' && pn==='flow_meter'){ anim.flowFloat=o; floatBaseY=o.position.y; }
      else if(mn==='red_paint' && pn==='valve') anim.wheel=o;
    });
    if(anim.needle) anim.needle.rotation.z = THREE.MathUtils.degToRad(225); // 0 kPa
    const box=new THREE.Box3().setFromObject(root); box.getCenter(center);
    const sz=box.getSize(new THREE.Vector3()); radius=Math.max(sz.x,sz.y,sz.z);
    resetView(); setHighlight(steps[idx]?nodeOf(steps[idx].targetPart):null);
    document.getElementById('load').style.display='none';
  }, (err)=>{ fail('模型解析失败 / モデル読込失敗'); });

  /* ---- 全部件鼠标/触摸拖拽插拔 ---- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let drag = null;

  function partIdOf(node){ const p = MANIFEST.parts.find(x=>x.node===node); return p ? p.id : node; }
  function partAxis(node){
    const s = steps.find(x => x.targetPart === partIdOf(node) && x.removeOffset);
    if (s){ const v = new THREE.Vector3(...s.removeOffset); return { dir: v.clone().normalize(), len: v.length() }; }
    return { dir: new THREE.Vector3(0,0,1), len: 0.5 };   // 无预设方向 → 默认向前拔
  }
  function lineParam(rayO, rayD, p0, ld){
    // 鼠标射线与插拔轴线的最近点参数(沿轴);rayD/ld 均为单位向量
    const w0 = new THREE.Vector3().subVectors(rayO, p0);
    const b = rayD.dot(ld), dd = rayD.dot(w0), e = ld.dot(w0);
    const den = 1 - b*b; if (Math.abs(den) < 1e-6) return e;   // 射线与轴近似平行 → 退化处理
    return (e - b*dd) / den;
  }
  function setRay(ev){
    const r = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX-r.left)/r.width)*2-1; ndc.y = -((ev.clientY-r.top)/r.height)*2+1;
    ray.setFromCamera(ndc, camera);
  }
  canvas.addEventListener('pointerdown', (ev)=>{
    if(!camera) return; setRay(ev);
    const hits = ray.intersectObjects(Object.values(partObjs), true);
    if(!hits.length) return;
    let node = partOf(hits[0].object);
    if(!node || node==='environment') return;   // 地面不可拔
    const ax = partAxis(node);
    const base = origPos[node];
    const cur = partObjs[node].position.clone().sub(base).dot(ax.dir); // 已拔出量
    drag = { node, dir: ax.dir, len: ax.len, base,
             start: lineParam(ray.ray.origin, ray.ray.direction, base, ax.dir) - cur, moved:false };
    controls.enabled = false;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev)=>{
    if(!drag) return; setRay(ev);
    const t = Math.max(0, Math.min(drag.len*1.3,
      lineParam(ray.ray.origin, ray.ray.direction, drag.base, drag.dir) - drag.start));
    const p = drag.base.clone().addScaledVector(drag.dir, t);
    partObjs[drag.node].position.copy(p);
    animTarget[drag.node] = p.clone();
    drag.moved = true;
  });
  function endDrag(){
    if(!drag) return;
    const node = drag.node;
    const t = partObjs[node].position.clone().sub(drag.base).dot(drag.dir);
    // 吸附:拔出超过 60% → 拔到位;否则弹回装好
    animTarget[node] = t > drag.len*0.6
      ? drag.base.clone().addScaledVector(drag.dir, drag.len)
      : drag.base.clone();
    if(!drag.moved) setHighlight(node);        // 原地点击 = 选中
    drag = null; controls.enabled = true;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);   // 触摸被系统打断时也要恢复相机控制

  /* ---- 渲染循环:PLC 扫描 + 插拔动画 + 3D 运转 ---- */
  let last = performance.now();
  (function tick(){
    requestAnimationFrame(tick);
    const now = performance.now(), dt = Math.min(0.1, (now-last)/1000); last = now;

    PLC.tick(dt); updateHmi();

    for(const n in animTarget){ const o=partObjs[n]; if(o && (!drag || drag.node!==n)) o.position.lerp(animTarget[n], 0.15); }

    // PLC → 3D:表针 / 浮子 / 信号灯 / LED / 手轮
    if(anim.needle) anim.needle.rotation.z = THREE.MathUtils.degToRad(225 - 270 * Math.min(1, PLC.p/300));
    if(anim.flowFloat){
      const fn = Math.min(1, PLC.f/42);
      anim.flowFloat.position.y = floatBaseY + fn*0.15 + Math.sin(now/180)*0.008*fn;
    }
    if(anim.beacon) anim.beacon.material.emissiveIntensity = PLC.beacon ? 2.5 : 0.12;
    if(anim.ledG) anim.ledG.material.emissiveIntensity = PLC.running ? 2.2 : 0.15;
    if(anim.ledA) anim.ledA.material.emissiveIntensity = (!PLC.running && !PLC.alarm && PLC.valveOpen) ? 1.8 : 0.15;
    if(anim.ledR) anim.ledR.material.emissiveIntensity = (PLC.alarm && PLC.beacon) ? 2.5 : 0.15;
    if(anim.wheel){ wheelAngle += (wheelTarget - wheelAngle) * Math.min(1, dt*3); anim.wheel.rotation.z = wheelAngle; }

    const w=canvas.clientWidth, h=canvas.clientHeight;
    if(w&&h&&(canvas.width!==w||canvas.height!==h)){ renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
    controls.update(); renderer.render(scene, camera);
  })();
}
function fail(msg){
  const el=document.getElementById('load');
  // 错误文本用 textContent 注入,防止异常消息中的标记被当 HTML 解析
  el.innerHTML='<div style="padding:20px;color:#B0BEC5;text-align:center">⚠ <span id="failMsg"></span><br><span style="font-size:12px">此预览环境可能禁用了脚本/WebGL。请下载后用浏览器打开。</span></div>';
  document.getElementById('failMsg').textContent = msg;
  el.style.display='flex';
}
try { init3D(); } catch(e){ fail('3D 初始化失败:'+e.message); }
window.__demo = { PLC, partObjs, origPos, animTarget, get cam(){ return camera; } };   // 自动化验证钩子
'''
# 注入清单与模型后统一转义,防止清单文本中的 </script 提前闭合脚本
APP = safe(APP.replace('__MANIFEST__', manifest_js).replace('__GLB__', glb))

STYLE = '''
*{margin:0;box-sizing:border-box;font-family:'Segoe UI','Microsoft YaHei','Hiragino Sans','Meiryo',sans-serif;-webkit-tap-highlight-color:transparent}
html,body{height:100%} body{display:flex;flex-direction:column;background:#0f141a;overflow:hidden}
.top{background:linear-gradient(90deg,#1E2A38,#28394d);color:#fff;padding:10px 16px;display:flex;align-items:center;gap:10px;flex:none}
.top h1{font-size:15px;font-weight:700;line-height:1.25}
.top .hint{font-size:12px;color:#9FB3C8;margin-left:6px}
.top button{margin-left:auto;padding:8px 14px;border:0;border-radius:6px;background:#3d5570;color:#fff;font-size:13px;cursor:pointer}
.main{flex:1;display:flex;min-height:0}
.stage{position:relative;flex:1;min-width:0;background:#262b33}
#c{display:block;width:100%;height:100%;touch-action:none}
#load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#90A4AE;font-size:14px;background:#262b33}
.side{width:352px;flex:none;background:#f4f6f8;border-left:1px solid #d9dee3;display:flex;flex-direction:column;overflow:auto}
.sec{padding:12px 14px;border-bottom:1px solid #e7ebef}
.h{font-size:13px;font-weight:700;color:#263238;margin-bottom:8px;border-left:3px solid #1976D2;padding-left:8px}
/* ---- HMI 触摸屏 ---- */
.hmi{background:#10151c;border-radius:10px;padding:12px;border:2px solid #2c3947;box-shadow:inset 0 0 24px rgba(0,0,0,.55)}
.hmi .ht{color:#6fe3ff;font-size:12px;letter-spacing:2px;margin-bottom:9px;text-align:center}
.hmi .row{display:flex;gap:8px;margin-bottom:9px;align-items:center}
.hmi button{flex:1;padding:10px 4px;border:0;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;color:#fff}
#bRun{background:#1d8a44} #bStop{background:#8a2c25} #bReset{background:#3d5570}
#bEstop{background:#c62828;border-radius:50%;width:58px;height:58px;flex:none;border:4px solid #ffd54f;font-size:11px;line-height:1.1}
#bEstop.pressed{background:#7b1414;box-shadow:inset 0 0 12px #000}
.vrow{color:#9fb3c8;font-size:13px}
#bValve{flex:none;width:72px;background:#37475a}
#bValve.on{background:#1d8a44}
.lamp{display:flex;align-items:center;gap:6px;color:#9fb3c8;font-size:12px}
.lamp i{width:14px;height:14px;border-radius:50%;background:#233041;border:1px solid #3a4a5e}
#lampRun.on i{background:#31e06c;box-shadow:0 0 10px #31e06c}
#lampAlm.alm i{background:#ff4438;box-shadow:0 0 12px #ff4438}
.meter{margin-bottom:7px}
.meter .ml{display:flex;justify-content:space-between;color:#9fb3c8;font-size:12px;margin-bottom:3px}
.meter .mv{color:#6fe3ff;font-variant-numeric:tabular-nums}
.bar{height:8px;background:#1a222d;border-radius:4px;overflow:hidden}
.bar i{display:block;height:100%;width:0%;background:linear-gradient(90deg,#1976D2,#6fe3ff);transition:width .2s}
/* ---- 其余面板 ---- */
.part{display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:6px;cursor:pointer;font-size:13.5px;color:#37474F}
.part:active,.part:hover{background:#e9eef3} .part.sel{background:#E3F2FD;font-weight:600}
.part input{width:17px;height:17px} .part .pn{flex:1}
#instr{background:#FFF8E1;border:1px solid #FFE082;border-radius:6px;padding:10px;font-size:13.5px;color:#5D4037;margin-bottom:8px;min-height:42px}
.chk{display:flex;align-items:center;gap:9px;padding:8px 0;font-size:13px;color:#333;border-bottom:1px solid #eee}
.chk input{width:19px;height:19px;flex:none} .chk .req{margin-left:auto;background:#D32F2F;color:#fff;font-size:11px;border-radius:4px;padding:2px 7px}
#gate{color:#C62828;font-size:12px;margin-top:8px} #done{display:none;color:#2E7D32;font-weight:700;margin-top:8px}
.btns{display:flex;gap:8px;margin-top:10px}
.btns button{flex:1;padding:11px;border:1px solid #B0BEC5;background:#fff;border-radius:8px;cursor:pointer;font-size:13.5px}
.btns button#next{background:#1976D2;color:#fff;border:0;font-weight:700}
.btns button#next:disabled{background:#B0BEC5}
.tools button{background:#eef1f4}
.prog{font-size:12px;color:#607D8B;margin-bottom:6px}
.disc{background:#B71C1C;color:#fff;text-align:center;font-size:12px;padding:7px;font-weight:600;flex:none}
@media (max-width:760px){
  .main{flex-direction:column}
  .stage{flex:none;height:42vh}
  .side{width:100%;flex:1;border-left:0;border-top:1px solid #d9dee3}
  .top .hint{display:none}
}
'''

html = f'''<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>除害装置 3D 交互演示 · unit-C</title>
<style>{STYLE}</style></head><body>
<div class="top">
  <h1>除害装置 3D 维护训练 · 交互演示</h1>
  <span class="hint">🖱 旋转 · 缩放 · 平移 · 拖拽部件=插拔 · 点击=高亮</span>
  <button id="lang">日本語</button>
</div>
<div class="main">
  <div class="stage"><canvas id="c"></canvas><div id="load">载入中… / 読み込み中…</div></div>
  <div class="side">
    <div class="sec">
      <div class="hmi">
        <div class="ht" id="hmiTitle">HMI 触摸屏</div>
        <div class="row">
          <button id="bRun">启动</button><button id="bStop">停止</button><button id="bReset">复位</button>
          <button id="bEstop">急停</button>
        </div>
        <div class="row vrow"><span id="lblValve">进气阀</span><button id="bValve">关</button>
          <span style="flex:1"></span>
          <span class="lamp" id="lampRun"><i></i><span id="lblRun">运转</span></span>
          <span class="lamp" id="lampAlm"><i></i><span id="lblAlm">报警</span></span>
        </div>
        <div class="meter"><div class="ml"><span id="lblP">压力</span><span class="mv" id="pv">0 kPa</span></div><div class="bar"><i id="pbar"></i></div></div>
        <div class="meter"><div class="ml"><span id="lblF">流量</span><span class="mv" id="fv">0.0 L/min</span></div><div class="bar"><i id="fbar"></i></div></div>
      </div>
    </div>
    <div class="sec"><div class="h">操作 / 操作</div>
      <div class="btns tools"><button id="explode">分解视图</button><button id="reset">复位模型</button></div></div>
    <div class="sec"><div class="h">部件 / 部品(可拖拽插拔)</div><div id="parts"></div></div>
    <div class="sec"><div class="h" id="title">流程</div>
      <div class="prog" id="prog"></div><div id="instr"></div><div id="safety"></div>
      <div id="gate"></div><div id="done">✓ 全部完成 / 完了</div>
      <div class="btns"><button id="prev">上一步</button><button id="next">下一步 ▶</button></div></div>
  </div>
</div>
<div class="disc">⚠ 训练辅助,实际作业以官方程序为准 / 訓練補助。実際の作業は公式手順に従ってください。</div>
<script>{tj}</script><script>{orb}</script><script>{gl}</script><script>{env}</script><script>{APP}</script>
</body></html>'''

OUT.mkdir(parents=True, exist_ok=True)
(OUT/'unitC-demo.html').write_text(html, encoding='utf-8')
print(OUT/'unitC-demo.html', round(len(html)/1024), 'KB')

cdn = ('<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js"></script>'
       '<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js"></script>'
       '<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js"></script>'
       '<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/environments/RoomEnvironment.js"></script>')
web = html.replace(f'<script>{tj}</script><script>{orb}</script><script>{gl}</script><script>{env}</script>', cdn)
(OUT/'unitC-web.html').write_text(web, encoding='utf-8')
print(OUT/'unitC-web.html', round(len(web)/1024), 'KB')
