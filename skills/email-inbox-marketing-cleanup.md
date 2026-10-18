---
name: Email inbox marketing cleanup
description: >-
  Use when cleaning marketing/promotional email: prefer connector/API over
  browser, batch by sender, footer-unsubscribe, mark non-actionable read, leave
  actionable unread.
---
# Email inbox marketing cleanup

Prefer the cheapest reliable path. Do not burn a long LLM browser session when a connector or a fixed script exists.

## Order of operations

1. **Gmail / any provider with a connector** — use the connector (search by sender, trash threads, label/unlabel). **Never** drive Gmail in the browser for cleanup.
2. **Yahoo or other no-connector inboxes** — use Playwright (or similar) scripts with deep links, role+name selectors, and dry-run by default. Keep LLM `browserUse` for login walls, captcha, or selector breakage only (thin driver).
3. If scripts are missing, reverse-engineer one thin browser pass into scripts before repeating the expensive flow.

## Workflow

1. **Scan first (read-only)** — open marketing surfaces (Yahoo: Offers + Newsletters + spot-check Primary/All); group by sender; classify clear marketing / keep / borderline.
2. **Batch delete by sender** — search-by-sender → select all matching → delete; or select-all on a tab → deselect KEEP → delete. Skip borderline until the user confirms.
3. **Footer unsubscribe (top repeat offenders)** — open one message; click the **brand footer** Unsubscribe / manage-preferences link; complete simple confirms; skip CAPTCHA, login walls, and `mailto:` unsub links. Do **not** use the mail client's one-click unsubscribe when the user has rejected it or a real footer link exists.
4. **Mark-read triage** — select all → deselect actionable → mark rest read. Prefer mark-read over delete for leftover FYI.

## KEEP / actionable heuristics (generic)

User-specific senders belong in **agent memory / keep-rules config**, not this skill.

- **Always keep:** insurers/agents the user named, banks, credit unions, utilities, medical portals, security alerts, investment alerts, transactional receipts.
- **Time-boxed keep:** providers the user is still switching away from — keep until a user-stated date, then treat as marketing.
- **Leave unread:** bills/payments due, appointments, documents to sign, medical messages, clear deadlines.
- **Mark read OK:** FYI statements-available, non-urgent security copies, deposit alerts, newsletters, pure confirmations.
- **Split senders:** same brand may be transactional *and* marketing — filter by subject keywords.

## Ask before

- Borderline financial/insurance/tax solicitations
- Anything that might be a bill, claim, or legal notice
- Mass-delete when KEEP items share the tab and cannot be deselected confidently
- Emptying Trash
- Sending any email

## Yahoo script map (when present)

Scripts under `yahoo-mail-scripts/` (default dry-run; pass `--live` only after review):

- `scan-marketing.js` — read-only sender grouping
- `bulk-delete-by-sender.js` / `bulk-delete-tab.js` — deletes
- `footer-unsubscribe.js` — brand footer unsub only
- `mark-read-triage.js` — FYI → read; actionable stays unread
- Helpers: `lib/yahoo-urls.js`, `lib/yahoo-selectors.js`, `config/keep-rules.json` (local, untracked)
- **Disabled:** `bulk-delete-by-sender.js` (trash-sender), `mark-read-triage.js`, `footer-unsubscribe.js` are hard-guarded (lib/guard.js); use the row-by-row browser method instead.

Abort on login walls; never paste passwords. Account-specific keep lists stay in config/memory.

## Report back

- Approx deleted / unsubscribed / marked read
- Actionable unread left for the user (sender, subject, why)
- Anything skipped as borderline
- Confirmation named keep entities were untouched
- Script failures that need a short browserUse repair pass
