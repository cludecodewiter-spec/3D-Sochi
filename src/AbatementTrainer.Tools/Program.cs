using AbatementTrainer.Core.Manifest;
using AbatementTrainer.Tools;

// AbatementTrainer.Tools:命令行辅助工具(M1 配套)。
// 用法:
//   nodes  <model.glb>                 列出 glTF 所有节点名
//   tree   <model.glb>                 打印 glTF 节点层级
//   validate <manifest.json> [model.glb]  校验清单(可选对照模型)
//   gen-sample <out.glb>               生成示例演示模型(与示例清单匹配)

if (args.Length < 2)
{
    Console.WriteLine("用法:");
    Console.WriteLine("  nodes      <model.glb>                  列出 glTF 节点名");
    Console.WriteLine("  tree       <model.glb>                  打印节点层级");
    Console.WriteLine("  validate   <manifest.json> [model.glb]  校验清单");
    Console.WriteLine("  gen-sample <out.glb>                    生成示例演示模型");
    return 1;
}

var cmd = args[0].ToLowerInvariant();
try
{
    switch (cmd)
    {
        case "gen-sample":
        {
            SampleModelBuilder.WriteUnitA(args[1]);
            Console.WriteLine($"✓ 已生成示例模型:{args[1]}");
            return 0;
        }
        case "gen-sample-b":
        {
            SampleModelBuilder.WriteUnitB(args[1]);
            Console.WriteLine($"✓ 已生成示例模型:{args[1]}");
            return 0;
        }
        case "gen-sample-c":
        {
            SampleModelBuilder.WriteUnitC(args[1]);
            Console.WriteLine($"✓ 已生成示例模型:{args[1]}");
            return 0;
        }
        case "nodes":
        {
            var names = GltfInspector.ListNodeNames(args[1]);
            Console.WriteLine($"共 {names.Count} 个命名节点:");
            foreach (var n in names) Console.WriteLine("  " + n);
            return 0;
        }
        case "tree":
        {
            foreach (var line in GltfInspector.DumpHierarchy(args[1]))
                Console.WriteLine(line);
            return 0;
        }
        case "validate":
        {
            var manifest = ManifestLoader.Load(args[1]);
            var gltf = args.Length >= 3 ? args[2] : null;
            var report = ManifestValidator.Validate(manifest, gltf);
            if (report.Issues.Count == 0)
            {
                Console.WriteLine("✓ 校验通过,无任何问题。");
                return 0;
            }
            foreach (var issue in report.Issues)
            {
                var tag = issue.Severity == ValidationSeverity.Error ? "错误" : "警告";
                Console.WriteLine($"[{tag}] {issue.Message}");
            }
            Console.WriteLine(report.IsValid ? "✓ 无错误(仅警告)。" : "✗ 校验未通过。");
            return report.IsValid ? 0 : 2;
        }
        default:
            Console.WriteLine($"未知命令:{cmd}");
            return 1;
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine("出错:" + ex.Message);
    return 3;
}
