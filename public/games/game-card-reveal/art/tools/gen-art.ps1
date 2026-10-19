# Deterministic, offline derivation of the frozen game-card-reveal package.
# Run without -Verify only once; subsequent runs compare bytes without changing files.
param([switch]$Verify)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../../..')).Path
$sourcePath = Join-Path $projectRoot 'docs/design/game-card-reveal/ui-refs/pack-unified-ai-v1.png'
$outputDir = Join-Path $projectRoot 'public/games/game-card-reveal/art/ai/pending'
$expectedSha256 = '34DE5A5A106BA842E4A2F99C3908B6A2F33B0D5943B42670FAE65E5B28CB7DD3'
$sourceSha256 = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
if ($sourceSha256 -ne $expectedSha256) { throw "Frozen source SHA-256 changed: $sourceSha256" }

$drawingAssembly = [System.Drawing.Bitmap].Assembly.Location
$drawingPrimitives = [System.Drawing.Rectangle].Assembly.Location
$drawingGdiPlus = Join-Path (Split-Path $drawingAssembly) 'System.Private.Windows.GdiPlus.dll'
$drawingCore = Join-Path (Split-Path $drawingAssembly) 'System.Private.Windows.Core.dll'
$consoleAssembly = [Console].Assembly.Location
Add-Type -ReferencedAssemblies @($drawingAssembly, $drawingPrimitives, $drawingGdiPlus, $drawingCore, $consoleAssembly) -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class CardRevealPackDerive {
  private static readonly double[] X = {0, 65, 135, 200, 265, 335, 400};
  private static readonly double[] Y = {57, 55, 58, 62, 59, 55, 57};

  private static double TearY(double x) {
    int i = 0;
    while (i < X.Length - 2 && x > X[i + 1]) i++;
    double t = (x - X[i]) / (X[i + 1] - X[i]);
    double m0 = i == 0 ? (Y[1] - Y[0]) / (X[1] - X[0]) : (Y[i + 1] - Y[i - 1]) / (X[i + 1] - X[i - 1]);
    double m1 = i == X.Length - 2 ? (Y[i + 1] - Y[i]) / (X[i + 1] - X[i]) : (Y[i + 2] - Y[i]) / (X[i + 2] - X[i]);
    double dx = X[i + 1] - X[i];
    return (2*t*t*t - 3*t*t + 1)*Y[i] + (t*t*t - 2*t*t + t)*dx*m0
      + (-2*t*t*t + 3*t*t)*Y[i + 1] + (t*t*t - t*t)*dx*m1;
  }

  private static Bitmap Crop(Bitmap source, Rectangle rect) {
    var output = new Bitmap(400, 600, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(output)) {
      g.CompositingMode = CompositingMode.SourceCopy;
      g.InterpolationMode = InterpolationMode.HighQualityBicubic;
      g.PixelOffsetMode = PixelOffsetMode.HighQuality;
      g.DrawImage(source, new Rectangle(0, 0, 400, 600), rect, GraphicsUnit.Pixel);
    }
    return output;
  }

  private static byte[] Png(Bitmap bitmap) {
    using (var stream = new MemoryStream()) {
      bitmap.Save(stream, ImageFormat.Png);
      return stream.ToArray();
    }
  }

  public static void Run(string sourcePath, string outputDir, bool verify) {
    using (var source = new Bitmap(sourcePath)) {
      if (source.Width != 1448 || source.Height != 1086) throw new Exception("Frozen source dimensions changed");
      using (var front = Crop(source, new Rectangle(105, 26, 573, 1032)))
      using (var back = Crop(source, new Rectangle(771, 26, 571, 1032)))
      using (var top = new Bitmap(400, 600, PixelFormat.Format32bppArgb))
      using (var body = new Bitmap(400, 600, PixelFormat.Format32bppArgb)) {
        for (int x = 0; x < 400; x++) {
          double boundary = TearY(x + 0.5);
          for (int y = 0; y < 600; y++) {
            var pixel = front.GetPixel(x, y);
            if (y + 0.5 < boundary) top.SetPixel(x, y, pixel);
            else body.SetPixel(x, y, pixel);
          }
        }
        var names = new[] {"pack-front.png", "pack-back.png", "pack-tear-top.png", "pack-tear-body.png"};
        var bitmaps = new[] {front, back, top, body};
        if (!verify) Directory.CreateDirectory(outputDir);
        for (int i = 0; i < names.Length; i++) {
          string path = Path.Combine(outputDir, names[i]);
          byte[] bytes = Png(bitmaps[i]);
          if (verify) {
            if (!File.Exists(path)) throw new Exception("Missing output: " + path);
            byte[] saved = File.ReadAllBytes(path);
            if (saved.Length != bytes.Length) throw new Exception("Output changed: " + path);
            for (int n = 0; n < bytes.Length; n++) if (saved[n] != bytes[n]) throw new Exception("Output changed: " + path);
          } else {
            if (File.Exists(path)) throw new Exception("Refusing to overwrite: " + path);
            File.WriteAllBytes(path, bytes);
          }
          Console.WriteLine((verify ? "VERIFY " : "WRITE ") + names[i] + " " + bytes.Length + " bytes");
        }
      }
    }
  }
}
'@

[CardRevealPackDerive]::Run($sourcePath, $outputDir, [bool]$Verify)
