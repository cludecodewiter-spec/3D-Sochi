# CLAUDE.md — GRAND THEFT: TEXT 开发指南

> 放在仓库根目录。Claude Code 每次会话自动读取。
> 本文件是**项目宪法**：技术选型、设计规范、数据结构、升级路线、以及踩过的坑。

---

# 0. 项目速览

**是什么**：《Car Thief 6》(Maxima Games) 的现代精神续作。
回合制文字沙盒犯罪模拟，PC 独占，Steam 发行。

**核心循环**
```
观察目标(防御数值) → 偷/劫/拖 → 洗白(热车→冷车) → 变现
   → 买工具/招人 → 偷更贵的车 → 扩张资产/地盘
```

**技术栈（已定，不要改）**
```
外壳    Tauri 2.x           （不用 Electron，包体 8-15MB vs 200MB）
前端    TypeScript + Vite   （无框架或 Preact，UI 是面板不是 SPA）
逻辑层  Rust                （判定/经济/AI 放这里，顺便防篡改）
状态    纯函数 reducer      （规则层必须可单测、可无 UI 跑 1000 回合）
数据    JSON/YAML           （所有内容数据驱动，为 MOD 预留）
```

**为什么是 Web 技术**：这个游戏 90% 是面板、列表、表格、彩色文字流——
HTML/CSS 的主场。用引擎做等于重新实现浏览器的富文本排版。

---

# 1. 仓库结构

```
/src
  /core                 ← Rust，纯逻辑，零 UI 依赖
    /rules              判定公式（偷车/战斗/贿赂/竞速）
    /economy            车价、黑市供需、资产收支
    /ai                 帮派 AI、警方调查引擎
    /sim                回合推进器（可脱离 UI 跑）
  /ui                   ← TypeScript
    /panels             左栏 Info / 右栏上下文 / 背包
    /map                城市地图 + 圆标
    /crime              犯罪执行窗口（独立布局）
    /dialogs            伪装 / 任务 / 帮派 / 资产 / 旅行
    /tokens.css         设计变量（见 §2）
/data                   ← 内容，改这里不用改代码
  vehicles.json         车型库
  locations.json        地点模板
  cities.json           城市 + 地点布局
  items.json            道具
  gangs.json            帮派
  quests.json           任务链
  events.json           随机事件文本池
/assets
  /photos               真实照片（见 §4）
  /icons                46px 圆标（照片+角标）
  CREDITS.md            署名清单（CC-BY 强制）
/tests
  sim_1000turns.rs      经济不崩溃回归测试
```

---

# 2. UI 设计规范（严格遵守）

## 2.1 设计令牌

```css
:root{
  --tan:      #E2C296;  /* 主底 */
  --panel:    #DCB88A;  /* 面板 */
  --sunk:     #C9A171;  /* 凹陷区/空格子 */
  --dk:       #A8814D;  /* 暗边 */
  --lt:       #F2DDB8;  /* 亮边 */
  --ink:      #1c1508;  /* 正文 */
  --blue:     #0000C0;  /* 可交互文字（按钮/链接）*/
  --red:      #A81C08;  /* 债务/支出/失败 */
  --grn:      #137A20;  /* 收入/成功 */
  --dim:      #8C7A55;  /* 叙述性日志 */
}
```

**字体**：`Tahoma, "MS Sans Serif", "Microsoft YaHei", sans-serif`，正文 **11px**。
不要用现代无衬线（Inter/Roboto），会立刻失去 2000 年代 Windows 应用的质感。

## 2.2 Win9x 立体边框（灵魂，不可省略）

```css
/* 凸起（按钮、状态条） */
.rise{ border:2px solid; border-color:var(--lt) var(--dk) var(--dk) var(--lt); }
/* 凹陷（面板、格子、日志） */
.sunk{ border:2px solid; border-color:var(--dk) var(--lt) var(--lt) var(--dk); }
/* 按下时翻转 */
.btn:active{ border-color:var(--dk) var(--lt) var(--lt) var(--dk); }
```

用纯色块或 `border-radius` 会毁掉整个观感。

## 2.3 尺寸规范（经过实测，别随意改）

| 元素 | 尺寸 | 内容 | 备注 |
|---|---|---|---|
| 地图圆标 | **46px** | 照片 + 20px 角标 | 见 §2.4 |
| 右栏格子 | 34px 高 | 真实照片 | 底部可叠 8px 标签 |
| 背包格 | 34×34 | 真实照片 | |
| 装备槽 | 38×34 | 真实照片 | 靠右独立成列 |
| Info 大图 | 152×110 | 真实照片 | 左栏顶部居中 |
| 弹窗头像 | 42×32 | 真实照片 | 表格行内 |

## 2.4 ★ 地图圆标：照片 + 角标（重要经验）

**实测结论：46px 下人脸/车/招牌清晰，建筑和场景必糊。**

所以圆标 = **真实照片底 + 右下角高对比图形徽章**。

照片预处理（Python/PIL，见 `tools/mkicons.py`）：
```
紧裁到最有辨识度区域 → 88×88
对比 ×1.5  饱和 ×1.6  UnsharpMask(1.8, 170%)
圆形遮罩 + 5px 深棕描边 + 1px 内亮线
```

角标规则：
```
右下 20px 圆形，底 #F5E3C2，边 2px
颜色编码：默认深棕 / 我的资产 → 绿 / 敌对帮派 → 红
图形：飞机·房子·P·银行·购物车·加油·警徽·方格旗·餐叉·树·床·扳手·拳
```

## 2.5 左右栏是上下文容器（原作最聪明的设计）

选中不同对象时，**四处同时变化**：

```
左栏标题   Object Info / General Info / My Property / Gang Territory
左栏内容   大图 + 描述 + 动作按钮组（或 Favor 条 / Pay 输入框）
右栏首格   面板名 + 该对象的容器内容（街上的车 / 商人的货 / 帮派成员）
背包标签   "Duke's Backpack:" ↔ "ATM's Storage:"
底部状态栏 当前对象名
```

## 2.6 犯罪窗口是独立布局

标题栏变成 `Attempting shop robbery in Houston...`，三栏改为
`我方状态 | 场景+日志+动作条 | 敌方编组`。**不要复用主界面布局。**

日志配色（照抄原作）：
```
灰 #8C7A55   叙述          "Police Officer is moving ahead in Ford Expedition."
黑 #1c1508   动作主句      "You are ordering to open up the desk..."
红 #A81C08   失败/受伤     "The middle-aged man ignores you."
绿 #137A20   成功/加成     "Being guided by Ryan, your team gets a bonus turn!"
```
复合句写法：**主句黑 + 结果着色，同一行**。这是原作的招牌。

---

# 3. 核心数据结构

## 3.1 车辆
```jsonc
{
  "id": "porsche911_87",
  "name": "1987 Porsche 911 Carrera",
  "type": "sports",            // sedan|sports|suv|van|truck|moto|classic
  "value": 28300,
  "condition": 82,             // 车况 0-100
  "locksmithingDefense": 55,   // ← 对抗玩家 Locksmithing
  "electronicDefense": 70,     // ← 对抗玩家 Electronics
  "disguise": 30,              // 车辆伪装度，可花钱提升
  "speed": { "top": 78, "accel": 82, "handling": 74, "brake": 70 },
  "tracker": true,             // 隐藏，需踩点或扫描发现
  "hot": true, "hotUntil": 30, // 热车 → 冷车
  "plate": "PHX-4471", "vin": "WP0AB0911HS120xxx",
  "photo": "cars/porsche911"
}
```

## 3.2 角色（8 属性，照搬原作）
```jsonc
{
  "name": "Duke", "profession": "Actor",   // 职业决定初始倾向
  "health": 100,
  "disguise": { "cur": 35, "max": 100,
    "traits": [ {"k":"face","worsen":40,"fixable":false},
                {"k":"hair","worsen":15,"cost":300},
                {"k":"eyes","worsen":10,"cost":200} ] },
  "acting": 44, "shooting": 22, "hiding": 30, "driving": 37,
  "locksmithing": {"base":39,"gear":15}, "electronics": 39,
  "leadership": 72,          // ★ 触发战斗额外回合
  "wounds": ["chest","leg"], // 永久，影响对应技能
  "photo": "people/p00"
}
```

## 3.3 通缉度（双段，别写成单值）
```jsonc
{ "wanted": { "base": 10, "current": 15 } }
// 显示为 "10+15"。贿赂主要减 current；重案会永久抬 base。
// base>0 时，该城会出现 "Patrol cars surrounded your region"
```

## 3.4 帮派
```jsonc
{
  "id":"coleman", "name":"Coleman Family",
  "relation": 12,   // -100..100
  "power": 87,
  "traits": { "aggression":30, "greed":60, "vengeful":90, "honest":80 },
  "controls": ["fencing","loansharking"],
  "goals": { "primary":"retake_docks", "hidden":"negotiating_with_firm" }
}
```

## 3.5 资产
```jsonc
{ "id":"chopshop_south", "name":"Chop Shop (South Yard)",
  "income": 2000, "upkeep": 180, "heatPerDay": 1,
  "capacity": 6, "concealment": 40,
  "effects": ["dismantle+40%","launder2000"],
  "threats": ["raid","informant","police_search"] }
```

---

# 4. 素材规范（血泪教训）

## 4.1 授权红线

| 类别 | 来源 | 状态 |
|---|---|---|
| 车 · 建筑 · 场景 | Wikimedia Commons (CC0/CC-BY/PD) | ✅ 可商用，**必须署名** |
| 白底道具 | Commons **不可靠**，换 Pexels/Unsplash API 或自渲染 | ⚠️ |
| **人物肖像** | 当前 randomuser.me **仅原型可用，禁止商用** | ❌ 上线前必换 |

**人物肖像只有三条合法路径**：
1. AI 生成人脸（不存在的人 → 无肖像权）← 推荐打底
2. 明确标注 Model Released 的商业图库
3. 委托画师（关键角色用这个）

> ⚠️ **CC 授权管的是摄影师的著作权，不管被拍者的肖像权。这是两回事。**
> 把真人的脸当成游戏里的打手/毒贩/尸体，会吃官司。

## 4.2 抓取管线纪律

```
1. Commons API 搜索（限速 2.2s/请求，429 指数退避）
2. User-Agent 必须用浏览器串，bot 味 UA 会被 403
3. thumburl 的 ?utm_source=... 查询串不能丢，否则 400
4. ★ 关键词校验：文件名必须含预期关键词，否则丢弃
5. ★ 纯色检测：方差 < 260 判为坏图（全黑/全白）
6. ★★ 人工过目：生成缩略图总览，人眼扫一遍再入库
```

**第 6 步不可跳过。** 自动化能下载，但判断不了"这是不是一把刀"。
实测：不过人眼的话，约 35% 是错的（刀→围裙线稿、金条→皮带、现金→大清银行钞票）。

## 4.3 已验证素材库（49 张）
```
cars(12)   bmw chevy civic escort expedition ferrari hummer moto
           mustang porsche911 towtruck van
places(14) airport atm bank diner gasstation junkyard motel nightclub
           park parking policestation racetrack residential supermarket
items(8)   beretta gloves lockpick medkit phone revolver scanner vest
scenes(3)  alley highway nightstreet
people(12) p00-p11  ⚠️ 原型专用
```

---

# 5. 战斗系统规格（原作方案，比自研的好）

## 5.1 核心认知
> **真正的敌人是时间，不是敌人。**
> 敌人只是拖住你的手段。赢 = 在警察到齐前搞完并撤离。

## 5.2 回合结构
```
按 [↻ Turn]
 1. 领袖加成判定 → leadership 高者有概率给双倍行动
 2. 我方行动（按选定模式，每个存活成员各一次）
 3. 敌方行动
 4. Police Readiness 上涨（警报响 +9~13 / 已关 +4~8）
 5. 阈值刷增援：40→Guards  70→Police Patrol  95→第二队+区域封锁
 6. 结束判定
```

## 5.3 七种行动模式
`Wait / Order / Push / Pull / Attack / Grab / Leave`
撤离需连续 **4 回合**，期间追兵持续拉近。

## 5.4 领袖加成文案（四种轮换，别只写一种）
```
Being guided by a skilled leader like {N}, your team gets a bonus turn!
Being led by {N}, your team gets a bonus move!
Being headed by {N}, your team gets some spare time!
Being guided by {N}, your team gets an extra time for acting!
```

## 5.5 伤害
打**具体部位**：chest / neck / leg / arm / stomach / jaw / shoulder / head
措辞分级：`hurt` < `injured` < `wounded`
**伤势永久留存**，影响对应技能（左肩中弹 → Locksmithing -3）

---

# 6. 升级路线（按此顺序做）

## ✅ 已完成（原型阶段）
- [x] 主界面三栏 + 上下文切换
- [x] 46px 照片圆标 + 角标
- [x] 七城地图（各自路网）+ 驾车旅行
- [x] 犯罪/战斗窗口（Readiness / 增援 / 领袖加成 / 部位伤害）
- [x] 贿赂（概率式）· 帮派关系 · 资产收支 · 任务列表
- [x] 素材管线 + 49 张已验证

## 阶段 A · 核心还原（4-6 周）
```
[ ] A1 8 属性面板 + 职业选择开局
       验收：属性显示 "39+15" 双段格式，职业影响初始值
[ ] A2 偷车三方式流程
       Tow(1阶段) / Steal(3阶段可中途撤) / Hijack(直接进战斗)
       验收：Steal 每阶段可放弃，Readiness 随耗时上涨
[ ] A3 热车→冷车洗白链条
       换牌 / 磨VIN / 套牌 / 拆解 / 出境 / 冷藏（6 选 1）
       验收：热车只能卖 40%，洗白后全价
[ ] A4 伪装弹窗（面部0..40不可改 / 发型$300 / 瞳色$200 / 车$700）
[ ] A5 死亡结算页（Name/Profession/Difficulty/Cash/Days）
[ ] A6 Wanted 双段 + 区域封锁事件
[ ] A7 难度四档（学徒/职业/传奇/奇迹），改世界状态不改数值
```

## 阶段 B · 世界还原（4-6 周）
```
[ ] B1 商人系统：Favor 影响成交价（标价$645→实收$855）
[ ] B2 购买需选归属（车/队友A/队友B）+ 道具槽位 "Works in: Tool Pouch"
[ ] B3 每城商人库存不同
[ ] B4 任务链：电话接单 / Days Left / Talk 对话 / 完成判定
[ ] B5 飙车场：AI 车手评估 + 声誉系统（赢多了没人跟你赌）
[ ] B6 途中检查（"Cops made an inspection" / "You passed"）
[ ] B7 队友招募 + 忠诚 + 分赃
```

## 阶段 C · 差异化增量（8-12 周）
```
[ ] C1 ★ 情报真假系统 —— 本项目最大差异化
       每条情报有隐藏可靠度；玩家只见来源记录/时效/交叉验证/动机
       六态：真实/过期/失真/臆测/谎言/诱饵
[ ] C2 手法侧写（叠加在原作外貌伪装之上）
       记录偏好车型/时段/破解方式/区域/团伙规模
[ ] C3 抽象阶梯 —— 解决第 200 次偷车
       手动/委派/自动三档；成功率>85% 的目标自动折叠为"产能"
[ ] C4 主线：Vidal 与「公司」三幕
[ ] C5 档案库（F 键）+「上次怎么了」灰字提示
[ ] C6 谷底机制（逃/求/卖/撑 四条叙事出路）
```

## 阶段 D · 长线
```
[ ] D1 三时代演进 1987→2017（技术让旧手艺失效）
[ ] D2 三主角 + 协同行动切换
[ ] D3 海外四章（欧洲/南美/中东/东亚，各换一套规则）
[ ] D4 金融投资 + 内幕交易（犯罪本身产生市场敏感信息）
[ ] D5 Steam 创意工坊 MOD 支持
```

---

# 7. 给 Claude Code 的提示词模板

## 做 UI 组件
```
参照 CLAUDE.md §2 的设计令牌与 Win9x 边框规范，
实现 [组件名]。要求：
- 用 --sunk/--rise 边框类，禁止 border-radius（圆标除外）
- 字号 11px，Tahoma
- 可交互文字用 --blue 粗体
- 尺寸严格按 §2.3 表格
先给我 HTML 结构，确认后再写逻辑。
```

## 做游戏系统
```
按 CLAUDE.md §3 的数据结构实现 [系统名]。
硬性要求：
- 判定逻辑写在 /src/core/rules，纯函数，不碰 DOM
- 配置数据放 /data/*.json，不硬编码
- 写一个可脱离 UI 跑 1000 回合的测试
```

## 做文本内容
```
按 CLAUDE.md §2.6 的日志配色写 [场景] 的文本池。
- 复合句：主句黑 + 结果着色
- 每种结果至少 4 种措辞轮换
- 参考原作语气：干、短、不煽情
```

---

# 8. 反模式（踩过的坑，别重犯）

```
✗ 用 emoji 当图标           → 廉价感，必须真实照片 + 角标
✗ 圆标做成 30px            → 照片糊成一团，最小 46px
✗ 用现代扁平 UI            → 失去年代感，必须 Win9x 立体边框
✗ 素材爬虫不过人眼          → 实测 35% 是错的
✗ 用真人照片当 NPC          → 肖像权，必须 AI 生成或委托
✗ 战斗做成"主动权拉锯条"     → 抽象难懂，用"警察在路上"
✗ 热度不给数字（艺术表达）   → 50 小时游戏会累死玩家
✗ 一次解锁所有系统          → 开局界面只能有 3 个按钮
✗ 判定逻辑写在 UI 里        → 无法单测，数值调不动
✗ 内容硬编码在代码里         → MOD 支持是 PC 独占最大杠杆
```

---

# 9. 优先级铁律

资源只够做五件事时，按此顺序：

```
1. 偷车四阶段 + 音效（点火成功那一声要做到极致）
2. 债主的电话（第一小时的钩子）
3. 情报真假系统（本作灵魂）
4. 档案库（让复杂度可承受的关键）
5. Vidal 与终局（让整件事有意义）
```

**这五项做不出让人上头的效果，后面的都别做。**

---

*最后更新：原型 v6 完成 · 素材 49 张已验证 · 七城地图已实装*
