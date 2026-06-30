using System.IO;
using System.Linq;
using AbatementTrainer.Core.Manifest;
using AbatementTrainer.Core.Models;
using Xunit;

namespace AbatementTrainer.Tests;

/// <summary>M1 清单加载与校验测试。</summary>
public class ManifestTests
{
    // 一份合法清单(两个部件、两个步骤)
    private const string ValidJson = """
    {
      "equipmentId": "abatement-unit-A",
      "name": { "zh": "除害装置 A 型", "ja": "除害装置 A 型" },
      "modelFile": "models/unitA.glb",
      "parts": [
        { "id": "front_panel", "node": "front_panel",
          "name": { "zh": "前面板", "ja": "フロントパネル" }, "partNo": "P-001" },
        { "id": "filter", "node": "filter",
          "name": { "zh": "滤芯", "ja": "フィルター" }, "partNo": "P-002" }
      ],
      "procedure": {
        "title": { "zh": "前面板拆卸", "ja": "フロントパネル取り外し" },
        "steps": [
          {
            "order": 1, "action": "remove", "targetPart": "front_panel",
            "removeOffset": [0, 0, 0.3],
            "instruction": { "zh": "拧下四角螺栓,取下面板", "ja": "四隅のボルトを外し、パネルを取り外す" },
            "safetyChecks": [
              { "type": "Loto", "text": { "zh": "确认主电源已隔离上锁挂牌", "ja": "主電源の遮断・施錠・札掛けを確認" }, "required": true },
              { "type": "Ppe",  "text": { "zh": "确认已戴防毒面具与手套", "ja": "防毒マスク・手袋の着用を確認" }, "required": true }
            ]
          },
          {
            "order": 2, "action": "remove", "targetPart": "filter",
            "instruction": { "zh": "取出滤芯", "ja": "フィルターを取り出す" },
            "safetyChecks": [
              { "type": "Purge", "text": { "zh": "确认已吹扫", "ja": "パージ確認" }, "required": false }
            ]
          }
        ]
      }
    }
    """;

    [Fact]
    public void Parse_ValidManifest_Succeeds()
    {
        var m = ManifestLoader.Parse(ValidJson);
        Assert.Equal("abatement-unit-A", m.EquipmentId);
        Assert.Equal(2, m.Parts.Count);
        Assert.Equal(2, m.Procedure.Steps.Count);

        var step1 = m.Procedure.Steps[0];
        Assert.Equal(StepAction.Remove, step1.Action);          // 小写 "remove" 正确解析为枚举
        Assert.Equal(new float[] { 0, 0, 0.3f }, step1.RemoveOffset);
        Assert.Equal(SafetyType.Loto, step1.SafetyChecks[0].Type); // "Loto" 解析
        Assert.True(step1.SafetyChecks[0].Required);
    }

    [Fact]
    public void Validate_WithCorrectNodes_Passes()
    {
        var m = ManifestLoader.Parse(ValidJson);
        var report = ManifestValidator.Validate(m, new[] { "front_panel", "filter", "root" });
        Assert.True(report.IsValid);
        Assert.DoesNotContain(report.Issues, i => i.Severity == ValidationSeverity.Error);
    }

    [Fact]
    public void Validate_WithMissingNode_ReportsError()
    {
        var m = ManifestLoader.Parse(ValidJson);
        // glTF 中没有 "filter" 节点 → 应报错
        var report = ManifestValidator.Validate(m, new[] { "front_panel" });
        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, e => e.Contains("filter"));
    }

    [Fact]
    public void Validate_MissingLocalizedJa_ReportsError()
    {
        // 故意把一处 ja 置空
        var bad = ValidJson.Replace("\"ja\": \"フィルター\"", "\"ja\": \"\"");
        var m = ManifestLoader.Parse(bad);
        var report = ManifestValidator.Validate(m, new[] { "front_panel", "filter" });
        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, e => e.Contains("ja"));
    }

    [Fact]
    public void Validate_TargetPartNotInParts_ReportsError()
    {
        var bad = ValidJson.Replace("\"targetPart\": \"filter\"", "\"targetPart\": \"ghost\"");
        var m = ManifestLoader.Parse(bad);
        var report = ManifestValidator.Validate(m, new[] { "front_panel", "filter" });
        Assert.False(report.IsValid);
        Assert.Contains(report.Errors, e => e.Contains("ghost"));
    }

    [Fact]
    public void GltfInspector_ListsNodeNames_FromGeneratedGlb()
    {
        // 用 SharpGLTF 生成一个含命名节点的临时 GLB,验证读取节点名
        var path = Path.Combine(Path.GetTempPath(), $"test_{System.Guid.NewGuid():N}.glb");
        try
        {
            TestGlb.WriteNamedNodes(path, "front_panel", "filter");
            var names = GltfInspector.ListNodeNames(path);
            Assert.Contains("front_panel", names);
            Assert.Contains("filter", names);
        }
        finally
        {
            if (File.Exists(path)) File.Delete(path);
        }
    }

    [Fact]
    public void Validate_AgainstGeneratedGlb_Passes()
    {
        var path = Path.Combine(Path.GetTempPath(), $"test_{System.Guid.NewGuid():N}.glb");
        try
        {
            TestGlb.WriteNamedNodes(path, "front_panel", "filter");
            var m = ManifestLoader.Parse(ValidJson);
            var report = ManifestValidator.Validate(m, path);   // 走真实 glTF 读取路径
            Assert.True(report.IsValid);
        }
        finally
        {
            if (File.Exists(path)) File.Delete(path);
        }
    }
}
