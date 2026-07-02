using AbatementTrainer.App.Services;
using AbatementTrainer.Core.Models;
using CommunityToolkit.Mvvm.ComponentModel;

namespace AbatementTrainer.App.ViewModels;

/// <summary>M3/M4:部件 ViewModel,双向联动 3D 场景节点。</summary>
public sealed partial class PartViewModel : ObservableObject
{
    private readonly Part _model;
    private readonly SceneController _scene;

    public PartViewModel(Part model, SceneController scene)
    {
        _model = model;
        _scene = scene;
    }

    /// <summary>部件逻辑 id。</summary>
    public string Id => _model.Id;

    /// <summary>对应 glTF 节点名。</summary>
    public string Node => _model.Node;

    /// <summary>部件号。</summary>
    public string? PartNo => _model.PartNo;

    /// <summary>当前语言下的部件名。</summary>
    public string Name => LocalizationService.Instance.Localize(_model.Name);

    /// <summary>显示名(含部件号)。</summary>
    public string DisplayName => string.IsNullOrEmpty(PartNo) ? Name : $"{Name}（{PartNo}）";

    /// <summary>M4:可见性,双向绑到对应 SceneNode.Visible。</summary>
    [ObservableProperty]
    private bool _isVisible = true;

    partial void OnIsVisibleChanged(bool value) => _scene.SetVisible(Node, value);

    /// <summary>M3:列表选中态,选中即高亮对应 3D 节点。</summary>
    [ObservableProperty]
    private bool _isSelected;

    partial void OnIsSelectedChanged(bool value)
    {
        if (value) _scene.Highlight(Node);
    }

    /// <summary>语言切换时刷新名称。</summary>
    public void RefreshLanguage()
    {
        OnPropertyChanged(nameof(Name));
        OnPropertyChanged(nameof(DisplayName));
    }
}
