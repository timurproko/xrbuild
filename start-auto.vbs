' XR Build Start-menu control panel: always uses the selected user workspace.
' A missing or empty .xrbuild directory opens the normal workspace setup.
' Log: %LOCALAPPDATA%\XRBuild\logs\control-panel.log
Option Explicit
Dim shell, fso, here, server
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
server = here & "\packages\control-panel\src\server.ts"

' Window style 0: hidden. Do not wait: the server keeps running until Quit in the panel.
shell.CurrentDirectory = here
On Error Resume Next
shell.Run "node """ & server & """ --open --auto-workspace --shortcut-launch=auto", 0, False
If Err.Number <> 0 Then
  MsgBox "Node.js was not found. Install Node.js 22 or newer and try again.", vbCritical, "XR Build control panel"
  WScript.Quit 1
End If
On Error GoTo 0
