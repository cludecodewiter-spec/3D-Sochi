using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using AbatementTrainer.App.Services;
using AbatementTrainer.Core.Models;
using AbatementTrainer.Core.Manifest;
using AbatementTrainer.Core.Procedure;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using HelixToolkit.SharpDX;
using HelixToolkit.SharpDX.Model.Scene;
using HelixToolkit.Wpf.SharpDX;

namespace AbatementTrainer.App.ViewModels;

/// <summary>设备库卡片(M9 起始页)。</summary>
public sealed partial class DeviceCardViewModel : ObservableObject
{
    public ContentIndexEntry Entry { get; }
    public DeviceCardViewModel(ContentIndexEntry entry) => Entry = entry;
    public string Name => LocalizationService.Instance.Localize(Entry.Name);
    public void RefreshLanguage() => OnPropertyChanged(nameof(Name));
}

/// <summary>主 ViewModel:串起 M2–M10 全部交互。</summary>
public sealed partial class MainViewModel : ObservableObject
{
    private readonly ContentLibraryService _library = new();
    private readonly ModelLoaderService _loader = new();
    private readonly LocalizationService _loc = LocalizationService.Instance;

    private Manifest? _manifest;
    private SceneController? _scene;
    private ProcedureRunner? _runner;

    public MainViewModel()
    {
        EffectsManager = new DefaultEffectsManager();
        Camera = new PerspectiveCamera
        {
            Position = new System.Windows.Media.Media3D.Point3D(4, 3, 5),
            LookDirection = new System.Windows.Media.Media3D.Vector3D(-4, -3, -5),
            UpDirection = new System.Windows.Media.Media3D.Vector3D(0, 1, 0),
            FarPlaneDistance = 1000,
            NearPlaneDistance = 0.1
        };
        // 语言切换 → 刷新所有本地化文案
        _loc.LanguageChanged += (_, _) => RefreshAllLanguage();

        LoadLibrary();
    }

    // ───────── Viewport 绑定属性(M2) ─────────
    public IEffectsManager EffectsManager { get; }
    public PerspectiveCamera Camera { get; }

    /// <summary>请求复位视角(由窗口订阅后调用 viewport.ZoomExtents)。</summary>
    public event EventHandler? ResetViewRequested;

    /// <summary>模型场景图就绪:窗口将其 AddNode 到视口的分组节点。</summary>
    public event Action<SceneNode>? ModelRootReady;

    /// <summary>清空当前模型:窗口清空分组节点。</summary>
    public event Action? ModelCleared;

    // ───────── 状态 ─────────
    public LocalizationService Loc => _loc;

    /// <summary>HMI 触摸屏(PLC 仿真,Core 逻辑)。</summary>
    public PlcViewModel Plc { get; } = new();

    /// <summary>当前是否在训练界面(false=设备库起始页)。</summary>
    [ObservableProperty] private bool _isTrainingActive;

    /// <summary>当前是否在考核模式(M10)。</summary>
    [ObservableProperty] private bool _isExamActive;

    [ObservableProperty] private string? _errorMessage;

    // ───────── M9 设备库 ─────────
    public ObservableCollection<DeviceCardViewModel> Devices { get; } = new();

    private void LoadLibrary()
    {
        Devices.Clear();
        try
        {
            foreach (var e in _library.LoadIndex())
                Devices.Add(new DeviceCardViewModel(e));
        }
        catch (Exception ex)
        {
            ErrorMessage = $"{_loc["LoadError"]}: {ex.Message}";
        }
    }

    /// <summary>M9:加载选定设备的模型 + 清单,进入训练界面。</summary>
    [RelayCommand]
    private void LoadDevice(DeviceCardViewModel? card)
    {
        if (card is null) return;
        ErrorMessage = null;
        try
        {
            var manifest = _library.LoadManifest(card.Entry);
            var modelPath = _library.ResolveModelPath(card.Entry, manifest);

            // M1:加载前校验(坏清单则拦截并提示)
            var report = ManifestValidator.Validate(manifest, modelPath);
            if (report.HasErrors)
            {
                ErrorMessage = $"{_loc["ValidationFailed"]}:\n" + string.Join("\n", report.Errors);
                return;
            }

            // M2:导入模型并加入视口(实际 AddNode 在窗口代码后置完成)
            var loaded = _loader.Load(modelPath);
            ModelCleared?.Invoke();
            ModelRootReady?.Invoke(loaded.Root);

            _manifest = manifest;
            _scene = new SceneController(loaded.NodesByName);

            // M3/M4:构建部件列表
            BuildParts();

            // M5:procedure runner(按 order 排序)
            var ordered = manifest.Procedure.Steps.OrderBy(s => s.Order).ToList();
            _runner = new ProcedureRunner(ordered);

            IsTrainingActive = true;
            IsExamActive = false;
            StartExamCommand.NotifyCanExecuteChanged();   // _manifest 就绪 → 考核按钮可用
            RefreshStep();
            ResetViewRequested?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex)
        {
            ErrorMessage = $"{_loc["LoadError"]}: {ex.Message}";
        }
    }

    [RelayCommand]
    private void BackToLibrary()
    {
        IsTrainingActive = false;
        IsExamActive = false;
        _scene?.ResetAll();        // 停止可能在途的取下动画(DispatcherTimer)
        Plc.ResetAll();            // HMI/PLC 状态复位
        ModelCleared?.Invoke();
        SelectedPart = null;       // 清除选中(避免残留高亮联动到下一台设备)
        _scene = null;
        _runner = null;
        _manifest = null;          // 复位路径完整:防止旧清单被 StartExam/NodeOf 复用
        Exam = null;               // 释放旧考核会话(其步骤引用旧清单)
        Parts.Clear();
        // 解除安全确认项事件订阅并清空(否则旧 VM 挂着 OnCheckToggled 残留)
        foreach (var c in SafetyChecks) c.Confirmed -= OnCheckToggled;
        SafetyChecks.Clear();
        IsComplete = false;
        StartExamCommand.NotifyCanExecuteChanged();   // _manifest 已清空 → 考核按钮禁用
    }

    // ───────── M3/M4 部件树 ─────────
    public ObservableCollection<PartViewModel> Parts { get; } = new();

    [ObservableProperty] private PartViewModel? _selectedPart;

    partial void OnSelectedPartChanged(PartViewModel? value)
    {
        // 列表 → 3D 高亮
        _scene?.Highlight(value?.Node);
    }

    private void BuildParts()
    {
        Parts.Clear();
        if (_manifest is null || _scene is null) return;
        foreach (var p in _manifest.Parts)
            Parts.Add(new PartViewModel(p, _scene));
    }

    [RelayCommand]
    private void Isolate()
    {
        if (SelectedPart is null) return;
        _scene?.Isolate(SelectedPart.Node);
        foreach (var p in Parts) p.IsVisible = p.Node == SelectedPart.Node;
    }

    [RelayCommand]
    private void ShowAll()
    {
        _scene?.ShowAll();
        foreach (var p in Parts) p.IsVisible = true;
    }

    [RelayCommand]
    private void ResetView() => ResetViewRequested?.Invoke(this, EventArgs.Empty);

    // ───────── M5/M6 步骤 + 安全门 ─────────
    public ObservableCollection<SafetyCheckViewModel> SafetyChecks { get; } = new();

    [ObservableProperty] private string _stepInstruction = string.Empty;
    [ObservableProperty] private string _stepTitle = string.Empty;
    [ObservableProperty] private string _progressText = string.Empty;
    [ObservableProperty] private bool _isComplete;

    /// <summary>M6:当前步骤 required 安全项是否全部确认(安全门语义;驱动门控提示)。</summary>
    public bool CanAdvance =>
        _runner is not null && _runner.CanAdvance(ConfirmedIndices());

    /// <summary>「下一步」按钮可用性:安全门通过且流程尚未完成。</summary>
    public bool CanGoNext => _runner is not null && !_runner.IsComplete && CanAdvance;

    private IReadOnlySet<int> ConfirmedIndices() =>
        SafetyChecks.Where(c => c.IsConfirmed).Select(c => c.Index).ToHashSet();

    private void RefreshStep()
    {
        // 解除旧订阅
        foreach (var c in SafetyChecks) c.Confirmed -= OnCheckToggled;
        SafetyChecks.Clear();

        if (_runner is null) return;

        IsComplete = _runner.IsComplete;
        if (_runner.Current is { } step)
        {
            for (int i = 0; i < step.SafetyChecks.Count; i++)
            {
                var vm = new SafetyCheckViewModel(step.SafetyChecks[i], i);
                vm.Confirmed += OnCheckToggled;
                SafetyChecks.Add(vm);
            }
        }
        RefreshStepTexts();

        NextCommand.NotifyCanExecuteChanged();
        OnPropertyChanged(nameof(CanAdvance));
        OnPropertyChanged(nameof(CanGoNext));
    }

    /// <summary>只刷新当前步骤的本地化文案(不重建确认项;语言切换时保留已勾选状态)。</summary>
    private void RefreshStepTexts()
    {
        if (_runner is null) return;
        if (_runner.Current is { } step)
        {
            StepInstruction = _loc.Localize(step.Instruction);
            StepTitle = _manifest is null ? string.Empty : _loc.Localize(_manifest.Procedure.Title);
            ProgressText = $"{_loc["Step"]} {_runner.Index + 1}/{_runner.Count}";
        }
        else
        {
            StepInstruction = _loc["AllComplete"];
            ProgressText = $"{_runner.Count}/{_runner.Count}";
        }
    }

    private void OnCheckToggled(object? sender, bool e)
    {
        OnPropertyChanged(nameof(CanAdvance));
        OnPropertyChanged(nameof(CanGoNext));
        NextCommand.NotifyCanExecuteChanged();
    }

    /// <summary>M6/M7:推进到下一步(安全门硬约束;所有前进路径都走这里)。</summary>
    [RelayCommand(CanExecute = nameof(CanGoNext))]
    private void Next()
    {
        if (_runner is null) return;
        var step = _runner.Current;
        if (!_runner.TryAdvance(ConfirmedIndices()))
            return; // 门控未过,绝不前进

        // 对刚完成的步骤目标件执行动作
        if (step is not null && _scene is not null)
        {
            switch (step.Action)
            {
                case StepAction.Remove:
                    _scene.RemovePart(NodeOf(step.TargetPart), step.RemoveOffset); // M7 动画
                    break;
                case StepAction.Isolate:
                    _scene.Isolate(NodeOf(step.TargetPart));
                    break;
                case StepAction.Highlight:
                    _scene.Highlight(NodeOf(step.TargetPart));
                    break;
            }
        }
        RefreshStep();
    }

    /// <summary>M6:上一步并恢复对应部件可见性。</summary>
    [RelayCommand]
    private void Previous()
    {
        if (_runner is null) return;
        _runner.Back();
        // 恢复回退后「当前步骤」目标件(取下动画反向)
        if (_runner.Current is { } step && _scene is not null)
            _scene.RestorePart(NodeOf(step.TargetPart));
        RefreshStep();
    }

    /// <summary>重练:复位流程与场景。</summary>
    [RelayCommand]
    private void Restart()
    {
        _runner?.Reset();
        _scene?.ResetAll();
        SelectedPart = null;   // ResetAll 已清 3D 高亮,同步清列表选中,避免两侧状态不一致
        foreach (var p in Parts) p.IsVisible = true;
        RefreshStep();
    }

    // 由 part.id(targetPart)解析到 glTF 节点名
    private string NodeOf(string partId) =>
        _manifest?.Parts.FirstOrDefault(p => p.Id == partId)?.Node ?? partId;

    // ───────── M10 考核 ─────────
    [ObservableProperty] private ExamViewModel? _exam;

    /// <summary>考核进行中禁止重开(防刷分:B1-HIGH——重开会拿到相同排列反复试错)。</summary>
    private bool CanStartExam => _manifest is not null && !IsExamActive;

    partial void OnIsExamActiveChanged(bool value) => StartExamCommand.NotifyCanExecuteChanged();

    [RelayCommand(CanExecute = nameof(CanStartExam))]
    private void StartExam()
    {
        if (_manifest is null) return;
        // 种子取时钟节拍:每次考核排列不同,杜绝「记住上次排列刷满分」
        Exam = new ExamViewModel(_manifest.Procedure.Steps, shuffleSeed: Environment.TickCount);
        IsExamActive = true;
    }

    [RelayCommand]
    private void ExitExam() => IsExamActive = false;

    // ───────── M8 语言 ─────────
    [RelayCommand]
    private void ToggleLanguage() => _loc.Toggle();

    private void RefreshAllLanguage()
    {
        foreach (var d in Devices) d.RefreshLanguage();
        foreach (var p in Parts) p.RefreshLanguage();
        foreach (var c in SafetyChecks) c.RefreshLanguage();
        Exam?.RefreshLanguage();
        // 只刷文案:切语言不得重建确认项(重建会清空已勾选,UX P5「切换不打断当前步」)
        RefreshStepTexts();
    }
}
