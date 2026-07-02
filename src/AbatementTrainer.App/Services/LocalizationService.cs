using System.ComponentModel;
using System.Globalization;
using System.Resources;
using AbatementTrainer.Core.Models;

namespace AbatementTrainer.App.Services;

/// <summary>
/// M8:运行时可切换的本地化服务(单例)。
/// UI 静态文案存于 .resx(zh / ja);通过 ResourceManager + 指定 CultureInfo 取值,
/// 切换语言时触发索引器 PropertyChanged,使所有 {Binding [Key]} 即时刷新。
/// </summary>
public sealed class LocalizationService : INotifyPropertyChanged
{
    /// <summary>全局单例(供 XAML 以 x:Static 绑定)。</summary>
    public static LocalizationService Instance { get; } = new();

    private readonly ResourceManager _rm =
        new("AbatementTrainer.App.Resources.Strings", typeof(LocalizationService).Assembly);

    private AppLanguage _language = AppLanguage.Ja; // 现场默认日语

    private LocalizationService() { }

    public event PropertyChangedEventHandler? PropertyChanged;

    /// <summary>当前语言。</summary>
    public AppLanguage Language
    {
        get => _language;
        set
        {
            if (_language == value) return;
            _language = value;
            // 索引器与所有派生属性整体刷新
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs("Item[]"));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Language)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Culture)));
            LanguageChanged?.Invoke(this, value);
        }
    }

    /// <summary>语言变更事件(供 ViewModel 刷新清单文案)。</summary>
    public event EventHandler<AppLanguage>? LanguageChanged;

    /// <summary>当前 CultureInfo。</summary>
    public CultureInfo Culture => _language == AppLanguage.Ja
        ? CultureInfo.GetCultureInfo("ja-JP")
        : CultureInfo.GetCultureInfo("zh-CN");

    /// <summary>静态文案索引器:<c>{Binding [AppTitle], Source={x:Static ...}}</c>。</summary>
    public string this[string key] => _rm.GetString(key, Culture) ?? key;

    /// <summary>取清单内的多语言文本(按当前语言,缺失回退并标注)。</summary>
    public string Localize(LocalizedText? text) => text?.Get(_language) ?? string.Empty;

    /// <summary>在 zh / ja 间切换。</summary>
    public void Toggle() => Language = _language == AppLanguage.Ja ? AppLanguage.Zh : AppLanguage.Ja;
}
