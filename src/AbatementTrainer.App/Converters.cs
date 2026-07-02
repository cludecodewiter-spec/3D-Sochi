using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;

namespace AbatementTrainer.App;

/// <summary>bool → Visibility(true=Visible)。</summary>
public sealed class BoolToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }
    public object Convert(object value, Type t, object p, CultureInfo c)
    {
        // bool → 直接判定;string → 非空为真;其他 → 非 null 为真。
        bool b = value switch
        {
            bool v => v,
            string s => !string.IsNullOrWhiteSpace(s),
            null => false,
            _ => true
        };
        if (Invert) b = !b;
        return b ? Visibility.Visible : Visibility.Collapsed;
    }
    public object ConvertBack(object value, Type t, object p, CultureInfo c) =>
        throw new NotSupportedException();
}

/// <summary>必填项 → 醒目颜色(true=红,false=灰)。</summary>
public sealed class RequiredToBrushConverter : IValueConverter
{
    public object Convert(object value, Type t, object p, CultureInfo c) =>
        (value is bool b && b)
            ? new SolidColorBrush(Color.FromRgb(0xD3, 0x2F, 0x2F))
            : new SolidColorBrush(Color.FromRgb(0x9E, 0x9E, 0x9E));
    public object ConvertBack(object value, Type t, object p, CultureInfo c) =>
        throw new NotSupportedException();
}
