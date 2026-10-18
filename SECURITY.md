# Security

Footer Dock runs inside your Pi session with your user's permissions, reads Git repositories you open, reads Pi's session logs, and sends your provider credential (obtained from Pi) to a provider's usage service. Because of that, we take reports seriously.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub: **Security → Report a vulnerability** on <https://github.com/KKhosla7/pi-footer-dock/security/advisories/new>. Include what you saw, how to reproduce it, and the version (`/dock-debug` prints it without secrets).

You can expect an acknowledgement within a few days and a fix or a plan within two weeks. We will credit you in the changelog unless you prefer not to be named.

## What is in scope

- Running code from a repository's configuration (Git hooks, `core.fsmonitor`, textconv, external diff) by Footer Dock's Git reads.
- A credential, token or account identifier leaving the process to any address except the provider's fixed usage service, or appearing in a log, file, screen or message.
- Terminal escape sequences from repository content, model names, branch names, file names or provider data reaching the terminal.
- Reading or writing files outside Pi's folder and Footer Dock's cache.
- Footer Dock changing a repository or Pi's settings without an explicit action by you.

## What Footer Dock does about these

The design notes in `docs/` explain each guard and how it is tested; the short version is in the README's _Privacy and safety_ section.

## Supported versions

Only the latest release receives fixes while the project is below 1.0.
