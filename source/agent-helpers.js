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

  // Build Codex's exact argument array (D11, D15). Returns { args, errors, notices }.
  //   launch: { conv: fresh|last|pick, model, customFlags, codexFlags, startup, language,
  //             skipLanguage, noDaemon, relaunch }
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
    return { args: args, errors: errors, notices: notices };
  }

  // ---- picker helpers --------------------------------------------------

  // The picker's conversation radios keep their v3.2.2 values; this maps them for Codex.
  function codexConv(radioValue) { return radioValue === "--continue" ? "last" : (radioValue === "--resume" ? "pick" : "fresh"); }
  function convRadio(codexConvValue) { return codexConvValue === "last" ? "--continue" : (codexConvValue === "pick" ? "--resume" : ""); }

  // Which agent the picker shows, and whether it shows the agent choice (D3, D6).
  //   profileAgent: the profile's agent field (missing = Claude); installed: { claude, codex }
  function resolveAgent(profileAgent, installed) {
    var agent = profileAgent === "codex" ? "codex" : "claude";
    var missing = !installed[agent];
    return { agent: agent, missing: missing, showChoice: (installed.claude && installed.codex) || missing };
  }

  // Store the agent the way D16 says: agent:"codex" only for Codex; choosing Claude removes it.
  // A profile never used with Codex keeps exactly the fields v3.2.2 wrote.
  function setProfileAgent(profile, agent) {
    if (agent === "codex") profile.agent = "codex";
    else if (profile.hasOwnProperty("agent")) delete profile.agent;
    return profile;
  }

  function codexFields(profile) {
    var c = profile.codex || {};
    return { model: c.model || "", conv: c.conv || "fresh", customFlags: c.customFlags || "", startupCmds: c.startupCmds || "" };
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
    newLaunchId: newLaunchId, previewLine: previewLine, contains: contains
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = AgentHelpers;
