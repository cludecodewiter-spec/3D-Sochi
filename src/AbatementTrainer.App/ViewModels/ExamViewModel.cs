using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using AbatementTrainer.App.Services;
using AbatementTrainer.Core.Exam;
using AbatementTrainer.Core.Models;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace AbatementTrainer.App.ViewModels;

/// <summary>考核中的一个步骤条目(排序阶段展示;隐藏正确 order)。</summary>
public sealed partial class ExamStepViewModel : ObservableObject
{
    private readonly Step _step;
    public ExamStepViewModel(Step step) => _step = step;

    /// <summary>真实 order(评分用,不在 UI 直接显示)。</summary>
    public int Order => _step.Order;

    /// <summary>当前语言的步骤说明。</summary>
    public string Instruction => LocalizationService.Instance.Localize(_step.Instruction);

    public void RefreshLanguage() => OnPropertyChanged(nameof(Instruction));
}

/// <summary>
/// M10:考核模式 ViewModel。打乱步骤 → 学员排序 → 提交评分 →
/// 按学员排出的顺序进入执行阶段,**安全确认仍强制**(由 Core ExamSession 保证)。
/// </summary>
public sealed partial class ExamViewModel : ObservableObject
{
    private readonly ExamSession _session;
    private readonly LocalizationService _loc = LocalizationService.Instance;

    public ExamViewModel(IReadOnlyList<Step> steps, int shuffleSeed)
    {
        _session = new ExamSession(steps, shuffleSeed);
        Items = new ObservableCollection<ExamStepViewModel>(
            _session.Arrangement.Select(s => new ExamStepViewModel(s)));
    }

    // ───────── 阶段标志(驱动 XAML 切换) ─────────
    public bool IsArranging => _session.Phase == ExamPhase.Arranging;
    public bool IsExecuting => _session.Phase == ExamPhase.Executing;
    public bool IsFinished => _session.Phase == ExamPhase.Finished;

    private void NotifyPhase()
    {
        OnPropertyChanged(nameof(IsArranging));
        OnPropertyChanged(nameof(IsExecuting));
        OnPropertyChanged(nameof(IsFinished));
    }

    // ───────── 排序阶段 ─────────
    public ObservableCollection<ExamStepViewModel> Items { get; }

    [ObservableProperty] private ExamStepViewModel? _selected;

    [RelayCommand]
    private void MoveUp() => MoveSelected(-1);

    [RelayCommand]
    private void MoveDown() => MoveSelected(+1);

    private void MoveSelected(int delta)
    {
        if (!IsArranging || Selected is null) return;
        var i = Items.IndexOf(Selected);
        var j = i + delta;
        if (i < 0 || j < 0 || j >= Items.Count) return;
        _session.Move(i, j);   // Core 与 UI 同步移动,保证评分顺序一致
        Items.Move(i, j);
    }

    /// <summary>提交排序 → 评分 → 进入执行阶段。</summary>
    [RelayCommand]
    private void Submit()
    {
        if (!IsArranging) return;
        var ordering = _session.ScoreOrdering();
        WrongPositions.Clear();
        foreach (var p in ordering.WrongPositions) WrongPositions.Add(p);
        OrderingSummary = $"{_loc["ExamScore"]}: {ordering.CorrectCount}/{ordering.Total} ({ordering.Accuracy:P0})";

        _session.SubmitArrangement();   // 进入执行阶段(安全门强制)
        NotifyPhase();
        RefreshExecStep();
    }

    /// <summary>排序错误位置(供 UI 标红)。</summary>
    public HashSet<int> WrongPositions { get; } = new();

    [ObservableProperty] private string _orderingSummary = string.Empty;

    // ───────── 执行阶段(安全门强制) ─────────
    public ObservableCollection<SafetyCheckViewModel> SafetyChecks { get; } = new();

    [ObservableProperty] private string _execInstruction = string.Empty;
    [ObservableProperty] private string _execProgress = string.Empty;

    /// <summary>执行阶段「下一步」可用性:安全门通过且仍在执行中。</summary>
    public bool CanAdvanceExec =>
        IsExecuting && _session.Runner is not null &&
        _session.Runner.CanAdvance(ConfirmedIndices());

    private IReadOnlySet<int> ConfirmedIndices() =>
        SafetyChecks.Where(c => c.IsConfirmed).Select(c => c.Index).ToHashSet();

    private void RefreshExecStep()
    {
        foreach (var c in SafetyChecks) c.Confirmed -= OnCheckToggled;
        SafetyChecks.Clear();

        var runner = _session.Runner;
        if (runner?.Current is { } step)
        {
            ExecInstruction = _loc.Localize(step.Instruction);
            for (int i = 0; i < step.SafetyChecks.Count; i++)
            {
                var vm = new SafetyCheckViewModel(step.SafetyChecks[i], i);
                vm.Confirmed += OnCheckToggled;
                SafetyChecks.Add(vm);
            }
            ExecProgress = $"{_loc["Step"]} {runner.Index + 1}/{runner.Count}";
        }
        NextExecCommand.NotifyCanExecuteChanged();
        OnPropertyChanged(nameof(CanAdvanceExec));
    }

    private void OnCheckToggled(object? sender, bool e)
    {
        OnPropertyChanged(nameof(CanAdvanceExec));
        NextExecCommand.NotifyCanExecuteChanged();
    }

    /// <summary>执行阶段推进(安全门硬约束;未确认必填项不前进并记录违规)。</summary>
    [RelayCommand(CanExecute = nameof(CanAdvanceExec))]
    private void NextExec()
    {
        if (!_session.TryAdvanceExecution(ConfirmedIndices())) return;

        if (_session.Phase == ExamPhase.Finished)
        {
            NotifyPhase();
            BuildResult();
        }
        else
        {
            RefreshExecStep();
        }
    }

    // ───────── 结果 ─────────
    [ObservableProperty] private string _resultSummary = string.Empty;

    private void BuildResult()
    {
        var outcome = _session.BuildOutcome();
        var pass = outcome.Passed ? "✓" : "✗";
        var gate = outcome.HadGateViolationAttempt
            ? $"({_loc["GateBlocked"]})"
            : string.Empty;
        ResultSummary =
            $"{pass} {_loc["ExamScore"]}: {outcome.Ordering.CorrectCount}/{outcome.Ordering.Total} " +
            $"({outcome.Ordering.Accuracy:P0}) {gate}";
    }

    public void RefreshLanguage()
    {
        foreach (var it in Items) it.RefreshLanguage();
        foreach (var c in SafetyChecks) c.RefreshLanguage();
        // 只刷文案:不能调 RefreshExecStep 重建确认项(会把学员已勾选的项清空)
        if (IsExecuting && _session.Runner is { Current: { } step } runner)
        {
            ExecInstruction = _loc.Localize(step.Instruction);
            ExecProgress = $"{_loc["Step"]} {runner.Index + 1}/{runner.Count}";
        }
        if (IsFinished) BuildResult();
    }
}
