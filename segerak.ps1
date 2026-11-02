# Segerakkan kalendar + gambar ke repo auto-post.
# PNG dari ../carousel/hari-XX ditukar ke JPEG (Instagram API hanya terima JPEG).
# Guna:  powershell -File segerak.ps1            (semua hari)
#        powershell -File segerak.ps1 -Hari 2,3  (hari tertentu)
param([int[]]$Hari)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sumber = Join-Path $root '..\carousel'

Copy-Item (Join-Path $root '..\mulakolab-kalendar-30hari.csv') (Join-Path $root 'kalendar.csv') -Force

$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$param = New-Object System.Drawing.Imaging.EncoderParameters 1
$param.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 92L

$folders = Get-ChildItem $sumber -Directory -Filter 'hari-*' | Sort-Object Name
if ($Hari) { $folders = $folders | Where-Object { $Hari -contains [int]($_.Name -replace 'hari-', '') } }

foreach ($f in $folders) {
  $dest = Join-Path $root "media\$($f.Name)"
  New-Item -ItemType Directory -Force $dest | Out-Null
  Get-ChildItem $dest -Filter *.jpg | Remove-Item
  foreach ($png in Get-ChildItem $f.FullName -Filter *.png | Sort-Object Name) {
    $img = [System.Drawing.Image]::FromFile($png.FullName)
    # Latar putih (JPEG tiada lutsinar)
    $bmp = New-Object System.Drawing.Bitmap $img.Width, $img.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.DrawImage($img, 0, 0, $img.Width, $img.Height)
    $bmp.Save((Join-Path $dest ($png.BaseName + '.jpg')), $jpeg, $param)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  }
  Write-Output ("{0}: {1} jpg" -f $f.Name, (Get-ChildItem $dest -Filter *.jpg).Count)
}
