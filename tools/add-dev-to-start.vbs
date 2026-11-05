' Adds a separate "XR Build Dev" shortcut to the current user's Start menu.
' It always opens this checkout's independently cloned .xrbuild workspace through start-repo.vbs.
' Rerun after moving the repo: a shortcut holds absolute paths.
' Remove it from the Start menu like any other app.
Option Explicit
Dim shell, fso, repo, lnkPath, lnk
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
lnkPath = shell.SpecialFolders("Programs") & "\XR Build Dev.lnk"

Set lnk = shell.CreateShortcut(lnkPath)
lnk.TargetPath = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")
lnk.Arguments = """" & repo & "\start-repo.vbs" & """"
lnk.WorkingDirectory = repo
lnk.IconLocation = repo & "\native\host\src\app.ico,0"
lnk.Description = "XR Build development control panel"
lnk.Save

' Pinning needs a right-click (Windows has no API for it): show the shortcut in its folder.
shell.Run "explorer.exe /select,""" & lnkPath & """", 1, False
