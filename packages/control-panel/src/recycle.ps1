# Moves a folder to the Windows Recycle Bin (recoverable), without any dialog.
#   -Path  folder to move
param([Parameter(Mandatory)] [string] $Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName Microsoft.VisualBasic
[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
  (Resolve-Path -LiteralPath $Path).Path,
  [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
  [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
