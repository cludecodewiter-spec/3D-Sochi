using System;
using System.Numerics;
using SharpGLTF.Geometry;
using SharpGLTF.Geometry.VertexTypes;
using SharpGLTF.Materials;
using SharpGLTF.Scenes;
using MESH = SharpGLTF.Geometry.MeshBuilder<
    SharpGLTF.Geometry.VertexTypes.VertexPositionNormal,
    SharpGLTF.Geometry.VertexTypes.VertexTexture1>;
using VERTEX = SharpGLTF.Geometry.VertexBuilder<
    SharpGLTF.Geometry.VertexTypes.VertexPositionNormal,
    SharpGLTF.Geometry.VertexTypes.VertexTexture1,
    SharpGLTF.Geometry.VertexTypes.VertexEmpty>;

namespace AbatementTrainer.Tools;

/// <summary>
/// 生成用于演示/测试的 GLB(真实向 v2):
/// - 全部几何带 UV,材质支持程序化纹理(拉丝钢/漆面/表盘/警示纹/混凝土);
/// - 弯头用圆环段(不再是直管对接),螺栓为六角(平面法线);
/// - unit-C 含地面环境节点(非部件,始终可见)。
/// 节点名与清单 part.node 一一对应,可端到端跑通。
/// </summary>
public static class SampleModelBuilder
{
    // 一个命名部件 = 一个 MESH(可由多段几何累加)
    private sealed class Part
    {
        public required string Node;
        public required Vector3 Center;
        public required MESH Mesh;
    }

    // ───────── 材质 ─────────

    private static MaterialBuilder Pbr(string name, float r, float g, float b, float metallic, float rough)
        => new MaterialBuilder(name)
            .WithDoubleSide(true)
            .WithMetallicRoughnessShader()
            .WithBaseColor(new Vector4(r, g, b, 1))
            .WithMetallicRoughness(metallic, rough);

    /// <summary>带贴图的 PBR 材质。</summary>
    private static MaterialBuilder Tex(string name, string png, float metallic, float rough)
        => new MaterialBuilder(name)
            .WithDoubleSide(true)
            .WithMetallicRoughnessShader()
            .WithChannelImage(KnownChannel.BaseColor, png)
            .WithMetallicRoughness(metallic, rough);

    /// <summary>发光材质(指示灯)。</summary>
    private static MaterialBuilder Glow(string name, float r, float g, float b)
        => new MaterialBuilder(name)
            .WithMetallicRoughnessShader()
            .WithBaseColor(new Vector4(r, g, b, 1))
            .WithMetallicRoughness(0.1f, 0.4f)
            .WithEmissive(new Vector3(r, g, b) * 2.5f);

    // ───────── 设备 A / B(沿用 v1 造型,几何自动获得 UV)─────────

    /// <summary>除害装置 A 型:卧式圆筒容器 + 前面板 + 滤芯 + 送风机 + 进出口管线。</summary>
    public static void WriteUnitA(string path)
    {
        var steel = Tex("steel", ProceduralTextures.BrushedSteel(), 0.85f, 0.35f);
        var parts = new System.Collections.Generic.List<Part>();

        var housing = new MESH("housing");
        AddCylinder(housing, steel, Vector3.Zero, 0.6f, 0.8f, 1);
        AddCylinder(housing, steel, new Vector3(0, 0.8f, 0), 0.62f, 0.06f, 1);
        parts.Add(new Part { Node = "housing", Center = Vector3.Zero, Mesh = housing });

        var panel = new MESH("front_panel");
        AddBox(panel, Pbr("front_panel", 0.30f, 0.50f, 0.80f, 0.3f, 0.5f), Vector3.Zero, new Vector3(0.9f, 1.2f, 0.06f));
        parts.Add(new Part { Node = "front_panel", Center = new Vector3(0, 0, 0.58f), Mesh = panel });

        var filter = new MESH("filter");
        AddCylinder(filter, Pbr("filter", 0.85f, 0.75f, 0.30f, 0.1f, 0.6f), Vector3.Zero, 0.34f, 0.30f, 1);
        parts.Add(new Part { Node = "filter", Center = new Vector3(0, 0.2f, 0), Mesh = filter });

        var blower = new MESH("blower");
        AddCylinder(blower, Pbr("blower", 0.40f, 0.70f, 0.45f, 0.6f, 0.45f), Vector3.Zero, 0.28f, 0.30f, 2);
        parts.Add(new Part { Node = "blower", Center = new Vector3(0, -0.55f, 0.35f), Mesh = blower });

        var pipe = new MESH("piping");
        AddCylinder(pipe, steel, new Vector3(0.65f, 0.30f, 0), 0.08f, 0.55f, 1);
        AddCylinder(pipe, steel, new Vector3(0.35f, 0.86f, 0), 0.08f, 0.35f, 0);
        AddCylinder(pipe, steel, new Vector3(0, -0.10f, 0.75f), 0.08f, 0.30f, 2);
        AddCylinder(pipe, steel, new Vector3(0.65f, 0.86f, 0), 0.11f, 0.10f, 1);
        parts.Add(new Part { Node = "piping", Center = Vector3.Zero, Mesh = pipe });

        WriteParts(path, parts);
    }

    /// <summary>除害装置 B 型:立式塔 + 底座 + 顶盖 + 洗涤塔 + 排液阀。</summary>
    public static void WriteUnitB(string path)
    {
        var steel = Tex("steel", ProceduralTextures.BrushedSteel(), 0.85f, 0.35f);
        var parts = new System.Collections.Generic.List<Part>();

        var baseMesh = new MESH("base");
        AddCylinder(baseMesh, Pbr("base", 0.55f, 0.55f, 0.60f, 0.6f, 0.5f), Vector3.Zero, 0.7f, 0.15f, 1);
        parts.Add(new Part { Node = "base", Center = new Vector3(0, -0.9f, 0), Mesh = baseMesh });

        var tower = new MESH("tower");
        AddCylinder(tower, steel, Vector3.Zero, 0.4f, 0.85f, 1);
        parts.Add(new Part { Node = "tower", Center = new Vector3(0, 0.1f, 0), Mesh = tower });

        var topCover = new MESH("top_cover");
        AddCylinder(topCover, Pbr("top_cover", 0.30f, 0.50f, 0.80f, 0.4f, 0.4f), Vector3.Zero, 0.45f, 0.07f, 1);
        parts.Add(new Part { Node = "top_cover", Center = new Vector3(0, 0.98f, 0), Mesh = topCover });

        var scrubber = new MESH("scrubber");
        AddCylinder(scrubber, Pbr("scrubber", 0.85f, 0.60f, 0.30f, 0.4f, 0.5f), Vector3.Zero, 0.22f, 0.45f, 1);
        AddCylinder(scrubber, steel, new Vector3(-0.3f, 0.2f, 0), 0.06f, 0.25f, 0);
        parts.Add(new Part { Node = "scrubber", Center = new Vector3(0.5f, 0.2f, 0), Mesh = scrubber });

        var valve = new MESH("drain_valve");
        AddCylinder(valve, Pbr("drain_valve", 0.80f, 0.30f, 0.30f, 0.9f, 0.3f), Vector3.Zero, 0.10f, 0.12f, 2);
        parts.Add(new Part { Node = "drain_valve", Center = new Vector3(0, -0.65f, 0.45f), Mesh = valve });

        WriteParts(path, parts);
    }

    // ───────── 设备 C(柜式 · 真实向 v2)─────────

    /// <summary>
    /// 除害装置 C 型(柜式,真实向):烤漆柜体(警示条纹/通风百叶/顶部信号灯/支脚)+
    /// 拉丝钢容器与管线(弯头/焊缝环/六角螺栓法兰)+ 阀门(轮辐手轮)+
    /// 控制面板(刻度表盘/指示灯/按钮)+ 混凝土地面环境节点。
    /// 节点名与 v1 完全一致(清单无需改动)。
    /// </summary>
    public static void WriteUnitC(string path)
    {
        // 纹理(生成一次,GLB 内嵌)
        var texSteel = ProceduralTextures.BrushedSteel();
        var texPaint = ProceduralTextures.CreamPaint();
        var texDial = ProceduralTextures.GaugeDial();
        var texHazard = ProceduralTextures.Hazard();
        var texFloor = ProceduralTextures.ConcreteFloor();

        var steel = Tex("steel", texSteel, 0.9f, 0.3f);
        var steelDark = Pbr("steel_dark", 0.42f, 0.44f, 0.48f, 0.85f, 0.45f); // 焊缝/垫圈
        var paint = Tex("cream_paint", texPaint, 0.05f, 0.55f);
        var boltMat = Pbr("bolt", 0.35f, 0.36f, 0.40f, 0.9f, 0.45f);
        var dark = Pbr("dark_plastic", 0.12f, 0.13f, 0.15f, 0.2f, 0.6f);
        var red = Pbr("red_paint", 0.72f, 0.16f, 0.14f, 0.35f, 0.45f);

        var parts = new System.Collections.Generic.List<Part>();
        var vx = -0.15f; // 容器/管线所在 X

        // ── 柜体外壳 ──
        var cab = new MESH("cabinet");
        AddBox(cab, paint, new Vector3(0, 0, -0.42f), new Vector3(1.30f, 2.10f, 0.04f)); // 背板
        AddBox(cab, paint, new Vector3(-0.65f, 0, 0), new Vector3(0.04f, 2.10f, 0.84f));  // 左侧板
        AddBox(cab, paint, new Vector3(0.65f, 0, 0), new Vector3(0.04f, 2.10f, 0.84f));   // 右侧板
        AddBox(cab, paint, new Vector3(0, 1.05f, 0), new Vector3(1.30f, 0.05f, 0.84f));   // 顶板
        AddBox(cab, paint, new Vector3(0, -1.02f, 0), new Vector3(1.30f, 0.10f, 0.84f));  // 底座
        AddBox(cab, paint, new Vector3(0.30f, 0, 0), new Vector3(0.03f, 2.10f, 0.84f));   // 中间隔板
        // 门框沿口(前开口上/下/左三条)
        AddBox(cab, paint, new Vector3(-0.17f, 1.0f, 0.415f), new Vector3(0.93f, 0.06f, 0.03f));
        AddBox(cab, paint, new Vector3(-0.17f, -0.94f, 0.415f), new Vector3(0.93f, 0.06f, 0.03f));
        AddBox(cab, paint, new Vector3(-0.635f, 0, 0.415f), new Vector3(0.05f, 2.0f, 0.03f));
        // 警示条纹带(底座前沿)
        AddBox(cab, Tex("hazard", texHazard, 0.05f, 0.7f), new Vector3(0, -1.02f, 0.427f), new Vector3(1.28f, 0.085f, 0.012f));
        // 支脚 ×4
        foreach (var (fx, fz) in new[] { (-0.55f, 0.32f), (0.55f, 0.32f), (-0.55f, -0.32f), (0.55f, -0.32f) })
            AddCylinder(cab, dark, new Vector3(fx, -1.09f, fz), 0.035f, 0.022f, 1, 12);
        // 顶部信号灯(座 + 红色发光罩)
        AddCylinder(cab, dark, new Vector3(0.45f, 1.095f, 0.15f), 0.032f, 0.02f, 1, 12);
        AddCylinder(cab, Glow("beacon", 0.95f, 0.18f, 0.12f), new Vector3(0.45f, 1.145f, 0.15f), 0.028f, 0.032f, 1, 12);
        parts.Add(new Part { Node = "cabinet", Center = Vector3.Zero, Mesh = cab });

        // ── 不锈钢容器(筒身 + 底法兰 + 焊缝环 + 铭牌)──
        var vessel = new MESH("vessel");
        AddCylinder(vessel, steel, Vector3.Zero, 0.26f, 0.40f, 1);
        AddCylinder(vessel, steelDark, new Vector3(0, 0.16f, 0), 0.262f, 0.008f, 1); // 焊缝环
        AddCylinder(vessel, steelDark, new Vector3(0, -0.18f, 0), 0.262f, 0.008f, 1);
        AddFlange(vessel, steel, boltMat, new Vector3(0, -0.42f, 0), 0.30f, 1, 8, 0.24f);
        AddBox(vessel, dark, new Vector3(0, 0.02f, 0.262f), new Vector3(0.14f, 0.09f, 0.006f)); // 铭牌
        parts.Add(new Part { Node = "vessel", Center = new Vector3(vx, -0.45f, 0), Mesh = vessel });

        // ── 容器顶盖 ──
        var lid = new MESH("vessel_lid");
        AddCylinder(lid, steel, Vector3.Zero, 0.27f, 0.05f, 1);
        AddFlange(lid, steel, boltMat, new Vector3(0, 0.05f, 0), 0.30f, 1, 8, 0.24f);
        parts.Add(new Part { Node = "vessel_lid", Center = new Vector3(vx, 0.02f, 0), Mesh = lid });

        // ── 立管(直管 + 顶部 90° 弯头 + 上下法兰 + 焊缝)──
        var riser = new MESH("riser_pipe");
        AddCylinder(riser, steel, new Vector3(0, -0.07f, 0), 0.045f, 0.27f, 1, 20);
        AddCylinder(riser, steelDark, new Vector3(0, 0.05f, 0), 0.047f, 0.007f, 1, 20); // 焊缝
        AddFlange(riser, steel, boltMat, new Vector3(0, -0.34f, 0), 0.09f, 1, 4, 0.062f);
        // 弯头:从 +Y 转向 +X(圆环段,环心 (0.10,0.20,0),XY 平面,90°~180°)
        AddTorus(riser, steel, new Vector3(0.10f, 0.20f, 0), Vector3.UnitX, Vector3.UnitY,
            ringR: 0.10f, tubeR: 0.045f, startDeg: 90f, sweepDeg: 90f);
        parts.Add(new Part { Node = "riser_pipe", Center = new Vector3(vx, 0.44f, 0), Mesh = riser });

        // ── 横管(接弯头出口,+X 方向,活接环 + 端法兰)──
        var cross = new MESH("cross_pipe");
        AddCylinder(cross, steel, Vector3.Zero, 0.045f, 0.26f, 0, 20);
        AddCylinder(cross, steelDark, new Vector3(-0.10f, 0, 0), 0.055f, 0.018f, 0, 20); // 活接
        AddFlange(cross, steel, boltMat, new Vector3(0.26f, 0, 0), 0.09f, 0, 4, 0.062f);
        parts.Add(new Part { Node = "cross_pipe", Center = new Vector3(vx + 0.36f, 0.74f, 0), Mesh = cross });

        // ── 出口管(+Z,端法兰六角螺栓)──
        var outlet = new MESH("outlet_pipe");
        AddCylinder(outlet, steel, Vector3.Zero, 0.05f, 0.24f, 2, 20);
        AddFlange(outlet, steel, boltMat, new Vector3(0, 0, 0.24f), 0.10f, 2, 6, 0.072f);
        parts.Add(new Part { Node = "outlet_pipe", Center = new Vector3(vx + 0.22f, -0.45f, 0.30f), Mesh = outlet });

        // ── 排液管(带红色阀体 + 法兰)──
        var drain = new MESH("drain_pipe");
        AddCylinder(drain, steel, Vector3.Zero, 0.035f, 0.18f, 2, 16);
        AddCylinder(drain, red, new Vector3(0, 0, 0.10f), 0.05f, 0.035f, 2, 16);
        AddFlange(drain, steel, boltMat, new Vector3(0, 0, 0.18f), 0.07f, 2, 4, 0.047f);
        parts.Add(new Part { Node = "drain_pipe", Center = new Vector3(vx, -0.80f, 0.28f), Mesh = drain });

        // ── 进气阀(阀体 + 阀盖 + 阀杆 + 轮辐手轮)──
        var valve = new MESH("valve");
        AddCylinder(valve, steel, Vector3.Zero, 0.058f, 0.055f, 2, 16);                 // 阀体
        AddCylinder(valve, steelDark, new Vector3(0, 0, 0.06f), 0.034f, 0.03f, 2, 12);  // 阀盖
        AddCylinder(valve, steelDark, new Vector3(0, 0, 0.10f), 0.012f, 0.035f, 2, 8);  // 阀杆
        // 手轮:红色圆环 + 十字辐条 + 轴帽
        AddTorus(valve, red, new Vector3(0, 0, 0.135f), Vector3.UnitX, Vector3.UnitY,
            ringR: 0.085f, tubeR: 0.013f, startDeg: 0f, sweepDeg: 360f);
        AddCylinder(valve, red, new Vector3(0, 0, 0.135f), 0.008f, 0.082f, 0, 8);
        AddCylinder(valve, red, new Vector3(0, 0, 0.135f), 0.008f, 0.082f, 1, 8);
        AddCylinder(valve, red, new Vector3(0, 0, 0.135f), 0.02f, 0.012f, 2, 12);
        parts.Add(new Part { Node = "valve", Center = new Vector3(vx, 0.40f, 0.07f), Mesh = valve });

        // ── 控制面板(漆面 + 表盘下方按钮/指示灯 + 通风百叶)──
        var panel = new MESH("control_panel");
        AddBox(panel, paint, Vector3.Zero, new Vector3(0.30f, 1.9f, 0.06f));
        // 指示灯 ×3(绿/橙/红,发光)
        AddCylinder(panel, Glow("led_g", 0.20f, 0.85f, 0.30f), new Vector3(-0.08f, 0.40f, 0.036f), 0.013f, 0.010f, 2, 10);
        AddCylinder(panel, Glow("led_a", 0.95f, 0.65f, 0.15f), new Vector3(0f, 0.40f, 0.036f), 0.013f, 0.010f, 2, 10);
        AddCylinder(panel, Glow("led_r", 0.95f, 0.20f, 0.15f), new Vector3(0.08f, 0.40f, 0.036f), 0.013f, 0.010f, 2, 10);
        // 按钮 ×2(暗色圈座 + 彩色帽)
        foreach (var (bx, col) in new[] { (-0.06f, red), (0.06f, Pbr("btn_g", 0.20f, 0.60f, 0.30f, 0.3f, 0.5f)) })
        {
            AddCylinder(panel, dark, new Vector3(bx, 0.30f, 0.034f), 0.024f, 0.008f, 2, 12);
            AddCylinder(panel, col, new Vector3(bx, 0.30f, 0.044f), 0.015f, 0.008f, 2, 12);
        }
        // 通风百叶 ×6(下部)
        for (int i = 0; i < 6; i++)
            AddBox(panel, dark, new Vector3(0, -0.62f - i * 0.045f, 0.033f), new Vector3(0.20f, 0.014f, 0.008f));
        parts.Add(new Part { Node = "control_panel", Center = new Vector3(0.48f, 0, 0.30f), Mesh = panel });

        // ── 压力表(黑框 + 刻度表盘贴图 + 可旋转指针)──
        var gauge = new MESH("gauge");
        AddCylinder(gauge, dark, new Vector3(0, 0, -0.01f), 0.10f, 0.022f, 2, 24);       // 表框
        AddCylinder(gauge, Tex("dial", texDial, 0.0f, 0.5f), new Vector3(0, 0, 0.016f), 0.088f, 0.004f, 2, 24); // 表盘
        // 指针:独立材质 "needle" → 导入后成为独立子网格,可绕表盘中心(节点原点)旋转指示压力。
        // 静止时沿 +X;运行时由 HMI 按压力值旋转(0 kPa=225°,满量程=-45°)。
        AddBox(gauge, Pbr("needle", 0.10f, 0.10f, 0.12f, 0.2f, 0.5f),
            new Vector3(0.032f, 0, 0.024f), new Vector3(0.064f, 0.006f, 0.004f));
        parts.Add(new Part { Node = "gauge", Center = new Vector3(0.48f, 0.62f, 0.34f), Mesh = gauge });

        // ── 流量计(亚克力管 + 上下钢接头 + 红色浮子)──
        var flow = new MESH("flow_meter");
        AddCylinder(flow, Pbr("acrylic", 0.80f, 0.88f, 0.92f, 0.05f, 0.10f), Vector3.Zero, 0.028f, 0.20f, 1, 16);
        AddCylinder(flow, steel, new Vector3(0, 0.215f, 0), 0.036f, 0.022f, 1, 12);
        AddCylinder(flow, steel, new Vector3(0, -0.215f, 0), 0.036f, 0.022f, 1, 12);
        AddCylinder(flow, red, new Vector3(0, -0.05f, 0), 0.021f, 0.018f, 1, 12);
        parts.Add(new Part { Node = "flow_meter", Center = new Vector3(0.48f, 0.15f, 0.34f), Mesh = flow });

        // ── 传感器探头 ×2(带电缆接头)──
        var sensor = new MESH("sensor");
        foreach (var sy in new[] { 0.15f, -0.15f })
        {
            AddCylinder(sensor, dark, new Vector3(0, sy, 0), 0.03f, 0.10f, 2, 12);
            AddBox(sensor, dark, new Vector3(0, sy, 0.12f), new Vector3(0.06f, 0.06f, 0.05f));
            AddCylinder(sensor, steelDark, new Vector3(0, sy, 0.155f), 0.012f, 0.012f, 2, 8); // 电缆格兰
        }
        parts.Add(new Part { Node = "sensor", Center = new Vector3(vx - 0.24f, -0.45f, 0.10f), Mesh = sensor });

        // ── 电气线路(多色线束 + 线槽)──
        var wire = new MESH("wiring");
        void Cable(float r, float g, float b, params (Vector3 ctr, float half, int ax)[] segs)
        {
            var m = Pbr($"cable_{r}_{g}", r, g, b, 0.0f, 0.6f);
            foreach (var s in segs) AddCylinder(wire, m, s.ctr, 0.012f, s.half, s.ax, 8);
        }
        Cable(0.85f, 0.20f, 0.18f, (new Vector3(0.08f, 0.55f, 0.33f), 0.24f, 0), (new Vector3(-0.15f, 0.50f, 0.33f), 0.06f, 1));
        Cable(0.20f, 0.40f, 0.80f, (new Vector3(0.08f, 0.50f, 0.31f), 0.24f, 0), (new Vector3(-0.38f, 0.20f, 0.31f), 0.32f, 1));
        Cable(0.90f, 0.80f, 0.20f, (new Vector3(0.08f, 0.45f, 0.35f), 0.24f, 0), (new Vector3(-0.15f, 0.30f, 0.35f), 0.18f, 1));
        Cable(0.25f, 0.65f, 0.35f, (new Vector3(0.14f, 0.60f, 0.29f), 0.05f, 0), (new Vector3(0.20f, 0.35f, 0.29f), 0.28f, 1));
        AddCylinder(wire, Pbr("conduit", 0.5f, 0.5f, 0.52f, 0.3f, 0.6f), new Vector3(-0.55f, 0.1f, -0.30f), 0.03f, 0.8f, 1, 12);
        parts.Add(new Part { Node = "wiring", Center = Vector3.Zero, Mesh = wire });

        // ── 环境:混凝土地面(非部件节点,App 中始终可见)──
        var env = new MESH("environment");
        AddBox(env, Tex("floor", texFloor, 0.02f, 0.85f), Vector3.Zero, new Vector3(3.4f, 0.04f, 2.8f));
        parts.Add(new Part { Node = "environment", Center = new Vector3(0, -1.135f, 0.1f), Mesh = env });

        WriteParts(path, parts);
    }

    // ───────── 装配与导出 ─────────

    private static void WriteParts(string path, System.Collections.Generic.List<Part> parts)
    {
        var scene = new SceneBuilder();
        foreach (var p in parts)
        {
            var node = new NodeBuilder(p.Node) { LocalTransform = Matrix4x4.CreateTranslation(p.Center) };
            scene.AddRigidMesh(p.Mesh, node);
        }
        scene.ToGltf2().SaveGLB(path);
    }

    // ───────── 几何(全部带 UV)─────────

    private static VERTEX V(Vector3 p, Vector3 n, float u, float v)
        => new VERTEX(new VertexPositionNormal(p, n), new VertexTexture1(new Vector2(u, v)));

    /// <summary>
    /// 圆柱(含两端封盖)。axis:0=X,1=Y,2=Z。
    /// 侧面 UV:(周向, 轴向);封盖 UV:圆盘映射(表盘贴图用)。
    /// segments ≤ 8 时用平面法线(六角螺栓等硬边件)。
    /// </summary>
    private static void AddCylinder(MESH mesh, MaterialBuilder mat,
        Vector3 center, float radius, float halfLen, int axis, int segments = 28)
    {
        var prim = mesh.UsePrimitive(mat);
        bool flat = segments <= 8;
        Vector3 Axis(float a, float b, float c) => axis switch
        {
            0 => new Vector3(c, a, b),
            2 => new Vector3(a, b, c),
            _ => new Vector3(a, c, b),
        };

        for (int i = 0; i < segments; i++)
        {
            float t0 = (float)(2 * Math.PI * i / segments);
            float t1 = (float)(2 * Math.PI * (i + 1) / segments);
            var (c0, s0) = ((float)Math.Cos(t0), (float)Math.Sin(t0));
            var (c1, s1) = ((float)Math.Cos(t1), (float)Math.Sin(t1));
            float u0 = (float)i / segments, u1 = (float)(i + 1) / segments;

            var b0 = center + Axis(c0 * radius, s0 * radius, -halfLen);
            var b1 = center + Axis(c1 * radius, s1 * radius, -halfLen);
            var t0p = center + Axis(c0 * radius, s0 * radius, +halfLen);
            var t1p = center + Axis(c1 * radius, s1 * radius, +halfLen);

            Vector3 n0, n1;
            if (flat)
            {
                // 平面法线:取扇区中线方向(硬边效果)
                var mid = Vector3.Normalize(Axis((c0 + c1) / 2, (s0 + s1) / 2, 0));
                n0 = n1 = mid;
            }
            else
            {
                n0 = Vector3.Normalize(Axis(c0, s0, 0));
                n1 = Vector3.Normalize(Axis(c1, s1, 0));
            }

            prim.AddTriangle(V(b0, n0, u0, 0), V(b1, n1, u1, 0), V(t1p, n1, u1, 1));
            prim.AddTriangle(V(b0, n0, u0, 0), V(t1p, n1, u1, 1), V(t0p, n0, u0, 1));

            // 封盖(圆盘 UV:贴图中心对准轴心)
            var capN = Vector3.Normalize(Axis(0, 0, 1));
            var topC = center + Axis(0, 0, +halfLen);
            prim.AddTriangle(
                V(topC, capN, 0.5f, 0.5f),
                V(t0p, capN, 0.5f + c0 * 0.5f, 0.5f - s0 * 0.5f),
                V(t1p, capN, 0.5f + c1 * 0.5f, 0.5f - s1 * 0.5f));
            var botC = center + Axis(0, 0, -halfLen);
            prim.AddTriangle(
                V(botC, -capN, 0.5f, 0.5f),
                V(b1, -capN, 0.5f + c1 * 0.5f, 0.5f + s1 * 0.5f),
                V(b0, -capN, 0.5f + c0 * 0.5f, 0.5f + s0 * 0.5f));
        }
    }

    /// <summary>轴对齐盒子(每面 UV 0..1)。</summary>
    private static void AddBox(MESH mesh, MaterialBuilder mat, Vector3 center, Vector3 size)
    {
        var prim = mesh.UsePrimitive(mat);
        var h = size * 0.5f;
        Vector3 P(float sx, float sy, float sz) => center + new Vector3(sx * h.X, sy * h.Y, sz * h.Z);
        void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 n)
        {
            prim.AddTriangle(V(a, n, 0, 1), V(b, n, 1, 1), V(c, n, 1, 0));
            prim.AddTriangle(V(a, n, 0, 1), V(c, n, 1, 0), V(d, n, 0, 0));
        }
        Quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), new Vector3(0, 0, 1));
        Quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), new Vector3(0, 0, -1));
        Quad(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), new Vector3(1, 0, 0));
        Quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), new Vector3(-1, 0, 0));
        Quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), new Vector3(0, 1, 0));
        Quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), new Vector3(0, -1, 0));
    }

    /// <summary>
    /// 圆环段(弯头/手轮)。环面位于 (ex,ey) 平面,ez=ex×ey。
    /// startDeg/sweepDeg 为环向角度;sweep=90 即 90° 弯头,360 即整环。
    /// </summary>
    private static void AddTorus(MESH mesh, MaterialBuilder mat,
        Vector3 center, Vector3 ex, Vector3 ey,
        float ringR, float tubeR, float startDeg, float sweepDeg,
        int ringSegs = 16, int tubeSegs = 14)
    {
        var prim = mesh.UsePrimitive(mat);
        var ez = Vector3.Normalize(Vector3.Cross(ex, ey));
        float a0 = startDeg * MathF.PI / 180f, sw = sweepDeg * MathF.PI / 180f;

        Vector3 Pt(float th, float ph, out Vector3 n)
        {
            var radial = MathF.Cos(th) * ex + MathF.Sin(th) * ey;   // 环向径向
            n = MathF.Cos(ph) * radial + MathF.Sin(ph) * ez;         // 管面法线
            return center + radial * ringR + n * tubeR;
        }

        for (int i = 0; i < ringSegs; i++)
        {
            float th0 = a0 + sw * i / ringSegs, th1 = a0 + sw * (i + 1) / ringSegs;
            for (int j = 0; j < tubeSegs; j++)
            {
                float ph0 = 2 * MathF.PI * j / tubeSegs, ph1 = 2 * MathF.PI * (j + 1) / tubeSegs;
                var pa = Pt(th0, ph0, out var na); var pb = Pt(th1, ph0, out var nb);
                var pc = Pt(th1, ph1, out var nc); var pd = Pt(th0, ph1, out var nd);
                float u0 = (float)i / ringSegs, u1 = (float)(i + 1) / ringSegs;
                float v0 = (float)j / tubeSegs, v1 = (float)(j + 1) / tubeSegs;
                prim.AddTriangle(V(pa, na, u0, v0), V(pb, nb, u1, v0), V(pc, nc, u1, v1));
                prim.AddTriangle(V(pa, na, u0, v0), V(pc, nc, u1, v1), V(pd, nd, u0, v1));
            }
        }
    }

    /// <summary>法兰:短粗圆盘 + 一圈六角螺栓(平面法线硬边)。axis 为法兰面法向轴。</summary>
    private static void AddFlange(MESH mesh, MaterialBuilder disc, MaterialBuilder bolt,
        Vector3 center, float discR, int axis, int boltCount, float boltRingR)
    {
        AddCylinder(mesh, disc, center, discR, 0.022f, axis);
        for (int i = 0; i < boltCount; i++)
        {
            float a = (float)(2 * Math.PI * i / boltCount);
            var off = PlaneOffset(axis, (float)Math.Cos(a) * boltRingR, (float)Math.Sin(a) * boltRingR);
            AddCylinder(mesh, bolt, center + off, 0.013f, 0.030f, axis, 6); // 六角
        }
    }

    /// <summary>在垂直于 axis 的平面内构造偏移向量。</summary>
    private static Vector3 PlaneOffset(int axis, float a, float b) => axis switch
    {
        0 => new Vector3(0, a, b),
        2 => new Vector3(a, b, 0),
        _ => new Vector3(a, 0, b),
    };
}
