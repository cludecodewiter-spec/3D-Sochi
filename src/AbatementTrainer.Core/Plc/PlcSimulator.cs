using System;

namespace AbatementTrainer.Core.Plc;

/// <summary>
/// 简易 PLC 仿真器:模拟除害装置的运转逻辑(触摸屏 HMI 的后端)。
/// 参考真实 PLC 的三要素:
/// - 扫描周期:<see cref="Tick"/> 按 dt 推进(读输入 → 执行逻辑 → 写输出);
/// - 联锁(Interlock):进气阀未开 / 急停按下时禁止启动;
/// - 密封自保持(Seal-in):启动按钮松开后保持运转,直到停止/急停/联锁失效。
/// 模拟量用一阶惯性环节逼近真实过程(压力上升/下降、流量随阀门与压力变化)。
/// 纯 Core、无 UI 依赖,可单测;WPF 与网页 HMI 共用同一套逻辑。
/// </summary>
public sealed class PlcSimulator
{
    // ───── 常量(过程参数)─────

    /// <summary>额定运行压力(kPa)。</summary>
    public const double RatedPressureKpa = 250;

    /// <summary>额定流量(L/min)。</summary>
    public const double RatedFlowLpm = 42;

    private const double PressureTau = 2.5;  // 压力一阶时间常数(秒)
    private const double FlowTau = 1.2;      // 流量一阶时间常数(秒)

    // ───── 数字输入(HMI 按钮/开关)─────

    /// <summary>进气阀开(联锁条件)。</summary>
    public bool ValveOpen { get; set; }

    /// <summary>急停(按下=真)。触发后报警锁存。</summary>
    public bool EStop { get; set; }

    // ───── 数字输出(指示/执行器)─────

    /// <summary>运转中(送风机/泵)。</summary>
    public bool Running { get; private set; }

    /// <summary>报警锁存(急停或运行中联锁失效触发;需复位)。</summary>
    public bool Alarm { get; private set; }

    /// <summary>信号灯是否点亮(运行时慢闪,报警时快闪)。</summary>
    public bool BeaconOn { get; private set; }

    // ───── 模拟量(过程值)─────

    /// <summary>当前压力(kPa)。</summary>
    public double PressureKpa { get; private set; }

    /// <summary>当前流量(L/min)。</summary>
    public double FlowLpm { get; private set; }

    /// <summary>累计运行时间(秒)。</summary>
    public double RunSeconds { get; private set; }

    private double _clock; // 信号灯相位钟

    // ───── HMI 操作 ─────

    /// <summary>
    /// 启动按钮。联锁:急停未按下 且 进气阀已开 且 无报警,才允许启动;
    /// 启动后自保持(松开按钮仍运转)。返回是否启动成功。
    /// </summary>
    public bool PressStart()
    {
        if (EStop || !ValveOpen || Alarm) return false;
        Running = true;
        return true;
    }

    /// <summary>停止按钮:正常停机(不触发报警)。</summary>
    public void PressStop() => Running = false;

    /// <summary>
    /// 复位按钮:清除报警锁存。仅当急停已释放才能复位(真实 PLC 惯例)。
    /// 返回是否复位成功。
    /// </summary>
    public bool PressReset()
    {
        if (EStop) return false;
        Alarm = false;
        return true;
    }

    // ───── 扫描周期 ─────

    /// <summary>
    /// 推进一个扫描周期。<paramref name="dtSeconds"/> 为距上次扫描的时间(秒)。
    /// </summary>
    public void Tick(double dtSeconds)
    {
        // 非法时间步(负数/NaN/无穷)直接忽略,防止污染过程量与时钟;
        // dt=0 仍执行保护逻辑——急停等安全逻辑不允许因时间步为零被跳过,
        // 过程模拟部分在 dt=0 时增量自然为零,无副作用。
        if (dtSeconds < 0 || !double.IsFinite(dtSeconds)) return;
        _clock += dtSeconds;

        // ① 保护逻辑:急停 → 立即停机 + 报警锁存;运行中关阀 → 停机 + 报警
        if (EStop)
        {
            Alarm = true; // 急停期间报警始终锁存(原条件与恒真等价,直接写明)
            Running = false;
        }
        else if (Running && !ValveOpen)
        {
            Running = false;
            Alarm = true;
        }

        // ② 过程模拟(一阶惯性):dx = (target - x) * (1 - e^(-dt/τ))
        double pTarget = Running ? RatedPressureKpa : 0;
        PressureKpa += (pTarget - PressureKpa) * (1 - Math.Exp(-dtSeconds / PressureTau));

        double fTarget = (ValveOpen && PressureKpa > 5)
            ? RatedFlowLpm * Math.Min(1.0, PressureKpa / RatedPressureKpa)
            : 0;
        FlowLpm += (fTarget - FlowLpm) * (1 - Math.Exp(-dtSeconds / FlowTau));

        if (Running) RunSeconds += dtSeconds;

        // ③ 信号灯:运行慢闪(1Hz),报警快闪(3Hz),否则灭
        BeaconOn = Alarm
            ? (_clock % (1.0 / 3) < (1.0 / 6))
            : Running && (_clock % 1.0 < 0.5);
    }

    /// <summary>恢复初始状态(训练重置)。</summary>
    public void Reset()
    {
        ValveOpen = false; EStop = false;
        Running = false; Alarm = false; BeaconOn = false;
        PressureKpa = 0; FlowLpm = 0; RunSeconds = 0; _clock = 0;
    }
}
