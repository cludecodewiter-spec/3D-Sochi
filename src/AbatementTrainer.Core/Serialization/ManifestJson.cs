using System.Text.Json;
using System.Text.Json.Serialization;

namespace AbatementTrainer.Core.Serialization;

/// <summary>清单 JSON 的共享序列化设置:camelCase + 枚举字符串。</summary>
public static class ManifestJson
{
    /// <summary>统一的 <see cref="JsonSerializerOptions"/>(只读单例)。</summary>
    public static JsonSerializerOptions Options { get; } = Create();

    private static JsonSerializerOptions Create()
    {
        var options = new JsonSerializerOptions
        {
            // JSON camelCase ↔ C# PascalCase
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            ReadCommentHandling = JsonCommentHandling.Skip,
            AllowTrailingCommas = true,
            WriteIndented = true
        };
        // 枚举按字符串解析。默认大小写不敏感,既能读 "remove" 也能读 "Loto",
        // 兼容清单中混用的大小写写法。
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }
}
