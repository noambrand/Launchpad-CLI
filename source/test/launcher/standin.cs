// Stand-in for claude.exe and wt.exe in the launcher test harness. Records how it was started
// (raw command line, arguments, working folder, environment) as one JSON line, then exits.
// Built at test time with the .NET Framework compiler that ships with Windows (csc.exe):
// console build for claude.exe, /target:winexe build for wt.exe (so `start wt.exe` opens no window).
//   STANDIN_LOG       file to append the record to (required)
//   STANDIN_FAIL_ON   if any argument equals this, exit with code 1 at once (no-history resume)
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;

static class StandIn
{
    static string J(string s)
    {
        if (s == null) return "null";
        var b = new StringBuilder("\"");
        foreach (char c in s)
        {
            if (c == '"') b.Append("\\\"");
            else if (c == '\\') b.Append("\\\\");
            else if (c < 0x20) b.Append("\\u").Append(((int)c).ToString("x4"));
            else b.Append(c);
        }
        return b.Append('"').ToString();
    }

    static int Main(string[] args)
    {
        string log = Environment.GetEnvironmentVariable("STANDIN_LOG");
        string failOn = Environment.GetEnvironmentVariable("STANDIN_FAIL_ON");
        var env = new List<string>();
        foreach (DictionaryEntry e in Environment.GetEnvironmentVariables()) env.Add((string)e.Key);
        env.Sort(StringComparer.OrdinalIgnoreCase);
        var envJson = new StringBuilder("{");
        for (int i = 0; i < env.Count; i++)
        {
            if (i > 0) envJson.Append(',');
            envJson.Append(J(env[i])).Append(':').Append(J(Environment.GetEnvironmentVariable(env[i])));
        }
        envJson.Append('}');
        var argJson = new StringBuilder("[");
        for (int i = 0; i < args.Length; i++) { if (i > 0) argJson.Append(','); argJson.Append(J(args[i])); }
        argJson.Append(']');
        string exe = Path.GetFileNameWithoutExtension(Environment.GetCommandLineArgs()[0]).ToLowerInvariant();
        string line = "{\"name\":" + J(exe) + ",\"commandLine\":" + J(Environment.CommandLine) +
            ",\"args\":" + argJson + ",\"cwd\":" + J(Environment.CurrentDirectory) + ",\"env\":" + envJson + "}\n";
        if (!string.IsNullOrEmpty(log)) File.AppendAllText(log, line, new UTF8Encoding(false));
        if (!string.IsNullOrEmpty(failOn)) foreach (string a in args) if (a == failOn) return 1;
        return 0;
    }
}
