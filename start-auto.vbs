' XR Build Start-menu control panel: always uses the selected user workspace.
' A missing or empty .xrbuild directory opens the normal workspace setup.
' Setup log: %LOCALAPPDATA%\XRBuild\startup\startup-<checkout>.log
Option Explicit
Dim shell, fso, here, server
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
server = here & "\tools\panel-bootstrap\bootstrap.mjs"

' Window style 0: hidden. Do not wait: the server keeps running until Quit in the panel.
shell.CurrentDirectory = here
On Error Resume Next
shell.Run "node """ & server & """ --open --auto-workspace --shortcut-launch=auto", 0, False
If Err.Number <> 0 Then
  MsgBox "XR Build could not start Node.js. Install a supported Node.js (22.18+ or current LTS) and try again. Setup will install missing app dependencies automatically.", vbCritical, "XR Build startup"
  WScript.Quit 1
End If
On Error GoTo 0
