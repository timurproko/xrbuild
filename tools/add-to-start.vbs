' Adds one "XR Build" shortcut to the current user's Start menu. Default: start-auto.vbs
' (ordinary user mode by default; --repo explicitly selects this checkout's .xrbuild clone).
' --repo forces start-repo.vbs; --user forces start.vbs. No option restores auto routing.
' Rerun after moving the repo: a shortcut holds absolute paths.
' Remove it from the Start menu like any other app.
Option Explicit
Dim shell, fso, repo, lnkPath, lnk, launcher
launcher = "start-auto.vbs"
If WScript.Arguments.Count > 1 Then
  MsgBox "Use --repo, --user, or no option.", vbExclamation, "XR Build control panel"
  WScript.Quit 1
End If
If WScript.Arguments.Count = 1 Then
  Select Case LCase(WScript.Arguments(0))
    Case "--repo"
      launcher = "start-repo.vbs"
    Case "--user"
      launcher = "start.vbs"
    Case Else
      MsgBox "Use --repo, --user, or no option.", vbExclamation, "XR Build control panel"
      WScript.Quit 1
  End Select
End If
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
lnkPath = shell.SpecialFolders("Programs") & "\XR Build.lnk"
' Earlier versions named it "Build control panel", then "Build"
Dim oldName
For Each oldName In Array("Build control panel", "Build")
  If fso.FileExists(shell.SpecialFolders("Programs") & "\" & oldName & ".lnk") Then fso.DeleteFile shell.SpecialFolders("Programs") & "\" & oldName & ".lnk"
Next

Set lnk = shell.CreateShortcut(lnkPath)
lnk.TargetPath = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")
lnk.Arguments = """" & repo & "\" & launcher & """"
lnk.WorkingDirectory = repo
lnk.IconLocation = repo & "\native\host\src\app.ico,0"
lnk.Description = "XR Build control panel"
If launcher = "start-repo.vbs" Then lnk.Description = "XR Build repository control panel"
lnk.Save
' Pinning needs a right-click (Windows has no API for it): show the shortcut in its folder.
shell.Run "explorer.exe /select,""" & lnkPath & """", 1, False
