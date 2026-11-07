// agent-helpers.js (v3.3.0)
// Shared by the folder picker (ES5 JScript inside the HTA / its generated HTML) and by
// configure-codex.js (Node), so the picker's preview is built by the very code that builds the
// command Codex is started with (handout 7.5, 7.7). ES5 only: no let/const, arrows, template
// strings, Array.indexOf or String.trim, because the HTA's JScript engine has none of them.

var AgentHelpers = (function () {
  // Same wording as the Claude path (claudecode-launchpad.bat, LANG_PROMPT).
  var LANGUAGES = {
    hebrew: "Hebrew", arabic: "Arabic", persian: "Persian (Farsi)", urdu: "Urdu", kurdish: "Kurdish", pashto: "Pashto",
    sindhi: "Sindhi", yiddish: "Yiddish", syriac: "Syriac", dhivehi: "Dhivehi", nko: "N'Ko", adlam: "Fulani (Adlam script)",
    mandaic: "Mandaic", samaritan: "Samaritan", dari: "Dari (Afghan Persian)", uyghur: "Uyghur", balochi: "Balochi",
    kashmiri: "Kashmiri", shahmukhi: "Punjabi (Shahmukhi)", azeri_south: "South Azerbaijani", jawi: "Malay (Jawi script)",
    hausa_ajami: "Hausa (Ajami script)", rohingya: "Rohingya", turoyo: "Turoyo (Neo-Aramaic)"
  };

  function trim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }
  function startsWith(s, p) { return String(s).substring(0, p.length) === p; }
  function contains(list, x) { for (var i = 0; i < list.length; i++) if (list[i] === x) return true; return false; }

  // One tokenizer, used everywhere: whitespace separates, "..." keeps text together and the
  // quotes are removed, nothing else is special.
  function tokenize(s) {
    var out = [], cur = "", inQ = false, had = false, str = String(s == null ? "" : s), i, ch;
    for (i = 0; i < str.length; i++) {
      ch = str.charAt(i);
      if (ch === '"') { inQ = !inQ; had = true; continue; }
      if (!inQ && /\s/.test(ch)) { if (had || cur) out.push(cur); cur = ""; had = false; continue; }
      cur += ch;
    }
    if (inQ) { var e = new Error("A quote mark in the custom options is not closed."); e.code = "UNCLOSED_QUOTE"; throw e; }
    if (had || cur) out.push(cur);
    return out;
  }

  // Codex takes one first message. Entries are joined with a space; a line break or other control
  // character, or an entry starting with "/" (a slash command, Q2), is refused.
  function startupText(entries) {
    var raw = (entries instanceof Array) ? entries : [entries], list = [], i, e;
    for (i = 0; i < raw.length; i++) { e = trim(raw[i]); if (e) list.push(e); }
    for (i = 0; i < list.length; i++) {
      if (/[\u0000-\u001f\u007f]/.test(list[i])) return { text: null, error: "CONTROL", message: "The startup message can only be one line." };
      if (list[i].charAt(0) === "/") return { text: null, error: "SLASH", message: "Codex can't run commands at startup. Type it yourself once Codex opens." };
    }
    return { text: list.length ? list.join(" ") : null };
  }

  function languageLine(code) {
    var name = LANGUAGES[String(code || "").toLowerCase()];
    return name ? "Always respond in " + name + "." : null;
  }
  // A TOML literal string: handles the N'Ko apostrophe and is never parsed as another type.
  function languageArg(line) { return "developer_instructions='''" + line + "'''"; }

  function isModelFlag(t) { return t === "-m" || t === "--model" || startsWith(t, "--model="); }

  // Build Codex's exact argument array (D11, D15). Returns { args, errors, notices, fatal }.
  //   launch: { conv: fresh|last|pick, model, customFlags, codexFlags, startup, language,
  //             skipLanguage, noDaemon, relaunch }
  // fatal: the errors about options. Codex is not started with any of them, because leaving an
  // option out would quietly change what the user asked for (a read-only sandbox, say). Invalid
  // startup text is only in errors: it is left out with a message and Codex starts (handout 7.5).
  function composeCodex(launch) {
    var errors = [], notices = [], user = [], i, t, v, bad = [], kept = [];
    try { user = tokenize(launch.codexFlags).concat(tokenize(launch.customFlags)); } catch (err) { errors.push(err.message); user = []; }
    if (user.length && /^(resume|fork)$/i.test(user[0])) {
      errors.push('Choose "continue last" or "pick from history" in the picker instead of typing ' + user[0] + ".");
      user = [];
    }
    for (i = 0; i < user.length; i++) { if (/^--dangerously-/.test(user[i]) || user[i] === "--yolo") bad.push(user[i]); else kept.push(user[i]); }
    if (bad.length) { errors.push("Launchpad does not start Codex with " + bad.join(" ") + "."); user = kept; }
    for (i = 0; i < user.length; i++) {
      t = user[i];
      var isA = (t === "-a" || t === "--ask-for-approval"), isEq = startsWith(t, "--ask-for-approval=");
      v = isA ? user[i + 1] : (isEq ? t.split("=")[1] : undefined);
      if ((isA || isEq) && v !== "on-request" && v !== "never") errors.push("The approval option (-a) can only be on-request or never.");
    }
    var modelCount = 0, userInstructions = false;
    for (i = 0; i < user.length; i++) {
      if (isModelFlag(user[i])) modelCount++;
      if (/developer_instructions\s*=/.test(user[i])) userInstructions = true;
    }
    if (modelCount > 1) errors.push("The custom options name a model more than once. Codex will not start with two models.");

    var args = [];
    if (launch.noDaemon) args.push("--no-daemon");
    if (launch.conv === "last") args.push("resume", "--last");
    else if (launch.conv === "pick") args.push("resume");
    if (launch.model && modelCount === 0) args.push("-m", launch.model);
    var lang = (!launch.skipLanguage && !userInstructions) ? languageLine(launch.language) : null;
    if (lang) args.push("-c", languageArg(lang));
    for (i = 0; i < user.length; i++) args.push(user[i]);
    var fatal = errors.slice();   // every error so far is about the options
    if (!launch.relaunch) {
      var st = startupText(launch.startup);
      if (st.error) { errors.push(st.message); notices.push("startup message not sent"); }
      else if (st.text && launch.conv === "pick") {
        // `codex resume <text>` would read the text as a conversation name.
        notices.push("The startup message is not sent when you pick a conversation from the list.");
      } else if (st.text) {
        if (st.text.charAt(0) === "-") args.push("--"); // otherwise Codex reads it as an option (Gate 0)
        args.push(st.text);
      }
    }
    return { args: args, errors: errors, notices: notices, fatal: fatal };
  }

  // ---- GitHub Copilot CLI (v3.4.0) ---------------------------------------

  // Copilot's permission bypasses are refused, as Codex's are. The other two lists would fight a
  // choice the picker makes: which conversation to open, and the first message.
  var COPILOT_BYPASS = ["--allow-all", "--allow-all-tools", "--allow-all-paths", "--allow-all-urls", "--yolo", "--autopilot"];
  var COPILOT_CONVERSATION = ["--continue", "--resume", "-r", "--session-id", "--connect"];
  var COPILOT_PROMPT = ["-i", "--interactive", "-p", "--prompt"];

  function optionName(t) { var i = t.indexOf("="); return (t.charAt(0) === "-" && i > 0) ? t.substring(0, i) : t; }

  // Copilot has no language option: configure-copilot.js puts this line in a file. It is firmer than
  // the line Claude and Codex get, because Copilot's automatic model choice ignored the plain line
  // for N'Ko (Step 0, S6).
  function copilotLanguageLine(code) {
    var name = LANGUAGES[String(code || "").toLowerCase()];
    return name ? "Always respond in " + name + ", whatever language the user writes in. Do not answer in English." : null;
  }

  // Copilot takes one first message, and a /command works as one (Step 0, S5). A /command can't be
  // joined with other text, because it would then become that command's arguments.
  function copilotStartup(entries) {
    var raw = (entries instanceof Array) ? entries : [entries], list = [], i, e;
    for (i = 0; i < raw.length; i++) { e = trim(raw[i]); if (e) list.push(e); }
    for (i = 0; i < list.length; i++) {
      if (/[\u0000-\u001f\u007f]/.test(list[i])) return { text: null, error: "CONTROL", message: "The startup message can only be one line." };
      if (list.length > 1 && list[i].charAt(0) === "/") return { text: null, error: "SLASH", message: "Copilot can run one command at startup, on its own. Remove the other lines or the command." };
    }
    return { text: list.length ? list.join(" ") : null };
  }

  // Build Copilot's exact argument array. Returns { args, errors, notices, fatal }, as composeCodex does.
  //   launch: { conv: fresh|last|pick, sessionId, model, customFlags, copilotFlags, startup, env, relaunch }
  // sessionId is what the runner found for this folder. Plain --continue is never used: with no
  // conversation here it opens another folder's (Step 0, S4). Nor is plain --resume: it shows no list
  // after a trust screen, while the /resume command does.
  function composeCopilot(launch) {
    var errors = [], notices = [], user = [], i, t, name, bad = [], kept = [], k;
    try { user = tokenize(launch.copilotFlags).concat(tokenize(launch.customFlags)); } catch (err) { errors.push(err.message); user = []; }
    for (i = 0; i < user.length; i++) {
      t = user[i]; name = optionName(t);
      if (contains(COPILOT_BYPASS, name) || t === "--mode=autopilot" || (t === "--mode" && user[i + 1] === "autopilot")) bad.push(t);
      else kept.push(t);
    }
    if (bad.length) { errors.push("Launchpad does not start Copilot with " + bad.join(" ") + "."); user = kept; }
    for (k in (launch.env || {})) {
      if (launch.env.hasOwnProperty(k) && String(k).toUpperCase() === "COPILOT_ALLOW_ALL") errors.push("Launchpad does not start Copilot with COPILOT_ALLOW_ALL: it also trusts the folder's own settings. Remove it from this profile.");
    }
    var modelCount = 0, convTold = false, promptTold = false;
    for (i = 0; i < user.length; i++) {
      name = optionName(user[i]);
      if (name === "--model") modelCount++;
      if (contains(COPILOT_CONVERSATION, name) && !convTold) { errors.push('Choose "continue last" or "pick from history" in the picker instead of typing ' + name + "."); convTold = true; }
      if (contains(COPILOT_PROMPT, name) && !promptTold) { errors.push("Use the startup message box instead of typing " + name + "."); promptTold = true; }
    }
    if (modelCount > 1) errors.push("The custom options name a model more than once.");

    var args = [];
    if (launch.conv === "last" && launch.sessionId) args.push("--session-id", launch.sessionId);
    if (launch.model && modelCount === 0) args.push("--model", launch.model);
    for (i = 0; i < user.length; i++) args.push(user[i]);
    var fatal = errors.slice();   // every error so far is about the options
    if (launch.conv === "pick") {
      args.push("-i", "/resume");
      if (!launch.relaunch && copilotStartup(launch.startup).text) notices.push("The startup message is not sent when you pick a conversation from the list.");
    } else if (!launch.relaunch) {
      var st = copilotStartup(launch.startup);
      if (st.error) { errors.push(st.message); notices.push("startup message not sent"); }
      else if (st.text && st.text.charAt(0) === "-") args.push("--interactive=" + st.text); // -i would read it as an option (Step 0)
      else if (st.text) args.push("-i", st.text);
    }
    return { args: args, errors: errors, notices: notices, fatal: fatal };
  }

  // Copilot's settings live in their own part of the profile, as Codex's do.
  function copilotFields(profile) {
    var c = profile.copilot || {};
    return { model: c.model || "", conv: c.conv || "fresh", customFlags: c.customFlags || "", startupCmds: c.startupCmds || "", envVars: c.envVars || "" };
  }

  // ---- picker helpers --------------------------------------------------

  // The picker's conversation radios keep their v3.2.2 values; this maps them for Codex.
  function codexConv(radioValue) { return radioValue === "--continue" ? "last" : (radioValue === "--resume" ? "pick" : "fresh"); }
  function convRadio(codexConvValue) { return codexConvValue === "last" ? "--continue" : (codexConvValue === "pick" ? "--resume" : ""); }

  // Which agent the picker shows, and whether it shows the agent choice (D3, D6).
  //   profileAgent: the profile's agent field (missing = Claude); installed: { claude, codex, copilot }
  function resolveAgent(profileAgent, installed) {
    var agent = (profileAgent === "codex" || profileAgent === "copilot") ? profileAgent : "claude";
    var missing = !installed[agent];
    var count = (installed.claude ? 1 : 0) + (installed.codex ? 1 : 0) + (installed.copilot ? 1 : 0);
    return { agent: agent, missing: missing, showChoice: count > 1 || missing };
  }

  // Store the agent the way D16 says: agent:"codex" or "copilot" only for those; choosing Claude
  // removes it. A profile only ever used with Claude keeps exactly the fields v3.2.2 wrote.
  function setProfileAgent(profile, agent) {
    if (agent === "codex" || agent === "copilot") profile.agent = agent;
    else if (profile.hasOwnProperty("agent")) delete profile.agent;
    return profile;
  }

  // envVars is Codex's own: a key typed for one agent never reaches the other (A31, A46).
  function codexFields(profile) {
    var c = profile.codex || {};
    return { model: c.model || "", conv: c.conv || "fresh", customFlags: c.customFlags || "", startupCmds: c.startupCmds || "", envVars: c.envVars || "" };
  }

  // A saved model that the last ONLINE model list no longer offers (handout 7.5).
  function modelUnavailable(model, cache) {
    if (!model || !cache || cache.source !== "online" || !(cache.models instanceof Array)) return false;
    for (var i = 0; i < cache.models.length; i++) if (cache.models[i].slug === model) return false;
    return true;
  }

  // Launch id: 32 lowercase hex characters (the only Codex value the batch file carries).
  function newLaunchId(random) {
    random = random || Math.random;
    var s = "";
    while (s.length < 32) s += ("0000000" + Math.floor(random() * 4294967296).toString(16)).slice(-8);
    return s.substring(0, 32);
  }

  // What the preview shows: the exact argument array, each item quoted when it holds spaces or quotes.
  function previewLine(args) {
    var parts = [], i, a;
    for (i = 0; i < args.length; i++) { a = args[i]; parts.push(/[\s"]/.test(a) || a === "" ? '"' + a.replace(/"/g, '\\"') + '"' : a); }
    return parts.join(" ");
  }

  return {
    LANGUAGES: LANGUAGES, tokenize: tokenize, startupText: startupText, languageLine: languageLine, languageArg: languageArg,
    composeCodex: composeCodex, codexConv: codexConv, convRadio: convRadio, resolveAgent: resolveAgent,
    setProfileAgent: setProfileAgent, codexFields: codexFields, modelUnavailable: modelUnavailable,
    newLaunchId: newLaunchId, previewLine: previewLine, contains: contains,
    composeCopilot: composeCopilot, copilotFields: copilotFields, copilotLanguageLine: copilotLanguageLine, copilotStartup: copilotStartup
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = AgentHelpers;
