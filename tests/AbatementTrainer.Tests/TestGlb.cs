using SharpGLTF.Schema2;

namespace AbatementTrainer.Tests;

/// <summary>测试辅助:用 SharpGLTF 生成含命名节点的最小 GLB。</summary>
internal static class TestGlb
{
    /// <summary>写出一个仅含若干命名空节点的 GLB,用于校验节点名读取。</summary>
    public static void WriteNamedNodes(string path, params string[] nodeNames)
    {
        var model = ModelRoot.CreateModel();
        var scene = model.UseScene("scene");
        foreach (var name in nodeNames)
            scene.CreateNode(name);
        model.SaveGLB(path);
    }

    /// <summary>写出一个带父子层级的 GLB:root → 每个子名。</summary>
    public static void WriteNested(string path, string rootName, params string[] childNames)
    {
        var model = ModelRoot.CreateModel();
        var scene = model.UseScene("scene");
        var root = scene.CreateNode(rootName);
        foreach (var child in childNames)
            root.CreateNode(child);
        model.SaveGLB(path);
    }
}
