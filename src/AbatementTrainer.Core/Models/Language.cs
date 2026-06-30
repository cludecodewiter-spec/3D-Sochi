namespace AbatementTrainer.Core.Models;

/// <summary>界面/内容语言。现场默认日语。</summary>
public enum AppLanguage
{
    /// <summary>中文。</summary>
    Zh,
    /// <summary>日语。</summary>
    Ja
}

/// <summary><see cref="LocalizedText"/> 的取值辅助方法。</summary>
public static class LocalizedTextExtensions
{
    /// <summary>
    /// 按当前语言取文本;当前语言缺失(空)时回退到另一语言,
    /// 并在回退文本前加 "⚠ " 标注(符合 M8「回退另一语言并标注」)。
    /// </summary>
    public static string Get(this LocalizedText text, AppLanguage lang)
    {
        if (text is null) return string.Empty;

        var primary = lang == AppLanguage.Ja ? text.Ja : text.Zh;
        var fallback = lang == AppLanguage.Ja ? text.Zh : text.Ja;

        if (!string.IsNullOrWhiteSpace(primary)) return primary;
        if (!string.IsNullOrWhiteSpace(fallback)) return "⚠ " + fallback;
        return string.Empty;
    }
}
