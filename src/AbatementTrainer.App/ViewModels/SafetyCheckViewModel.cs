using AbatementTrainer.App.Services;
using AbatementTrainer.Core.Models;
using CommunityToolkit.Mvvm.ComponentModel;

namespace AbatementTrainer.App.ViewModels;

/// <summary>M6:单条安全确认项的 ViewModel。</summary>
public sealed partial class SafetyCheckViewModel : ObservableObject
{
    private readonly SafetyCheck _model;

    public SafetyCheckViewModel(SafetyCheck model, int index)
    {
        _model = model;
        Index = index;
    }

    /// <summary>在当前步骤 SafetyChecks 中的索引(与 ProcedureRunner 门控对应)。</summary>
    public int Index { get; }

    /// <summary>是否必填。</summary>
    public bool Required => _model.Required;

    /// <summary>类型(用于图标着色等)。</summary>
    public SafetyType Type => _model.Type;

    /// <summary>当前语言下的确认文案。</summary>
    public string Text => LocalizationService.Instance.Localize(_model.Text);

    /// <summary>是否已勾选确认。变更时通知外部重新评估门控。</summary>
    [ObservableProperty]
    private bool _isConfirmed;

    partial void OnIsConfirmedChanged(bool value) => Confirmed?.Invoke(this, value);

    /// <summary>勾选状态变化事件(由步骤面板订阅以刷新「下一步」可用性)。</summary>
    public event EventHandler<bool>? Confirmed;

    /// <summary>语言切换时刷新文案。</summary>
    public void RefreshLanguage() => OnPropertyChanged(nameof(Text));
}
