using System.Numerics;
using SharpGLTF.Geometry;
using SharpGLTF.Geometry.VertexTypes;
using SharpGLTF.Materials;
using SharpGLTF.Scenes;
using VERTEX = SharpGLTF.Geometry.VertexTypes.VertexPositionNormal;

namespace AbatementTrainer.Tools;

/// <summary>
/// 生成一个用于演示/测试的 GLB:若干带名字的彩色盒子,
/// 节点名与示例清单的 part.node 对应,方便端到端跑通。
/// </summary>
public static class SampleModelBuilder
{
    private record BoxSpec(string Node, Vector3 Center, Vector3 Size, Vector4 Color);

    /// <summary>写出与示例清单 abatement-unit-A 匹配的演示 GLB。</summary>
    public static void WriteUnitA(string path)
    {
        var boxes = new[]
        {
            new BoxSpec("housing",      new Vector3(0, 0, 0),     new Vector3(1.2f, 1.6f, 0.8f), new Vector4(0.6f, 0.6f, 0.65f, 1)),
            new BoxSpec("front_panel",  new Vector3(0, 0, 0.42f), new Vector3(1.1f, 1.5f, 0.05f), new Vector4(0.3f, 0.5f, 0.8f, 1)),
            new BoxSpec("filter",       new Vector3(0, 0.2f, 0),  new Vector3(0.7f, 0.7f, 0.5f), new Vector4(0.85f, 0.75f, 0.3f, 1)),
            new BoxSpec("blower",       new Vector3(0, -0.55f, 0),new Vector3(0.6f, 0.4f, 0.5f), new Vector4(0.4f, 0.7f, 0.45f, 1)),
        };

        WriteBoxes(path, boxes);
    }

    /// <summary>写出与示例清单 abatement-unit-B 匹配的演示 GLB(立式塔结构)。</summary>
    public static void WriteUnitB(string path)
    {
        var boxes = new[]
        {
            new BoxSpec("base",         new Vector3(0, -0.9f, 0), new Vector3(1.0f, 0.3f, 1.0f), new Vector4(0.55f, 0.55f, 0.6f, 1)),
            new BoxSpec("tower",        new Vector3(0, 0.1f, 0),  new Vector3(0.6f, 1.6f, 0.6f), new Vector4(0.5f, 0.6f, 0.7f, 1)),
            new BoxSpec("top_cover",    new Vector3(0, 0.95f, 0), new Vector3(0.7f, 0.12f, 0.7f), new Vector4(0.3f, 0.5f, 0.8f, 1)),
            new BoxSpec("scrubber",     new Vector3(0.5f, 0.2f, 0), new Vector3(0.4f, 0.9f, 0.4f), new Vector4(0.85f, 0.6f, 0.3f, 1)),
            new BoxSpec("drain_valve",  new Vector3(0, -0.65f, 0.45f), new Vector3(0.2f, 0.2f, 0.2f), new Vector4(0.8f, 0.3f, 0.3f, 1)),
        };
        WriteBoxes(path, boxes);
    }

    private static void WriteBoxes(string path, BoxSpec[] boxes)
    {
        var scene = new SceneBuilder();
        foreach (var b in boxes)
        {
            var material = new MaterialBuilder(b.Node)
                .WithDoubleSide(true)
                .WithMetallicRoughnessShader()
                .WithBaseColor(b.Color);
            var mesh = BuildBox(b.Node, b.Size, material);
            var node = new NodeBuilder(b.Node) { LocalTransform = Matrix4x4.CreateTranslation(b.Center) };
            scene.AddRigidMesh(mesh, node);
        }
        scene.ToGltf2().SaveGLB(path);
    }

    /// <summary>构造一个轴对齐盒子的 MeshBuilder。</summary>
    private static MeshBuilder<VERTEX> BuildBox(string name, Vector3 size, MaterialBuilder material)
    {
        var mesh = new MeshBuilder<VERTEX>(name);
        var prim = mesh.UsePrimitive(material);
        var h = size * 0.5f;

        // 8 个角点
        Vector3 P(float sx, float sy, float sz) => new(sx * h.X, sy * h.Y, sz * h.Z);

        // 6 个面,每面 2 三角;法线朝外
        AddQuad(prim, P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), new Vector3(0, 0, 1));   // +Z
        AddQuad(prim, P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), new Vector3(0, 0, -1)); // -Z
        AddQuad(prim, P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), new Vector3(1, 0, 0));   // +X
        AddQuad(prim, P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), new Vector3(-1, 0, 0)); // -X
        AddQuad(prim, P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), new Vector3(0, 1, 0));   // +Y
        AddQuad(prim, P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), new Vector3(0, -1, 0)); // -Y

        return mesh;
    }

    private static void AddQuad(
        PrimitiveBuilder<MaterialBuilder, VERTEX, VertexEmpty, VertexEmpty> prim,
        Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 normal)
    {
        var va = new VERTEX(a, normal);
        var vb = new VERTEX(b, normal);
        var vc = new VERTEX(c, normal);
        var vd = new VERTEX(d, normal);
        prim.AddTriangle(va, vb, vc);
        prim.AddTriangle(va, vc, vd);
    }
}
