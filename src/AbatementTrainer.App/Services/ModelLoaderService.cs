using System.Collections.Generic;
using HelixToolkit.SharpDX.Core;
using HelixToolkit.SharpDX.Core.Assimp;
using HelixToolkit.SharpDX.Core.Model.Scene;

namespace AbatementTrainer.App.Services;

/// <summary>
/// M2:用 HelixToolkit.SharpDX.Assimp 导入器加载 glTF/GLB,返回场景图根 SceneNode。
/// 注意:Helix v3 的 SharpDX 类型位于 HelixToolkit.SharpDX.Core.* 命名空间,
/// WPF 包装控件(Viewport3DX 等)在 HelixToolkit.Wpf.SharpDX。
/// </summary>
public sealed class ModelLoaderService
{
    /// <summary>加载结果。</summary>
    public sealed record LoadResult(SceneNode Root, IReadOnlyDictionary<string, SceneNode> NodesByName);

    /// <summary>
    /// 导入模型文件。导入后按节点名建立索引,供「部件↔节点映射」使用。
    /// </summary>
    public LoadResult Load(string filePath)
    {
        var importer = new Importer();
        // glTF/GLB/FBX 原生支持;关闭多余的后处理以尽量保留节点名/层级
        var scene = importer.Load(filePath);
        if (scene is null || scene.Root is null)
            throw new InvalidDataException($"模型加载失败:{filePath}");

        var map = new Dictionary<string, SceneNode>();
        Index(scene.Root, map);
        return new LoadResult(scene.Root, map);
    }

    /// <summary>深度遍历场景图,按节点名建立索引(后出现的同名节点不覆盖)。</summary>
    private static void Index(SceneNode node, Dictionary<string, SceneNode> map)
    {
        if (!string.IsNullOrEmpty(node.Name) && !map.ContainsKey(node.Name))
            map[node.Name] = node;

        foreach (var child in node.Items)
            Index(child, map);
    }
}
