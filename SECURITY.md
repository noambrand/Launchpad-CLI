# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| 1.0.x   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in ClaudeCode Launchpad CLI, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities.
2. Email **launchpad@excel-armor.com** with:
   - A description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You can expect an initial response within 72 hours.
4. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Scope

The following are in scope for security reports:

- The NSIS installer (`ClaudeCode_Launchpad_CLI_Setup.nsi`) and its scripts
- The macOS postinstall script (`mac/scripts/postinstall`)
- Launcher batch files and VBScript helpers in `source/`
- Registry and environment variable modifications
- GitHub Actions workflows

The following are **out of scope** (report to their respective maintainers):

- Claude Code itself (report to [Anthropic](https://anthropic.com))
- Node.js, Git, Windows Terminal, or Homebrew vulnerabilities
