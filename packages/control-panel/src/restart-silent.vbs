' Backward-compatible relauncher for Control Panel processes started before direct detached Node restart.
' Current server code does not invoke this file, but an already-running older process can still reference this path.
Option Explicit
Dim shell, command, i
If WScript.Arguments.Count < 2 Then WScript.Quit 2
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = WScript.Arguments(0)
command = QuoteArgument(WScript.Arguments(1))
For i = 2 To WScript.Arguments.Count - 1
  command = command & " " & QuoteArgument(WScript.Arguments(i))
Next
' Window style 0 is hidden; do not wait for the replacement server.
shell.Run command, 0, False

Function QuoteArgument(value)
  QuoteArgument = """" & Replace(value, """", """""") & """"
End Function
