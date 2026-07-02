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
}
