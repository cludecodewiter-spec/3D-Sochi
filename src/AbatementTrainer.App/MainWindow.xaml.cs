using System.Linq;
using System.Windows;
using System.Windows.Input;
using AbatementTrainer.App.ViewModels;
using HelixToolkit.SharpDX.Core.Model.Scene;

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
            // M3:在 3D 中点选部件 → 反向选中列表项
            View.MouseDown3D += OnViewMouseDown;
        }
    }

    /// <summary>3D 命中测试:点中某节点则在部件列表中选中它。</summary>
    private void OnViewMouseDown(object? sender, RoutedEventArgs e)
    {
        if (DataContext is not MainViewModel vm) return;
        if (e is not MouseButtonEventArgs me || me.ChangedButton != MouseButton.Left) return;

        var pos = me.GetPosition(View);
        var hits = View.FindHits(pos);
        if (hits is null || hits.Count == 0) return;

        // 取最近命中,向上回溯到带名字的节点
        var node = hits[0].ModelHit as SceneNode;
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
