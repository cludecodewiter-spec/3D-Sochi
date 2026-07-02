using System.Collections.Generic;
using System.Linq;
using AbatementTrainer.Core.Manifest;
using AbatementTrainer.Core.Models;
using Xunit;

namespace AbatementTrainer.Tests;

/// <summary>ManifestValidator 边界与告警(M1)测试。</summary>
public class ValidatorEdgeTests
{
    private static LocalizedText T(string s = "x") => new(s, s);

    private static Manifest Make(
        IReadOnlyList<Part>? parts = null,
        IReadOnlyList<Step>? steps = null,
        string equipmentId = "eq",
        string modelFile = "m.glb")
    {
        parts ??= new[] { new Part("p1", "node1", T(), "P-1") };
        steps ??= new[]
        {
            new Step(1, StepAction.Highlight, "p1", null, T(),
                new[] { new SafetyCheck(SafetyType.Loto, T(), true) })
        };
        return new Manifest(equipmentId, T(), modelFile, parts, new Procedure(T(), steps));
    }

    [Fact]
    public void DuplicatePartId_IsError()
    {
        var m = Make(parts: new[]
        {
            new Part("dup", "n1", T(), null),
            new Part("dup", "n2", T(), null),
        }, steps: new[] { new Step(1, StepAction.Highlight, "dup", null, T(), new List<SafetyCheck>()) });
        var report = ManifestValidator.Validate(m, (IReadOnlyList<string>?)null);
        Assert.Contains(report.Errors, e => e.Contains("重复"));
    }

    [Fact]
    public void DuplicateStepOrder_IsError()
    {
        var steps = new[]
        {
            new Step(1, StepAction.Highlight, "p1", null, T(), new List<SafetyCheck>()),
            new Step(1, StepAction.Highlight, "p1", null, T(), new List<SafetyCheck>()),
        };
        var report = ManifestValidator.Validate(Make(steps: steps), (IReadOnlyList<string>?)null);
        Assert.Contains(report.Errors, e => e.Contains("order 重复"));
    }

    [Fact]
    public void WrongRemoveOffsetLength_IsError()
    {
        var steps = new[]
        {
            new Step(1, StepAction.Remove, "p1", new float[] { 1, 2 }, T(), new List<SafetyCheck>())
        };
        var report = ManifestValidator.Validate(Make(steps: steps), (IReadOnlyList<string>?)null);
        Assert.Contains(report.Errors, e => e.Contains("removeOffset"));
    }

    [Fact]
    public void StepWithoutSafetyChecks_IsWarningNotError()
    {
        var steps = new[]
        {
            new Step(1, StepAction.Highlight, "p1", null, T(), new List<SafetyCheck>())
        };
        var report = ManifestValidator.Validate(Make(steps: steps), (IReadOnlyList<string>?)null);
        Assert.True(report.IsValid); // 无 required 缺失 → 不阻断
        Assert.Contains(report.Issues, i => i.Severity == ValidationSeverity.Warning && i.Message.Contains("安全确认"));
    }

    [Fact]
    public void EmptyEquipmentId_IsError()
    {
        var report = ManifestValidator.Validate(Make(equipmentId: "  "), (IReadOnlyList<string>?)null);
        Assert.Contains(report.Errors, e => e.Contains("equipmentId"));
    }

    [Fact]
    public void NonContiguousStepOrders_IsWarningNotError()
    {
        var steps = new[]
        {
            new Step(1, StepAction.Highlight, "p1", null, T(), new List<SafetyCheck>()),
            new Step(5, StepAction.Highlight, "p1", null, T(), new List<SafetyCheck>()),
        };
        var report = ManifestValidator.Validate(Make(steps: steps), (IReadOnlyList<string>?)null);
        Assert.True(report.IsValid); // 仅告警,不阻断
        Assert.Contains(report.Issues, i => i.Severity == ValidationSeverity.Warning && i.Message.Contains("连续"));
    }

    [Fact]
    public void NullNodeList_SkipsNodeExistenceCheck()
    {
        // 不传节点集合时,node 存在性不校验,其余结构合法 → 通过
        var report = ManifestValidator.Validate(Make(), (IReadOnlyList<string>?)null);
        Assert.True(report.IsValid);
    }

    [Fact]
    public void EmptyParts_WithStepTargetPart_IsError()
    {
        // parts 为空但步骤仍引用部件:不得静默通过(幽灵部件)
        var m = Make(parts: new List<Part>(), steps: new[]
        {
            new Step(1, StepAction.Highlight, "ghost", null, T(), new List<SafetyCheck>())
        });
        var report = ManifestValidator.Validate(m, (IReadOnlyList<string>?)null);
        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, e => e.Contains("ghost"));
    }

    [Fact]
    public void RemoveAction_WithoutOffset_IsWarningNotError()
    {
        // remove 动作缺 removeOffset:告警提示(拆卸动画无位移),但不阻断既有内容
        var steps = new[]
        {
            new Step(1, StepAction.Remove, "p1", null, T(),
                new[] { new SafetyCheck(SafetyType.Loto, T(), true) })
        };
        var report = ManifestValidator.Validate(Make(steps: steps), (IReadOnlyList<string>?)null);
        Assert.True(report.IsValid);
        Assert.Contains(report.Issues, i =>
            i.Severity == ValidationSeverity.Warning && i.Message.Contains("removeOffset"));
    }

    [Fact]
    public void CorruptGlbFile_ReportsErrorInsteadOfThrowing()
    {
        // 损坏的模型文件:校验器应报「加载失败」错误而不是抛异常
        var path = System.IO.Path.Combine(System.IO.Path.GetTempPath(),
            $"corrupt_{System.Guid.NewGuid():N}.glb");
        try
        {
            System.IO.File.WriteAllBytes(path, new byte[] { 0x00, 0x01, 0x02, 0x03 });
            var report = ManifestValidator.Validate(Make(), path);
            Assert.False(report.IsValid);
            Assert.Contains(report.Errors, e => e.Contains("加载失败"));
        }
        finally
        {
            if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
        }
    }
}
