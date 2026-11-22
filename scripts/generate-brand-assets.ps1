# generate-brand-assets.ps1 — 由 assets/brand/kismet-logo.jpg 生成安卓图标 / 启动图 / 网页图标。
#
# 用法（仓库根目录，Windows PowerShell）：
#   powershell -ExecutionPolicy Bypass -File scripts/generate-brand-assets.ps1
#
# 产物：
#   android-src/app/src/main/res/mipmap-*/ic_launcher.png            普通图标（全幅）
#   android-src/app/src/main/res/mipmap-*/ic_launcher_round.png      圆形图标
#   android-src/app/src/main/res/mipmap-*/ic_launcher_foreground.png 自适应图标前景层
#   android-src/app/src/main/res/drawable*/splash.png                启动图
#   www/icons/icon-96.png | icon-192.png | icon-512.png | icon-maskable-512.png
#
# 原图背景是一层柔和的粉白渐变，直接贴到纯色画布上会露出方形接缝。
# 这里用「镜像补边」（reflect padding）把画面扩展到目标尺寸：补出来的区域
# 是原图边缘的镜像，颜色和渐变完全连续，看不到任何边界。
#
# 只有换了品牌图才需要重跑；日常打包不用执行。

param(
  [string]$Source = (Join-Path $PSScriptRoot '..\assets\brand\kismet-logo.jpg')
)

Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class BrandRender
{
    // 把原图缩放到 contentSide 见方，居中放进 W×H 画布。
    // 空出来的区域以「原图边缘像素 → 品牌底色」的渐变补齐：接缝处颜色与
    // 原图完全一致，越往外越接近底色，所以既没有方框也没有镜像重影。
    public static Bitmap Pad(string srcPath, int W, int H, double contentFactor, int cr, int cg, int cb)
    {
        using (Bitmap src = new Bitmap(srcPath))
        {
            int side = (int)Math.Round(Math.Min(W, H) * contentFactor);
            if (side < 1) side = 1;

            using (Bitmap scaled = new Bitmap(side, side, PixelFormat.Format32bppArgb))
            {
                using (Graphics g = Graphics.FromImage(scaled))
                {
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    g.CompositingQuality = CompositingQuality.HighQuality;
                    g.DrawImage(src, new Rectangle(0, 0, side, side));
                }

                int ox = (W - side) / 2;
                int oy = (H - side) / 2;

                Bitmap outBmp = new Bitmap(W, H, PixelFormat.Format32bppArgb);
                BitmapData sd = scaled.LockBits(new Rectangle(0, 0, side, side), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                BitmapData od = outBmp.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);

                byte[] sbuf = new byte[sd.Stride * side];
                byte[] obuf = new byte[od.Stride * H];
                Marshal.Copy(sd.Scan0, sbuf, 0, sbuf.Length);

                int leftPad = ox;
                int rightPad = W - ox - side;
                int topPad = oy;
                int bottomPad = H - oy - side;

                for (int y = 0; y < H; y++)
                {
                    double ey = 0;
                    if (y < oy)
                    {
                        ey = topPad > 0 ? (double)(oy - y) / topPad : 1;
                    }
                    else if (y >= oy + side)
                    {
                        ey = bottomPad > 0 ? (double)(y - (oy + side - 1)) / bottomPad : 1;
                    }
                    if (ey < 0) ey = 0;
                    if (ey > 1) ey = 1;

                    int sy = y - oy;
                    if (sy < 0) sy = 0;
                    if (sy >= side) sy = side - 1;

                    int srow = sy * sd.Stride;
                    int orow = y * od.Stride;

                    for (int x = 0; x < W; x++)
                    {
                        double ex = 0;
                        if (x < ox)
                        {
                            ex = leftPad > 0 ? (double)(ox - x) / leftPad : 1;
                        }
                        else if (x >= ox + side)
                        {
                            ex = rightPad > 0 ? (double)(x - (ox + side - 1)) / rightPad : 1;
                        }
                        if (ex < 0) ex = 0;
                        if (ex > 1) ex = 1;

                        int sx = x - ox;
                        if (sx < 0) sx = 0;
                        if (sx >= side) sx = side - 1;

                        int si = srow + sx * 4;
                        int oi = orow + x * 4;

                        double e = Math.Max(ex, ey);
                        if (e <= 0.0001)
                        {
                            obuf[oi] = sbuf[si];
                            obuf[oi + 1] = sbuf[si + 1];
                            obuf[oi + 2] = sbuf[si + 2];
                        }
                        else
                        {
                            double t = e * e * (3 - 2 * e); // smoothstep，过渡更柔和
                            obuf[oi] = (byte)(sbuf[si] + (cr - sbuf[si]) * t);
                            obuf[oi + 1] = (byte)(sbuf[si + 1] + (cg - sbuf[si + 1]) * t);
                            obuf[oi + 2] = (byte)(sbuf[si + 2] + (cb - sbuf[si + 2]) * t);
                        }
                        obuf[oi + 3] = 255;
                    }
                }

                Marshal.Copy(obuf, 0, od.Scan0, obuf.Length);
                scaled.UnlockBits(sd);
                outBmp.UnlockBits(od);
                return outBmp;
            }
        }
    }
}
'@

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$resDir = Join-Path $root 'android-src\app\src\main\res'
$wwwIcons = Join-Path $root 'www\icons'
$srcPath = (Resolve-Path $Source).Path

# 品牌底色，同时写进 values/ic_launcher_background.xml（自适应图标背景层）
$brand = [System.Drawing.Color]::FromArgb(255, 247, 241, 239)

function Save-Png($bmp, [string]$path) {
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-Icon([string]$path, [int]$size) {
  $bmp = [BrandRender]::Pad($srcPath, $size, $size, 1.0, $brand.R, $brand.G, $brand.B)
  Save-Png $bmp $path
  $bmp.Dispose()
}

function New-RoundIcon([string]$path, [int]$size) {
  $square = [BrandRender]::Pad($srcPath, $size, $size, 1.0, $brand.R, $brand.G, $brand.B)
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear($brand)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
  $clip.AddEllipse(0, 0, $size, $size)
  $g.SetClip($clip)
  $g.DrawImage($square, 0, 0, $size, $size)
  $g.ResetClip()
  $clip.Dispose()
  $g.Dispose()
  $square.Dispose()
  Save-Png $bmp $path
  $bmp.Dispose()
}

function New-Padded([string]$path, [int]$w, [int]$h, [double]$factor) {
  $bmp = [BrandRender]::Pad($srcPath, $w, $h, $factor, $brand.R, $brand.G, $brand.B)
  Save-Png $bmp $path
  $bmp.Dispose()
}

# ---- 安卓启动图标 ----
$densities = @(
  @{ name = 'mdpi';    icon = 48;  fg = 108 },
  @{ name = 'hdpi';    icon = 72;  fg = 162 },
  @{ name = 'xhdpi';   icon = 96;  fg = 216 },
  @{ name = 'xxhdpi';  icon = 144; fg = 324 },
  @{ name = 'xxxhdpi'; icon = 192; fg = 432 }
)

foreach ($d in $densities) {
  $dir = Join-Path $resDir ('mipmap-' + $d.name)
  New-Icon      (Join-Path $dir 'ic_launcher.png')            $d.icon
  New-RoundIcon (Join-Path $dir 'ic_launcher_round.png')      $d.icon
  # 自适应图标可见区约为画布中央 2/3，图案缩到 74% 保证不被圆/方遮罩切到
  New-Padded    (Join-Path $dir 'ic_launcher_foreground.png') $d.fg $d.fg 0.74
  Write-Output ('  mipmap-' + $d.name + ' ok')
}

# ---- 启动图（横竖屏各密度，画面铺满、镜像补边） ----
$splashes = @(
  @{ dir = 'drawable';              w = 480;  h = 320  },
  @{ dir = 'drawable-land-mdpi';    w = 480;  h = 320  },
  @{ dir = 'drawable-land-hdpi';    w = 800;  h = 480  },
  @{ dir = 'drawable-land-xhdpi';   w = 1280; h = 720  },
  @{ dir = 'drawable-land-xxhdpi';  w = 1600; h = 960  },
  @{ dir = 'drawable-land-xxxhdpi'; w = 1920; h = 1280 },
  @{ dir = 'drawable-port-mdpi';    w = 320;  h = 480  },
  @{ dir = 'drawable-port-hdpi';    w = 480;  h = 800  },
  @{ dir = 'drawable-port-xhdpi';   w = 720;  h = 1280 },
  @{ dir = 'drawable-port-xxhdpi';  w = 960;  h = 1600 },
  @{ dir = 'drawable-port-xxxhdpi'; w = 1280; h = 1920 }
)

foreach ($s in $splashes) {
  New-Padded (Join-Path (Join-Path $resDir $s.dir) 'splash.png') $s.w $s.h 1.0
  Write-Output ('  ' + $s.dir + '/splash.png ok')
}

# ---- 网页 / PWA 图标 ----
New-Icon (Join-Path $wwwIcons 'icon-96.png')  96
New-Icon (Join-Path $wwwIcons 'icon-192.png') 192
New-Icon (Join-Path $wwwIcons 'icon-512.png') 512
New-Padded (Join-Path $wwwIcons 'icon-maskable-512.png') 512 512 0.74

Write-Output '完成：安卓图标 / 启动图 / 网页图标已重新生成。'
