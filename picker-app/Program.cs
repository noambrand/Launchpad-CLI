using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace LaunchpadPicker
{
    internal static class Program
    {
        // Single-instance guard (the old HTA used SINGLEINSTANCE="yes"). A
        // second launch while the picker is open exits quietly instead of
        // opening a duplicate window.
        private static Mutex _instanceMutex;

        [STAThread]
        private static void Main()
        {
            bool createdNew;
            _instanceMutex = new Mutex(true, "ClaudeCodeLaunchpadPicker_SingleInstance", out createdNew);
            if (!createdNew) return; // already running

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try
            {
                Application.Run(new MainForm());
            }
            finally
            {
                try { _instanceMutex.ReleaseMutex(); } catch { }
            }
        }
    }

    internal sealed class MainForm : Form
    {
        // Must match the folder the exe is installed into: folder-picker.html,
        // webview-shim.js, config.txt and VERSION all live next to the exe.
        private static readonly string AppDir =
            AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');

        private const string VirtualHost = "appassets.local";
        private const string StartPage = "https://appassets.local/folder-picker.html";

        private readonly WebView2 _web = new WebView2();
        private readonly HostBridge _bridge;

        public MainForm()
        {
            _bridge = new HostBridge(this);

            Text = "ClaudeCode Launchpad CLI - Pick Folder";
            try { Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            FormBorderStyle = FormBorderStyle.FixedDialog; // BORDER="dialog"
            MaximizeBox = false;                            // MAXIMIZEBUTTON="no"
            MinimizeBox = false;                            // MINIMIZEBUTTON="no"
            ShowInTaskbar = true;                           // SHOWINTASKBAR="yes"
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new System.Drawing.Size(1040, 690); // baseline; JS re-fits
            BackColor = System.Drawing.Color.White;

            _web.Dock = DockStyle.Fill;
            Controls.Add(_web);

            Load += OnLoadAsync;
        }

        private async void OnLoadAsync(object sender, EventArgs e)
        {
            try
            {
                // Keep the WebView2 user-data folder in a writable per-user
                // location (the install dir may be read-only, e.g. Program Files).
                string userData = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "ClaudeCodeLaunchpad", "WebView2");
                Directory.CreateDirectory(userData);

                var env = await CoreWebView2Environment.CreateAsync(null, userData);
                await _web.EnsureCoreWebView2Async(env);

                CoreWebView2 c = _web.CoreWebView2;

                // Lock the control down to a dialog, not a browser.
                c.Settings.AreHostObjectsAllowed = true;
                c.Settings.IsWebMessageEnabled = true;
                c.Settings.AreDefaultContextMenusEnabled = false; // CONTEXTMENU="no"
                c.Settings.AreDevToolsEnabled = false;
                c.Settings.IsStatusBarEnabled = false;
                c.Settings.IsZoomControlEnabled = false;
                c.Settings.IsBuiltInErrorPageEnabled = false;
                c.Settings.AreBrowserAcceleratorKeysEnabled = false;

                // Expose the COM-replacement bridge as window...hostObjects.host.
                c.AddHostObjectToScript("host", _bridge);

                // The picker reads window.__APP_DIR__ (replacing the old
                // location.pathname trick) to find config.txt / VERSION.
                string appDirJs = AppDir.Replace("\\", "\\\\").Replace("\"", "\\\"");
                await c.AddScriptToExecuteOnDocumentCreatedAsync(
                    "window.__APP_DIR__ = \"" + appDirJs + "\";");

                // Serve the picker UI from the install dir over a real https
                // origin so the update-check XHR to api.github.com works (a
                // file:// origin would be blocked from remote requests).
                c.SetVirtualHostNameToFolderMapping(
                    VirtualHost, AppDir, CoreWebView2HostResourceAccessKind.Allow);

                // Picker's ok()/cancel() call window.close().
                c.WindowCloseRequested += (s2, e2) =>
                {
                    try { BeginInvoke((Action)Close); } catch { Close(); }
                };

                // Any real navigation to an external URL (update Download button
                // routes through wshShell.Run, but guard target=_blank too) opens
                // in the default browser rather than inside the dialog.
                c.NewWindowRequested += (s2, e2) =>
                {
                    e2.Handled = true;
                    try { Process.Start(new ProcessStartInfo(e2.Uri) { UseShellExecute = true }); } catch { }
                };

                c.Navigate(StartPage);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "The picker could not start the Microsoft Edge WebView2 component.\n\n" +
                    "Please install the free 'Microsoft Edge WebView2 Runtime' from Microsoft, then try again.\n\n" +
                    "Details: " + ex.Message,
                    "ClaudeCode Launchpad CLI",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                Close();
            }
        }
    }
}
