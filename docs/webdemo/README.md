# docs/webdemo — 网页交互演示(unit-C)

本目录存放除害装置 3D 维护训练系统的网页 demo 产物(three.js 单文件 HTML),
由 `tools/webdemo/build_demo.py` 从 `content/unitC/`(manifest.json + unitC.glb)生成,
与桌面版(WPF + HelixToolkit)共用同一份清单数据契约。**请勿手工编辑这两个 HTML**,
需要改动时修改构建脚本后重新生成(构建方法见 `tools/webdemo/README.md`)。

## 两个文件的用途

| 文件 | 内容 | 适用场景 |
|---|---|---|
| `unitC-demo.html`(约 2.6 MB) | three.js r147 库 + GLB 模型(base64)+ 清单全部内嵌 | **完全离线**:U 盘/邮件分发,双击浏览器打开即可演示 |
| `unitC-web.html`(约 1.9 MB) | GLB 与清单内嵌,three.js 从 jsDelivr CDN 加载 | 挂网页/内网门户,减小文件体积;**需要能访问 CDN** |

两者页面功能完全一致:

- HMI 触摸屏(PLC 仿真):启动/停止/复位/急停(锁存,需复位解除)/进气阀;
  压力表针、流量浮子、信号灯、LED、手轮随 PLC 状态实时运转。
- 逐步维护教程:按清单 `procedure.steps` 顺序推进,每步必填安全确认
  不勾齐则「下一步」禁用(安全门语义,同桌面版 `CanAdvance`)。
- 全部件鼠标/触摸拖拽插拔(沿 `removeOffset` 轴,>60% 吸附到位,否则弹回)、
  分解视图/复原、部件高亮与显隐、中日双语即时切换。
- 免责横幅「训练辅助,实际作业以官方程序为准」常驻底部(冻结项,不可移除)。

## 部署

- 本地演示:直接双击 HTML 用现代浏览器(Chrome/Edge/Firefox/Safari)打开,
  需 WebGL 支持;无需任何服务器。
- 静态托管:整文件放到任意静态服务器(nginx / GitHub Pages / 内网文件共享)即可;
  无后端、无外部资源依赖(`unitC-web.html` 除 three.js CDN 外亦无其他请求)。
- 内容更新:修改 `content/unitC/` 下的清单或模型后,重新运行构建脚本覆盖本目录产物。

## 已知裁剪

demo 定位为演示训练主循环:仅 unitC 单设备,无考核模式与设备库;
拖拽插拔暂未与步骤安全门联动(详见 UX 设计书差异表 #2、#20)。
