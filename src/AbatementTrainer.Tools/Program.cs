using AbatementTrainer.Core.Manifest;
using AbatementTrainer.Tools;

// AbatementTrainer.Tools:命令行辅助工具(M1 配套)。
// 用法:
//   nodes  <model.glb>                 列出 glTF 所有节点名
//   tree   <model.glb>                 打印 glTF 节点层级
//   validate <manifest.json> [model.glb]  校验清单(可选对照模型)
//   gen-sample / gen-sample-b / gen-sample-c <out.glb>  生成 A/B/C 型示例模型(与示例清单匹配)

// 统一的用法说明(参数不足与未知命令共用)
static int PrintUsage()
{
    Console.WriteLine("用法:");
    Console.WriteLine("  nodes        <model.glb>                  列出 glTF 节点名");
    Console.WriteLine("  tree         <model.glb>                  打印节点层级");
    Console.WriteLine("  validate     <manifest.json> [model.glb]  校验清单");
    Console.WriteLine("  gen-sample   <out.glb>                    生成 A 型示例模型");
    Console.WriteLine("  gen-sample-b <out.glb>                    生成 B 型示例模型");
    Console.WriteLine("  gen-sample-c <out.glb>                    生成 C 型示例模型");
    return 1;
}

if (args.Length < 2)
{
    return PrintUsage();
}

var cmd = args[0].ToLowerInvariant();
try
{
    switch (cmd)
    {
        case "gen-sample" or "gen-sample-b" or "gen-sample-c":
        {
            var outPath = args[1];
            // 提前建好输出目录,避免 SaveGLB 抛出晦涩的路径异常
            var outDir = Path.GetDirectoryName(Path.GetFullPath(outPath));
            if (!string.IsNullOrEmpty(outDir)) Directory.CreateDirectory(outDir);
            Action<string> write = cmd switch
            {
                "gen-sample" => SampleModelBuilder.WriteUnitA,
                "gen-sample-b" => SampleModelBuilder.WriteUnitB,
                _ => SampleModelBuilder.WriteUnitC,
            };
            write(outPath);
            Console.WriteLine($"✓ 已生成示例模型:{outPath}");
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
            return PrintUsage();
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine("出错:" + ex.Message);
    return 3;
}
