# Yahoo Mail scripts

Cheaper alternative to full LLM browserUse sessions for Yahoo Mail cleanup.

Follows browser-to-script order:

1. Gmail connector/MCP (always - never browser Gmail)
2. Official API if one exists (none for Yahoo here)
3. Stable HTTP / deep links (mail.yahoo.com/n/...)
4. Playwright CLI in this folder (default dry-run) -- primary entrypoint
5. browserUse - last resort (login, captcha, selector break)

## Primary CLI

Exact path: bin/yahoo-mail.js
Shebang wrapper: bin/yahoo-mail

Run help (no browser):

    node bin/yahoo-mail.js help
    node bin/yahoo-mail.js help

### Commands

- scan [--tab offers|newsletters|priority|all|social] [--limit N] [--json]
- trash-sender --sender NAME [--tab offers] [--live] [--json]
- mark-read-triage [--live] [--json]
- footer-unsub --sender NAME [--live] [--json]
- help

Defaults: dry-run unless --live. JSON on stdout by default.

### Examples

    node bin/yahoo-mail.js scan --tab offers --limit 50
    node bin/yahoo-mail.js trash-sender --sender "Example Marketer"
    node bin/yahoo-mail.js trash-sender --sender "Example Marketer" --live
    node bin/yahoo-mail.js mark-read-triage
    node bin/yahoo-mail.js mark-read-triage --live
    node bin/yahoo-mail.js footer-unsub --sender "Example Newsletter"

### Output

- stdout: one JSON object { ok, command, dryRun, result, summary }
- stderr: short human summary, e.g. scan: 42 visible in offers, 18 senders (12 clear marketing)
- Script logs go to stderr so JSON stays parseable
- Use --no-json to suppress JSON

### Auth / login

Reuses signed-in box Chrome profile via lib/browser.js (YAHOO_CHROME_PROFILE or auto-detect).

On login wall or missing profile, exits non-zero with:

    { "ok": false, "error": "login_expired" | "no_profile", "message": "..." }

1. Abort (no retry loop)
2. Hand the user the desktop to sign in (never paste passwords)
3. Re-run the CLI

## Underlying scripts

Each exports run(opts) => result for the CLI; still runnable as standalone:

- scan-marketing.js -- read-only sender scan/group
- bulk-delete-by-sender.js -- search then remove by sender
- bulk-delete-tab.js -- Offers/Newsletters tab-wide (not yet wired into CLI)
- footer-unsubscribe.js -- footer Unsubscribe only
- mark-read-triage.js -- FYI to read; actionable stays unread

Preferred mark-read UI: Unread then select all then uncheck actionable then Mark as read.

**Disabled (2026-10-18):** `trash-sender`, `mark-read-triage` and `footer-unsub` are hard-guarded and refuse every run (live and --dry-run) without launching a browser. Use the row-by-row browser method instead. See lib/guard.js.

## Config / lib

- config/keep-rules.json -- your local keep / actionable lists (untracked; copy from config/keep-rules.example.json, or set YAHOO_MAIL_KEEP_RULES)
- lib/yahoo-urls.js -- /n/inbox/offers deep links
- lib/yahoo-selectors.js -- role+name a11y selectors
- lib/browser.js -- Playwright + box Chrome profile + BrowserError
- lib/keep-rules.js -- classify / leave-unread engine
- lib/list-messages.js -- visible row scrape

## Still TODO

- Footer unsub iframe vs main frame
- Verify accountIds=00_1
- Replace fixed waits
- Re-capture selectors if UI drifts
- Wire bulk-delete-tab into CLI if needed

## Agent policy

Footer unsub only - never Yahoo one-click.
Never send mail without explicit ask. Mutations need --live.
config/keep-rules.json is account-specific and gitignored -- never commit it.
