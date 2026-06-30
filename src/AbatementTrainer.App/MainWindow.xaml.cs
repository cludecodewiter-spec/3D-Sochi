using System.Linq;
using System.Windows;
using AbatementTrainer.App.ViewModels;
using HelixToolkit.SharpDX.Model.Scene;
using HelixToolkit.Wpf.SharpDX;

namespace AbatementTrainer.App;

/// <summary>主窗口代码后置:仅放与视图强相关、不便用纯 MVVM 表达的逻辑。</summary>
public partial class MainWindow : Window
{
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
            // M3:在 3D 中点选部件 → 反向选中列表项
            View.MouseDown3D += OnViewMouseDown;
        }
    }

    /// <summary>3D 命中测试:点中某节点则在部件列表中选中它(M3 反向联动)。</summary>
    private void OnViewMouseDown(object? sender, RoutedEventArgs e)
    {
        if (DataContext is not MainViewModel vm) return;
        // Helix 的 3D 鼠标事件携带命中结果,无需再次 FindHits
        if (e is not MouseDown3DEventArgs args || args.HitTestResult is null) return;

        var node = args.HitTestResult.ModelHit as SceneNode;
        var name = AscendToNamed(node);
        if (name is null) return;

        var part = vm.Parts.FirstOrDefault(p => p.Node == name);
        if (part is not null) vm.SelectedPart = part;
    }

    /// <summary>命中的可能是子网格节点,向上找到与部件对应的命名节点。</summary>
    private static string? AscendToNamed(SceneNode? node)
    {
        while (node is not null)
        {
            if (!string.IsNullOrEmpty(node.Name)) return node.Name;
            node = node.Parent;
        }
        return null;
    }
}
