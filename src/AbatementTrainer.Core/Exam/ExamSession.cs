using System.Collections.Generic;
using System.Linq;
using AbatementTrainer.Core.Models;
using AbatementTrainer.Core.Procedure;

namespace AbatementTrainer.Core.Exam;

/// <summary>考核阶段。</summary>
public enum ExamPhase
{
    /// <summary>排序阶段:学员把打乱的步骤排成正确顺序。</summary>
    Arranging,
    /// <summary>执行阶段:按学员排出的顺序逐步执行,安全门仍强制。</summary>
    Executing,
    /// <summary>已结束。</summary>
    Finished
}

/// <summary>考核综合结果:排序正确率 + 执行阶段是否安全合规。</summary>
public sealed class ExamOutcome
{
    /// <summary>排序评分(逐位置)。</summary>
    public required ExamResult Ordering { get; init; }
    /// <summary>执行阶段是否完整走完(每步都通过了安全门)。</summary>
    public required bool ExecutionCompleted { get; init; }
    /// <summary>是否记录过「安全门拦截」(尝试在未确认必填项时前进)。</summary>
    public required bool HadGateViolationAttempt { get; init; }
    /// <summary>综合是否合格:排序全对 且 执行完成。</summary>
    public bool Passed => Ordering.IsPerfect && ExecutionCompleted;
}

/// <summary>
/// M10:考核会话。打乱步骤 → 学员排序 → 评分;随后按学员排出的顺序进入执行阶段,
/// 执行阶段复用 <see cref="ProcedureRunner"/>,**安全确认仍强制**(规范要求)。
/// 纯 Core、可单测。
/// </summary>
public sealed class ExamSession
{
    private readonly List<Step> _arrangement;
    private ProcedureRunner? _runner;
    private bool _hadGateViolation;

    /// <summary>用流程步骤构造,按种子打乱初始排列。</summary>
    public ExamSession(IReadOnlyList<Step> steps, int shuffleSeed)
    {
        // 评分只依赖排列中各步骤自带的 order,无需另存原始序列
        _arrangement = ExamScorer.Shuffle(steps, shuffleSeed).ToList();
        Phase = ExamPhase.Arranging;
    }

    /// <summary>当前阶段。</summary>
    public ExamPhase Phase { get; private set; }

    /// <summary>学员当前排列(排序阶段可调整)。</summary>
    public IReadOnlyList<Step> Arrangement => _arrangement;

    /// <summary>执行阶段的步骤推进器(进入执行阶段后可用)。</summary>
    public ProcedureRunner? Runner => _runner;

    /// <summary>排序阶段:把位置 <paramref name="from"/> 的步骤移动到 <paramref name="to"/>。</summary>
    public void Move(int from, int to)
    {
        if (Phase != ExamPhase.Arranging) return;
        if (from < 0 || from >= _arrangement.Count || to < 0 || to >= _arrangement.Count) return;
        var item = _arrangement[from];
        _arrangement.RemoveAt(from);
        _arrangement.Insert(to, item);
    }

    /// <summary>对当前排序评分(不结束会话,可在提交前预览)。</summary>
    public ExamResult ScoreOrdering() => ExamScorer.Score(_arrangement);

    /// <summary>
    /// 提交排序并进入执行阶段。执行阶段按学员排出的顺序逐步推进,
    /// 安全门由 <see cref="ProcedureRunner"/> 强制。
    /// </summary>
    public void SubmitArrangement()
    {
        if (Phase != ExamPhase.Arranging) return;
        _runner = new ProcedureRunner(_arrangement);
        _hadGateViolation = false;
        Phase = ExamPhase.Executing;
    }

    /// <summary>
    /// 执行阶段尝试推进。安全门未通过则记录一次违规尝试并返回 false(不前进)。
    /// </summary>
    public bool TryAdvanceExecution(IReadOnlySet<int> confirmedCheckIndices)
    {
        if (Phase != ExamPhase.Executing || _runner is null) return false;
        if (!_runner.CanAdvance(confirmedCheckIndices))
        {
            _hadGateViolation = true; // 记录:学员在未确认必填项时尝试前进
            return false;
        }
        _runner.TryAdvance(confirmedCheckIndices);
        if (_runner.IsComplete) Phase = ExamPhase.Finished;
        return true;
    }

    /// <summary>生成综合结果(排序正确率 + 执行是否完成 + 是否触发过安全门拦截)。</summary>
    public ExamOutcome BuildOutcome() => new()
    {
        Ordering = ExamScorer.Score(_arrangement),
        ExecutionCompleted = _runner is not null && _runner.IsComplete,
        HadGateViolationAttempt = _hadGateViolation
    };
}
