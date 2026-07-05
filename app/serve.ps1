<#
  เซิร์ฟเวอร์ไฟล์สถิตอย่างง่าย สำหรับรันต้นแบบ "ระบบขายไข่ฟาร์มสมบูรณ์"
  ใช้ .NET TcpListener (มากับ Windows) — ไม่ต้องติดตั้ง Node/Python และไม่ต้องสิทธิ์ admin

  วิธีใช้:   powershell -ExecutionPolicy Bypass -File serve.ps1 [port]
  ค่าเริ่มต้น port = 5173   →   เปิดเบราว์เซอร์ที่ http://localhost:5173
  หยุด: กด Ctrl+C ในหน้าต่างนี้
#>
param([int]$Port = 5173)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".htm"  = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".jsx"  = "text/javascript; charset=utf-8"
  ".mjs"  = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".gif"  = "image/gif"
  ".ico"  = "image/x-icon"
  ".woff" = "font/woff"
  ".woff2"= "font/woff2"
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
try {
  $listener.Start()
} catch {
  Write-Host "เปิดพอร์ต $Port ไม่ได้ (อาจถูกใช้งานอยู่). ลองสั่ง: .\serve.ps1 5174" -ForegroundColor Red
  throw
}

Write-Host ""
Write-Host "  ระบบขายไข่ฟาร์มสมบูรณ์ — เซิร์ฟเวอร์พร้อมใช้งาน" -ForegroundColor Green
Write-Host "  เปิดเบราว์เซอร์ที่:  http://localhost:$Port" -ForegroundColor Cyan
Write-Host "  เสิร์ฟไฟล์จาก:       $root"
Write-Host "  หยุดเซิร์ฟเวอร์:     กด Ctrl+C"
Write-Host ""

function Send-Response {
  param($stream, [int]$status, [string]$statusText, [string]$contentType, [byte[]]$body)
  if ($null -eq $body) { $body = [byte[]]@() }
  $header  = "HTTP/1.1 $status $statusText`r`n"
  $header += "Content-Type: $contentType`r`n"
  $header += "Content-Length: $($body.Length)`r`n"
  $header += "Cache-Control: no-cache`r`n"
  $header += "Connection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)

    # อ่านบรรทัดคำขอ (request line) + drain header จนเจอบรรทัดว่าง
    $requestLine = $reader.ReadLine()
    while ($true) { $h = $reader.ReadLine(); if ($null -eq $h -or $h -eq "") { break } }

    if ([string]::IsNullOrWhiteSpace($requestLine)) { $client.Close(); continue }

    $parts  = $requestLine.Split(" ")
    $method = $parts[0]
    $rawUrl = if ($parts.Length -ge 2) { $parts[1] } else { "/" }

    # ตัด query string และถอดรหัส %xx
    $path = $rawUrl.Split("?")[0]
    $path = [System.Uri]::UnescapeDataString($path)
    if ($path -eq "/" -or $path -eq "") { $path = "/index.html" }

    # ป้องกัน path traversal
    $relative = $path.TrimStart("/").Replace("/", "\")
    $fullPath = Join-Path $root $relative
    $fullResolved = [System.IO.Path]::GetFullPath($fullPath)

    if ($method -ne "GET" -and $method -ne "HEAD") {
      Send-Response $stream 405 "Method Not Allowed" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("405 - รองรับเฉพาะ GET"))
    }
    elseif (-not $fullResolved.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      Send-Response $stream 403 "Forbidden" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("403 - Forbidden"))
    }
    elseif (Test-Path -LiteralPath $fullResolved -PathType Leaf) {
      $ext  = [System.IO.Path]::GetExtension($fullResolved).ToLower()
      $ct   = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($fullResolved)
      Send-Response $stream 200 "OK" $ct $bytes
      Write-Host ("  200  {0}" -f $path) -ForegroundColor DarkGray
    }
    else {
      Send-Response $stream 404 "Not Found" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("404 - ไม่พบไฟล์: $path"))
      Write-Host ("  404  {0}" -f $path) -ForegroundColor DarkYellow
    }
  } catch {
    Write-Host ("  ! error: {0}" -f $_.Exception.Message) -ForegroundColor Red
  } finally {
    $client.Close()
  }
}
