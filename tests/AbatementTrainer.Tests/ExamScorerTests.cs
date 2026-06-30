using System.Linq;
using AbatementTrainer.Core.Exam;
using Xunit;

namespace AbatementTrainer.Tests;

/// <summary>M10 考核评分测试。</summary>
public class ExamScorerTests
{
    [Fact]
    public void PerfectOrder_ScoresFull()
    {
        var result = ExamScorer.Score(new[] { 1, 2, 3, 4 });
        Assert.True(result.IsPerfect);
        Assert.Equal(4, result.CorrectCount);
        Assert.Equal(1.0, result.Accuracy);
        Assert.Empty(result.WrongPositions);
    }

    [Fact]
    public void SwappedPair_MarksBothWrong()
    {
        // 正确应为 1,2,3;学员排成 1,3,2 → 后两位错
        var result = ExamScorer.Score(new[] { 1, 3, 2 });
        Assert.False(result.IsPerfect);
        Assert.Equal(1, result.CorrectCount);
        Assert.Equal(new[] { 1, 2 }, result.WrongPositions.ToArray());
        Assert.Equal(1.0 / 3.0, result.Accuracy, 5);
    }

    [Fact]
    public void Shuffle_IsDeterministicBySeed_AndPreservesSet()
    {
        var orders = new[] { 1, 2, 3, 4, 5, 6 };
        var steps = orders.Select(o =>
            new AbatementTrainer.Core.Models.Step(o,
                AbatementTrainer.Core.Models.StepAction.Remove, "p", null,
                new AbatementTrainer.Core.Models.LocalizedText("x", "x"),
                new System.Collections.Generic.List<AbatementTrainer.Core.Models.SafetyCheck>())).ToList();

        var a = ExamScorer.Shuffle(steps, seed: 42).Select(s => s.Order).ToArray();
        var b = ExamScorer.Shuffle(steps, seed: 42).Select(s => s.Order).ToArray();

        Assert.Equal(a, b);                                   // 同种子可复现
        Assert.Equal(orders.OrderBy(x => x), a.OrderBy(x => x)); // 是同一集合的排列
    }

    [Fact]
    public void EmptySubmission_AccuracyZero()
    {
        var result = ExamScorer.Score(System.Array.Empty<int>());
        Assert.Equal(0, result.Total);
        Assert.Equal(0d, result.Accuracy);
        Assert.False(result.IsPerfect);
    }
}
