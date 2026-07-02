using AbatementTrainer.Core.Plc;
using Xunit;

namespace AbatementTrainer.Tests;

/// <summary>PLC 仿真器:联锁 / 自保持 / 急停锁存 / 过程动态测试。</summary>
public class PlcSimulatorTests
{
    private static void Run(PlcSimulator plc, double seconds, double dt = 0.05)
    {
        for (double t = 0; t < seconds; t += dt) plc.Tick(dt);
    }

    [Fact] // 联锁:阀未开不能启动
    public void Start_Blocked_WhenValveClosed()
    {
        var plc = new PlcSimulator();
        Assert.False(plc.PressStart());
        Assert.False(plc.Running);
    }

    [Fact] // 联锁:急停按下不能启动
    public void Start_Blocked_WhenEStop()
    {
        var plc = new PlcSimulator { ValveOpen = true, EStop = true };
        Assert.False(plc.PressStart());
    }

    [Fact] // 自保持:启动后(按钮已松开)持续运转
    public void SealIn_KeepsRunning()
    {
        var plc = new PlcSimulator { ValveOpen = true };
        Assert.True(plc.PressStart());
        Run(plc, 2);
        Assert.True(plc.Running);
    }

    [Fact] // 急停:立即停机 + 报警锁存;急停未释放时复位无效
    public void EStop_Stops_AndLatchesAlarm()
    {
        var plc = new PlcSimulator { ValveOpen = true };
        plc.PressStart();
        Run(plc, 1);

        plc.EStop = true;
        plc.Tick(0.05);
        Assert.False(plc.Running);
        Assert.True(plc.Alarm);

        Assert.False(plc.PressReset());   // 急停未释放 → 复位失败
        Assert.True(plc.Alarm);

        plc.EStop = false;
        Assert.True(plc.PressReset());    // 释放后复位成功
        Assert.False(plc.Alarm);
    }

    [Fact] // 运行中关阀:停机 + 报警
    public void ClosingValveWhileRunning_TripsAlarm()
    {
        var plc = new PlcSimulator { ValveOpen = true };
        plc.PressStart();
        Run(plc, 1);

        plc.ValveOpen = false;
        plc.Tick(0.05);
        Assert.False(plc.Running);
        Assert.True(plc.Alarm);
    }

    [Fact] // 报警未复位不能再启动
    public void Start_Blocked_WhileAlarmLatched()
    {
        var plc = new PlcSimulator { ValveOpen = true };
        plc.PressStart();
        plc.EStop = true; plc.Tick(0.05); plc.EStop = false;
        Assert.True(plc.Alarm);

        plc.ValveOpen = true;
        Assert.False(plc.PressStart());
        plc.PressReset();
        Assert.True(plc.PressStart());
    }

    [Fact] // 过程动态:压力向额定值爬升,停机后回落;流量随之
    public void Pressure_RampsUp_AndDecays()
    {
        var plc = new PlcSimulator { ValveOpen = true };
        plc.PressStart();
        Run(plc, 10);   // ≫ 时间常数,应接近额定
        Assert.InRange(plc.PressureKpa, PlcSimulator.RatedPressureKpa * 0.9, PlcSimulator.RatedPressureKpa * 1.01);
        Assert.InRange(plc.FlowLpm, PlcSimulator.RatedFlowLpm * 0.85, PlcSimulator.RatedFlowLpm * 1.01);

        plc.PressStop();
        Run(plc, 12);
        Assert.True(plc.PressureKpa < 10);
        Assert.True(plc.FlowLpm < 5);
    }

    [Fact] // 复位到初始状态
    public void Reset_ClearsEverything()
    {
        var plc = new PlcSimulator { ValveOpen = true };
        plc.PressStart();
        Run(plc, 3);
        plc.Reset();
        Assert.False(plc.Running);
        Assert.Equal(0, plc.PressureKpa);
        Assert.Equal(0, plc.RunSeconds);
    }

    // ───── 边界:扫描时间步 ─────

    [Fact] // dt=0:过程量不变,但保护逻辑(急停)仍必须生效——安全逻辑不允许被零时间步跳过
    public void Tick_ZeroDt_StillAppliesEStopProtection()
    {
        var plc = new PlcSimulator { ValveOpen = true };
        plc.PressStart();
        Run(plc, 1);
        double pressureBefore = plc.PressureKpa;
        double runBefore = plc.RunSeconds;

        plc.EStop = true;
        plc.Tick(0);

        Assert.False(plc.Running);                       // 急停在 dt=0 扫描中同样切断输出
        Assert.True(plc.Alarm);                          // 报警锁存
        Assert.Equal(pressureBefore, plc.PressureKpa);   // 过程量零增量
        Assert.Equal(runBefore, plc.RunSeconds);
    }

    [Theory] // 非法 dt(负数/NaN/无穷)整体忽略,不污染状态与过程量
    [InlineData(-0.05)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(double.NegativeInfinity)]
    public void Tick_InvalidDt_IsIgnored(double dt)
    {
        var plc = new PlcSimulator { ValveOpen = true };
        plc.PressStart();
        Run(plc, 2);
        double pressureBefore = plc.PressureKpa;
        double flowBefore = plc.FlowLpm;
        double runBefore = plc.RunSeconds;

        plc.Tick(dt);

        Assert.True(plc.Running);                        // 状态原样
        Assert.Equal(pressureBefore, plc.PressureKpa);   // 无 NaN 污染
        Assert.Equal(flowBefore, plc.FlowLpm);
        Assert.Equal(runBefore, plc.RunSeconds);
        Assert.True(double.IsFinite(plc.PressureKpa));
    }

    [Fact] // 超大 dt:一阶惯性精确离散化应直接收敛到目标值,无超调、无 NaN
    public void Tick_HugeDt_ConvergesWithoutOvershoot()
    {
        var plc = new PlcSimulator { ValveOpen = true };
        plc.PressStart();
        plc.Tick(1e9);

        Assert.True(double.IsFinite(plc.PressureKpa));
        Assert.True(double.IsFinite(plc.FlowLpm));
        Assert.InRange(plc.PressureKpa, 0, PlcSimulator.RatedPressureKpa * 1.0001); // 不超调
        Assert.InRange(plc.FlowLpm, 0, PlcSimulator.RatedFlowLpm * 1.0001);
        Assert.InRange(plc.PressureKpa, PlcSimulator.RatedPressureKpa * 0.999,
                       PlcSimulator.RatedPressureKpa * 1.0001);                     // 已收敛
    }

    // ───── 边界:连续急停 ─────

    [Fact] // 连续多次急停按下/释放:报警始终锁存;释放期间复位一次即可清除并可再启动
    public void RepeatedEStopCycles_AlarmStaysLatched_UntilSingleReset()
    {
        var plc = new PlcSimulator { ValveOpen = true };
        plc.PressStart();
        Run(plc, 1);

        for (int i = 0; i < 3; i++)
        {
            plc.EStop = true;
            plc.Tick(0.05);
            Assert.False(plc.Running);
            Assert.True(plc.Alarm);
            Assert.False(plc.PressReset());   // 急停按下期间复位必须无效

            plc.EStop = false;
            plc.Tick(0.05);
            Assert.True(plc.Alarm);           // 释放后仍锁存(需人工复位)
            Assert.False(plc.PressStart());   // 锁存期间禁止再启动
        }

        Assert.True(plc.PressReset());        // 最终释放后一次复位即清除
        Assert.False(plc.Alarm);
        Assert.True(plc.PressStart());        // 可重新启动

        // 复位后再次急停 → 报警重新锁存(锁存不是一次性的)
        plc.EStop = true;
        plc.Tick(0.05);
        Assert.True(plc.Alarm);
        Assert.False(plc.Running);
    }
}
