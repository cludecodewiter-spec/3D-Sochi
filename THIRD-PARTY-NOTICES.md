# 第三方组件许可声明 / Third-Party Notices

本项目使用以下第三方组件(PM 审核 P0 项;分发前请随附本文件):

## 桌面版(AbatementTrainer.App / Core)
| 组件 | 版本 | 许可证 | 风险 |
|---|---|---|---|
| HelixToolkit.Wpf.SharpDX / HelixToolkit.SharpDX / .Assimp / .Maths | 3.1.2 | MIT | 低 |
| SharpDX.*(D3D11/DXGI 等) | 4.2.0 | MIT | 低(项目已停维,功能稳定) |
| SharpGLTF.Toolkit | 1.0.x | MIT | 低 |
| CommunityToolkit.Mvvm | 8.4.2 | MIT | 低 |
| Assimp 原生库(经 HelixToolkit.SharpDX.Assimp) | — | BSD-3-Clause | 低 |

## 内容生成(AbatementTrainer.Tools,仅开发侧使用、不随产品分发)
| 组件 | 版本 | 许可证 | 风险 |
|---|---|---|---|
| SixLabors.ImageSharp | 3.1.12 | **Six Labors Split License** | **中:年总收入超 100 万美元的商业组织使用需购买商业许可**。缓解:① Tools 仅内容生产用、不随 App 分发;② 如需彻底规避,可降级 2.1.x(Apache-2.0)或改用 SkiaSharp(MIT)——像素级 API 迁移量约半天 |

## 网页演示(docs/webdemo)
| 组件 | 版本 | 许可证 | 风险 |
|---|---|---|---|
| three.js(含 OrbitControls/GLTFLoader/RoomEnvironment) | 0.147.0 | MIT | 低 |

## 待办(P0,需产品负责人决定)
- [ ] 仓库尚无 LICENSE 文件:内部专有软件请添加公司专有许可声明;若对外分发需法务确认。
- [ ] 对外分发时在「关于」界面内置本声明。
