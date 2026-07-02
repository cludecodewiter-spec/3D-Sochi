using System.Linq;
using System.Numerics;
using System.Windows;
using System.Windows.Input;
using AbatementTrainer.App.ViewModels;
using HelixToolkit.SharpDX.Model.Scene;
using HelixToolkit.Wpf.SharpDX;

namespace AbatementTrainer.App;

/// <summary>主窗口代码后置:仅放与视图强相关、不便用纯 MVVM 表达的逻辑(拾取/拖拽/视角)。</summary>
public partial class MainWindow : Window
{
    // ── 拖拽插拔状态(与网页版同一套轴约束数学)──
    private string? _dragNode;
    private Vector3 _dragDir;
    private float _dragLen;
    private Vector3 _dragBase;
    private float _dragStart;
    private bool _dragMoved;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            // 复位视角:VM 请求 → 调用 Viewport3DX.ZoomExtents(按模型包围盒)
            vm.ResetViewRequested += (_, _) => View.ZoomExtents();
            // M2:模型场景图就绪/清空 → 维护视口分组节点
            vm.ModelRootReady += root => GroupModel.AddNode(root);
            vm.ModelCleared += () => GroupModel.Clear();
            // M3/拖拽:按下 → 命中部件即开始拖拽(未拖动松手=点选)
            View.MouseDown3D += OnViewMouseDown;
            View.MouseMove += OnViewMouseMove;
            View.MouseUp += OnViewMouseUp;
            View.LostMouseCapture += (_, _) => EndDrag(snap: true);
        }
    }

    /// <summary>3D 命中:开始拖拽(沿清单 removeOffset 轴);松手未移动则视为点选。</summary>
    private void OnViewMouseDown(object? sender, RoutedEventArgs e)
    {
        if (DataContext is not MainViewModel vm || vm.Scene is null) return;
        if (e is not MouseDown3DEventArgs args || args.HitTestResult is null) return;

        var name = AscendToPart(args.HitTestResult.ModelHit as SceneNode, vm);
        if (name is null) return;
        var axis = vm.GetDragAxis(name);
        if (axis is null) return;   // 非部件(地面等)不可拖

        var (dir, len) = axis.Value;
        _dragNode = name;
        _dragDir = dir;
        _dragLen = len;
        _dragBase = vm.Scene.GetBaseTranslation(name);
        _dragMoved = false;

        // 起始参数 = 当前射线在轴上的最近点 − 已拔出量(拖拽增量以此为零点)
        var ray = RayAt(Mouse.GetPosition(View));
        _dragStart = LineParam(ray.pos, ray.dir, _dragBase, _dragDir)
                     - vm.Scene.GetPulloutAmount(name, _dragDir);

        View.IsRotationEnabled = false;   // 拖拽期间暂停视角旋转
        Mouse.Capture(View);
    }

    private void OnViewMouseMove(object sender, MouseEventArgs e)
    {
        if (_dragNode is null || DataContext is not MainViewModel vm || vm.Scene is null) return;
        var ray = RayAt(e.GetPosition(View));
        var t = LineParam(ray.pos, ray.dir, _dragBase, _dragDir) - _dragStart;
        t = Math.Clamp(t, 0f, _dragLen * 1.3f);   // 行程限位(与网页版一致)
        vm.Scene.SetPullout(_dragNode, _dragDir, t);
        _dragMoved = true;
    }

    private void OnViewMouseUp(object sender, MouseButtonEventArgs e) => EndDrag(snap: true);

    /// <summary>结束拖拽:吸附(>60% 拔到位,否则弹回);未移动的按下视为点选。</summary>
    private void EndDrag(bool snap)
    {
        if (_dragNode is null) return;
        var node = _dragNode;
        _dragNode = null;

        if (DataContext is MainViewModel vm && vm.Scene is not null)
        {
            if (_dragMoved && snap)
                vm.Scene.SnapPullout(node, _dragDir, _dragLen);
            else if (!_dragMoved)
                vm.SelectedPart = vm.Parts.FirstOrDefault(p => p.Node == node);   // 原地点击=选中
        }
        View.IsRotationEnabled = true;
        if (Mouse.Captured == View) Mouse.Capture(null);
    }

    /// <summary>屏幕点 → 世界射线(Helix v3 ViewportExtensions.UnProject)。</summary>
    private (Vector3 pos, Vector3 dir) RayAt(Point p)
    {
        var ray = View.UnProject(new Vector2((float)p.X, (float)p.Y));
        return (ray.Position, Vector3.Normalize(ray.Direction));
    }

    /// <summary>鼠标射线与插拔轴线的最近点参数(沿轴;两方向均已归一化)。</summary>
    private static float LineParam(Vector3 rayO, Vector3 rayD, Vector3 p0, Vector3 lineDir)
    {
        var w0 = rayO - p0;
        float b = Vector3.Dot(rayD, lineDir);
        float d = Vector3.Dot(rayD, w0);
        float e = Vector3.Dot(lineDir, w0);
        float den = 1f - b * b;
        if (Math.Abs(den) < 1e-6f) return e;   // 视线与轴几乎平行
        return (e - b * d) / den;
    }

    /// <summary>命中的可能是子网格节点,向上回溯到「清单里存在的部件」节点(跳过中间命名层)。</summary>
    private static string? AscendToPart(SceneNode? node, MainViewModel vm)
    {
        while (node is not null)
        {
            if (!string.IsNullOrEmpty(node.Name) &&
                vm.Parts.Any(p => p.Node == node.Name))
                return node.Name;
            node = node.Parent;
        }
        return null;
    }
}
