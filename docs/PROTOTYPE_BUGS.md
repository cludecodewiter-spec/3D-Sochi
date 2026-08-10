# 原型 v6 缺陷报告

对象：`UI原型v6_图标与七城.html`（1.2 MB，内嵌 77 项素材）
方法：Playwright 载入真实 DOM，逐个调用其全局函数并对比前后状态。
**下列每一条都是实测复现，不是读代码猜的。**

界面本身不抛异常——七城切换、帮派/资产/任务弹窗、连续结束回合全部干净。
问题集中在经济与数值逻辑。

---

## P0-1 负数贿赂可以白拿钱

```js
function bribe(){
  const v=parseInt(document.getElementById('amt').value)||0;
  if(v>cash){L('Not enough cash.','r');return;}   // ← -5000 > cash 为假，放行
  cash-=v;                                        // ← cash -= -5000
```

金额输入框没有下限校验。`-5000 > 35490` 为假，于是通过检查，
然后 `cash -= -5000` **增加**五千。

实测：`cash 10000 → 15000`。

修法：`if(!(v > 0) || v > cash) return`。本仓库的 `systems/heat.ts#bribe`
已按此实现，并有测试守着。

---

## P0-2 付不起也照付，现金变负

```js
'Pay Tribute':()=>{cash-=5000; ...}
'Buy Info':()=>{cash-=800; ...}
'Change VIN':()=>{cash-=700; ...}
function travel(c){ ... cash-=cost; ... }
```

四处扣款都没有余额检查。

实测：余额 $100 交 $5000 保护费 → `100 → -4900`。

现金为负之后没有任何机制处理它——不触发破产、不触发债主、不阻止后续消费，
它只是一个负数在界面上挂着。

---

## P0-3 找不到帮派时，钱已经扣了

```js
'Pay Tribute':()=>{
  cash-=5000;                                              // ← 先扣
  const g=GANGS.find(x=>w.startsWith(x.n.split(' ')[0]));  // ← 后找
  if(g){ g.rel=...; }                                      // ← 找不到就什么都不做
},
```

扣款在查找之前，且查找失败没有回滚。

实测：向不存在的帮派交保护费 → `10000 → 5000`，关系没有任何变化。

查找方式本身也脆弱：按帮派名的**第一个词**去前缀匹配地点名。
两个帮派若首词相同就会认错人；地点改个名字就静默失配。
应该用 `gang` 索引（`TPL.gangC` 已经带了 `gang:2`），别用名字猜。

---

## P0-4 通缉度的双段结构是假的

`CLAUDE.md §3.3` 和 `UPGRADE_GUIDE §2.1` 都写明「**别写成单值**」。
原型存的正是单值：

```js
let wl=69;
document.getElementById('wlT').textContent='0+'+wl;   // ← base 段写死为 0
```

界面显示成 `0+69` 这个双段格式，但底下只有一个数。后果是：

- 没有 `majorCrime()`，重案不会永久抬底案
- 贿赂 `wl=Math.floor(wl/2)` 把**整个**值砍半，包括本该消不掉的那一段
- `base+cur > 90` 的区域封锁完全没有实现
- `wl` 没有上限，实测连续 20 次 Hijack 后 `wl=280`，
  进度条因为 `Math.min(wl/2,100)` 看起来满了，数字却还在涨

实测：`wl=280`，显示 `"0+280"`。

本仓库已按 §3.3 改为真双段并附 v1→v2 存档迁移。

---

## P1-5 `Lie Low` 跳过两天的经济结算

```js
'Lie Low':()=>{ ...; day+=2; ... }
```

直接推进两天，但不跑 `endTurn()` 的资产收支与维持费。
蛰伏因此是**免费**的——白得两天，还不用付维持费。

---

## P1-6 内联事件处理器里插了未转义的数据

```js
`<div class="btn" onclick="act('${a}','${o.n}')">`
`<div class="cityrow" onclick="travel('${c}')">`
```

地点名 `o.n` 直接拼进单引号包裹的 `onclick` 属性。
任何含撇号的名字（`Duke's Garage`）都会截断属性、让按钮静默失效。
数据全在本地，不构成安全漏洞，但这是一颗改内容就会踩响的雷。

改法：`addEventListener` + 闭包，别把数据拼进 HTML 字符串。

---

## 一条澄清

我一度以为 `CITY_OBJ` 只有 Miami、另外六城会让旅行弹窗崩溃。
**这是错的**——`LAYOUTS` 下面有一段构建器把其余六城补齐了：

```js
Object.keys(LAYOUTS).forEach(c=>{
  CITY_OBJ[c]=LAYOUTS[c].map(([k,x,y])=>Object.assign({},TPL[k],{x,y}));
});
```

七城齐全，旅行与切城实测无异常。写在这里，免得后来人重蹈我这次的误判。
