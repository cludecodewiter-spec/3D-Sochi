using System;
using System.IO;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace AbatementTrainer.Tools;

/// <summary>
/// 程序化纹理生成(纯像素数学,不依赖绘图扩展包):
/// 拉丝金属、漆面、压力表盘、警示条纹、混凝土地面(含警示边框)。
/// 纹理写入临时目录,由 SharpGLTF 打包进 GLB(自包含)。
/// </summary>
public static class ProceduralTextures
{
    /// <summary>输出目录(进程内固定,便于复用)。</summary>
    public static string Dir { get; } =
        Path.Combine(Path.GetTempPath(), "abatement_tex");

    // 确定性伪随机哈希(与运行环境无关,保证每次生成一致)
    private static float Hash(int x, int y, int seed = 0)
    {
        unchecked
        {
            uint h = (uint)(x * 374761393 + y * 668265263 + seed * 1442695041);
            h = (h ^ (h >> 13)) * 1274126177u;
            return ((h ^ (h >> 16)) & 0xFFFFFF) / (float)0x1000000;
        }
    }

    /// <summary>值噪声:格点哈希 + 双线性插值(用于漆面/混凝土的斑驳感)。</summary>
    private static float ValueNoise(float x, float y, int seed)
    {
        int x0 = (int)MathF.Floor(x), y0 = (int)MathF.Floor(y);
        float fx = x - x0, fy = y - y0;
        // 平滑插值
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        float a = Hash(x0, y0, seed), b = Hash(x0 + 1, y0, seed);
        float c = Hash(x0, y0 + 1, seed), d = Hash(x0 + 1, y0 + 1, seed);
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }

    private static string Save(string name, Image<Rgba32> img)
    {
        Directory.CreateDirectory(Dir);
        var path = Path.Combine(Dir, name);
        img.SaveAsPng(path);
        img.Dispose();
        return path;
    }

    /// <summary>拉丝不锈钢:水平细纹 + 轻微噪点。</summary>
    public static string BrushedSteel(int size = 512)
    {
        var img = new Image<Rgba32>(size, size);
        for (int y = 0; y < size; y++)
        {
            // 每行一个基础亮度(拉丝条纹),行内再加细噪
            float row = 0.78f + (Hash(0, y, 11) - 0.5f) * 0.10f
                              + (Hash(0, y / 3, 12) - 0.5f) * 0.06f;
            for (int x = 0; x < size; x++)
            {
                float v = row + (Hash(x, y, 13) - 0.5f) * 0.035f;
                byte g = (byte)Math.Clamp(v * 255, 0, 255);
                img[x, y] = new Rgba32(g, g, (byte)Math.Clamp(g + 4, 0, 255), 255);
            }
        }
        return Save("brushed_steel.png", img);
    }

    /// <summary>奶油色烤漆(柜体):低幅值噪声 + 细微脏渍。</summary>
    public static string CreamPaint(int size = 512)
    {
        var img = new Image<Rgba32>(size, size);
        for (int y = 0; y < size; y++)
        for (int x = 0; x < size; x++)
        {
            float n = ValueNoise(x / 48f, y / 48f, 21) * 0.5f
                    + ValueNoise(x / 12f, y / 12f, 22) * 0.5f;
            float v = 0.92f + (n - 0.5f) * 0.05f;
            img[x, y] = new Rgba32(
                (byte)Math.Clamp(v * 236, 0, 255),
                (byte)Math.Clamp(v * 231, 0, 255),
                (byte)Math.Clamp(v * 208, 0, 255), 255);
        }
        return Save("cream_paint.png", img);
    }

    /// <summary>压力表盘:白盘、黑色主/次刻度、右上红色警戒区、外圈黑环。</summary>
    public static string GaugeDial(int size = 512)
    {
        var img = new Image<Rgba32>(size, size);
        float c = size / 2f, R = size * 0.48f;
        for (int y = 0; y < size; y++)
        for (int x = 0; x < size; x++)
        {
            float dx = x - c, dy = y - c;
            float r = MathF.Sqrt(dx * dx + dy * dy);
            if (r > R) { img[x, y] = new Rgba32(0, 0, 0, 0); continue; } // 盘外透明

            // 角度:表盘常规 225°(左下)~ -45°(右下),量程 270°
            float ang = MathF.Atan2(-dy, dx) * 180f / MathF.PI;      // -180..180,上为正
            float sweep = (225f - ang + 720f) % 360f;                 // 0(起点)..270(满量程)

            var col = new Rgba32(248, 248, 244, 255);                 // 盘面
            if (r > R * 0.92f) col = new Rgba32(30, 30, 32, 255);     // 外圈黑环
            else if (sweep <= 272f)
            {
                bool major = MathF.Abs(sweep % 27f) < 1.6f;           // 主刻度(10 格)
                bool minor = MathF.Abs(sweep % 5.4f) < 0.9f;          // 次刻度
                if (major && r > R * 0.70f) col = new Rgba32(25, 25, 25, 255);
                else if (minor && r > R * 0.80f) col = new Rgba32(70, 70, 70, 255);
                // 红色警戒区:量程最后 20%
                if (sweep > 216f && sweep <= 270f && r > R * 0.84f && r < R * 0.92f)
                    col = new Rgba32(200, 40, 36, 255);
            }
            // 中心轴点
            if (r < R * 0.06f) col = new Rgba32(40, 40, 44, 255);
            img[x, y] = col;
        }
        return Save("gauge_dial.png", img);
    }

    /// <summary>黄黑警示条纹(45° 斜纹)。</summary>
    public static string Hazard(int size = 256)
    {
        var img = new Image<Rgba32>(size, size);
        for (int y = 0; y < size; y++)
        for (int x = 0; x < size; x++)
        {
            bool yellow = ((x + y) / 28) % 2 == 0;
            img[x, y] = yellow
                ? new Rgba32(240, 196, 32, 255)
                : new Rgba32(28, 28, 30, 255);
        }
        return Save("hazard.png", img);
    }

    /// <summary>混凝土地面:斑驳噪声 + 分缝 + 中央黄色警示框。</summary>
    public static string ConcreteFloor(int size = 1024)
    {
        var img = new Image<Rgba32>(size, size);
        for (int y = 0; y < size; y++)
        for (int x = 0; x < size; x++)
        {
            float n = ValueNoise(x / 90f, y / 90f, 31) * 0.55f
                    + ValueNoise(x / 22f, y / 22f, 32) * 0.30f
                    + Hash(x, y, 33) * 0.15f;
            float v = 0.55f + (n - 0.5f) * 0.16f;
            var col = new Rgba32(
                (byte)(v * 168), (byte)(v * 168), (byte)(v * 172), 255);

            // 地面分缝(十字)
            if (x % (size / 2) < 3 || y % (size / 2) < 3)
                col = new Rgba32((byte)(v * 120), (byte)(v * 120), (byte)(v * 124), 255);

            // 中央安全警示框(黄色描边方框)
            int b1 = (int)(size * 0.18f), b2 = (int)(size * 0.82f), w = 8;
            bool onFrame =
                ((Math.Abs(x - b1) < w || Math.Abs(x - b2) < w) && y >= b1 - w && y <= b2 + w) ||
                ((Math.Abs(y - b1) < w || Math.Abs(y - b2) < w) && x >= b1 - w && x <= b2 + w);
            if (onFrame) col = new Rgba32(228, 188, 40, 255);

            img[x, y] = col;
        }
        return Save("concrete_floor.png", img);
    }
}
