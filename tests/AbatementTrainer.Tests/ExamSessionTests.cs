using System.Collections.Generic;
using System.Linq;
using AbatementTrainer.Core.Exam;
using AbatementTrainer.Core.Models;
using Xunit;

namespace AbatementTrainer.Tests;

/// <summary>M10 考核会话:排序 + 执行阶段强制安全门测试。</summary>
public class ExamSessionTests
{
    private static LocalizedText T(string s = "x") => new(s, s);

    private static IReadOnlyList<Step> Steps()
    {
        // 3 步,每步一个 required 安全项
        SafetyCheck Req() => new(SafetyType.Loto, T(), true);
        return new[]
        {
            new Step(1, StepAction.Remove, "p", null, T(), new[] { Req() }),
            new Step(2, StepAction.Remove, "p", null, T(), new[] { Req() }),
            new Step(3, StepAction.Highlight, "p", null, T(), new[] { Req() }),
        };
    }

    private static IReadOnlySet<int> Confirm(params int[] i) => new HashSet<int>(i);
    private static IReadOnlySet<int> None => new HashSet<int>();

    [Fact]
    public void Shuffle_ThenArrangeToCorrect_ScoresPerfect()
    {
        var s = new ExamSession(Steps(), shuffleSeed: 7);
        // 通过排序把它整理成 order 升序
        SortToCorrect(s);
        var result = s.ScoreOrdering();
        Assert.True(result.IsPerfect);
    }

    [Fact]
    public void Execution_EnforcesSafetyGate()
    {
        var s = new ExamSession(Steps(), shuffleSeed: 1);
        SortToCorrect(s);
        s.SubmitArrangement();
        Assert.Equal(ExamPhase.Executing, s.Phase);

        // 未确认必填项 → 不能前进,且记录违规尝试
        Assert.False(s.TryAdvanceExecution(None));
        Assert.Equal(0, s.Runner!.Index);

        // 确认后可前进
        Assert.True(s.TryAdvanceExecution(Confirm(0)));
        Assert.Equal(1, s.Runner!.Index);
    }

    [Fact]
    public void FullRun_PerfectOrder_AndCompletedExecution_Passes()
    {
        var s = new ExamSession(Steps(), shuffleSeed: 99);
        SortToCorrect(s);
        s.SubmitArrangement();
        // 逐步确认必填项推进到结束
        while (s.Phase == ExamPhase.Executing)
            Assert.True(s.TryAdvanceExecution(Confirm(0)));

        Assert.Equal(ExamPhase.Finished, s.Phase);
        var outcome = s.BuildOutcome();
        Assert.True(outcome.ExecutionCompleted);
        Assert.True(outcome.Passed);
    }

    [Fact]
    public void Outcome_RecordsGateViolationAttempt()
    {
        var s = new ExamSession(Steps(), shuffleSeed: 3);
        SortToCorrect(s);
        s.SubmitArrangement();
        s.TryAdvanceExecution(None);          // 故意违规一次
        s.TryAdvanceExecution(Confirm(0));    // 然后正常推进
        var outcome = s.BuildOutcome();
        Assert.True(outcome.HadGateViolationAttempt);
    }

    [Fact]
    public void Move_OnlyWorksInArrangingPhase()
    {
        var s = new ExamSession(Steps(), shuffleSeed: 5);
        s.SubmitArrangement();
        var before = s.Arrangement.Select(x => x.Order).ToArray();
        s.Move(0, 2); // 执行阶段不应改变排列
        Assert.Equal(before, s.Arrangement.Select(x => x.Order).ToArray());
    }

    [Theory] // 排序阶段 Move 越界:任一下标越界都必须整体忽略,不得抛异常/不得改动排列
    [InlineData(-1, 0)]
    [InlineData(0, -1)]
    [InlineData(3, 0)]   // from == Count(刚好越界)
    [InlineData(0, 3)]   // to == Count(刚好越界)
    [InlineData(99, 1)]
    [InlineData(1, 99)]
    [InlineData(-5, -5)]
    public void Move_OutOfRange_IsIgnored(int from, int to)
    {
        var s = new ExamSession(Steps(), shuffleSeed: 11);
        var before = s.Arrangement.Select(x => x.Order).ToArray();

        s.Move(from, to);

        Assert.Equal(before, s.Arrangement.Select(x => x.Order).ToArray());
    }

    [Fact] // Move 到原位置:合法但应无变化
    public void Move_SamePosition_NoChange()
    {
        var s = new ExamSession(Steps(), shuffleSeed: 11);
        var before = s.Arrangement.Select(x => x.Order).ToArray();
        s.Move(1, 1);
        Assert.Equal(before, s.Arrangement.Select(x => x.Order).ToArray());
    }

    [Fact] // 排序阶段(未提交)不能执行推进
    public void TryAdvanceExecution_BeforeSubmit_ReturnsFalse()
    {
        var s = new ExamSession(Steps(), shuffleSeed: 2);
        Assert.False(s.TryAdvanceExecution(Confirm(0)));
        Assert.Equal(ExamPhase.Arranging, s.Phase);
    }

    [Fact] // 结束后再推进:返回 false,阶段保持 Finished
    public void TryAdvanceExecution_AfterFinished_ReturnsFalse()
    {
        var s = new ExamSession(Steps(), shuffleSeed: 4);
        SortToCorrect(s);
        s.SubmitArrangement();
        while (s.Phase == ExamPhase.Executing) s.TryAdvanceExecution(Confirm(0));

        Assert.Equal(ExamPhase.Finished, s.Phase);
        Assert.False(s.TryAdvanceExecution(Confirm(0)));
        Assert.Equal(ExamPhase.Finished, s.Phase);
    }

    [Fact] // 重复提交排序:第二次应被忽略,不重置执行进度
    public void SubmitArrangement_Twice_DoesNotResetProgress()
    {
        var s = new ExamSession(Steps(), shuffleSeed: 6);
        SortToCorrect(s);
        s.SubmitArrangement();
        s.TryAdvanceExecution(Confirm(0));
        var runner = s.Runner;

        s.SubmitArrangement(); // 应无效

        Assert.Same(runner, s.Runner);
        Assert.Equal(1, s.Runner!.Index);
    }

    // 通过反复 Move 把排列整理成 order 升序(稳定选择)
    private static void SortToCorrect(ExamSession s)
    {
        for (int target = 0; target < s.Arrangement.Count; target++)
        {
            int expectedOrder = target + 1;
            int cur = -1;
            for (int i = 0; i < s.Arrangement.Count; i++)
                if (s.Arrangement[i].Order == expectedOrder) { cur = i; break; }
            if (cur >= 0 && cur != target) s.Move(cur, target);
        }
    }
}
