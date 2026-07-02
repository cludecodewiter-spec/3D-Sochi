using System.Collections.Generic;
using AbatementTrainer.Core.Models;

namespace AbatementTrainer.Core.Procedure;

/// <summary>
/// M5(核心):拆装步骤推进 + 安全门硬约束状态机。
/// 安全红线:当前步骤所有 required 安全项未全部确认时,禁止进入下一步。
/// 本类与 UI 完全解耦,任何前进路径(按钮/快捷键)都必须经过这里。
/// </summary>
public sealed class ProcedureRunner
{
    private readonly IReadOnlyList<Step> _steps;
    private int _index = 0;

    /// <summary>用流程步骤构造。步骤应已按 order 排序(由调用方保证)。</summary>
    public ProcedureRunner(IReadOnlyList<Step> steps) => _steps = steps;

    /// <summary>当前步骤;越界(已完成)时为 null。</summary>
    public Step? Current => _index < _steps.Count ? _steps[_index] : null;

    /// <summary>当前步骤索引(0 基)。</summary>
    public int Index => _index;

    /// <summary>步骤总数。</summary>
    public int Count => _steps.Count;

    /// <summary>是否已完成全部步骤。</summary>
    public bool IsComplete => _index >= _steps.Count;

    /// <summary>仅当当前步骤所有 required 安全项都已确认,才允许进入下一步。</summary>
    public bool CanAdvance(IReadOnlySet<int> confirmedCheckIndices)
    {
        if (Current is null) return true;
        for (int i = 0; i < Current.SafetyChecks.Count; i++)
            if (Current.SafetyChecks[i].Required && !confirmedCheckIndices.Contains(i))
                return false;
        return true;
    }

    /// <summary>尝试推进;门控未通过或已全部完成则不前进并返回 false。</summary>
    public bool TryAdvance(IReadOnlySet<int> confirmedCheckIndices)
    {
        // 已完成后不再累加索引:防止 Index 越过 Count,导致 Back() 需多次才能回到真实步骤
        if (IsComplete) return false;
        if (!CanAdvance(confirmedCheckIndices)) return false;
        _index++;
        return true;
    }

    /// <summary>回退一步(不可越过起点)。</summary>
    public void Back()
    {
        if (_index > 0) _index--;
    }

    /// <summary>重置到第一步。</summary>
    public void Reset() => _index = 0;
}
