using System;
using System.IO;
using System.Text.Json;
using AbatementTrainer.Core.Models;
using AbatementTrainer.Core.Serialization;

namespace AbatementTrainer.Core.Manifest;

/// <summary>M1:把 manifest.json 读成 <see cref="Models.Manifest"/> 对象。</summary>
public static class ManifestLoader
{
    /// <summary>从文件路径加载清单。</summary>
    /// <exception cref="FileNotFoundException">文件不存在。</exception>
    /// <exception cref="InvalidDataException">JSON 非法或反序列化为空。</exception>
    public static Models.Manifest Load(string path)
    {
        if (!File.Exists(path))
            throw new FileNotFoundException("清单文件不存在", path);

        var json = File.ReadAllText(path);
        return Parse(json);
    }

    /// <summary>从 JSON 字符串解析清单(便于单元测试)。</summary>
    public static Models.Manifest Parse(string json)
    {
        Models.Manifest? manifest;
        try
        {
            manifest = JsonSerializer.Deserialize<Models.Manifest>(json, ManifestJson.Options);
        }
        catch (JsonException ex)
        {
            throw new InvalidDataException("清单 JSON 解析失败:" + ex.Message, ex);
        }

        if (manifest is null)
            throw new InvalidDataException("清单 JSON 反序列化结果为空");

        return manifest;
    }

    /// <summary>读取设备库索引(content/index.json)。</summary>
    public static System.Collections.Generic.IReadOnlyList<ContentIndexEntry> LoadIndex(string path)
    {
        if (!File.Exists(path))
            throw new FileNotFoundException("索引文件不存在", path);

        var json = File.ReadAllText(path);
        var list = JsonSerializer.Deserialize<System.Collections.Generic.List<ContentIndexEntry>>(json, ManifestJson.Options);
        return list ?? new System.Collections.Generic.List<ContentIndexEntry>();
    }
}
