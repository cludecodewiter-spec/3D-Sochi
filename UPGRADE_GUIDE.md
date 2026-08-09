# UPGRADE_GUIDE.md — UI 与游戏功能升级指南

> 配套文档：`CLAUDE.md` 是**项目宪法**（规范、数据结构、路线），
> 本文件是**操作手册**（具体怎么改代码）。
> 放仓库根目录，与 CLAUDE.md 并列。

---

# 0. 先读这段

## 0.1 当前产物

```
UI原型v6_图标与七城.html      ← 主界面（地图/地点/资产/帮派/七城）
UI原型v3_战斗窗口.html         ← 犯罪执行窗口（回合制 + 增援 + 领袖加成）
assets/                        ← 49 张已人工核验的照片
icons/                         ← 28 个 88px 圆形图标（照片处理版）
```

**两个原型尚未合并。** 第一个升级任务就是把它们接起来（见 §3.1）。

## 0.2 单文件原型 → 工程结构的迁移时机

```
现在：单 HTML + 内嵌 base64（1.2 MB）
  优点：双击即开、无需构建
  缺点：素材一多就爆炸、无法版本控制素材

触发迁移的信号（任一出现即迁移）：
  · HTML 超过 2 MB
  · 素材超过 100 张
  · 需要多人协作
  · 开始写存档系统
```

迁移方案见 §6。

---

# 1. UI 升级：还缺什么

对照原作截图，当前原型**尚未实现**的界面：

| 界面 | 优先级 | 原作参考 | 说明 |
|---|---|---|---|
| **角色属性面板** | **P0** | 截图1 | 8 属性 + `39+15` 基础/装备分离显示 |
| **Item Info（选中道具）** | **P0** | 截图2 | 左栏切换为道具详情 + Sell 按钮 |
| **Disguise 弹窗** | **P0** | 截图3 | 面部 0..40 / 发型 $300 / 瞳色 $200 |
| **购买确认弹窗** | P1 | 截图4 | 「选择归属：车/队友A/队友B」+ 标价≠成交价 |
| **Vehicle Info + Steal/Hijack** | **P0** | 截图9 | Condition / Locksmithing Def / Electronic Def |
| **死亡结算页** | P1 | 截图9 | Name / Profession / Difficulty / Cash / Days |
| **职业选择开局** | P1 | 截图9 | Profession: Actor → 决定初始属性 |
| **任务对话嵌套弹窗** | P2 | 截图6 | Talk → NPC 说一句话 → OK |

---

## 1.1 加角色属性面板

**位置**：左栏，与 Object Info 互斥切换（点右栏队友头像时切过去）。

```js
const STATS = [
  {k:'Health',       v:100, max:100, cls:'hp'},
  {k:'Disguise',     v:35,  max:100, cls:'dg', txt:'35..100'},  // 区间显示
  {k:'Acting',       v:44,  max:100},
  {k:'Shooting',     v:22,  max:100},
  {k:'Hiding',       v:30,  max:100},
  {k:'Driving',      v:37,  max:100},
  {k:'Locksmithing', v:39,  max:100, bonus:15},   // ★ 装备加成分离
  {k:'Electronics',  v:39,  max:100},
];

function renderStats(el){
  el.innerHTML = STATS.map(s=>{
    const val = s.txt || (s.v + (s.bonus ? `<span class="bonus">+${s.bonus}</span>` : ''));
    const w = Math.min(100, (s.v + (s.bonus||0)) / s.max * 100);
    return `<div class="st ${s.cls||''}">
      <span class="n">${s.k}</span>
      <span class="bwrap"><i style="width:${w}%"></i></span>
      <span class="v">${val}</span><span class="q">?</span></div>`;
  }).join('');
}
```

**必须遵守**：
- `Locksmithing 39+15` 的 `+15` 用绿色，**不能合并成 54**（原作就是分开的，玩家要知道多少来自装备）
- `Disguise` 显示成 `35..100` 区间，不是单值
- 每行末尾有 `?` 按钮

CSS 补充：
```css
.st{display:flex;align-items:center;gap:4px;margin-bottom:1px}
.st .n{width:74px;font-size:11px}
.st .v{width:52px;text-align:right;font-size:11px;font-weight:bold}
.st .bwrap{flex:1;height:6px;background:#EFE0C4;border:1px solid var(--dk)}
.st .bwrap i{display:block;height:100%;background:#E8A33D}
.st.hp .bwrap i{background:#4CAF50}      /* 生命绿 */
.st.dg .bwrap i{background:#7BB0E0}      /* 伪装蓝 */
.st .bonus{color:var(--grn)}
```

---

## 1.2 加 Vehicle Info（含 Steal / Hijack / Tow）

选中带车的地点或车库里的车时，左栏切换：

```js
function renderVehicle(v){
  return `
  <div style="position:relative">
    <img class="infoimg" src="${IMG['cars/'+v.model]}">
    <span style="position:absolute;right:6px;top:4px;font-weight:bold;font-size:13px">$${f(v.price)}</span>
  </div>
  <div class="desc">${v.name}, ${v.body}, ${v.seats} seats, ${v.engine}.</div>
  ${bar('Condition',            v.cond,  '#4CAF50')}
  ${bar('Locksmithing Defense', v.lockDef, '#E8A33D')}
  ${bar('Electronic Defense',   v.elecDef, '#E8A33D')}
  ${bar('Disguise',             v.disguise,'#7BB0E0')}
  <div class="acts">
    <div class="btn" onclick="startTheft('steal','${v.id}')">Steal</div>
    <div class="btn" onclick="startTheft('hijack','${v.id}')">Hijack</div>
    <div class="btn" onclick="startTheft('tow','${v.id}')">Tow away</div>
  </div>`;
}
const bar=(label,val,color)=>`<div class="metric"><span style="width:110px">${label}</span>
  <span class="trk"><i style="width:${val}%;background:${color}"></i></span></div>`;
```

**三种方式的差异（务必区分，这是核心策略）**：

| 方式 | 阶段数 | 判定属性 | Wanted | 目击者 | 备注 |
|---|---|---|---|---|---|
| `tow` | 1 | 无 | +2 | 0 | 需拖车、耗 2 AP、最安静 |
| `steal` | 3 | Locksmithing → Electronics | +6~12 | 0~1 | 每阶段可撤退 |
| `hijack` | — | 直接进战斗窗口 | +14 | 2+ | 必有冲突 |

```js
function startTheft(mode, vid){
  const v = VEHICLES[vid];
  if(mode==='tow')    return resolveTow(v);
  if(mode==='steal')  return stealPhase(v, 0);   // 三阶段，见下
  if(mode==='hijack') return openCrimeWindow('hijack', v);
}

function stealPhase(v, phase){
  const P = [
    {name:'Approach',   skill:null,           risk:.08},
    {name:'Pick lock',  skill:'Locksmithing', def:v.lockDef},
    {name:'Bypass',     skill:'Electronics',  def:v.elecDef},
  ][phase];
  // 每阶段结束给玩家 [继续] / [换工具] / [撤退] 三选一
  // ★ 撤退必须永远可用，且零代价（这是紧张感的来源）
}
```

---

## 1.3 加 Disguise 弹窗

**这是原作版的侧写系统，照抄即可**：

```js
const DISGUISE = [
  {icon:'face', label:'Police may know the facial features.', worsens:'0..40', action:null},
  {icon:'hair', label:'Police may know the hairstyle.',       worsens:'0..15', action:{t:'Restyle',cost:300}},
  {icon:'eye',  label:'Police may know the eye color.',       worsens:'0..10', action:{t:'Change', cost:200}},
];
// 车辆版：Stamp new engine number  $700
```

**设计要点**：面部特征 `(None)` 不可更改——这是玩家永远甩不掉的尾巴，也是后期"整容"内容的钩子。

---

## 1.4 加购买确认弹窗

原作的两个细节**必须实现**，它们是 Favor 系统的意义所在：

```js
function buyDialog(item, dealer){
  // ★ 细节一：标价 ≠ 成交价，Favor 越高越便宜
  const listed = item.price;
  const asking = Math.round(listed * (1.35 - dealer.favor / 200));

  // ★ 细节二：必须选归属（车 / 队友A / 队友B）
  return `
  <p>Vendor wants $${f(asking)} for the item.
     Select destination character or vehicle and click OK to buy it.</p>
  <div class="g3" id="destPick">${OWNERS.map(o=>
    `<div class="sl" onclick="pickDest('${o.id}')">${im(o.img)}</div>`).join('')}</div>
  <p style="color:#7a6640">Works in: ${item.slot}</p>`;  // 槽位限制
}
```

---

# 2. 游戏功能升级：按阶段做

## 阶段 A · 核心还原（当前阶段）

```
[x] 地图 + 地点 + 上下文右栏
[x] 七城市 + 驾车旅行 + 途中检查
[x] 资产（收支/维持费）
[x] 帮派（关系/实力/五种互动）
[x] 战斗窗口（独立原型，未接入）
[ ] 8 属性面板                    ← §1.1
[ ] Vehicle Info + 三种偷法        ← §1.2
[ ] Disguise 弹窗                  ← §1.3
[ ] 两窗口接线                     ← §3.1
[ ] Wanted 双段 + 区域封锁          ← §2.1
[ ] 死亡结算 + 永久死亡             ← §2.2
```

## 2.1 Wanted Level 双段结构

**别写成单值**。原作是 `基数 + 累积`：

```js
const wanted = { base: 0, cur: 69 };

// 累积部分：每回合自然衰减
wanted.cur = Math.max(0, wanted.cur - 4);

// 基数：重大案件后永久上升，贿赂无法消除
function majorCrime(severity){ wanted.base += severity; }   // 杀人 +5、银行 +3

// 贿赂只减累积部分
function bribe(amount){
  const chance = Math.min(85, amount / 5000 * 41);
  if(Math.random()*100 < chance) wanted.cur = Math.floor(wanted.cur / 2);
}

// 区域封锁：总值过高 → 该城市锁死
if(wanted.base + wanted.cur > 90){
  log(`Patrol cars surrounded your region in ${city}.`, 'r');
  cityLocked[city] = true;      // 必须离城才能继续作业
}
```

## 2.2 死亡结算

```js
function gameOver(reason){
  showModal(`
    <b>You have been killed and your game is lost!</b><br><br>
    Name: ${player.name}<br>
    Profession: ${player.profession}<br>
    Game difficulty: ${DIFFICULTY[player.diff].label}<br>
    Cash: $${f(player.cash)}<br>
    Days elapsed: ${day}
  `, IMG['scenes/nightstreet']);
  freezeGame();      // ★ 永久死亡，不给读档
}
```

## 2.3 难度（改世界状态，不改数值）

```js
const DIFFICULTY = {
  apprentice:{label:'学徒', cash:5000, debt:0,      hostility:.6, ironman:false},
  pro:       {label:'职业', cash:500,  debt:180000, hostility:1.0, ironman:true},
  legend:    {label:'传奇', cash:0,    debt:350000, hostility:1.4, ironman:true},
  miracle:   {label:'奇迹', cash:0,    debt:500000, hostility:1.8, ironman:true,
              startWanted:25, startEnemies:2},   // ★ 开局就有仇家
};
```

**原则**：难度不是把敌人血量翻倍，是**让世界一开始就更敌对**。

---

# 3. 两个原型的接线

## 3.1 主窗口 ↔ 犯罪窗口

当前两个 HTML 各自独立。接线方案：

```js
// ── 主窗口 ──
function openCrimeWindow(type, target){
  crimeState = {
    type,                       // 'rob' | 'steal' | 'hijack'
    target,
    team: TEAM.filter(p=>p.hp>0),
    policeReadiness: {base: wanted.base, cur: 0},
    loot: 0,
    turn: 0,
  };
  document.getElementById('mainWin').style.display='none';
  document.getElementById('crimeWin').classList.add('on');
  renderCrime();
}

// ── 犯罪窗口结束时回传 ──
function closeCrimeWindow(outcome){
  // outcome: {escaped, loot, wounds, arrested, killed, readiness}
  if(outcome.killed)   return gameOver('killed');
  if(outcome.arrested) return arrestFlow();

  cash += outcome.loot;
  wanted.cur += Math.round(outcome.readiness / 3);   // ★ 警戒度转化为通缉
  outcome.wounds.forEach(w => applyWound(w.who, w.part));

  document.getElementById('crimeWin').classList.remove('on');
  document.getElementById('mainWin').style.display='block';
  log(`You've found $${f(outcome.loot)} in the Large Stack of Cash.`,'g');
  sync();
}
```

**关键约定**：犯罪窗口**不直接改主状态**，只在结束时回传一个 `outcome` 对象。
这样战斗逻辑可以独立单测。

## 3.2 伤势要持久化

```js
function applyWound(who, part){
  const p = TEAM.find(x=>x.n===who);
  p.wounds.push({part, day});
  // ★ 永久影响属性（这是策划案里"衰老与磨损"主题的载体）
  const PENALTY = {arm:['Locksmithing',-3], leg:['Driving',-3],
                   chest:['Health',-5], head:['Acting',-2]};
  if(PENALTY[part]) p.stats[PENALTY[part][0]] += PENALTY[part][1];
}
```

---

# 4. 常用配方（Copy-Paste 级）

## 4.1 加一个新地点类型

```js
// 步骤 1：加图标（跑 mkicons2.py，加一行 JOB）
('places/newplace','newplace', 1.8, 0, .05, 'glyphKey'),

// 步骤 2：加模板
TPL.newplace = {
  ic:'newplace', img:'places/newplace', n:'Pawn Shop', ctx:'Pawn Shop',
  d:'They take anything.\nThey pay nothing.',
  a:['Sell Hot','Buy Illegal'], slots:['items/beretta','',''],
  favor:0,                    // 可选：有 Favor 条
};

// 步骤 3：布点到城市
LAYOUTS['Houston, TX'].push(['newplace', 44, 52]);   // [模板, x%, y%]
```

## 4.2 加一个新行动

```js
// 在 act() 的 M 表里加一行即可
'Case the Place': () => {
  ap -= 2;
  const t = currentTarget();
  t.intel = true;                        // 解锁踩点信息
  log(`Watched for two hours. ${t.guards} guards, shift change 3am.`, 'd');
},
```

**规范**：每个行动必须明确 ① 消耗（AP/钱/时间）② 判定属性 ③ Wanted 变化 ④ 日志文案。

## 4.3 加一辆新车

```js
// 1) 抓素材（fix_assets.py，务必带关键词校验）
('cars','supra','Toyota Supra 1993',['supra','toyota'],(240,168)),

// 2) 人工核验（必须！）——生成缩略图总览，肉眼过一遍
// 3) 加数据
VEHICLES.supra = {
  id:'supra', model:'supra', name:'Toyota Supra', body:'coupe', seats:2, engine:'3.0L I6',
  price:31000, cond:78, lockDef:52, elecDef:64, disguise:100, speed:88,
};
```

## 4.4 加一座城市

```js
// 1) mkmaps.py 里加配置（选 grid 类型：ortho / tilt / radial）
'Denver, CO': dict(seed=88, bg='#F1DEBB', block='#E7D0A4', hw='#D89C54',
  grid='ortho', gy0=56, gys=58, gx0=64, gxs=90, blocks=9,
  water=[], green=['rect x="400" y="60" width="90" height="56" fill="#C8D8AA"'],
  highways=['M0 200 H640','M290 0 V404'],
  labels=[('Colfax Ave',6,196,0),('I-25',296,20,90)]),

// 2) 加地点布局
LAYOUTS['Denver, CO'] = [['airport',10,18],['residential',32,12], /* ... */];
```

## 4.5 加一种战斗行动模式

```js
ACTIONS.push({k:'suppress', i:'🔫', t:'Suppress the enemy with covering fire'});

// 在 playerPhase() 加分支
else if(sel==='suppress'){
  alive.forEach(p=>{
    const foe = pickFoe(); if(!foe) return;
    foe.suppressed = 2;                          // 两回合内命中率减半
    L2(`${p.n} is laying down fire on ${foe.n}...`, 'They are pinned.', 'g');
  });
  policeReadiness.cur += 6;                      // ★ 开火加速警察到来
}
```

**铁律**：任何增加噪音的行动，**必须**推高 Police Readiness。这是战斗系统的平衡支点。

---

# 5. 帮派 AI（阶段 B）

当前帮派是静态数据。让它们真正「活」起来：

```js
function gangTurn(){
  GANGS.forEach(g => {
    // 1) 评估目标
    const rivals = GANGS.filter(x => x !== g);
    const weakest = rivals.sort((a,b) => a.pow - b.pow)[0];

    // 2) 按性格决策
    const roll = Math.random();
    if(g.aggression/100 > roll && weakest.pow < g.pow * .7){
      weakest.pow -= 6; g.pow += 3;
      news(`${g.n} moved on ${weakest.n}'s ground in the east.`);
    } else if(roll > .85){
      g.pow += 2;
      news(`${g.n} is recruiting. They are hiring fast.`);
    }

    // 3) 对玩家的态度自然漂移
    if(g.rel > 0) g.rel -= 1;      // ★ 关系不维护就会衰减
  });
}
```

**要点**：帮派行为必须通过**报纸/街谈**呈现，否则玩家看不见 AI 在动。

```js
function news(text){
  // 进入每回合的报纸摘要，而不是直接弹日志
  NEWSPAPER.push({day, text, reliability: Math.random() > .2 ? 'true' : 'rumor'});
}
```

---

# 6. 迁移到 Tauri 工程

触发条件见 §0.2。目标结构：

```
src-tauri/          Rust：规则层（判定/经济/势力AI）
  src/
    rules/          纯函数，可 cargo test
    world/          世界状态推演
    save/           存档序列化
src/                TypeScript：表现层
  ui/               面板组件
  screens/          主界面 / 犯罪窗口
  data/             JSON 配置（车/地点/物品/事件）
public/assets/      素材（不再 base64 内嵌）
```

**迁移步骤**：

```bash
npm create tauri-app@latest
# 1) 把 assets/ 和 icons/ 挪到 public/assets/
# 2) 把内嵌 base64 换成路径引用：IMG['cars/x'] → '/assets/cars/x.jpg'
# 3) 把 CITY_OBJ / TPL / LAYOUTS 抽成 src/data/*.json
# 4) 判定逻辑逐个搬进 src-tauri/src/rules/，前端通过 invoke 调用
```

**先搬什么**：判定函数（偷车成功率、战斗命中、贿赂概率）。
理由：这些是最值钱的逻辑，编译成原生码顺带解决了 JS 源码裸奔的问题。

---

# 7. 验证清单（每次改完跑一遍）

```bash
# 语法检查
node -e "const h=require('fs').readFileSync('原型.html','utf8');
 [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(x=>{
   try{new Function(x[1]);console.log('✓')}catch(e){console.log('✗',e.message)}});"

# 素材完整性（引用了但不存在的 key）
node -e "/* 遍历 CITY_OBJ 的 img/ic 字段，比对 IMG/ICO 是否有对应键 */"

# 素材人工核验（改素材后必跑）
python3 -c "生成缩略图总览 → 肉眼过一遍"
```

**手动回归清单**：
```
[ ] 七座城市都能切换，地图各不相同
[ ] 每个地点点击后：左栏图/文/按钮、右栏面板、底部状态栏 四处同步变化
[ ] 贿赂：金额可改，概率随金额变化，成功则通缉减半
[ ] 结束回合：天数+1、扣维持费、通缉衰减、帮派动向播报
[ ] 战斗：Police Readiness 到 40/70/95 各刷一波增援
[ ] 领袖加成四种文案都会出现
```

---

# 8. 反模式（别犯）

| ❌ 别做 | ✅ 应该 |
|---|---|
| 地图圆标用纯照片 | 照片 + 角标（44px 下建筑必糊） |
| 地图圆标用纯矢量 | 同上——原作是照片，别丢质感 |
| 属性合并成 `54` | 分开写 `39+15`，绿色显示加成 |
| Wanted 写成单值 | 双段 `base + cur`，贿赂只减 cur |
| 战斗做成血条消耗战 | 真正的敌人是 Police Readiness 计时器 |
| 素材下载完直接用 | **必须**生成缩略图肉眼核验 |
| 用真人照片当 NPC | 肖像权≠著作权，商用必须换 AI 生成或手绘 |
| 犯罪窗口直接改主状态 | 只回传 `outcome` 对象 |
| 帮派 AI 静默运行 | 通过报纸/街谈让玩家看见 |
| 失败就是 Game Over | 五档失败结果，大部分是"没得手但跑掉了" |

---

# 9. 优先级（资源不够时砍到只剩这些）

```
P0  偷车三方式 + 四阶段流程 + 音效
P0  Police Readiness 计时器（战斗的灵魂）
P0  会打电话催债的具名 NPC
P0  8 属性面板 + Disguise 弹窗
────────── 以上做不出上头效果，别继续 ──────────
P1  两窗口接线 / Vehicle Info / 死亡结算
P1  帮派 AI + 报纸系统
P2  情报真假 / 手法侧写 / 资产扩张
P3  主线剧情 / 三主角 / 海外线
```

---

*配套 CLAUDE.md 使用 · 每完成一项在 §2 打勾*
