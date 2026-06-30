using System;
using System.Collections.Generic;
using System.Linq;
using AbatementTrainer.Core.Models;

namespace AbatementTrainer.Core.Exam;

/// <summary>考核中一个位置的判定结果。</summary>
/// <param name="Position">学员排列中的位置(0 基)。</param>
/// <param name="SubmittedOrder">学员放在该位置步骤的 order。</param>
/// <param name="ExpectedOrder">该位置正确应为的 order。</param>
/// <param name="IsCorrect">该位置是否正确。</param>
public record PositionResult(int Position, int SubmittedOrder, int ExpectedOrder, bool IsCorrect);

/// <summary>考核评分结果。</summary>
public sealed class ExamResult
{
    /// <summary>逐位置判定。</summary>
    public required IReadOnlyList<PositionResult> Positions { get; init; }

    /// <summary>正确位置数。</summary>
    public int CorrectCount => Positions.Count(p => p.IsCorrect);

    /// <summary>总位置数。</summary>
    public int Total => Positions.Count;

    /// <summary>正确率(0~1);无步骤时为 0。</summary>
    public double Accuracy => Total == 0 ? 0d : (double)CorrectCount / Total;

    /// <summary>是否全对。</summary>
    public bool IsPerfect => Total > 0 && CorrectCount == Total;

    /// <summary>错处位置(0 基)。</summary>
    public IReadOnlyList<int> WrongPositions =>
        Positions.Where(p => !p.IsCorrect).Select(p => p.Position).ToList();
}

/// <summary>
/// M10:考核模式评分。打乱步骤让学员排序,提交后与正确 order 比对。
/// 逻辑纯 Core、可单测;安全确认在考核模式仍强制(由 UI 经 ProcedureRunner 保证)。
/// </summary>
public static class ExamScorer
{
    /// <summary>
    /// 把流程步骤打乱用于考核展示。使用调用方提供的随机种子以保证可测/可复现。
    /// (Core 不直接用系统时间作种,符合架构约束。)
    /// </summary>
    public static IReadOnlyList<Step> Shuffle(IReadOnlyList<Step> steps, int seed)
    {
        var list = steps.ToList();
        var rng = new Random(seed);
        // Fisher–Yates 洗牌
        for (int i = list.Count - 1; i > 0; i--)
        {
            int j = rng.Next(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
        return list;
    }

    /// <summary>
    /// 对学员提交的步骤排序评分。
    /// 评分规则:把学员序列按 order 升序得到的「应有位置」与学员实际放置位置比对,
    /// 等价于「第 k 位是否为正确的第 k 小 order」。
    /// </summary>
    /// <param name="submittedOrders">学员排出的步骤 order 序列(按其排列顺序)。</param>
    public static ExamResult Score(IReadOnlyList<int> submittedOrders)
    {
        // 正确顺序 = 提交集合按 order 升序
        var expected = submittedOrders.OrderBy(o => o).ToList();
        var positions = new List<PositionResult>(submittedOrders.Count);
        for (int i = 0; i < submittedOrders.Count; i++)
        {
            var ok = submittedOrders[i] == expected[i];
            positions.Add(new PositionResult(i, submittedOrders[i], expected[i], ok));
        }
        return new ExamResult { Positions = positions };
    }

    /// <summary>重载:直接传步骤对象,内部取其 Order。</summary>
    public static ExamResult Score(IReadOnlyList<Step> submittedSteps) =>
        Score(submittedSteps.Select(s => s.Order).ToList());
}
