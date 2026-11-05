# Opens a folder in Explorer, or a file in its default app, and brings that window in front of
# the browser. The panel server runs in the background, and Windows' focus-stealing protection
# keeps windows it activates behind the browser; attaching to the foreground window's input
# thread (plus a synthetic Alt press) lets SetForegroundWindow through.
#   -Path       folder or file to open
#   -FocusOnly  do not open anything: wait for the Explorer window of -Path (opened by the
#               caller with explorer.exe) and bring it to the front
param([Parameter(Mandatory)] [string] $Path, [switch] $FocusOnly)
$ErrorActionPreference = 'Stop'
Add-Type -Namespace Win32 -Name Focus -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
'@

function Bring-ToFront([IntPtr] $hwnd) {
  $fgThread = [Win32.Focus]::GetWindowThreadProcessId([Win32.Focus]::GetForegroundWindow(), [IntPtr]::Zero)
  $me = [Win32.Focus]::GetCurrentThreadId()
  $attached = $fgThread -ne 0 -and $fgThread -ne $me -and [Win32.Focus]::AttachThreadInput($me, $fgThread, $true)
  try {
    if ([Win32.Focus]::IsIconic($hwnd)) { [void][Win32.Focus]::ShowWindow($hwnd, 9) }  # SW_RESTORE
    [Win32.Focus]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)  # Alt down
    [void][Win32.Focus]::BringWindowToTop($hwnd)
    [void][Win32.Focus]::SetForegroundWindow($hwnd)
    [Win32.Focus]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)  # Alt up
  } finally {
    if ($attached) { [void][Win32.Focus]::AttachThreadInput($me, $fgThread, $false) }
  }
}

function Wait-Window([scriptblock] $find, [int] $ms = 4000) {
  for ($t = 0; $t -lt $ms; $t += 100) {
    $h = & $find
    if ($h -and $h -ne [IntPtr]::Zero) { return $h }
    Start-Sleep -Milliseconds 100
  }
  return [IntPtr]::Zero
}

$full = (Resolve-Path -LiteralPath $Path).Path.TrimEnd('\')
$shell = New-Object -ComObject Shell.Application

if (Test-Path -LiteralPath $full -PathType Container) {
  $explorerWindow = {
    foreach ($w in @($shell.Windows())) {
      try { if ($w.Document.Folder.Self.Path.TrimEnd('\') -ieq $full) { return [IntPtr]$w.HWND } } catch { }
    }
    return [IntPtr]::Zero
  }
  $hwnd = if ($FocusOnly) { Wait-Window $explorerWindow 6000 } else { & $explorerWindow }
  if ($hwnd -eq [IntPtr]::Zero -and -not $FocusOnly) {
    # explorer.exe hands the request to the running shell; that sometimes gets lost, so wait for
    # the window and ask the shell directly if it does not come.
    Start-Process explorer.exe -ArgumentList "`"$full`""
    $hwnd = Wait-Window $explorerWindow 3000
    if ($hwnd -eq [IntPtr]::Zero) {
      $shell.Open($full)
      $hwnd = Wait-Window $explorerWindow 3000
    }
  }
} else {
  # The default app for the file type (e.g. VS Code for .json); its window is the one whose
  # title names the file.
  $name = Split-Path -Leaf $full
  $shell.ShellExecute($full)
  $hwnd = Wait-Window {
    $p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$name*" } | Select-Object -First 1
    if ($p) { $p.MainWindowHandle } else { [IntPtr]::Zero }
  } 6000
}
if ($hwnd -ne [IntPtr]::Zero) { Bring-ToFront $hwnd }
