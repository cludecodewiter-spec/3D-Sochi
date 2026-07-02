# 测试报告(TEST_REPORT)

- 项目:除害装置 3D 维护训练系统(3D-Sochi)
- 分支:claude/software-dev-start-myyegj
- 测试日期:2026-07-02
- 测试代理:QA(自动化实测,非静态走查)

---

## 1. 测试环境

| 项目 | 值 |
|---|---|
| 操作系统 | Linux x86_64(内核 6.18.5) |
| .NET SDK | 8.0.128(MSBuild 17.8.49) |
| Node.js | v22.22.2 |
| Python | 3.11.15 |
| 浏览器 | Playwright Chromium headless_shell 1194(--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader,软件渲染) |
| 静态服务 | python3 -m http.server 8099(docs/webdemo) |

说明:本环境为 Linux,WPF 桌面工程(AbatementTrainer.App)无法本地编译/运行,由 CI 的 Windows job 覆盖(见 5.1)。

---

## 2. 用例矩阵(功能 / 结果 / 证据)

### 2.1 编译验证

| # | 功能 | 命令 | 结果 | 证据 |
|---|---|---|---|---|
| B-1 | Core 库编译 | `dotnet build src/AbatementTrainer.Core/AbatementTrainer.Core.csproj` | 通过 | Build succeeded,0 Warning / 0 Error |
| B-2 | Tools 工具编译 | `dotnet build src/AbatementTrainer.Tools/AbatementTrainer.Tools.csproj` | 通过 | Build succeeded,0 Warning / 0 Error |
| B-3 | App(WPF)编译 | — | 未执行(Linux 不支持) | 由 CI Windows job 覆盖 |

无需任何编译修复,开发代理交付的代码可直接编译。

### 2.2 单元测试(dotnet test)

`dotnet test tests/AbatementTrainer.Tests/AbatementTrainer.Tests.csproj`

**结果:68 / 68 通过,0 失败,0 跳过,耗时 190 ms,通过率 100%。**

按测试类分布:

| 测试类 | 用例数 | 覆盖点 |
|---|---|---|
| ExamSessionTests | 16 | 考核会话状态机、越界移动忽略等 |
| PlcSimulatorTests | 15 | PLC 仿真(启动/停止/急停/报警/非法 dt 忽略) |
| ValidatorEdgeTests | 10 | 清单校验边界(重复 partId/order、空 equipmentId、removeOffset 长度、损坏 GLB 不抛异常等) |
| ManifestTests | 8 | 清单 JSON 数据契约反序列化(冻结字段名) |
| ProcedureRunnerTests | 8 | 安全门:必选项未全确认不可前进、可选项不阻塞、完成后不越界 |
| LocalizationTests | 5 | 中日双语回退 |
| ExamScorerTests | 4 | 考核评分 |
| ContentIntegrationTests | 2 | 内容与代码集成 |

### 2.3 内容校验(三套设备)

`dotnet run --project src/AbatementTrainer.Tools -- validate <manifest> <glb>`

| # | 设备 | manifest | glb | 结果 |
|---|---|---|---|---|
| C-1 | unitA | content/unitA/manifest.json | content/unitA/models/unitA.glb | 通过:「✓ 校验通过,无任何问题。」 |
| C-2 | unitB | content/unitB/manifest.json | content/unitB/models/unitB.glb | 通过:「✓ 校验通过,无任何问题。」 |
| C-3 | unitC | content/unitC/manifest.json | content/unitC/models/unitC.glb | 通过:「✓ 校验通过,无任何问题。」 |

清单字段名与 glTF 节点名(冻结项 1)经校验器逐一比对,零错误零警告。

### 2.4 网页 demo 冒烟(Playwright + 无头 Chromium,软件渲染)

页面:`http://127.0.0.1:8099/unitC-demo.html`(GLB 为 base64 内嵌,单文件加载)。
脚本等待 `window.__demo.partObjs` 就绪(3D 场景加载完成)后执行断言。

| # | 断言 | 期望 | 实测 | 结果 |
|---|---|---|---|---|
| W-1 | 无 pageerror | 0 条 | 0 条(console error 亦为 0) | 通过 |
| W-2 | 部件列表条目数(`#parts .part`) | 13 | 13 | 通过 |
| W-3 | 点 `#bValve`(开阀)后点 `#bRun` | `window.__demo.PLC.running === true` | true | 通过 |
| W-4 | 启动 3 秒后压力 | `PLC.p > 100` | 115.17 kPa | 通过 |

原始输出:

```json
{ "pageErrors": [], "consoleErrors": [], "partCount": 13,
  "plcRunning": true, "p3s": 115.17455822638885, "pass": true }
```

W-3 同时隐含验证了 PLC 联锁:阀未开时 `start()` 拒绝启动(与 PlcSimulatorTests 中的联锁用例互证)。

### 2.5 冻结项抽查(静态)

| 冻结项 | 结论 | 证据 |
|---|---|---|
| 1. 清单 JSON 数据契约 | 保持 | ManifestTests 8 例通过;三套内容 validate 零问题;webdemo 内嵌 MANIFEST 字段名一致 |
| 2. 安全门 CanAdvance | 保持 | Core 内 `ProcedureRunner.TryAdvance` 与 `ExamSession` 前进路径均调用 `CanAdvance`;App 的 `MainViewModel.CanGoNext` / `ExamViewModel.CanAdvanceExec` 亦经 `_runner.CanAdvance`;ProcedureRunnerTests 覆盖「必选未确认不可前进」 |
| 3. 免责横幅 | 保持 | 「实际作业以官方程序为准」出现在 App 的 Strings.zh.resx 与 webdemo 两个 HTML 中 |
| 4. Core/UI 分层 | 保持 | 全部 68 个单测仅引用 Core;webdemo PLC 注释标明与 Core/Plc/PlcSimulator.cs 同一套逻辑 |

---

## 3. 缺陷清单

**本轮实测未发现缺陷(0 个)。**

无编译错误、无测试失败、无内容校验问题、无页面运行时错误。

---

## 4. 风险与建议

1. **WPF App 未在本环境验证(主要风险)**:HelixToolkit 3D 视口、鼠标拖拽插拔、HMI 控件等桌面 UI 行为只能靠 CI Windows job 编译验证,缺少自动化 UI 冒烟。建议在 Windows 侧至少补一条「启动 → 加载 unitC → 走完一步安全确认」的冒烟脚本或手工检查单。
2. **软件渲染与真实 GPU 存在差异**:webdemo 冒烟在 SwiftShader 下通过,但材质/性能表现与真机 GPU 不完全一致,发布前建议在真实浏览器上人工过一遍拖拽插拔与 PLC 动画(表针/浮子/信号灯/手轮)。
3. **冒烟覆盖面**:本次网页冒烟只覆盖 unitC-demo.html 的 PLC 主链路;unitC-web.html、语言切换(中/日)、拆装步骤全流程、考核模式的浏览器端断言可在后续迭代补充(Core 侧逻辑已由单测覆盖)。
4. **PLC 数值断言基于时间**:`p>100@3s` 依赖 requestAnimationFrame 节奏,在极端低性能 CI 机器上可能抖动;建议断言窗口留余量或改为轮询等待。

---

## 5. 总体结论

**可发布(限本环境可验证范围)。**

- Core / Tools 编译通过(0 警告 0 错误);
- 单元测试 68/68 通过(100%);
- 三套设备内容校验全部通过;
- 网页 demo 冒烟 4/4 断言通过,无任何页面错误;
- 四项冻结项抽查均未被破坏。

条件说明:WPF 桌面端(AbatementTrainer.App)在 Linux 无法编译运行,须以 CI Windows job 的编译结果 + Windows 侧冒烟作为最终放行门槛;在该项确认前,桌面端部分视为「有条件通过」。

---

*免责声明:本系统为训练辅助,实际作业以官方程序为准。*
