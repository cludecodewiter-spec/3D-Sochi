using System.IO;
using System.Linq;
using AbatementTrainer.Core.Manifest;
using AbatementTrainer.Core.Models;
using AbatementTrainer.Core.Procedure;
using Xunit;

namespace AbatementTrainer.Tests;

/// <summary>
/// 端到端集成测试:针对仓库随附的真实 content/ 内容,
/// 走「读索引 → 加载清单 → 对照 GLB 校验 → 跑安全门」完整链路,
/// 保证发布的内容始终合法、与 Core 行为一致。
/// </summary>
public class ContentIntegrationTests
{
    /// <summary>从测试输出目录向上回溯到仓库根(含 content/index.json)。</summary>
    private static string FindContentRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "content", "index.json");
            if (File.Exists(candidate)) return Path.Combine(dir.FullName, "content");
            dir = dir.Parent;
        }
        throw new DirectoryNotFoundException("未找到 content/index.json");
    }

    [Fact]
    public void Index_LoadsAtLeastOneDevice()
    {
        var root = FindContentRoot();
        var index = ManifestLoader.LoadIndex(Path.Combine(root, "index.json"));
        Assert.NotEmpty(index);
        Assert.All(index, e =>
        {
            Assert.False(string.IsNullOrWhiteSpace(e.EquipmentId));
            Assert.False(string.IsNullOrWhiteSpace(e.ManifestPath));
        });
    }

    [Fact]
    public void EveryShippedManifest_LoadsValidatesAndRunsClean()
    {
        var root = FindContentRoot();
        var index = ManifestLoader.LoadIndex(Path.Combine(root, "index.json"));

        foreach (var entry in index)
        {
            var manifestPath = Path.Combine(root, entry.ManifestPath);
            Assert.True(File.Exists(manifestPath), $"清单缺失:{manifestPath}");

            var manifest = ManifestLoader.Load(manifestPath);

            // 对照真实 GLB 校验(节点存在性等)
            var modelPath = Path.Combine(Path.GetDirectoryName(manifestPath)!, manifest.ModelFile);
            Assert.True(File.Exists(modelPath), $"模型缺失:{modelPath}");

            var report = ManifestValidator.Validate(manifest, modelPath);
            Assert.True(report.IsValid,
                $"{entry.EquipmentId} 校验失败:\n" + string.Join("\n", report.Errors));

            // 安全门:逐步推进,每步都必须先确认全部 required 项才能前进
            var ordered = manifest.Procedure.Steps.OrderBy(s => s.Order).ToList();
            var runner = new ProcedureRunner(ordered);
            while (!runner.IsComplete)
            {
                var step = runner.Current!;
                var requiredIdx = Enumerable.Range(0, step.SafetyChecks.Count)
                    .Where(i => step.SafetyChecks[i].Required)
                    .ToHashSet();

                // 若存在 required,未确认时必须被拦截
                if (requiredIdx.Count > 0)
                    Assert.False(runner.CanAdvance(new HashSet<int>()),
                        $"{entry.EquipmentId} 步骤 {step.Order} 安全门未拦截空确认");

                Assert.True(runner.TryAdvance(requiredIdx),
                    $"{entry.EquipmentId} 步骤 {step.Order} 全确认后仍无法前进");
            }
            Assert.True(runner.IsComplete);
        }
    }
}
