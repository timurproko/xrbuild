' XR Build repository-development control panel: starts with this checkout's .xrbuild workspace,
' no console window, and opens it in the browser. Log:
' %LOCALAPPDATA%\XRBuild\startup\startup-<checkout>.log (setup), logs\control-panel.log (panel)
Option Explicit
Dim shell, fso, here, server
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
server = here & "\tools\panel-bootstrap\bootstrap.mjs"

' Window style 0: hidden. Do not wait: the server keeps running until Quit in the panel.
shell.CurrentDirectory = here
On Error Resume Next
shell.Run "node """ & server & """ --open --workspace=.xrbuild --shortcut-launch=repository", 0, False
If Err.Number <> 0 Then
  MsgBox "XR Build could not start Node.js. Install a supported Node.js (22.18+ or current LTS) and try again. Setup will install missing app dependencies automatically.", vbCritical, "XR Build startup"
  WScript.Quit 1
End If
On Error GoTo 0
