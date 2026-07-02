using System.Collections.Generic;
using System.Numerics;
using System.Windows.Threading;
using HelixToolkit.Maths;
using HelixToolkit.SharpDX.Model;
using HelixToolkit.SharpDX.Model.Scene;

namespace AbatementTrainer.App.Services;

/// <summary>
/// M3/M4/M7:对场景图节点执行显隐、隔离、高亮、平移取下动画。
/// 仅操作 SceneNode(与具体控件解耦)。
///
/// 说明:Helix v3 节点变换 <see cref="SceneNode.ModelMatrix"/> 为
/// 行主序 <c>System.Numerics.Matrix4x4</c>(v3 已弃用 SharpDX 数学库);
/// 高亮采用节点级 PostEffect("highlight"),需在 Viewport3DX 中注册同名
/// PostEffectMeshBorderHighlight 后效(见 MainWindow.xaml)。
/// </summary>
public sealed class SceneController
{
    private const string HighlightEffect = "highlight";

    private readonly IReadOnlyDictionary<string, SceneNode> _nodesByName;

    // 记录每个节点的初始变换,便于回退/复位
    private readonly Dictionary<SceneNode, Matrix4x4> _baseMatrix = new();

    private SceneNode? _highlighted;

    // 在途动画状态(同一时刻至多一个动画;新动画启动前旧动画被「直达终态」)
    private DispatcherTimer? _animTimer;
    private SceneNode? _animNode;
    private Vector3 _animTranslate;
    private bool _animHideAtEnd;

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

    /// <summary>
    /// 设置单个部件可见性。重新显示时把变换复位到安装位——
    /// 已「取下」的部件停在位移终点且隐藏,若直接重现会悬浮在半空(B1 审计发现)。
    /// </summary>
    public void SetVisible(string nodeName, bool visible)
    {
        var node = Find(nodeName);
        if (node is null) return;
        if (visible && !node.Visible && _baseMatrix.TryGetValue(node, out var m))
            node.ModelMatrix = m;   // 从隐藏恢复显示 → 回到安装位,避免悬浮
        node.Visible = visible;
    }

    /// <summary>全部显示(隐藏件同时复位到安装位,见 <see cref="SetVisible"/>)。</summary>
    public void ShowAll()
    {
        foreach (var kv in _nodesByName)
        {
            if (!kv.Value.Visible && _baseMatrix.TryGetValue(kv.Value, out var m))
                kv.Value.ModelMatrix = m;
            kv.Value.Visible = true;
        }
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

        var translate = new Vector3(offset[0], offset[1], offset[2]);
        Animate(node, translate, hideAtEnd: true);
    }

    /// <summary>M7:回退时复位目标部件(恢复可见并平移回原位)。</summary>
    public void RestorePart(string nodeName)
    {
        var node = Find(nodeName);
        if (node is null) return;
        // 若该节点正处于取下动画中,先取消(否则后续 Tick 会再次平移并在末尾隐藏它)
        if (node == _animNode) CancelAnim();
        node.Visible = true;
        if (_baseMatrix.TryGetValue(node, out var m))
            node.ModelMatrix = m;
    }

    /// <summary>把所有节点恢复到初始变换与可见状态。</summary>
    public void ResetAll()
    {
        CancelAnim(); // 直接取消即可:下面统一恢复初始状态
        foreach (var kv in _baseMatrix)
        {
            kv.Key.ModelMatrix = kv.Value;
            kv.Key.Visible = true;
        }
        Highlight(null);
    }

    // 用 DispatcherTimer 做平移插值动画
    private void Animate(SceneNode node, Vector3 totalTranslate, bool hideAtEnd)
    {
        FinishAnim(); // 上一个在途动画直达终态(防止连续两步取下时,前一部件停在半空且未隐藏)
        var baseM = _baseMatrix.TryGetValue(node, out var m) ? m : node.ModelMatrix;
        _animNode = node;
        _animTranslate = totalTranslate;
        _animHideAtEnd = hideAtEnd;

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
            node.ModelMatrix = baseM * Matrix4x4.CreateTranslation(step);

            if (t >= 1.0)
            {
                CancelAnim();
                if (hideAtEnd) node.Visible = false;
            }
        };
        _animTimer.Start();
    }

    /// <summary>把在途动画直接推进到终态(平移到位并按需隐藏),然后停表。</summary>
    private void FinishAnim()
    {
        if (_animNode is not null)
        {
            var baseM = _baseMatrix.TryGetValue(_animNode, out var m) ? m : _animNode.ModelMatrix;
            _animNode.ModelMatrix = baseM * Matrix4x4.CreateTranslation(_animTranslate);
            if (_animHideAtEnd) _animNode.Visible = false;
        }
        CancelAnim();
    }

    /// <summary>仅停表并清除在途动画记录,不改变节点当前状态(调用方随后自行复位)。</summary>
    private void CancelAnim()
    {
        _animTimer?.Stop();
        _animTimer = null;
        _animNode = null;
    }

    // ═══════════════ 拖拽插拔支持(与网页版同一套轴约束数学) ═══════════════

    /// <summary>取部件初始位移(基准矩阵的平移分量;拖拽轴线起点)。</summary>
    public Vector3 GetBaseTranslation(string nodeName)
    {
        var node = Find(nodeName);
        return node is not null && _baseMatrix.TryGetValue(node, out var m)
            ? m.Translation
            : Vector3.Zero;
    }

    /// <summary>取部件当前沿 <paramref name="dir"/> 的拔出量(供拖拽起始点计算)。</summary>
    public float GetPulloutAmount(string nodeName, Vector3 dir)
    {
        var node = Find(nodeName);
        if (node is null || !_baseMatrix.TryGetValue(node, out var m)) return 0;
        return Vector3.Dot(node.ModelMatrix.Translation - m.Translation, dir);
    }

    /// <summary>把部件放到「基准位 + dir×t」处(拖拽中实时调用;t 由调用方裁剪)。</summary>
    public void SetPullout(string nodeName, Vector3 dir, float t)
    {
        var node = Find(nodeName);
        if (node is null || !_baseMatrix.TryGetValue(node, out var m)) return;
        node.ModelMatrix = m * Matrix4x4.CreateTranslation(dir * t);
    }

    /// <summary>拖拽结束吸附:超过 60% 拔到位,否则弹回装好(带动画)。</summary>
    public void SnapPullout(string nodeName, Vector3 dir, float len)
    {
        var node = Find(nodeName);
        if (node is null) return;
        float cur = GetPulloutAmount(nodeName, dir);
        if (cur > len * 0.6f)
            Animate(node, dir * len, hideAtEnd: false);   // 拔到位(保持可见,与网页版一致)
        else
            RestorePart(nodeName);                        // 弹回安装位
    }

    // ═══════════════ PLC → 3D 运转视觉(表针/信号灯/LED/浮子/手轮) ═══════════════
    // 生成器给动画件用了独立材质名(needle/beacon/led_g/led_a/led_r/red_paint),
    // Assimp 导入后按「部件根节点 + 材质名」定位对应 MeshNode;找不到则安静降级(不同模型无此件)。

    private MeshNode? _needle, _beacon, _ledG, _ledA, _ledR, _wheel, _float;
    private Matrix4x4 _needleBase, _wheelBase, _floatBase;
    private float _wheelAngle, _wheelTarget;

    /// <summary>扫描部件子树,绑定 PLC 动画子网格。加载模型后调用一次。</summary>
    public void BindPlcVisuals()
    {
        _needle = FindMesh("gauge", "needle");
        _beacon = FindMesh("cabinet", "beacon");
        _ledG = FindMesh("control_panel", "led_g");
        _ledA = FindMesh("control_panel", "led_a");
        _ledR = FindMesh("control_panel", "led_r");
        _wheel = FindMesh("valve", "red_paint");
        _float = FindMesh("flow_meter", "red_paint");
        if (_needle is not null) _needleBase = _needle.ModelMatrix;
        if (_wheel is not null) _wheelBase = _wheel.ModelMatrix;
        if (_float is not null) _floatBase = _float.ModelMatrix;
        _wheelAngle = _wheelTarget = 0;
    }

    /// <summary>阀门开/关时调用:手轮目标转角 ±2 圈。</summary>
    public void SpinValveWheel(bool open) =>
        _wheelTarget += (open ? 1 : -1) * 4 * MathF.PI;

    /// <summary>
    /// 每个 PLC 扫描周期调用:驱动表针旋转、浮子升降、信号灯/LED 发光、手轮旋转。
    /// 找不到对应网格时各自跳过(非 unitC 模型无这些件)。
    /// </summary>
    public void UpdatePlcVisuals(double pressureKpa, double flowLpm, bool beaconOn,
        bool running, bool alarmLampOn, bool valveOpen)
    {
        // 表针:0 kPa=225°,满量程(300kPa)扫过 270°(与表盘贴图刻度一致)
        if (_needle is not null)
        {
            float deg = 225f - 270f * (float)Math.Min(1.0, pressureKpa / 300.0);
            _needle.ModelMatrix = Matrix4x4.CreateRotationZ(deg * MathF.PI / 180f) * _needleBase;
        }
        // 浮子:随流量升起(满量程升 0.15,本地 Y)
        if (_float is not null)
        {
            float fn = (float)Math.Min(1.0, flowLpm / 42.0);
            _float.ModelMatrix = _floatBase * Matrix4x4.CreateTranslation(0, fn * 0.15f, 0);
        }
        // 手轮:向目标角度平滑逼近
        if (_wheel is not null)
        {
            _wheelAngle += (_wheelTarget - _wheelAngle) * 0.15f;
            _wheel.ModelMatrix = Matrix4x4.CreateRotationZ(_wheelAngle) * _wheelBase;
        }
        SetEmissive(_beacon, beaconOn, 1f, 0.15f, 0.1f);
        SetEmissive(_ledG, running, 0.15f, 0.9f, 0.25f);
        SetEmissive(_ledA, !running && !alarmLampOn && valveOpen, 0.95f, 0.65f, 0.15f);
        SetEmissive(_ledR, alarmLampOn, 1f, 0.15f, 0.1f);
    }

    private static void SetEmissive(MeshNode? mesh, bool on, float r, float g, float b)
    {
        if (mesh?.Material is PBRMaterialCore pbr)
            pbr.EmissiveColor = on ? new Color4(r, g, b, 1f) : new Color4(r * 0.08f, g * 0.08f, b * 0.08f, 1f);
    }

    /// <summary>在部件根节点子树内按材质名找 MeshNode。</summary>
    private MeshNode? FindMesh(string partNode, string materialName)
    {
        var root = Find(partNode);
        if (root is null) return null;
        MeshNode? hit = null;
        void Walk(SceneNode n)
        {
            if (hit is not null) return;
            if (n is MeshNode mesh && mesh.Material?.Name == materialName) { hit = mesh; return; }
            foreach (var c in n.Items) Walk(c);
        }
        Walk(root);
        return hit;
    }
}
