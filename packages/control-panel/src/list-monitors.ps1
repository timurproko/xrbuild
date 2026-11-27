$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms

# Match GDI sources to active display targets by adapter LUID + source/target id.
# WMI can be absent on internal panels; list order and model-only PnP IDs are not identities.
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class XrbDisplayDevices {
  [StructLayout(LayoutKind.Sequential)] public struct Luid { public uint low; public int high; }
  [StructLayout(LayoutKind.Sequential)] public struct Rational { public uint numerator, denominator; }
  [StructLayout(LayoutKind.Sequential)] public struct Source {
    public Luid adapter; public uint id, modeIndex, status;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Target {
    public Luid adapter; public uint id, modeIndex, technology, rotation, scaling;
    public Rational refresh; public uint scanline; public int available; public uint status;
  }
  [StructLayout(LayoutKind.Sequential)] public struct DisplayPath { public Source source; public Target target; public uint flags; }
  [StructLayout(LayoutKind.Sequential)] public struct Header { public uint type, size; public Luid adapter; public uint id; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct SourceName {
    public Header header;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string device;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct TargetName {
    public Header header; public uint flags, technology; public ushort manufacturer, product; public uint connector;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string friendly;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string devicePath;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct DisplayDevice {
    public int size;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string device;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string description;
    public int flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string id;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string key;
  }
  public class ActiveTarget { public string source, name, path; public uint technology; }
  [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint flags, out uint paths, out uint modes);
  [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint flags, ref uint paths, [Out] DisplayPath[] values, ref uint modes, [Out] byte[] modeValues, IntPtr topology);
  [DllImport("user32.dll", EntryPoint = "DisplayConfigGetDeviceInfo")] static extern int SourceInfo(ref SourceName value);
  [DllImport("user32.dll", EntryPoint = "DisplayConfigGetDeviceInfo")] static extern int TargetInfo(ref TargetName value);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplayDevices(string source, uint index, ref DisplayDevice result, uint flags);

  public static ActiveTarget[] ActiveTargets() {
    // Mode records are an unused 64-byte native union. Bound allocation and topology-change retries.
    for (int attempt = 0; attempt < 3; attempt++) {
      uint paths, modes;
      if (GetDisplayConfigBufferSizes(2, out paths, out modes) != 0 || paths > 4096 || modes > 4096 || paths == 0) break;
      var values = new DisplayPath[paths]; var modeValues = new byte[Math.Max(1, modes) * 64];
      int result = QueryDisplayConfig(2, ref paths, values, ref modes, modeValues, IntPtr.Zero);
      if (result == 122) continue;
      if (result != 0) break;
      var found = new List<ActiveTarget>();
      for (int i = 0; i < paths; i++) {
        var source = new SourceName();
        source.header = new Header { type = 1, size = (uint)Marshal.SizeOf(typeof(SourceName)), adapter = values[i].source.adapter, id = values[i].source.id };
        if (SourceInfo(ref source) != 0 || String.IsNullOrEmpty(source.device)) continue;
        var target = new TargetName();
        target.header = new Header { type = 2, size = (uint)Marshal.SizeOf(typeof(TargetName)), adapter = values[i].target.adapter, id = values[i].target.id };
        bool named = TargetInfo(ref target) == 0;
        found.Add(new ActiveTarget { source = source.device, name = named ? target.friendly : "", path = named ? target.devicePath : "", technology = values[i].target.technology });
      }
      return found.ToArray();
    }
    return new ActiveTarget[0];
  }
  public static string Description(string source) {
    var result = new DisplayDevice(); result.size = Marshal.SizeOf(result);
    return EnumDisplayDevices(source, 0, ref result, 0) ? result.description : "";
  }
}
'@

$targets = @{}
try {
  [XrbDisplayDevices]::ActiveTargets() | ForEach-Object {
    $key = $_.source.ToUpperInvariant()
    if (-not $targets.ContainsKey($key)) { $targets[$key] = @() }
    $targets[$key] += $_
  }
} catch { # Remote/unsupported sessions still get human-readable fallback labels in the server.
}
# Physical image size from the monitor's EDID (millimetres), found through the active target's device path,
# e.g. \\?\DISPLAY#DEL4277#5&abc&0&UID4353#{guid} -> HKLM\...\Enum\DISPLAY\DEL4277\5&abc&0&UID4353.
function Get-EdidSizeMm([string] $path) {
  try {
    $parts = $path -replace '^\\\\\?\\', '' -split '#'
    if ($parts.Count -lt 3 -or $parts[0] -ne 'DISPLAY') { return $null }
    $edid = (Get-ItemProperty -LiteralPath "HKLM:\SYSTEM\CurrentControlSet\Enum\DISPLAY\$($parts[1])\$($parts[2])\Device Parameters" -Name EDID -ErrorAction Stop).EDID
    if ($edid.Length -lt 128) { return $null }
    # The first detailed timing descriptor carries the size in mm; the basic block only in whole cm.
    $w = $edid[66] + (($edid[68] -band 0xF0) -shl 4); $h = $edid[67] + (($edid[68] -band 0x0F) -shl 8)
    if ($w -lt 50 -or $h -lt 50 -or $w -gt 5000 -or $h -gt 5000) { $w = $edid[21] * 10; $h = $edid[22] * 10 }
    if ($w -lt 50 -or $h -lt 50) { return $null }
    return @{ width = [int]$w; height = [int]$h }
  } catch { return $null }
}
$found = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
  $screen = $_
  $mapped = @($targets[$screen.DeviceName.ToUpperInvariant()] | Where-Object { $null -ne $_ })
  $single = $mapped.Count -eq 1
  $size = if ($single -and $mapped[0].path) { Get-EdidSizeMm $mapped[0].path } else { $null }
  [PSCustomObject]@{
    device = $screen.DeviceName
    name = if ($single -and $mapped[0].name) { $mapped[0].name } else { [XrbDisplayDevices]::Description($screen.DeviceName) }
    internal = $single -and ([uint32]$mapped[0].technology -in @(6, 11, 13, [uint32]2147483648))
    mirrored = $mapped.Count -gt 1
    primary = $screen.Primary
    width = $screen.Bounds.Width
    height = $screen.Bounds.Height
    widthMm = if ($size) { $size.width } else { $null }
    heightMm = if ($size) { $size.height } else { $null }
  }
})

# Preserve the numeric selection order used by existing project manifests and native launches.
$ordered = @($found | Where-Object primary) + @($found | Where-Object { -not $_.primary } | Sort-Object device)
$result = for ($i = 0; $i -lt $ordered.Count; $i++) {
  [PSCustomObject]@{ index=$i; device=$ordered[$i].device; name=$ordered[$i].name; internal=$ordered[$i].internal; mirrored=$ordered[$i].mirrored; primary=$ordered[$i].primary; widthMm=$ordered[$i].widthMm; heightMm=$ordered[$i].heightMm; width=$ordered[$i].width; height=$ordered[$i].height }
}
ConvertTo-Json -InputObject @($result) -Compress
