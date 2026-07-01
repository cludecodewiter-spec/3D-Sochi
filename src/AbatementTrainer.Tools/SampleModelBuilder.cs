using System;
using System.Numerics;
using SharpGLTF.Geometry;
using SharpGLTF.Geometry.VertexTypes;
using SharpGLTF.Materials;
using SharpGLTF.Scenes;
using VERTEX = SharpGLTF.Geometry.VertexTypes.VertexPositionNormal;

namespace AbatementTrainer.Tools;

/// <summary>
/// 生成用于演示/测试的 GLB:用圆柱(容器/滤芯/送风机)+ 管线(成段圆管)等
/// 更接近真实设备的几何,节点名与示例清单的 part.node 对应,可端到端跑通。
/// 材质采用 glTF PBR(金属/粗糙度),导入后 Helix 映射为 PBRMaterial。
/// </summary>
public static class SampleModelBuilder
{
    // 一个命名部件 = 一个 MeshBuilder(可由多段几何累加,如管线由多段圆管组成)
    private sealed class Part
    {
        public required string Node;
        public required Vector3 Center;
        public required MeshBuilder<VERTEX> Mesh;
    }

    private static MaterialBuilder Pbr(string name, float r, float g, float b, float metallic, float rough)
        // 双面渲染:程序生成的圆柱/管线绕序不保证完全一致,开双面可避免出现「透视」空洞
        // (对应 BUILD_SPEC §6 的三角面绕序提示);演示内容量小,性能可接受。
        => new MaterialBuilder(name)
            .WithDoubleSide(true)
            .WithMetallicRoughnessShader()
            .WithBaseColor(new Vector4(r, g, b, 1))
            .WithMetallicRoughness(metallic, rough);

    /// <summary>除害装置 A 型:立式圆筒容器 + 前面板 + 滤芯 + 送风机 + 进出口管线。</summary>
    public static void WriteUnitA(string path)
    {
        var parts = new System.Collections.Generic.List<Part>();

        // 主体外壳:立式圆筒容器(金属)
        var housing = NewMesh();
        AddCylinder(housing, Pbr("housing", 0.62f, 0.64f, 0.68f, 0.7f, 0.35f),
            Vector3.Zero, radius: 0.6f, halfLen: 0.8f, axis: 1);
        AddCylinder(housing, Pbr("housing_top", 0.62f, 0.64f, 0.68f, 0.7f, 0.35f),
            new Vector3(0, 0.8f, 0), radius: 0.62f, halfLen: 0.06f, axis: 1);
        parts.Add(new Part { Node = "housing", Center = Vector3.Zero, Mesh = housing });

        // 前面板:略带弧度的金属板(用扁圆柱近似)
        var panel = NewMesh();
        AddBox(panel, Pbr("front_panel", 0.30f, 0.50f, 0.80f, 0.3f, 0.5f),
            Vector3.Zero, new Vector3(0.9f, 1.2f, 0.06f));
        parts.Add(new Part { Node = "front_panel", Center = new Vector3(0, 0, 0.58f), Mesh = panel });

        // 滤芯:圆柱(陶瓷/塑料,低金属)
        var filter = NewMesh();
        AddCylinder(filter, Pbr("filter", 0.85f, 0.75f, 0.30f, 0.1f, 0.6f),
            Vector3.Zero, radius: 0.34f, halfLen: 0.30f, axis: 1);
        parts.Add(new Part { Node = "filter", Center = new Vector3(0, 0.2f, 0), Mesh = filter });

        // 送风机:横置电机圆柱(金属)
        var blower = NewMesh();
        AddCylinder(blower, Pbr("blower", 0.40f, 0.70f, 0.45f, 0.6f, 0.45f),
            Vector3.Zero, radius: 0.28f, halfLen: 0.30f, axis: 2);
        parts.Add(new Part { Node = "blower", Center = new Vector3(0, -0.55f, 0.35f), Mesh = blower });

        // 管线:进口竖管 + 顶部横管 + 出口管(多段圆管累加成一个部件)
        var pipe = NewMesh();
        var pipeMat = Pbr("piping", 0.75f, 0.78f, 0.82f, 0.95f, 0.30f);
        AddCylinder(pipe, pipeMat, new Vector3(0.65f, 0.30f, 0), radius: 0.08f, halfLen: 0.55f, axis: 1); // 进口竖管
        AddCylinder(pipe, pipeMat, new Vector3(0.35f, 0.86f, 0), radius: 0.08f, halfLen: 0.35f, axis: 0); // 顶部横管(接入容器顶)
        AddCylinder(pipe, pipeMat, new Vector3(0, -0.10f, 0.75f), radius: 0.08f, halfLen: 0.30f, axis: 2); // 出口管
        AddCylinder(pipe, pipeMat, new Vector3(0.65f, 0.86f, 0), radius: 0.11f, halfLen: 0.10f, axis: 1); // 弯头处法兰
        parts.Add(new Part { Node = "piping", Center = Vector3.Zero, Mesh = pipe });

        WriteParts(path, parts);
    }

    /// <summary>除害装置 B 型:立式塔(圆筒)+ 底座 + 顶盖 + 洗涤塔 + 排液阀。</summary>
    public static void WriteUnitB(string path)
    {
        var parts = new System.Collections.Generic.List<Part>();

        var baseMesh = NewMesh();
        AddCylinder(baseMesh, Pbr("base", 0.55f, 0.55f, 0.60f, 0.6f, 0.5f),
            Vector3.Zero, radius: 0.7f, halfLen: 0.15f, axis: 1);
        parts.Add(new Part { Node = "base", Center = new Vector3(0, -0.9f, 0), Mesh = baseMesh });

        var tower = NewMesh();
        AddCylinder(tower, Pbr("tower", 0.50f, 0.60f, 0.70f, 0.7f, 0.35f),
            Vector3.Zero, radius: 0.4f, halfLen: 0.85f, axis: 1);
        parts.Add(new Part { Node = "tower", Center = new Vector3(0, 0.1f, 0), Mesh = tower });

        var topCover = NewMesh();
        AddCylinder(topCover, Pbr("top_cover", 0.30f, 0.50f, 0.80f, 0.4f, 0.4f),
            Vector3.Zero, radius: 0.45f, halfLen: 0.07f, axis: 1);
        parts.Add(new Part { Node = "top_cover", Center = new Vector3(0, 0.98f, 0), Mesh = topCover });

        var scrubber = NewMesh();
        AddCylinder(scrubber, Pbr("scrubber", 0.85f, 0.60f, 0.30f, 0.4f, 0.5f),
            Vector3.Zero, radius: 0.22f, halfLen: 0.45f, axis: 1);
        // 洗涤塔进液管
        AddCylinder(scrubber, Pbr("scrubber_pipe", 0.75f, 0.78f, 0.82f, 0.95f, 0.3f),
            new Vector3(-0.3f, 0.2f, 0), radius: 0.06f, halfLen: 0.25f, axis: 0);
        parts.Add(new Part { Node = "scrubber", Center = new Vector3(0.5f, 0.2f, 0), Mesh = scrubber });

        var valve = NewMesh();
        AddCylinder(valve, Pbr("drain_valve", 0.80f, 0.30f, 0.30f, 0.9f, 0.3f),
            Vector3.Zero, radius: 0.10f, halfLen: 0.12f, axis: 2);
        parts.Add(new Part { Node = "drain_valve", Center = new Vector3(0, -0.65f, 0.45f), Mesh = valve });

        WriteParts(path, parts);
    }

    /// <summary>
    /// 除害装置 C 型(柜式):米色柜体外壳 + 立式管柱(含管件/阀门)+ 不锈钢容器 +
    /// 右侧控制面板(压力表 + 流量计 + 指示灯)。结构参照真实照片。
    /// </summary>
    public static void WriteUnitC(string path)
    {
        var parts = new System.Collections.Generic.List<Part>();
        var cream = (0.88f, 0.86f, 0.78f);
        var steel = (0.80f, 0.82f, 0.86f);

        // 柜体外壳:后背板 + 左右侧板 + 顶 + 底座 + 中间隔板(前面敞开可见内部)
        var cab = NewMesh();
        var cabMat = Pbr("cabinet", cream.Item1, cream.Item2, cream.Item3, 0.1f, 0.7f);
        AddBox(cab, cabMat, new Vector3(0, 0, -0.42f), new Vector3(1.30f, 2.10f, 0.04f)); // 背板
        AddBox(cab, cabMat, new Vector3(-0.65f, 0, 0), new Vector3(0.04f, 2.10f, 0.84f));  // 左侧板
        AddBox(cab, cabMat, new Vector3(0.65f, 0, 0), new Vector3(0.04f, 2.10f, 0.84f));   // 右侧板
        AddBox(cab, cabMat, new Vector3(0, 1.05f, 0), new Vector3(1.30f, 0.05f, 0.84f));   // 顶板
        AddBox(cab, cabMat, new Vector3(0, -1.02f, 0), new Vector3(1.30f, 0.10f, 0.84f));  // 底座
        AddBox(cab, cabMat, new Vector3(0.30f, 0, 0), new Vector3(0.03f, 2.10f, 0.84f));   // 中间隔板
        parts.Add(new Part { Node = "cabinet", Center = Vector3.Zero, Mesh = cab });

        // 立式管柱:细长竖管 + 数个管件(短粗环)+ 顶部横向支管
        var col = NewMesh();
        var pipeMat = Pbr("column", steel.Item1, steel.Item2, steel.Item3, 0.9f, 0.28f);
        AddCylinder(col, pipeMat, new Vector3(-0.15f, 0.25f, 0), radius: 0.045f, halfLen: 0.70f, axis: 1); // 主竖管
        foreach (var y in new[] { -0.35f, -0.05f, 0.35f, 0.70f })                                          // 管件
            AddCylinder(col, pipeMat, new Vector3(-0.15f, y, 0), radius: 0.075f, halfLen: 0.04f, axis: 1);
        AddCylinder(col, pipeMat, new Vector3(0.02f, 0.90f, 0), radius: 0.045f, halfLen: 0.20f, axis: 0);  // 顶部横支管
        parts.Add(new Part { Node = "column", Center = Vector3.Zero, Mesh = col });

        // 阀门(手轮):管柱上的红色圆盘 + 短轴
        var valve = NewMesh();
        var valveMat = Pbr("valve", 0.75f, 0.22f, 0.20f, 0.5f, 0.4f);
        AddCylinder(valve, valveMat, Vector3.Zero, radius: 0.11f, halfLen: 0.02f, axis: 0);   // 手轮盘
        AddCylinder(valve, valveMat, new Vector3(-0.08f, 0, 0), radius: 0.03f, halfLen: 0.08f, axis: 0); // 阀杆
        parts.Add(new Part { Node = "valve", Center = new Vector3(-0.02f, 0.05f, 0.10f), Mesh = valve });

        // 不锈钢容器:主圆筒 + 顶盖(短粗)+ 底部法兰
        var vessel = NewMesh();
        var vMat = Pbr("vessel", steel.Item1, steel.Item2, steel.Item3, 0.9f, 0.25f);
        AddCylinder(vessel, vMat, Vector3.Zero, radius: 0.26f, halfLen: 0.42f, axis: 1);
        AddCylinder(vessel, vMat, new Vector3(0, 0.42f, 0), radius: 0.28f, halfLen: 0.05f, axis: 1);
        AddCylinder(vessel, vMat, new Vector3(0, -0.44f, 0), radius: 0.30f, halfLen: 0.04f, axis: 1);
        parts.Add(new Part { Node = "vessel", Center = new Vector3(-0.15f, -0.45f, 0), Mesh = vessel });

        // 控制面板:右格米色面板
        var panel = NewMesh();
        AddBox(panel, Pbr("control_panel", 0.90f, 0.89f, 0.83f, 0.1f, 0.6f),
            Vector3.Zero, new Vector3(0.30f, 1.9f, 0.06f));
        parts.Add(new Part { Node = "control_panel", Center = new Vector3(0.48f, 0, 0.30f), Mesh = panel });

        // 压力表:白面圆盘 + 深色表框
        var gauge = NewMesh();
        AddCylinder(gauge, Pbr("gauge_rim", 0.25f, 0.25f, 0.28f, 0.6f, 0.4f),
            new Vector3(0, 0, -0.02f), radius: 0.10f, halfLen: 0.02f, axis: 2);
        AddCylinder(gauge, Pbr("gauge_face", 0.96f, 0.96f, 0.94f, 0.0f, 0.6f),
            new Vector3(0, 0, 0.01f), radius: 0.085f, halfLen: 0.012f, axis: 2);
        parts.Add(new Part { Node = "gauge", Center = new Vector3(0.48f, 0.62f, 0.34f), Mesh = gauge });

        // 流量计:竖向透明管(浅蓝)
        var flow = NewMesh();
        AddCylinder(flow, Pbr("flow_meter", 0.72f, 0.82f, 0.88f, 0.1f, 0.12f),
            Vector3.Zero, radius: 0.03f, halfLen: 0.22f, axis: 1);
        parts.Add(new Part { Node = "flow_meter", Center = new Vector3(0.48f, 0.15f, 0.34f), Mesh = flow });

        WriteParts(path, parts);
    }

    // ───────── 装配与导出 ─────────

    private static MeshBuilder<VERTEX> NewMesh() => new MeshBuilder<VERTEX>("part");

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

    // ───────── 几何 ─────────

    /// <summary>向网格累加一个圆柱(含两端封盖)。axis:0=X,1=Y,2=Z。</summary>
    private static void AddCylinder(MeshBuilder<VERTEX> mesh, MaterialBuilder mat,
        Vector3 center, float radius, float halfLen, int axis, int segments = 28)
    {
        var prim = mesh.UsePrimitive(mat);
        Vector3 Axis(float a, float b, float c) => axis switch
        {
            0 => new Vector3(c, a, b),   // 沿 X:长度在 X,环在 (Y,Z)
            2 => new Vector3(a, b, c),   // 沿 Z:长度在 Z,环在 (X,Y)
            _ => new Vector3(a, c, b),   // 沿 Y(默认):长度在 Y,环在 (X,Z)
        };

        for (int i = 0; i < segments; i++)
        {
            float t0 = (float)(2 * Math.PI * i / segments);
            float t1 = (float)(2 * Math.PI * (i + 1) / segments);
            var (c0, s0) = ((float)Math.Cos(t0), (float)Math.Sin(t0));
            var (c1, s1) = ((float)Math.Cos(t1), (float)Math.Sin(t1));

            // 侧面四点(下=-halfLen,上=+halfLen)
            var b0 = center + Axis(c0 * radius, s0 * radius, -halfLen);
            var b1 = center + Axis(c1 * radius, s1 * radius, -halfLen);
            var t0p = center + Axis(c0 * radius, s0 * radius, +halfLen);
            var t1p = center + Axis(c1 * radius, s1 * radius, +halfLen);
            var n0 = Vector3.Normalize(Axis(c0, s0, 0));
            var n1 = Vector3.Normalize(Axis(c1, s1, 0));

            prim.AddTriangle(new VERTEX(b0, n0), new VERTEX(b1, n1), new VERTEX(t1p, n1));
            prim.AddTriangle(new VERTEX(b0, n0), new VERTEX(t1p, n1), new VERTEX(t0p, n0));

            // 顶盖 / 底盖(三角扇)
            var capN = Vector3.Normalize(Axis(0, 0, 1));
            var topC = center + Axis(0, 0, +halfLen);
            prim.AddTriangle(new VERTEX(topC, capN), new VERTEX(t0p, capN), new VERTEX(t1p, capN));
            var botC = center + Axis(0, 0, -halfLen);
            prim.AddTriangle(new VERTEX(botC, -capN), new VERTEX(b1, -capN), new VERTEX(b0, -capN));
        }
    }

    /// <summary>向网格累加一个轴对齐盒子。</summary>
    private static void AddBox(MeshBuilder<VERTEX> mesh, MaterialBuilder mat, Vector3 center, Vector3 size)
    {
        var prim = mesh.UsePrimitive(mat);
        var h = size * 0.5f;
        Vector3 P(float sx, float sy, float sz) => center + new Vector3(sx * h.X, sy * h.Y, sz * h.Z);
        void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 n)
        {
            prim.AddTriangle(new VERTEX(a, n), new VERTEX(b, n), new VERTEX(c, n));
            prim.AddTriangle(new VERTEX(a, n), new VERTEX(c, n), new VERTEX(d, n));
        }
        Quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), new Vector3(0, 0, 1));
        Quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), new Vector3(0, 0, -1));
        Quad(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), new Vector3(1, 0, 0));
        Quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), new Vector3(-1, 0, 0));
        Quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), new Vector3(0, 1, 0));
        Quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), new Vector3(0, -1, 0));
    }
}
