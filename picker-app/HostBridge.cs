using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace LaunchpadPicker
{
    // The bridge that replaces the picker's former COM objects. Exposed to the
    // page JavaScript as window.chrome.webview.hostObjects.sync.host by
    // MainForm via CoreWebView2.AddHostObjectToScript("host", ...).
    //
    // Every method here is called SYNCHRONOUSLY from the page on the UI thread
    // (WebView2 invokes host-object members on the thread that created the
    // CoreWebView2). That matches the original COM calls, which were also
    // synchronous, so picker behavior is preserved 1:1.
    //
    // The old COM surface this replaces (see webview-shim.js for the mapping):
    //   WScript.Shell            -> Run, ExpandEnv
    //   Scripting.FileSystemObject -> FileExists, FolderExists, CreateFolder, DeleteFile
    //   Shell.Application        -> BrowseForFolder
    //   ADODB.Stream (r/w utf-8) -> ReadFile, WriteFile
    //   (window.resizeTo/moveTo) -> SizeAndCenter
    //   WinHttp.WinHttpRequest   -> stays in the page as a synchronous XHR
    [ComVisible(true)]
    [ClassInterface(ClassInterfaceType.AutoDual)]
    public class HostBridge
    {
        private readonly Form _owner;

        public HostBridge(Form owner)
        {
            _owner = owner;
        }

        // The install directory (where the exe, config.txt and VERSION live).
        // Injected into the page as window.__APP_DIR__; also callable directly.
        public string AppDir()
        {
            return AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        }

        // WScript.Shell.ExpandEnvironmentStrings
        public string ExpandEnv(string s)
        {
            if (string.IsNullOrEmpty(s)) return s ?? "";
            return Environment.ExpandEnvironmentVariables(s);
        }

        // Scripting.FileSystemObject.FileExists
        public bool FileExists(string path)
        {
            try { return !string.IsNullOrEmpty(path) && File.Exists(path); }
            catch { return false; }
        }

        // Scripting.FileSystemObject.FolderExists
        public bool FolderExists(string path)
        {
            try { return !string.IsNullOrEmpty(path) && Directory.Exists(path); }
            catch { return false; }
        }

        // Scripting.FileSystemObject.CreateFolder
        public void CreateFolder(string path)
        {
            try { if (!string.IsNullOrEmpty(path)) Directory.CreateDirectory(path); }
            catch { /* mirror the HTA: creation failures are non-fatal */ }
        }

        // Scripting.FileSystemObject.DeleteFile
        public void DeleteFile(string path)
        {
            try { if (FileExists(path)) File.Delete(path); }
            catch { /* HTA wrapped this in try/catch too */ }
        }

        // ADODB.Stream read (utf-8). Returns "" when the file is missing, exactly
        // like the picker's readUtf8() helper did.
        public string ReadFile(string path)
        {
            try
            {
                if (!FileExists(path)) return "";
                // Decode as UTF-8; strip a BOM if one is present so callers get
                // the same text the ADODB.Stream utf-8 reader returned.
                byte[] bytes = File.ReadAllBytes(path);
                if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
                    return new UTF8Encoding(false).GetString(bytes, 3, bytes.Length - 3);
                return new UTF8Encoding(false).GetString(bytes);
            }
            catch { return ""; }
        }

        // ADODB.Stream write (utf-8, NO BOM) — matches writeUtf8NoBom().
        // The launcher .bat reads these files (kivun-workdir.txt, config.txt,
        // kivun-claude-startcmd.txt, kivun-claude-flags.txt), so the exact
        // byte encoding matters: UTF-8 without a byte-order mark.
        public void WriteFile(string path, string content)
        {
            try
            {
                string dir = Path.GetDirectoryName(path);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    Directory.CreateDirectory(dir);
                File.WriteAllText(path, content ?? "", new UTF8Encoding(false));
            }
            catch (Exception ex)
            {
                // Surface write failures the way the picker expects: throwing
                // back into JS lets the existing try/catch show an error instead
                // of silently producing no result file.
                throw new InvalidOperationException("WriteFile failed for " + path + ": " + ex.Message, ex);
            }
        }

        // Scripting.FileSystemObject.CopyFile(source, destination, overwrite)
        // Used by the Windows Terminal icon fixer to back up and restore
        // settings.json. VBScript's CopyFile overwrites by default.
        public void CopyFile(string source, string destination, bool overwrite)
        {
            try
            {
                File.Copy(source, destination, overwrite);
            }
            catch (Exception ex)
            {
                // Surface failures to JS so the tool's try/catch can report and
                // (for the restore path) react, instead of failing silently.
                throw new InvalidOperationException("CopyFile failed (" + source + " -> " + destination + "): " + ex.Message, ex);
            }
        }

        // WScript.Shell.Run(command, windowStyle, waitOnReturn)
        //   windowStyle: 0 = hidden, anything else = normal
        //   waitOnReturn: block until the process exits
        // The picker uses this to open a URL in the default browser, launch
        // notepad on config.txt, run node on a helper .js, and run a .bat/.cmd.
        // UseShellExecute=true reproduces WScript.Shell.Run's behavior of
        // resolving URLs/documents/PATH executables the way the shell does.
        public int Run(string command, int windowStyle, bool waitOnReturn)
        {
            if (string.IsNullOrEmpty(command)) return 0;
            try
            {
                string file, args;
                SplitCommand(command, out file, out args);

                var psi = new ProcessStartInfo
                {
                    FileName = file,
                    Arguments = args,
                    UseShellExecute = true,
                    WindowStyle = (windowStyle == 0) ? ProcessWindowStyle.Hidden : ProcessWindowStyle.Normal,
                    WorkingDirectory = AppDir()
                };
                var p = Process.Start(psi);
                if (waitOnReturn && p != null)
                {
                    p.WaitForExit();
                    return p.ExitCode;
                }
                return 0;
            }
            catch
            {
                // Match the HTA: Run() calls were wrapped in try/catch and a
                // failure to launch was non-fatal (e.g. missing browser).
                return -1;
            }
        }

        // Shell.Application.BrowseForFolder — the "pick a folder" dialog.
        // Returns the selected path, or "" if the user cancels. The page shim
        // wraps the result back into { Self: { Path: ... } } like the COM object.
        public string BrowseForFolder(string startPath, string title)
        {
            string selected = "";
            Action show = () =>
            {
                using (var dlg = new FolderBrowserDialog())
                {
                    dlg.Description = string.IsNullOrEmpty(title) ? "Pick a folder" : title;
                    dlg.ShowNewFolderButton = true;
                    try
                    {
                        if (!string.IsNullOrEmpty(startPath) && Directory.Exists(startPath))
                            dlg.SelectedPath = startPath;
                    }
                    catch { /* invalid start path — let the dialog default */ }

                    if (dlg.ShowDialog(_owner) == DialogResult.OK)
                        selected = dlg.SelectedPath ?? "";
                }
            };

            // Host-object methods already run on the UI thread, but guard anyway
            // so the modal dialog is always shown on the form's thread.
            if (_owner != null && _owner.InvokeRequired)
                _owner.Invoke(show);
            else
                show();

            return selected;
        }

        // Replaces window.resizeTo + window.moveTo (no-ops in a browser control).
        // w/h are CSS pixels from the page; convert to physical pixels using the
        // form's DPI, then size the client area and center on the working area.
        public void SizeAndCenter(int cssWidth, int cssHeight)
        {
            if (_owner == null) return;
            Action apply = () =>
            {
                try
                {
                    double scale = _owner.DeviceDpi / 96.0;
                    if (scale <= 0) scale = 1.0;
                    int w = (int)Math.Round(cssWidth * scale);
                    int h = (int)Math.Round(cssHeight * scale);

                    var wa = Screen.FromControl(_owner).WorkingArea;
                    // Never exceed the available work area.
                    w = Math.Min(w, wa.Width);
                    h = Math.Min(h, wa.Height);

                    _owner.ClientSize = new System.Drawing.Size(w, h);
                    int x = wa.Left + Math.Max(0, (wa.Width - _owner.Width) / 2);
                    int y = wa.Top + Math.Max(0, (wa.Height - _owner.Height) / 2);
                    _owner.Location = new System.Drawing.Point(x, y);
                }
                catch { /* sizing is best-effort, never fatal */ }
            };
            if (_owner.InvokeRequired) _owner.Invoke(apply); else apply();
        }

        // Split a WScript.Shell.Run command line into executable + arguments,
        // honoring a leading quoted path (e.g. "C:\a b\x.bat" ARG).
        private static void SplitCommand(string command, out string file, out string args)
        {
            command = command.Trim();
            if (command.StartsWith("\""))
            {
                int end = command.IndexOf('"', 1);
                if (end > 0)
                {
                    file = command.Substring(1, end - 1);
                    args = command.Substring(end + 1).Trim();
                    return;
                }
                file = command.Trim('"');
                args = "";
                return;
            }
            int sp = command.IndexOf(' ');
            if (sp < 0) { file = command; args = ""; return; }
            file = command.Substring(0, sp);
            args = command.Substring(sp + 1).Trim();
        }
    }
}
