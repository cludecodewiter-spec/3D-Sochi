# tools/webdemo — 网页 demo 构建脚本

`build_demo.py` 从仓库内容包生成两个自包含的 three.js 网页 demo(HTML 单文件),
与桌面版共用同一份数据源(冻结的数据契约):

- 输入:`content/unitC/manifest.json` + `content/unitC/models/unitC.glb`
- 输出:`docs/webdemo/unitC-demo.html`(three.js 全内嵌,离线可用)
  与 `docs/webdemo/unitC-web.html`(three.js 走 jsDelivr CDN,体积更小)

## 构建方法

```bash
cd tools/webdemo
npm i three@0.147.0     # 仅需一次;three r147 是最后一个提供 examples/js UMD 版的版本
python3 build_demo.py   # 产物写入 docs/webdemo/
```

依赖:Python 3(仅标准库)、Node/npm(仅用于下载 three)。
若缺少 `node_modules/three`,脚本会直接报错退出并提示安装命令。

## 说明

- 脚本内嵌了 demo 的全部 JS(PLC 仿真、HMI、安全门步骤面板、拖拽插拔)与 CSS;
  修改 demo 行为即修改本脚本中的 `APP` / `STYLE` 字符串,然后重新构建。
- three 版本锁定 0.147.0:demo 依赖 `examples/js/`(UMD 全局脚本)形态的
  OrbitControls / GLTFLoader / RoomEnvironment,r148 起官方已删除该目录。
- 所有内嵌文本(JS 库、清单 JSON)在写入 HTML 前统一做 `</script` 转义,
  防止提前闭合脚本标签。
- demo 中 PLC 逻辑(自保持、进气阀联锁、急停锁存需复位、一阶惯性过程动态)
  与 `src/AbatementTrainer.Core/Plc/PlcSimulator.cs` 保持同一套语义;
  安全门(必填确认不勾选则「下一步」禁用)对应 `ProcedureRunner.CanAdvance`。
- 免责横幅「训练辅助,实际作业以官方程序为准」为冻结项,常驻页面底部,不可移除。

## 已知裁剪(设计书已认可)

- 仅覆盖 unitC 单设备、单流程;无考核模式、无设备库(UX 设计书差异表 #20)。
- 拖拽插拔未与步骤安全门联动(任何部件任意时刻可拔),为已记录的差异项
  (UX 设计书差异表 #2),修复属行为变更,不在本脚本入库范围内。
