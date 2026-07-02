# 同类软件调研 & 「照片/CAD → 3D 设备」路线

> 2026-07 调研,支撑「全面升级」决策。来源链接见文末。

## 1. 同类软件对标

### PLC / 设备运转仿真
| 软件 | 类型 | 可借鉴点 | 我们的对应实现 |
|---|---|---|---|
| **Factory I/O** | 商业(~$300/席) | 3D 虚拟工厂 + 真实 PLC 联动;传送带/机械臂等预置部件库;HMI 面板 | ✅ 已实现 `PlcSimulator`(Core,可单测)+ 网页/WPF HMI 触摸屏;联锁/自保持/急停锁存/一阶过程动态 |
| **OpenPLC** | 开源(免费) | IEC 61131-3 梯形图/结构化文本运行时;可与仿真环境经 Modbus 通讯 | 🔜 若客户要「真 PLC 程序」训练,可把我们的 3D 场景经 Modbus-TCP 接 OpenPLC Runtime,3D 只做 IO 映射 |
| Siemens PLCSIM | 商业 | S7 官方仿真 | 同上,属进阶集成方向 |

### 3D 交互维护训练 / 电子手册
| 软件 | 类型 | 可借鉴点 | 我们的对应实现 |
|---|---|---|---|
| **Cortona3D RapidManual / RapidLearning** | 商业(高价) | CAD 直接生成交互拆装手册;步骤动画与文字联动;零件目录钻取 | ✅ 清单驱动步骤 + 插拔动画 + 部件树;🔜 零件号目录导出 |
| **SOLIDWORKS Composer** | 商业 | 爆炸图/BOM/步骤动画,Player 免费分发 | ✅ 分解视图;网页单文件=免费分发方案 |
| xeokit(开源) | 开源 BIM 查看器 | 大模型分块加载、剖切 | 🔜 大型设备 LOD/剖切 |

**结论:我们已覆盖两类商业软件的核心交互(清单驱动步骤 + 安全门是差异化强项);
真正的差距在「内容生产管线」——商业软件都是从 CAD 直接进,而非手写几何。**

## 2. 照片 / CAD → 3D 设备:推荐路线

**架构不变**:一切路线的产物都是 glTF/GLB(+命名节点)→ 清单 JSON → App 加载。

### 路线 A:有 CAD 图纸(最准,首选)
STEP/IGES → glTF 转换:
- FreeCAD(开源)导入 STEP → 导出 glTF;或 CAD Exchanger / meshinspector 在线转换
- 关键动作:在 CAD 中**按部件命名装配树节点**(= 清单 part.node),再导出
- 大模型用 gltf-transform 减面/压缩(spec §6 已提示)

### 路线 B:只有实物(拍照建模)
- **摄影测量(Photogrammetry)**:围绕设备拍 50–200 张 → Meshroom(开源)/RealityCapture 重建
  → Blender 分割命名部件 → 导出 glTF。精度高但需人工分件。
- **AI 单图生成**:TripoSR(开源权重,<1s/件)、Meshy(商业 API)从单张照片生成 GLB。
  适合快速出「近似演示件」;工业精度不足,**适合配件级而非整机**。
- 实操建议:整机骨架用路线 A/程序生成,外观复杂的单件(泵头、异形罩)用 AI 生成后替换。

### 路线 C:程序化生成(本仓库现状)
`SampleModelBuilder` + `ProceduralTextures`:参数化圆柱/弯头/法兰/线束 + 程序化纹理。
适合:没有 CAD 时快速搭训练场景;可作为路线 A/B 的补充件库。

## 3. 已按调研落地的功能(本次升级)
- PLC 仿真 + HMI 触摸屏(联锁/自保持/急停锁存/压力流量动态)——对标 Factory I/O
- PLC → 3D 运转联动:表针旋转、流量浮子、信号灯/LED 闪烁、阀门手轮旋转
- 全部件鼠标/触摸**拖拽插拔**(沿轴约束 + 60% 吸附判定)——对标 Composer 交互
- UI 重排:HMI 置顶、触摸屏质感样式

## 来源
- [Factory I/O](https://factoryio.com/) · [Factory I/O 技术评述(control.com)](https://control.com/technical-articles/factory-i-o-a-modern-plc-simulation-tool-to-learn-the-fundamentals/) · [PLC 仿真软件对比](https://plcprogramming.io/blog/plc-simulator-software-complete-guide)
- [Cortona3D RapidManual](https://www.cortona3d.com/en/rapidmanual) · [Cortona3D RapidLearning](https://www.cortona3d.com/en/rapidlearning) · [SOLIDWORKS Composer](https://www.solidworks.com/product/solidworks-composer)
- [TripoSR(fal.ai)](https://fal.ai/models/fal-ai/triposr) · [Meshy Image-to-3D](https://www.meshy.ai/features/image-to-3d) · [STEP→glTF 转换](https://meshinspector.com/3d-converters/step-to-gltf/)
