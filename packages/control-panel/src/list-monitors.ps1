Add-Type -AssemblyName System.Windows.Forms

# Screen gives us the GDI device used by the native host (\\.\DISPLAYn), but not a reliable
# friendly name. EnumDisplayDevices links that GDI device to the monitor's PnP id; WmiMonitorID
# provides the EDID name for the same id. Do not pair the two lists by position: their orders differ.
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class XrbDisplayDevices {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
  }

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern bool EnumDisplayDevices(string device, uint index, ref DISPLAY_DEVICE result, uint flags);

  public static string[] Monitor(string source) {
    var result = new DISPLAY_DEVICE();
    result.cb = Marshal.SizeOf(result);
    if (!EnumDisplayDevices(source, 0, ref result, 1)) return new string[0];
    return new[] { result.DeviceID ?? "", result.DeviceString ?? "" };
  }
}
'@

$names = @{}
Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue | ForEach-Object {
  $parts = $_.InstanceName -split '\\'
  if ($parts.Count -ge 2) {
    $friendly = -join ($_.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ })
    if ($friendly) { $names[$parts[1].ToUpperInvariant()] = $friendly }
  }
}

$found = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
  $screen = $_
  $monitor = [XrbDisplayDevices]::Monitor($screen.DeviceName)
  $pnp = if ($monitor.Count) { $monitor[0] } else { '' }
  $match = [regex]::Match($pnp, 'DISPLAY#([^#]+)#', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $key = if ($match.Success) { $match.Groups[1].Value.ToUpperInvariant() } else { '' }
  $fallback = if ($monitor.Count -gt 1 -and $monitor[1] -and $monitor[1] -ne 'Generic PnP Monitor') { $monitor[1] } else { $screen.DeviceName }
  [PSCustomObject]@{
    device = $screen.DeviceName
    name = if ($key -and $names.ContainsKey($key)) { $names[$key] } else { $fallback }
    primary = $screen.Primary
    width = $screen.Bounds.Width
    height = $screen.Bounds.Height
  }
})

# Keep the old numeric index deterministic for existing manifests; new saves use `device`.
$ordered = @($found | Where-Object primary) + @($found | Where-Object { -not $_.primary } | Sort-Object device)
$result = for ($i = 0; $i -lt $ordered.Count; $i++) {
  [PSCustomObject]@{
    index = $i
    device = $ordered[$i].device
    name = $ordered[$i].name
    primary = $ordered[$i].primary
    width = $ordered[$i].width
    height = $ordered[$i].height
  }
}
@($result) | ConvertTo-Json -Compress
