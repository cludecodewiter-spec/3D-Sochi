using System.Collections.Generic;
using System.Linq;
using SharpGLTF.Schema2;

namespace AbatementTrainer.Core.Manifest;

/// <summary>
/// M1:用 SharpGLTF 读取 glTF/GLB 的节点结构,供「部件命名约定」核对。
/// 这是部件↔节点映射成败的关键,先于渲染跑(见 BUILD_SPEC §6)。
/// </summary>
public static class GltfInspector
{
    /// <summary>列出 glTF 所有逻辑节点名(去重、保持原顺序)。</summary>
    public static IReadOnlyList<string> ListNodeNames(string gltfPath)
    {
        var model = ModelRoot.Load(gltfPath);
        return ListNodeNames(model);
    }

    /// <summary>从已加载的 <see cref="ModelRoot"/> 列出节点名。</summary>
    public static IReadOnlyList<string> ListNodeNames(ModelRoot model)
    {
        var names = new List<string>();
        var seen = new HashSet<string>();
        foreach (var node in model.LogicalNodes)
        {
            var name = node.Name ?? string.Empty;
            if (name.Length == 0) continue;
            if (seen.Add(name)) names.Add(name);
        }
        return names;
    }

    /// <summary>
    /// 列出节点层级(缩进展示),供人工核对部件命名与层级。
    /// 返回每行形如 "  - front_panel"。
    /// </summary>
    public static IReadOnlyList<string> DumpHierarchy(string gltfPath)
    {
        var model = ModelRoot.Load(gltfPath);
        var lines = new List<string>();
        // 以默认场景的根节点为起点遍历
        var scene = model.DefaultScene ?? model.LogicalScenes.FirstOrDefault();
        if (scene is null) return lines;

        foreach (var root in scene.VisualChildren)
            Walk(root, 0, lines);
        return lines;
    }

    private static void Walk(Node node, int depth, List<string> lines)
    {
        var indent = new string(' ', depth * 2);
        lines.Add($"{indent}- {node.Name ?? "(unnamed)"}");
        foreach (var child in node.VisualChildren)
            Walk(child, depth + 1, lines);
    }
}
