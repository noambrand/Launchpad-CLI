' unzip.vbs - extract a .zip on old Windows that has no `tar`/Expand-Archive.
' Uses the Shell.Application COM object, present on every Windows since XP.
' Usage:  cscript //nologo unzip.vbs "C:\path\file.zip" "C:\dest\folder"
Option Explicit
Dim args, zipPath, destPath, fso, shell, zipItems, i
Set args = WScript.Arguments
If args.Count < 2 Then
  WScript.Echo "usage: unzip.vbs <zipFile> <destFolder>"
  WScript.Quit 2
End If
zipPath = args(0)
destPath = args(1)

Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(zipPath) Then
  WScript.Echo "zip not found: " & zipPath
  WScript.Quit 1
End If
If Not fso.FolderExists(destPath) Then fso.CreateFolder(destPath)

Set shell = CreateObject("Shell.Application")
Set zipItems = shell.NameSpace(zipPath).Items()
' 16 = respond "Yes to All" to any prompt; 256 = no progress dialog.
shell.NameSpace(destPath).CopyHere zipItems, 16

' CopyHere is asynchronous; wait until the item count settles before exiting.
Dim expected, prev, tries
expected = zipItems.Count
prev = -1
tries = 0
Do
  WScript.Sleep 400
  Dim got
  got = shell.NameSpace(destPath).Items().Count
  If got = prev Then
    tries = tries + 1
  Else
    tries = 0
  End If
  prev = got
Loop While tries < 5 And got < expected And tries < 60
WScript.Quit 0
