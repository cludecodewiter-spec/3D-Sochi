using System.Collections.Generic;
using System.IO;
using AbatementTrainer.Core.Manifest;
using AbatementTrainer.Core.Models;

namespace AbatementTrainer.App.Services;

/// <summary>M9:设备库 / 内容索引。读取 content/index.json,定位各模块清单与模型。</summary>
public sealed class ContentLibraryService
{
    /// <summary>内容根目录(默认程序目录下的 content/)。</summary>
    public string ContentRoot { get; }

    public ContentLibraryService(string? contentRoot = null)
    {
        ContentRoot = contentRoot
            ?? Path.Combine(AppContext.BaseDirectory, "content");
    }

    /// <summary>读取设备库索引。</summary>
    public IReadOnlyList<ContentIndexEntry> LoadIndex()
    {
        var indexPath = Path.Combine(ContentRoot, "index.json");
        return ManifestLoader.LoadIndex(indexPath);
    }

    /// <summary>由索引项加载清单。</summary>
    public Manifest LoadManifest(ContentIndexEntry entry)
    {
        var manifestPath = Path.Combine(ContentRoot, entry.ManifestPath);
        return ManifestLoader.Load(manifestPath);
    }

    /// <summary>解析某清单对应模型(.glb)的绝对路径(modelFile 相对于清单所在目录)。</summary>
    public string ResolveModelPath(ContentIndexEntry entry, Manifest manifest)
    {
        var manifestDir = Path.GetDirectoryName(Path.Combine(ContentRoot, entry.ManifestPath))!;
        return Path.Combine(manifestDir, manifest.ModelFile);
    }
}
