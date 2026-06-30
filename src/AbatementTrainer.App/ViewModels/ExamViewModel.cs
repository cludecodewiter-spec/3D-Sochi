using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using AbatementTrainer.App.Services;
using AbatementTrainer.Core.Exam;
using AbatementTrainer.Core.Models;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace AbatementTrainer.App.ViewModels;

/// <summary>考核中的一个步骤条目(展示用,隐藏正确 order)。</summary>
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

/// <summary>M10:考核模式 ViewModel。打乱步骤→学员排序→评分。</summary>
public sealed partial class ExamViewModel : ObservableObject
{
    private readonly IReadOnlyList<Step> _steps;

    public ExamViewModel(IReadOnlyList<Step> steps, int shuffleSeed)
    {
        _steps = steps;
        var shuffled = ExamScorer.Shuffle(steps, shuffleSeed);
        Items = new ObservableCollection<ExamStepViewModel>(
            shuffled.Select(s => new ExamStepViewModel(s)));
    }

    /// <summary>学员当前排列(可上下移动)。</summary>
    public ObservableCollection<ExamStepViewModel> Items { get; }

    [ObservableProperty]
    private ExamStepViewModel? _selected;

    [ObservableProperty]
    private bool _hasResult;

    [ObservableProperty]
    private double _accuracy;

    [ObservableProperty]
    private string _resultSummary = string.Empty;

    /// <summary>错误位置集合(供 UI 标红)。</summary>
    public HashSet<int> WrongPositions { get; } = new();

    [RelayCommand]
    private void MoveUp()
    {
        if (Selected is null) return;
        var i = Items.IndexOf(Selected);
        if (i > 0) Items.Move(i, i - 1);
    }

    [RelayCommand]
    private void MoveDown()
    {
        if (Selected is null) return;
        var i = Items.IndexOf(Selected);
        if (i >= 0 && i < Items.Count - 1) Items.Move(i, i + 1);
    }

    /// <summary>M10:提交评分。与正确 order 比对,得出正确率与错处。</summary>
    [RelayCommand]
    private void Submit()
    {
        var submitted = Items.Select(x => x.Order).ToList();
        var result = ExamScorer.Score(submitted);

        WrongPositions.Clear();
        foreach (var p in result.WrongPositions) WrongPositions.Add(p);

        Accuracy = result.Accuracy;
        HasResult = true;
        ResultSummary = $"{LocalizationService.Instance["ExamScore"]}: " +
                        $"{result.CorrectCount}/{result.Total} ({result.Accuracy:P0})";
    }

    public void RefreshLanguage()
    {
        foreach (var it in Items) it.RefreshLanguage();
        if (HasResult) Submit(); // 重新生成本地化摘要
    }
}
