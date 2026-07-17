# Releasing ClaudeCode Launchpad CLI

## Standard Release Assets

Every release **must** include all three assets:

| Asset | Platform | Source |
|---|---|---|
| `ClaudeCode_Launchpad_CLI_Setup.exe` | Windows | Built by NSIS from `ClaudeCode_Launchpad_CLI_Setup.nsi` |
| `ClaudeCode_Launchpad_CLI_Setup_mac.pkg` | macOS | Built by `pkgbuild` from `mac/scripts/` |
| `kivun_terminal_Hebrew_2_0_2.mp4` | Both | Demo video (static, checked into repo) |

## How to Release

### Automated (recommended)

1. Tag the commit: `git tag v2.X.Y && git push origin v2.X.Y`
2. The `release.yml` workflow automatically:
   - Builds the Windows `.exe` (NSIS on Windows runner)
   - Builds the macOS `.pkg` (pkgbuild on macOS runner)
   - Copies the demo video from the repo
   - **Validates all 3 assets exist** (fails the workflow if any are missing)
   - Creates the GitHub release with all assets attached (the `.exe` is **unsigned** here)
3. **Sign the Windows installer** (required): open **SimplySign Desktop** and log in (6-digit
   code from your phone), then **double-click `sign-and-release.cmd`** in the repo root. It
   downloads the built `.exe`, signs it with the Certum "Code Signing Individual in Cloud"
   certificate, verifies it, and re-uploads the **signed** copy to the release. Full flow:
   `../Certification/SIGNING_GUIDE.md`. (Signing can only be done on Noam's PC — the cloud
   cert's key can't be exported to CI.)
4. Edit the release notes on GitHub if needed.

### Manual (fallback)

If the workflow fails or you need to release manually:

```bash
# 1. Build Windows exe locally
makensis ClaudeCode_Launchpad_CLI_Setup.nsi

# 2. Create the release with ALL assets
gh release create v2.X.Y \
  ClaudeCode_Launchpad_CLI_Setup.exe \
  ClaudeCode_Launchpad_CLI_Setup_mac.pkg \
  kivun_terminal_Hebrew_2_0_2.mp4 \
  --title "ClaudeCode Launchpad CLI v2.X.Y" \
  --generate-notes --latest
```

## Verification

After any release, verify all assets are present:

```bash
gh release view v2.X.Y --json assets --jq '.assets[].name'
```

Expected output:
```
ClaudeCode_Launchpad_CLI_Setup.exe
ClaudeCode_Launchpad_CLI_Setup_mac.pkg
kivun_terminal_Hebrew_2_0_2.mp4
```

## CI Workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `release.yml` | Tag push `v*` | Full release: build all platforms + upload assets |
| `build-mac.yml` | Manual only | Test macOS build without releasing |
| `build-and-test-mac.yml` | Push to `mac/**` | CI test for macOS installer changes |
| `test-mac.yml` | Push to `mac/**` | Dry-run macOS postinstall script |
