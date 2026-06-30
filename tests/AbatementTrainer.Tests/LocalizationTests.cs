using AbatementTrainer.Core.Models;
using Xunit;

namespace AbatementTrainer.Tests;

/// <summary>多语言取值与回退(M8)测试。</summary>
public class LocalizationTests
{
    [Theory]
    [InlineData(AppLanguage.Zh, "中文", "中文")]
    [InlineData(AppLanguage.Ja, "中文", "日本語")]
    public void Get_ReturnsRequestedLanguage(AppLanguage lang, string zh, string expected)
    {
        var t = new LocalizedText(zh, "日本語");
        Assert.Equal(expected, t.Get(lang));
    }

    [Fact]
    public void Get_FallsBackAndMarks_WhenPrimaryEmpty()
    {
        // 日语缺失 → 回退中文并加标注前缀
        var t = new LocalizedText("中文", "");
        var result = t.Get(AppLanguage.Ja);
        Assert.StartsWith("⚠", result);
        Assert.Contains("中文", result);
    }

    [Fact]
    public void Get_BothEmpty_ReturnsEmpty()
    {
        var t = new LocalizedText("", "");
        Assert.Equal(string.Empty, t.Get(AppLanguage.Zh));
    }

    [Fact]
    public void Get_NullText_ReturnsEmpty()
    {
        LocalizedText? t = null;
        Assert.Equal(string.Empty, t!.Get(AppLanguage.Zh));
    }
}
