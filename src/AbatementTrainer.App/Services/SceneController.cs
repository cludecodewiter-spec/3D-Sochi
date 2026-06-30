using System.Collections.Generic;
using System.Windows.Threading;
using HelixToolkit.SharpDX.Core.Model;
using HelixToolkit.SharpDX.Core.Model.Scene;
using SharpDXMatrix = global::SharpDX.Matrix;
using SharpDXVector3 = global::SharpDX.Vector3;

namespace AbatementTrainer.App.Services;

/// <summary>
/// M3/M4/M7:对场景图节点执行显隐、隔离、高亮、平移取下动画。
/// 仅操作 SceneNode(与具体控件解耦)。
///
/// 说明:Helix v3(SharpDX 线)节点变换 <see cref="SceneNode.ModelMatrix"/> 为
/// 行主序 <c>SharpDX.Matrix</c>;高亮采用节点级 PostEffect("highlight"),
/// 需在 Viewport3DX 中注册对应的边框高亮后效(见 MainWindow.xaml)。
/// 具体后效名称/材质 API 请对照 Helix v3 官方示例核对(BUILD_SPEC §6)。
/// </summary>
public sealed class SceneController
{
    private const string HighlightEffect = "highlight";

    private readonly IReadOnlyDictionary<string, SceneNode> _nodesByName;

    // 记录每个节点的初始变换,便于回退/复位
    private readonly Dictionary<SceneNode, SharpDXMatrix> _baseMatrix = new();

    private SceneNode? _highlighted;
    private DispatcherTimer? _animTimer;

    public SceneController(IReadOnlyDictionary<string, SceneNode> nodesByName)
    {
        _nodesByName = nodesByName;
        foreach (var node in nodesByName.Values)
            _baseMatrix[node] = node.ModelMatrix;
    }

    /// <summary>动画时长(毫秒),性能差时可设 0 直接生效。</summary>
    public int AnimationMs { get; set; } = 500;

    /// <summary>按部件 node 名取场景节点。</summary>
    public SceneNode? Find(string nodeName) =>
        _nodesByName.TryGetValue(nodeName, out var n) ? n : null;

    /// <summary>设置单个部件可见性。</summary>
    public void SetVisible(string nodeName, bool visible)
    {
        var node = Find(nodeName);
        if (node is not null) node.Visible = visible;
    }

    /// <summary>全部显示。</summary>
    public void ShowAll()
    {
        foreach (var node in _nodesByName.Values) node.Visible = true;
    }

    /// <summary>隔离:仅显示指定部件,其余隐藏。</summary>
    public void Isolate(string nodeName)
    {
        foreach (var kv in _nodesByName)
            kv.Value.Visible = kv.Key == nodeName;
    }

    /// <summary>高亮指定部件(先清除上一处)。M3 列表↔3D 联动用。</summary>
    public void Highlight(string? nodeName)
    {
        if (_highlighted is not null)
        {
            _highlighted.RemovePostEffect(HighlightEffect);
            _highlighted = null;
        }
        if (nodeName is null) return;

        var node = Find(nodeName);
        if (node is null) return;
        // 节点级后效:需在 Viewport3DX 中注册同名 PostEffectMeshBorderHighlight(见 MainWindow.xaml)
        node.AddPostEffect(new EffectAttributes(HighlightEffect));
        _highlighted = node;
    }

    /// <summary>
    /// M7:沿 <paramref name="offset"/> 平移「取下」目标部件,动画结束后置不可见。
    /// 无 offset 则直接隐藏(退化为 M6 行为)。
    /// </summary>
    public void RemovePart(string nodeName, float[]? offset)
    {
        var node = Find(nodeName);
        if (node is null) return;

        if (offset is null || offset.Length != 3 || AnimationMs <= 0)
        {
            node.Visible = false;
            return;
        }

        var translate = new SharpDXVector3(offset[0], offset[1], offset[2]);
        Animate(node, translate, hideAtEnd: true);
    }

    /// <summary>M7:回退时复位目标部件(恢复可见并平移回原位)。</summary>
    public void RestorePart(string nodeName)
    {
        var node = Find(nodeName);
        if (node is null) return;
        node.Visible = true;
        if (_baseMatrix.TryGetValue(node, out var m))
            node.ModelMatrix = m;
    }

    /// <summary>把所有节点恢复到初始变换与可见状态。</summary>
    public void ResetAll()
    {
        StopAnim();
        foreach (var kv in _baseMatrix)
        {
            kv.Key.ModelMatrix = kv.Value;
            kv.Key.Visible = true;
        }
        Highlight(null);
    }

    // 用 DispatcherTimer 做平移插值动画
    private void Animate(SceneNode node, SharpDXVector3 totalTranslate, bool hideAtEnd)
    {
        StopAnim();
        var baseM = _baseMatrix.TryGetValue(node, out var m) ? m : node.ModelMatrix;

        var elapsed = 0;
        const int interval = 16; // ~60fps
        _animTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(interval) };
        _animTimer.Tick += (_, _) =>
        {
            elapsed += interval;
            var t = Math.Min(1.0, (double)elapsed / AnimationMs);
            // 缓动(easeInOut)
            var e = t < 0.5 ? 2 * t * t : 1 - Math.Pow(-2 * t + 2, 2) / 2;
            var step = totalTranslate * (float)e;
            node.ModelMatrix = baseM * SharpDXMatrix.Translation(step);

            if (t >= 1.0)
            {
                StopAnim();
                if (hideAtEnd) node.Visible = false;
            }
        };
        _animTimer.Start();
    }

    private void StopAnim()
    {
        _animTimer?.Stop();
        _animTimer = null;
    }
}
