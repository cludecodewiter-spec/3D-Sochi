# PM 商业化交付审核报告(PM_REVIEW)

- 文档编号:PM-RV-001
- 审核人:产品经理代理 PM
- 审核日期:2026-07-02
- 审核对象:仓库 `3D-Sochi` 全量(分支 claude/software-dev-start-myyegj)
- 审核标准:**能否作为商业产品交付**
- 核查方式:逐条对照 README 功能表读源码取证;脚本化核查 resx 与三台设备清单的双语完整性;实际运行 `dotnet test`(68/68 通过);依赖锁定文件(project.assets.json)逐项许可证审计。

> 总结论:**有条件通过(整改后可上市)**。核心训练主循环(导入模型 → 逐步拆装 → 每步强制安全确认 → 考核 → 双语)在桌面版代码层成立且有单测护航,冻结项 2/3/4 全部合规;但存在 3 项 P0(许可证合规缺失、桌面版缺两项承诺功能、发布链路未验证),不整改不得对外销售。

---

## 1. 需求达成度:「通过程序就能模拟维护设备」是否成立 —— **整改**(主循环通过,承诺功能有缺口)

对 README「已实现模块」表逐条抽查代码证据:

| 模块 | README 声称 | 代码证据 | 结论 |
|---|---|---|---|
| M1 | 清单加载+校验+glTF 节点检视 | `src/AbatementTrainer.Core/Manifest/ManifestValidator.cs`:①node 存在性 ②targetPart 存在性 ③必填非空 ④zh/ja 双语非空,均实现;`ValidatorEdgeTests.cs` 等 10 项边界单测 | ✅ 通过 |
| M2 | Viewport3DX + Assimp 导入 | `Services/ModelLoaderService.cs`(Importer.Load + 节点名索引)、`MainWindow.xaml`(Viewport3DX + 三点布光 + MSAA/FXAA/SSAO) | ✅ 通过(仅代码级验证,本环境无 Windows 无法实跑) |
| M3 | 部件树↔3D 双向联动 | `MainWindow.xaml.cs` MouseDown3D 命中→反选列表;`MainViewModel.OnSelectedPartChanged`→`SceneController.Highlight` | ✅ 通过 |
| M4 | 显隐/隔离/全显 | `Services/SceneController.cs` SetVisible/Isolate/ShowAll | ✅ 通过 |
| M5 | 安全门状态机 | `Core/Procedure/ProcedureRunner.cs` CanAdvance/TryAdvance;`ProcedureRunnerTests.cs` 8 项单测 | ✅ 通过 |
| M6 | 门控「下一步」 | `MainViewModel.Next()`:`[RelayCommand(CanExecute=nameof(CanGoNext))]` + 内部再次 `TryAdvance` 双保险 | ✅ 通过 |
| M7 | remove 平移动画 | `SceneController.RemovePart/Animate/RestorePart`(含在途动画取消、直达终态等健壮性处理) | ✅ 通过 |
| M8 | 中/日运行时切换 | `Services/LocalizationService.cs`(ResourceManager + 索引器 PropertyChanged)、切换不重建已勾选确认项 | ✅ 通过 |
| M9 | 设备库/内容索引 | `Services/ContentLibraryService.cs` + `content/index.json`(实际 3 台设备 unitA/B/C) | ✅ 通过 |
| M10 | 考核(打乱→排序→评分) | `Core/Exam/ExamSession.cs`、`ExamScorer.cs`,执行阶段复用 ProcedureRunner 安全门;22 项单测 | ⚠ 通过但有产品缺陷(见 6.P1-2) |
| M11 | 自包含单文件发布 | 仅 README 中一条 publish 命令;CI 无 publish job,产物行为未实测 | ❌ 整改(见 §5) |

**核心命题的缺口**(对照 `docs/design/SYSTEM_DESIGN.md` §1.2 需求分解 R4/R5,即项目背景明示的功能):

1. **R5 全部件鼠标拖拽插拔:桌面正式版完全没有**。`MainWindow.xaml.cs` 仅有点选联动;拖拽插拔(轴约束、>60% 吸附、回弹)只存在于网页 demo(`docs/webdemo/unitC-demo.html` 第 5374 行起)。UX 设计书差异表 #1 已自认,优先级「高」。
2. **R4 PLC 驱动设备内部 3D 运转(表针/浮子/信号灯/手轮):桌面版未联动 3D**。桌面 PLC 仿真(`Core/Plc/PlcSimulator.cs` + `ViewModels/PlcViewModel.cs`)只驱动 2D HMI 面板(进度条/圆点灯);表针转动、浮子升降、手轮旋转等 3D 内部运转只在网页 demo 实现(demo 中 `anim.needle/flowFloat/wheel` 等)。
3. README 模块表未列 PLC 仿真与拖拽两项(功能表与实际产品能力不同步),对外沟通口径有歧义。

**判定**:「不接触真机、仅凭软件完成一次完整、有安全确认、可考核的维护演练」在桌面版**成立**;但「项目背景/设计书承诺的 PLC 3D 运转与拖拽插拔」目前是**网页 demo 独有**,正式桌面产品与宣传能力不一致 → **整改(P0-2)**。

---

## 2. 合规:第三方许可证审计 —— **整改**

依据 `src/AbatementTrainer.App/obj/project.assets.json` 与各 csproj 逐项审计:

| 组件 | 版本 | 许可证 | 使用位置 | 风险 |
|---|---|---|---|---|
| HelixToolkit(Wpf.SharpDX / SharpDX / Assimp / Maths / Geometry) | 3.1.2 | MIT | App(随产品分发) | 低,需随附版权声明 |
| SharpDX 系列 | 4.2.0 | MIT | App(传递依赖) | 低;**项目已停止维护(2019 归档)**,长期供应链风险(P2) |
| SharpAssimp | 6.0.6 | MIT(封装);原生 assimp 为 **BSD-3-Clause** 且自带若干第三方代码声明 | App(传递依赖,含原生 dll) | 低,但 BSD-3 要求二进制分发随附版权与许可声明 |
| CommunityToolkit.Mvvm(+Common/Diagnostics) | 8.4.2 | MIT | App | 低 |
| SharpGLTF.Toolkit(Core/Runtime) | 1.0.6 | MIT | Core/Tools | 低 |
| Cyotek.Drawing.BitmapFont | 2.0.4 | MIT | App(传递依赖) | 低 |
| three.js | r147 | MIT | 网页 demo(整库内嵌进 HTML) | 低;min.js 内保留了 SPDX-License-Identifier(demo html 第 97 行),但仍应在声明文件中列明 |
| **SixLabors.ImageSharp** | **3.1.12** | **Six Labors Split License 1.0** | Tools(程序化贴图生成 `ProceduralTextures.cs`) | **高(见下)** |

**ImageSharp 3.x 专项风险评估**:

- Split License 条款:仅对开源项目、非营利组织、以及**年总收入低于 100 万美元**的商业实体按 Apache-2.0 授权;超过门槛的商业使用需购买 Six Labors 商业许可。
- 本仓库用法:仅 `src/AbatementTrainer.Tools`(内容生成控制台)直接引用,**不随 App 主程序分发**;但 README 明确指导客户/内部人员运行 `gen-sample` 生成模型,Tools 属于交付链的一部分——若购买方或我方年收入超门槛,即构成需付费的商业使用。
- **处置方案(三选一,建议 a)**:
  a. **降级到 ImageSharp 2.1.x**(该大版本为纯 Apache-2.0,程序化贴图 API 完全够用,迁移成本≈0);
  b. 换 **SkiaSharp**(MIT)或 **Magick.NET**(Apache-2.0)重写贴图生成(约 200 行);
  c. 保留 3.x 并**采购 Six Labors 商业许可**(按团队席位年费),需法务/采购走流程。

**仓库级合规缺失(与具体库无关)**:

- **仓库无 LICENSE 文件**——产品自身授权方式未定义,无法签商业合同;
- **无 THIRD-PARTY-NOTICES / NOTICE 文件**——MIT/BSD-3 均要求二进制分发时随附版权与许可文本,当前发布产物(exe、demo HTML)不满足;
- 三份设计/调研文档(RESEARCH/SYSTEM_DESIGN/UX_DESIGN)中无任何许可证审计记录(grep 证实)。

**判定:整改(P0-1)。**

---

## 3. 安全与免责一致性 —— **通过(附 1 项 P1 收紧项)**

- **免责横幅常驻(冻结项 3)**:✅
  - 桌面:`MainWindow.xaml` 第 353–357 行,Grid 第 2 行独立红底横幅,不随任何页面切换消失、无关闭入口;文案走 `Loc[Disclaimer]`,zh/ja resx 均有非空值。
  - 网页 demo:`unitC-demo.html` 第 93 行 `.disc` 常驻底部;`tools/webdemo/README.md` 明文「冻结项,不可移除」。
  - README 顶部同款声明。三处口径一致。
- **安全门不可绕过(冻结项 2)**:✅
  - 训练模式唯一前进路径 `MainViewModel.Next()`:CanExecute 绑 `CanGoNext`(内含 `ProcedureRunner.CanAdvance`),命令体内再次 `TryAdvance` 兜底——即使 UI 层 CanExecute 被绕过也不前进。
  - 考核执行阶段 `ExamViewModel.NextExec()` → `ExamSession.TryAdvanceExecution()`,门未过则记违规且不前进(`_hadGateViolation`),计入成绩。
  - 全窗口无 InputBindings/快捷键,不存在旁路;Previous/Restart 均非前进方向。单测覆盖(ProcedureRunnerTests/ExamSessionTests)。
  - 网页 demo 教程面板同语义(必填不勾齐则「下一步」禁用)。
- **需收紧的一致性缺口(P1-1)**:网页 demo 的**拖拽插拔完全不经安全门**——任何部件任意时刻可拔到位(`tools/webdemo/README.md`「已知裁剪」与 UX 差异表 #2 已书面记录,定级「高(安全语义)」)。严格说拖拽不是「步骤前进路径」,未违反冻结项 2 的字面约束;但该 demo 是对客户/领导的门面材料,「随手可拆、无需任何确认」与产品核心卖点「每步强制安全确认」直接矛盾。UX 设计书已给出方案(未到步骤仅允许 ≤15% 晃动回弹),上市前必须落地。

---

## 4. 双语完整性 —— **通过**

- **resx**(脚本核查):`Strings.resx / Strings.zh.resx / Strings.ja.resx` 三文件键集完全一致(各 37 键),无空值;XAML/代码中引用的全部键(含 Hmi* 9 键、Disclaimer、GateBlocked、ExamScore 等)均有定义,无缺失键。唯一冗余:`TrainingMode` 已定义未使用(P2)。UX 差异表 #3 所指「HMI 文案硬编码中文」已在现版 XAML 修复(全部走 `Loc[Hmi*]`)。
- **清单**(脚本核查三台设备):unitA(4 步/5 件)、unitB(4 步/5 件)、unitC(9 步/13 件)所有 `name/title/instruction/safetyChecks[].text` 的 zh 与 ja 均非空;`content/index.json` 设备名双语齐全。且 `ManifestValidator` 校验项④在加载时强制双语非空,内容侧有制度保障;`ContentIntegrationTests` 对随库内容做了回归。
- 网页 demo:中日即时切换(`L()` 回退逻辑),HMI 文案双语字典齐备。
- 小瑕疵(不阻断):语言选择不持久化,每次启动回默认日语(UX 差异表 #18,P2)。

---

## 5. 交付物:安装/发布(M11)、文档、演示材料 —— **整改**

- **M11 发布路径:❌ 未验证的宣称。**
  - README 声称「产物可在无 .NET 运行时的 Windows 上双击运行」,但 CI(`.github/workflows/ci.yml`)只有 `dotnet build`,**没有任何 publish/打包 job**,单文件产物从未在流水线上生成过;
  - `PublishSingleFile` 默认**不打包原生库**(需 `IncludeNativeLibrariesForSelfExtract=true`),而本产品依赖 SharpDX/assimp 原生 dll——「单文件双击即用」大概率不成立,需在真实 Windows 上实测并修正 csproj/README;
  - 无安装器(MSI/MSIX)、无版本号策略、无代码签名——商业桌面软件在客户 IT 环境(SmartScreen/杀软)将被拦截;
  - `content/` 随程序拷贝的机制(csproj None Include)对 build 成立,对 publish 需实测确认。
- **文档齐全度:开发侧齐,用户侧缺。**
  - 已有:README(构建/运行/数据契约/CLI 工具)、`docs/RESEARCH.md`(对标调研+建模路线)、`docs/design/SYSTEM_DESIGN.md`、`docs/design/UX_DESIGN.md`(含 22 项差异清单,质量高)、`tools/webdemo/README.md`、`docs/webdemo/README.md`。
  - 缺失:**用户操作手册**(训练员/学员视角)、**内容作者指南**(客户如何把自己设备的 CAD/照片变成 glb+manifest——RESEARCH.md 有路线但无步骤化手册)、安装部署手册、FAQ/故障排查。
  - README 数据过时:测试数写「30 项」实测 68 项;结构图只列 unitA/unitB(实有 unitC);模块表漏 PLC 仿真与网页 demo(P2)。
- **给领导的演示材料:✅ 基本齐**。`docs/renders/`7 张渲染图(含 `unitC-overview-slide.png` 汇报页)、`docs/ui-mockup.svg`、完全离线的 `unitC-demo.html`(U 盘双击即演,含 PLC 运转/拖拽/安全门/双语)——演示力强;但演示前必须先修 P1-1(拖拽绕安全门),否则演示现场就会暴露安全语义矛盾。
- **工程质量佐证**:本次实测 `dotnet test` 68/68 全绿;Core/App 分层(冻结项 4)核查通过——Core 无任何 UI 依赖,App 无业务状态机逻辑;数据契约字段(冻结项 1)与 Build Spec §2 逐字段比对一致。
- **健壮性缺口(P1-3)**:`App.xaml.cs` 为空壳,无 DispatcherUnhandledException/日志落盘——现场崩溃即闪退且无法取证,不符合商业桌面软件底线。

---

## 6. 上市前必须整改清单

### P0(不整改不得对外销售/签约)

| # | 事项 | 证据 | 建议动作 |
|---|---|---|---|
| P0-1 | **许可证合规缺失**:仓库无 LICENSE、无 THIRD-PARTY-NOTICES;SixLabors.ImageSharp 3.1.12 为 Split License,商用(年收入≥100 万美元)需付费 | §2;`src/AbatementTrainer.Tools/AbatementTrainer.Tools.csproj` | ① 定义产品自身许可并添加 LICENSE;② 生成 THIRD-PARTY-NOTICES(MIT×7 家 + BSD-3 assimp + three.js)随 exe 与 demo HTML 分发;③ ImageSharp 降级 2.1.x(Apache-2.0,首选)或改 SkiaSharp,或采购商业许可 |
| P0-2 | **桌面正式版缺项目背景承诺的两项核心功能**:全部件拖拽插拔(R5)与 PLC→3D 内部运转联动(表针/浮子/信号灯/手轮,R4),当前仅网页 demo 具备 | §1;`MainWindow.xaml.cs`(无拖拽)、`PlcViewModel.cs`(不触达 SceneController) | 按 UX 设计书第 5 章/第 4 章向桌面版移植(HelixToolkit 轴约束拖拽 + PLC 状态驱动节点变换);或在合同/宣传口径中明确降级承诺(不推荐) |
| P0-3 | **发布链路(M11)是未验证宣称**:CI 无 publish job;PublishSingleFile 默认不含原生库(SharpDX/assimp),「无 .NET 环境双击即用」大概率不成立;无安装器、无签名、无版本号 | §5;`.github/workflows/ci.yml`、README M11 节 | ① CI 增加 windows publish job 并对产物做冒烟启动;② csproj 补 `IncludeNativeLibrariesForSelfExtract` 等并在真机验证;③ 制作 MSIX/MSI + 代码签名 + 语义化版本 |

### P1(首个商业版本发布前完成)

| # | 事项 | 证据 | 建议动作 |
|---|---|---|---|
| P1-1 | 网页 demo 拖拽插拔绕过安全门,与「每步强制安全确认」卖点矛盾(UX 差异表 #2,级别「高·安全语义」) | `docs/webdemo/unitC-demo.html` 5374 行起;`tools/webdemo/README.md` 已知裁剪 | 落地 UX 方案:未到当前步骤的部件仅允许 ≤15% 晃动后回弹;或演示页明示「自由探索模式」 |
| P1-2 | 考核模式不具备商用考核效力:shuffleSeed 固定 12345(题序恒定可背题);无每步用时、无成绩留存/导出(设计验收 A4 未达);WrongPositions 算了但 UI 未标红 | `MainViewModel.StartExam()`;`ExamViewModel.cs`;UX 差异表 #10 | 随机种子(记录在成绩单以便复现)+ 计时 + CSV/JSON 成绩导出 + 错位标红 |
| P1-3 | 无全局异常处理与日志:App.xaml.cs 空壳,现场崩溃即闪退、不可取证 | `src/AbatementTrainer.App/App.xaml.cs` | DispatcherUnhandledException + 本地滚动日志 + 友好错误对话框 |
| P1-4 | 破坏性操作无二次确认:「重来/退出考核/返回设备库」单击立即生效,训练进度即刻丢失(UX 差异表 #6) | `MainViewModel.Restart/BackToLibrary/ExitExam` | 确认对话框,默认焦点在「取消」 |
| P1-5 | 用户侧文档缺失:无操作手册、无内容作者指南(客户自有设备接入)、无安装部署手册 | §5 | 补三份手册(中日双语),内容作者指南基于 RESEARCH.md 路线步骤化 |

### P2(商业版 1.x 内解决)

| # | 事项 | 证据/出处 |
|---|---|---|
| P2-1 | README 数据过时:测试「30 项」实为 68;结构图缺 unitC;模块表漏 PLC/拖拽/网页 demo | 本次实测 + README |
| P2-2 | SharpDX 4.2.0 已停止维护(2019 归档),长期供应链/DX 版本风险,关注 HelixToolkit 后续渲染后端 | project.assets.json |
| P2-3 | 语言选择不持久化(每次启动回日语);冗余键 TrainingMode | LocalizationService.cs;UX 差异表 #18 |
| P2-4 | 无「关于」对话框(版本号/许可声明入口,亦是 P0-1 的展示载体) | App 全局 |
| P2-5 | UX 差异表其余中低优先级项(急停按钮形态 #4、门禁就地计数 #5、设备卡片缩略图 #8、考核拖拽排序 #9、无障碍 #16/#17 等)按表推进 | `docs/design/UX_DESIGN.md` §7 |

---

## 7. 冻结项合规确认(一票否决项,全部通过)

| 冻结项 | 结论 | 证据 |
|---|---|---|
| 1. 数据契约字段名与 glTF 节点名 | ✅ 未被更改 | `Core/Serialization/ManifestJson.cs`、`Core/Models/Manifest.cs` camelCase 契约与 Build Spec §2 一致;ContentIntegrationTests 对随库内容回归 |
| 2. 所有前进路径经 CanAdvance | ✅ | §3;训练 Next 与考核 NextExec 双路径均经 ProcedureRunner,且命令体内二次兜底 |
| 3. 免责横幅常驻 | ✅ | §3;桌面/网页/README 三处一致且不可关闭 |
| 4. Core 与 UI 分层 | ✅ | Core 仅依赖 SharpGLTF,零 UI 引用;逻辑单测 68 项全绿;App 仅做绑定与渲染 |
