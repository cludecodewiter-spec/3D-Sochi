using System.Collections.Generic;
using System.IO;
using System.Linq;
using AbatementTrainer.Core.Models;
using SharpGLTF.Schema2;

namespace AbatementTrainer.Core.Manifest;

/// <summary>校验严重级别。</summary>
public enum ValidationSeverity
{
    /// <summary>错误:阻断使用。</summary>
    Error,
    /// <summary>警告:可继续但需注意。</summary>
    Warning
}

/// <summary>单条校验结果。</summary>
public record ValidationIssue(ValidationSeverity Severity, string Message);

/// <summary>校验报告。</summary>
public sealed class ValidationReport
{
    private readonly List<ValidationIssue> _issues = new();

    /// <summary>全部问题。</summary>
    public IReadOnlyList<ValidationIssue> Issues => _issues;

    /// <summary>是否存在错误级问题。</summary>
    public bool HasErrors => _issues.Any(i => i.Severity == ValidationSeverity.Error);

    /// <summary>是否完全通过(无错误)。</summary>
    public bool IsValid => !HasErrors;

    /// <summary>仅错误信息。</summary>
    public IReadOnlyList<string> Errors =>
        _issues.Where(i => i.Severity == ValidationSeverity.Error).Select(i => i.Message).ToList();

    internal void Error(string message) => _issues.Add(new ValidationIssue(ValidationSeverity.Error, message));
    internal void Warn(string message) => _issues.Add(new ValidationIssue(ValidationSeverity.Warning, message));
}

/// <summary>
/// M1:对照 glTF 校验清单。是「部件命名约定」的守门员。
/// 校验项见 BUILD_SPEC §M1:节点存在性、targetPart 存在性、必填字段、双语非空。
/// </summary>
public static class ManifestValidator
{
    /// <summary>
    /// 校验清单。<paramref name="gltfPath"/> 为 null/不存在时跳过节点存在性校验(只做结构校验)。
    /// </summary>
    public static ValidationReport Validate(Models.Manifest manifest, string? gltfPath)
    {
        IReadOnlyList<string>? nodeNames = null;
        if (!string.IsNullOrEmpty(gltfPath) && File.Exists(gltfPath))
        {
            var model = ModelRoot.Load(gltfPath);
            nodeNames = GltfInspector.ListNodeNames(model);
        }
        return Validate(manifest, nodeNames);
    }

    /// <summary>
    /// 校验清单。<paramref name="gltfNodeNames"/> 为已知的 glTF 节点名集合;
    /// 传 null 则跳过节点存在性校验(供无模型的纯结构单测)。
    /// </summary>
    public static ValidationReport Validate(Models.Manifest manifest, IReadOnlyList<string>? gltfNodeNames)
    {
        var report = new ValidationReport();

        // ③ 必填字段非空
        if (string.IsNullOrWhiteSpace(manifest.EquipmentId))
            report.Error("equipmentId 不能为空");
        if (string.IsNullOrWhiteSpace(manifest.ModelFile))
            report.Error("modelFile 不能为空");
        CheckLocalized(report, manifest.Name, "name");

        // 部件:Id 唯一、字段非空、节点存在
        var partIds = new HashSet<string>();
        if (manifest.Parts is null || manifest.Parts.Count == 0)
        {
            report.Warn("parts 为空");
        }
        else
        {
            var nodeSet = gltfNodeNames is null ? null : new HashSet<string>(gltfNodeNames);
            foreach (var part in manifest.Parts)
            {
                if (string.IsNullOrWhiteSpace(part.Id))
                    report.Error("存在 id 为空的部件");
                else if (!partIds.Add(part.Id))
                    report.Error($"部件 id 重复:{part.Id}");

                if (string.IsNullOrWhiteSpace(part.Node))
                    report.Error($"部件 {part.Id} 的 node 为空");
                else if (nodeSet is not null && !nodeSet.Contains(part.Node))
                    // ① 每个 part.node 必须在 glTF 节点中存在
                    report.Error($"部件 {part.Id} 的 node「{part.Node}」在 glTF 中不存在");

                CheckLocalized(report, part.Name, $"部件 {part.Id} 的 name");
            }
        }

        // 流程与步骤
        if (manifest.Procedure is null)
        {
            report.Error("procedure 缺失");
            return report;
        }

        CheckLocalized(report, manifest.Procedure.Title, "procedure.title");

        var steps = manifest.Procedure.Steps;
        if (steps is null || steps.Count == 0)
        {
            report.Error("procedure.steps 为空");
            return report;
        }

        var seenOrders = new HashSet<int>();
        foreach (var step in steps)
        {
            if (!seenOrders.Add(step.Order))
                report.Error($"步骤 order 重复:{step.Order}");

            // ② 每个 step.targetPart 必须在 parts.id 中存在
            if (string.IsNullOrWhiteSpace(step.TargetPart))
                report.Error($"步骤 {step.Order} 的 targetPart 为空");
            else if (partIds.Count > 0 && !partIds.Contains(step.TargetPart))
                report.Error($"步骤 {step.Order} 的 targetPart「{step.TargetPart}」不在 parts.id 中");

            CheckLocalized(report, step.Instruction, $"步骤 {step.Order} 的 instruction");

            // removeOffset 若提供必须是 3 个分量
            if (step.RemoveOffset is not null && step.RemoveOffset.Length != 3)
                report.Error($"步骤 {step.Order} 的 removeOffset 必须为 3 个分量,实际 {step.RemoveOffset.Length}");

            if (step.SafetyChecks is null || step.SafetyChecks.Count == 0)
            {
                report.Warn($"步骤 {step.Order} 无任何安全确认项");
            }
            else
            {
                for (int i = 0; i < step.SafetyChecks.Count; i++)
                    CheckLocalized(report, step.SafetyChecks[i].Text, $"步骤 {step.Order} 安全项[{i}] 的 text");
            }
        }

        // 步骤 order 建议从 1 起连续递增(便于排序/考核);非连续仅告警,不阻断。
        var orders = steps.Select(s => s.Order).OrderBy(o => o).ToList();
        var expected = Enumerable.Range(1, orders.Count).ToList();
        if (!orders.SequenceEqual(expected))
            report.Warn($"步骤 order 不是从 1 起的连续序列(实际:{string.Join(",", orders)})");

        return report;
    }

    /// <summary>④ name/instruction/text 的 zh 与 ja 都非空。</summary>
    private static void CheckLocalized(ValidationReport report, LocalizedText? text, string field)
    {
        if (text is null)
        {
            report.Error($"{field} 缺失");
            return;
        }
        if (string.IsNullOrWhiteSpace(text.Zh))
            report.Error($"{field} 的 zh 为空");
        if (string.IsNullOrWhiteSpace(text.Ja))
            report.Error($"{field} 的 ja 为空");
    }
}
