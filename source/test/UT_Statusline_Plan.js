// The status bar's line 2 ends with the plan and Claude Code's version, and the Weekly part warns
// when a Claude Code trial ends before the weekly reset (Noam, 2026-11-26). Claude Code keeps the plan
// and the trial end in .claude.json; it stores no end date for a paid subscription, so none is shown.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./codex-fixture');

const RESET = Date.UTC(2099, 0, 6, 23, 5) / 1000;   // far ahead, so the dates never pass
const LIMITS = { five_hour: { used_percentage: 10, resets_at: RESET - 3600 }, seven_day: { used_percentage: 20, resets_at: RESET } };

// Line 2 of the bar, colors removed. opts.account: the oauthAccount object in .claude.json (none when
// absent); opts.configDir: put .claude.json under CLAUDE_CONFIG_DIR instead of the home folder.
function line2(name, input, opts) {
  opts = opts || {};
  const d = fx.makeEnv('slplan-' + name);
  const env = Object.assign({}, d.env, { TZ: 'UTC' });
  delete env.CLAUDE_CONFIG_DIR;
  if (opts.account) {
    const dir = opts.configDir ? path.join(d.root, 'cfg') : d.home;
    if (opts.configDir) env.CLAUDE_CONFIG_DIR = dir;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ numStartups: 3, oauthAccount: opts.account, projects: {} }));
  }
  const r = cp.spawnSync(process.execPath, [path.join(fx.SOURCE, 'statusline.mjs')],
    { input: JSON.stringify(input), env, encoding: 'utf8', windowsHide: true });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout.replace(/\x1b\[\d+m/g, '').split('\n')[1];
}
const MAX5 = { organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_5x', billingType: 'stripe_subscription', claudeCodeTrialEndsAt: null };

test('UT_StatuslinePlan_PlanAndVersion: line 2 ends with the plan and the version number', () => {
  const line = line2('max5', { version: '2.1.332', rate_limits: LIMITS }, { account: MAX5 });
  assert.match(line, /Weekly .*\|\s+Max 5x · v2\.1\.332$/);
});

test('UT_StatuslinePlan_OtherPlans: Max 20x, Pro, Team', () => {
  const plan = acct => line2('plans', { version: '2.1.332', rate_limits: LIMITS }, { account: acct }).split('|').pop().trim();
  assert.strictEqual(plan({ organizationType: 'claude_max', organizationRateLimitTier: 'default_claude_max_20x' }), 'Max 20x · v2.1.332');
  assert.strictEqual(plan({ organizationType: 'claude_pro', organizationRateLimitTier: 'default_claude_ai' }), 'Pro · v2.1.332');
  assert.strictEqual(plan({ organizationType: 'claude_team' }), 'Team · v2.1.332');
});

test('UT_StatuslinePlan_ConfigDir: with CLAUDE_CONFIG_DIR, the plan is read from there', () => {
  assert.match(line2('cfgdir', { version: '2.1.332', rate_limits: LIMITS }, { account: MAX5, configDir: true }), /Max 5x · v2\.1\.332$/);
});

test('UT_StatuslinePlan_NothingKnown: no account shows only the version; no version either adds nothing', () => {
  assert.match(line2('noacct', { version: '2.1.332', rate_limits: LIMITS }), /Weekly .*\|\s+v2\.1\.332$/);
  const bare = line2('bare', { rate_limits: LIMITS });
  assert.match(bare, /Weekly .* 20% resets in [^|]*$/, bare);
});

test('UT_StatuslinePlan_TrialBeforeReset: a trial that ends before the weekly reset is shown on the Weekly part', () => {
  const ends = new Date((RESET - 2 * 86400) * 1000).toISOString();   // Sun Jan 4 23:05 UTC
  const line = line2('trial', { version: '2.1.332', rate_limits: LIMITS }, { account: Object.assign({}, MAX5, { claudeCodeTrialEndsAt: ends }) });
  assert.match(line, /Weekly .* resets in [^|]*trial ends Sun Jan 4 23:05/);
});

test('UT_StatuslinePlan_TrialAfterResetOrPast: a trial ending after the reset, or already over, adds no note', () => {
  const after = new Date((RESET + 86400) * 1000).toISOString();
  assert.ok(!/trial/.test(line2('trial-after', { rate_limits: LIMITS }, { account: Object.assign({}, MAX5, { claudeCodeTrialEndsAt: after }) })));
  assert.ok(!/trial/.test(line2('trial-past', { rate_limits: LIMITS }, { account: Object.assign({}, MAX5, { claudeCodeTrialEndsAt: '2020-01-01T00:00:00Z' }) })));
});

// The token count covers the main conversation only: what helper agents use is not in it (Noam,
// 2026-11-26), so it is labeled "main tokens", not "total tokens".
test('UT_StatuslinePlan_MainTokens: line 1 labels the count "main tokens"', () => {
  const d = fx.makeEnv('slplan-tokens');
  const r = cp.spawnSync(process.execPath, [path.join(fx.SOURCE, 'statusline.mjs')], { input: JSON.stringify({ context_window: { total_input_tokens: 200000, total_output_tokens: 84000 } }), env: Object.assign({}, d.env, { TZ: 'UTC' }), encoding: 'utf8', windowsHide: true });
  const line1 = r.stdout.replace(/\x1b\[\d+m/g, '').split('\n')[0];
  assert.match(line1, /main tokens:284K/);
  assert.ok(!/total tokens/.test(line1), line1);
});
