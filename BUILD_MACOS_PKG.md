# Build macOS .pkg Installer

The macOS installer needs to be rebuilt on a Mac to include the updated `postinstall` script with the new features (folder picker, right-click menu, language config).

## Prerequisites

- macOS computer
- Xcode Command Line Tools installed
- Git repository cloned

## Build Steps

Run these commands on a Mac:

```bash
# 1. Navigate to the repository
cd /path/to/kivun-terminal

# 2. Copy required files to mac/scripts/
cp source/statusline.mjs mac/scripts/statusline.mjs
cp source/configure-statusline.js mac/scripts/configure-statusline.js
cp -R source/sounds mac/scripts/sounds

# 3. Make postinstall executable
chmod +x mac/scripts/postinstall

# 4. Build the .pkg
pkgbuild \
  --identifier com.noambrand.claudecode-launchpad \
  --version 2.4.0 \
  --scripts mac/scripts \
  --nopayload \
  ClaudeCode_Launchpad_CLI_Setup_mac.pkg

# 5. Verify the package was created
ls -lh ClaudeCode_Launchpad_CLI_Setup_mac.pkg

# Expected output: ~3-4 KB file
```

## Upload to GitHub Release

```bash
# Upload the new .pkg to v2.4.0 release (replaces old one)
gh release upload v2.4.0 \
  ClaudeCode_Launchpad_CLI_Setup_mac.pkg \
  --clobber
```

## What Changed in v2.4.0

The updated `mac/scripts/postinstall` now includes:

1. **Configuration file creation** (`~/Library/Application Support/ClaudeCode-Launchpad/config.txt`)
2. **Enhanced desktop shortcut** with folder picker dialog
3. **Finder Quick Action** for right-click context menu
4. **Native installer migration** (npm → `curl https://claude.ai/install.sh`)

## Testing the .pkg

After building:

```bash
# Install on your Mac
open ClaudeCode_Launchpad_CLI_Setup_mac.pkg

# Enter password when prompted

# Test the features:
# 1. Double-click desktop shortcut → folder picker should appear
# 2. Right-click any folder in Finder → Services → "Open with ClaudeCode Launchpad"
# 3. Check config file exists:
cat ~/Library/Application\ Support/ClaudeCode-Launchpad/config.txt

# 4. Test language config:
nano ~/Library/Application\ Support/ClaudeCode-Launchpad/config.txt
# Change RESPONSE_LANGUAGE=hebrew
# Launch via desktop shortcut → Claude should respond in Hebrew
```

## Troubleshooting

**pkgbuild: error: Cannot modify file permissions**
- Run with sudo: `sudo pkgbuild ...`

**postinstall script not executing**
- Check it's executable: `chmod +x mac/scripts/postinstall`
- Check it has Unix line endings: `dos2unix mac/scripts/postinstall` (if needed)

**Right-click menu doesn't appear**
- Log out and log back in
- Or run: `killall Finder && /System/Library/CoreServices/pbs -flush`

## Alternative: GitHub Actions (Future)

For automated builds, add this workflow to `.github/workflows/build-mac.yml`:

```yaml
name: Build macOS Installer

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Copy files
        run: |
          cp source/statusline.mjs mac/scripts/
          cp source/configure-statusline.js mac/scripts/
          cp -R source/sounds mac/scripts/sounds
          chmod +x mac/scripts/postinstall
      
      - name: Build pkg
        run: |
          pkgbuild \
            --identifier com.noambrand.claudecode-launchpad \
            --version ${GITHUB_REF#refs/tags/v} \
            --scripts mac/scripts \
            --nopayload \
            ClaudeCode_Launchpad_CLI_Setup_mac.pkg
      
      - name: Upload to release
        uses: softprops/action-gh-release@v1
        with:
          files: ClaudeCode_Launchpad_CLI_Setup_mac.pkg
```

This would automatically build and upload the .pkg when you push a version tag.
