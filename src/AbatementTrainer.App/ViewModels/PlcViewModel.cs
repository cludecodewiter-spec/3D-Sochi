using System.Windows.Threading;
using AbatementTrainer.Core.Plc;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace AbatementTrainer.App.ViewModels;

/// <summary>
/// HMI 触摸屏 ViewModel:包装 Core 的 <see cref="PlcSimulator"/>,
/// 用 DispatcherTimer 以约 20Hz 驱动扫描周期并刷新绑定属性。
/// 网页版 demo 与本面板共用同一套 PLC 逻辑设计。
/// </summary>
public sealed partial class PlcViewModel : ObservableObject
{
    private readonly PlcSimulator _plc = new();
    private readonly DispatcherTimer _timer;

    public PlcViewModel()
    {
        _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(50) };
        _timer.Tick += (_, _) => Scan(0.05);
        _timer.Start();
    }

    // ───── 绑定属性(扫描后刷新)─────
    [ObservableProperty] private bool _running;
    [ObservableProperty] private bool _alarm;
    [ObservableProperty] private bool _beaconOn;
    [ObservableProperty] private bool _valveOpen;
    [ObservableProperty] private bool _eStop;
    [ObservableProperty] private double _pressureKpa;
    [ObservableProperty] private double _flowLpm;

    /// <summary>压力占额定的百分比(绑 ProgressBar)。</summary>
    public double PressurePercent => Math.Min(100, PressureKpa / 300 * 100);

    /// <summary>流量占额定的百分比。</summary>
    public double FlowPercent => Math.Min(100, FlowLpm / 50 * 100);

    /// <summary>报警灯是否点亮(报警 + 闪烁相位;便于 XAML 直接绑定)。</summary>
    public bool AlarmLampOn => Alarm && BeaconOn;

    private void Scan(double dt)
    {
        _plc.ValveOpen = ValveOpen;
        _plc.EStop = EStop;
        _plc.Tick(dt);

        Running = _plc.Running;
        Alarm = _plc.Alarm;
        BeaconOn = _plc.BeaconOn;
        PressureKpa = _plc.PressureKpa;
        FlowLpm = _plc.FlowLpm;
        OnPropertyChanged(nameof(PressurePercent));
        OnPropertyChanged(nameof(FlowPercent));
        OnPropertyChanged(nameof(AlarmLampOn));
    }

    // ───── HMI 按钮 ─────
    [RelayCommand] private void Start() => _plc.PressStart();
    [RelayCommand] private void Stop() => _plc.PressStop();
    [RelayCommand] private void ResetAlarm() => _plc.PressReset();
    [RelayCommand] private void ToggleValve() => ValveOpen = !ValveOpen;
    [RelayCommand] private void ToggleEStop() => EStop = !EStop;

    /// <summary>切换设备/离开训练时复位。</summary>
    public void ResetAll()
    {
        _plc.Reset();
        ValveOpen = false; EStop = false;
        Scan(0.001);
    }
}
