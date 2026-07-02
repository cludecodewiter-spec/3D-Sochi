using System.Collections.Generic;

namespace AbatementTrainer.Core.Models;

// 本文件定义清单(manifest.json)对应的 C# 数据模型。
// 数据契约严格按 BUILD_SPEC §2.2,字段名不可更改。
// JSON 用 camelCase，C# 用 PascalCase,序列化时通过 JsonNamingPolicy.CamelCase 映射。

/// <summary>多语言文本:中文(Zh)与日文(Ja)。</summary>
public record LocalizedText(string Zh, string Ja);

/// <summary>安全确认项的类型。</summary>
public enum SafetyType
{
    /// <summary>上锁挂牌(Lockout/Tagout)。</summary>
    Loto,
    /// <summary>个人防护装备。</summary>
    Ppe,
    /// <summary>吹扫/置换。</summary>
    Purge,
    /// <summary>泄漏检查。</summary>
    LeakCheck,
    /// <summary>扭矩确认。</summary>
    Torque,
    /// <summary>其他。</summary>
    Other
}

/// <summary>步骤动作类型。</summary>
public enum StepAction
{
    /// <summary>取下(可带位移动画)。</summary>
    Remove,
    /// <summary>隔离。</summary>
    Isolate,
    /// <summary>高亮。</summary>
    Highlight
}

/// <summary>单条安全确认项。</summary>
public record SafetyCheck(SafetyType Type, LocalizedText Text, bool Required);

/// <summary>设备部件:Id 为逻辑标识,Node 为 glTF 节点名,二者用于映射。</summary>
public record Part(string Id, string Node, LocalizedText Name, string? PartNo);

/// <summary>拆装流程中的单个步骤。</summary>
public record Step(
    int Order,
    StepAction Action,
    string TargetPart,
    float[]? RemoveOffset,
    LocalizedText Instruction,
    IReadOnlyList<SafetyCheck> SafetyChecks);

/// <summary>完整拆装流程。</summary>
public record Procedure(LocalizedText Title, IReadOnlyList<Step> Steps);

/// <summary>设备清单根对象。App 行为完全由该对象驱动。</summary>
public record Manifest(
    string EquipmentId,
    LocalizedText Name,
    string ModelFile,
    IReadOnlyList<Part> Parts,
    Procedure Procedure);

/// <summary>设备库索引项(content/index.json 中的一条)。</summary>
public record ContentIndexEntry(string EquipmentId, LocalizedText Name, string ManifestPath);
