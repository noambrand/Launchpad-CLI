' play.vbs <wavpath> - play a .wav on Windows with no PowerShell and no extra installs.
' Uses the Windows Media Player COM control (cscript-friendly, headless, no window).
' Never shows an error: if WMP is unavailable it just exits quietly.
Option Explicit
On Error Resume Next

Dim f, p, waited
If WScript.Arguments.Count < 1 Then WScript.Quit 0
f = WScript.Arguments(0)

Set p = CreateObject("WMPlayer.OCX")
If p Is Nothing Then WScript.Quit 0   ' Windows Media Player not present -> stay silent

p.settings.volume = 100
p.URL = f
p.controls.play

' Wait for playback to start (max ~3s), then for it to finish (max ~15s).
waited = 0
Do While p.playState <> 3 And waited < 3000
  WScript.Sleep 50
  waited = waited + 50
Loop
waited = 0
Do While p.playState = 3 And waited < 15000
  WScript.Sleep 50
  waited = waited + 50
Loop

p.close
WScript.Quit 0
