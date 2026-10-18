# Notes

Reverse-engineered from Yahoo Mail browser automation into Playwright CLI.

UI: https://mail.yahoo.com/n/inbox/{priority|offers|newsletters|social|all}
Search: /n/search/keyword=...

Defaults: dry-run; footer unsubscribe only (not Yahoo one-click); leave actionable unread.
Put account-specific keep lists in config/keep-rules.json locally (gitignored) — use keep-rules.example.json as template.
