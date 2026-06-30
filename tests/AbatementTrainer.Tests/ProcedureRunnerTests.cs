using System.Collections.Generic;
using AbatementTrainer.Core.Models;
using AbatementTrainer.Core.Procedure;
using Xunit;

namespace AbatementTrainer.Tests;

/// <summary>M5 核心:安全门状态机测试。</summary>
public class ProcedureRunnerTests
{
    private static Step MakeStep(int order, params bool[] requiredFlags)
    {
        var checks = new List<SafetyCheck>();
        foreach (var req in requiredFlags)
            checks.Add(new SafetyCheck(SafetyType.Loto, new LocalizedText("确认", "確認"), req));
        return new Step(order, StepAction.Remove, "p", null,
            new LocalizedText("说明", "説明"), checks);
    }

    private static IReadOnlySet<int> Confirmed(params int[] idx) => new HashSet<int>(idx);

    [Fact] // ① required 未全确认 → 不可前进
    public void CannotAdvance_WhenRequiredNotAllConfirmed()
    {
        var runner = new ProcedureRunner(new[] { MakeStep(1, true, true), MakeStep(2) });

        Assert.False(runner.CanAdvance(Confirmed(0)));      // 只确认了第 0 项
        Assert.False(runner.TryAdvance(Confirmed(0)));      // TryAdvance 不前进
        Assert.Equal(0, runner.Index);                      // 仍停在第一步
        Assert.Equal(1, runner.Current!.Order);
    }

    [Fact] // ② 全确认后可前进
    public void CanAdvance_WhenAllRequiredConfirmed()
    {
        var runner = new ProcedureRunner(new[] { MakeStep(1, true, true), MakeStep(2) });

        Assert.True(runner.CanAdvance(Confirmed(0, 1)));
        Assert.True(runner.TryAdvance(Confirmed(0, 1)));
        Assert.Equal(1, runner.Index);
        Assert.Equal(2, runner.Current!.Order);
    }

    [Fact] // 非 required 项不影响门控
    public void OptionalChecks_DoNotBlockAdvance()
    {
        // 第 0 项 required,第 1 项可选
        var runner = new ProcedureRunner(new[] { MakeStep(1, true, false), MakeStep(2) });
        Assert.True(runner.CanAdvance(Confirmed(0)));       // 只需确认 required 项
    }

    [Fact] // 无安全项的步骤可直接前进
    public void StepWithoutChecks_CanAdvanceFreely()
    {
        var runner = new ProcedureRunner(new[] { MakeStep(1), MakeStep(2) });
        Assert.True(runner.CanAdvance(Confirmed()));
        Assert.True(runner.TryAdvance(Confirmed()));
        Assert.Equal(1, runner.Index);
    }

    [Fact] // ③ Back / Reset 正确
    public void BackAndReset_Work()
    {
        var runner = new ProcedureRunner(new[] { MakeStep(1), MakeStep(2), MakeStep(3) });

        runner.TryAdvance(Confirmed());
        runner.TryAdvance(Confirmed());
        Assert.Equal(2, runner.Index);

        runner.Back();
        Assert.Equal(1, runner.Index);

        runner.Back();
        runner.Back();             // 不可越过起点
        Assert.Equal(0, runner.Index);

        runner.TryAdvance(Confirmed());
        runner.Reset();
        Assert.Equal(0, runner.Index);
    }

    [Fact] // ④ 到末步后 IsComplete 为 true
    public void IsComplete_AtEnd()
    {
        var runner = new ProcedureRunner(new[] { MakeStep(1), MakeStep(2) });
        Assert.False(runner.IsComplete);

        runner.TryAdvance(Confirmed());
        runner.TryAdvance(Confirmed());

        Assert.True(runner.IsComplete);
        Assert.Null(runner.Current);
        Assert.True(runner.CanAdvance(Confirmed()));   // 完成态下 CanAdvance 返回 true
    }
}
