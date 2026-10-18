#!/usr/bin/env node
/**
 * yahoo-mail — unified CLI for Yahoo Mail Playwright cleanup scripts.
 *
 * Dry-run by default. Pass --live for mutations.
 * Never pastes passwords. Login wall / missing profile → JSON error + non-zero exit.
 *
 * Usage:
 *   yahoo-mail scan [--tab offers|newsletters|priority|all|social] [--limit N] [--json]
 *   yahoo-mail trash-sender --sender "Name" [--tab offers] [--live] [--json]
 *   yahoo-mail mark-read-triage [--live] [--json]
 *   yahoo-mail footer-unsub --sender "Name" [--live] [--json]
 *   yahoo-mail help
 *
 * Also: node bin/yahoo-mail.js <command>
 */

const path = require('path');

const ROOT = path.join(__dirname, '..');

const HELP = `
yahoo-mail — Yahoo Mail cleanup CLI (Playwright; dry-run by default)

Commands:
  scan [--tab offers|newsletters|priority|all|social] [--limit N] [--json]
      Read-only sender scan/group. Never deletes.

  trash-sender --sender "Name" [--tab offers] [--live] [--json]
      Search by sender → select all → delete. Dry-run unless --live.
      Refuses alwaysKeep / active keepUntil senders.

  mark-read-triage [--live] [--json]
      Preferred UI: Unread → select all → uncheck actionable → Mark as read.
      Leaves bills / patient-portal / payments unread (config/keep-rules.json).

  footer-unsub --sender "Name" [--live] [--json]
      Open message → footer Unsubscribe <a> only (never Yahoo one-click).
      Dry-run lists candidates; --live clicks best brand link.
      Never sends mail; never enters passwords; skips CAPTCHA.

  help
      Show this message (no browser).

Global flags:
  --live          Perform mutations (default is dry-run)
  --json          Print one JSON object to stdout (default on)
  --no-json       Suppress JSON (human summary still printed)
  --headless      Launch Chrome headless (Yahoo may break)
  --profile DIR   Chrome user-data-dir (else auto-detect box profiles)
  --help, -h      Command help

Auth:
  Reuses signed-in box Chrome profile via lib/browser.js.
  On login wall / missing profile exits non-zero with:
    { "ok": false, "error": "login_expired"|"no_profile", "message": "..." }
  Hand the user the desktop to sign in — never paste passwords.

Examples:
  node bin/yahoo-mail.js help
  node bin/yahoo-mail.js scan --tab offers --limit 50
  node bin/yahoo-mail.js trash-sender --sender "Example Marketer"
  node bin/yahoo-mail.js trash-sender --sender "Example Marketer" --live
  node bin/yahoo-mail.js mark-read-triage
  node bin/yahoo-mail.js footer-unsub --sender "Example Newsletter"

Preference order (browser-to-script):
  1) Gmail connector/MCP  2) official API  3) deep links
  4) this CLI / Playwright scripts  5) browserUse last resort
`.trim();

function parseArgs(argv) {
  const args = argv.slice();
  const out = {
    command: null,
    dryRun: !args.includes('--live'),
    live: args.includes('--live'),
    json: !args.includes('--no-json'),
    headless: args.includes('--headless'),
    help: args.includes('--help') || args.includes('-h'),
    tab: null,
    sender: null,
    limit: null,
    profile: null,
  };

  // First non-flag token is the command
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--tab') out.tab = args[++i];
    else if (a === '--sender') out.sender = args[++i];
    else if (a === '--limit') out.limit = Number(args[++i]);
    else if (a === '--profile') out.profile = args[++i];
    else if (a.startsWith('-')) continue;
    else positionals.push(a);
  }
  out.command = positionals[0] || null;
  if (out.live) out.dryRun = false;
  return out;
}

function emit(payload, { json = true } = {}) {
  const summary = payload.summary || payload.message || '';
  if (json) {
    // ONE JSON object to stdout
    process.stdout.write(JSON.stringify(payload) + '\n');
  }
  if (summary) {
    process.stderr.write(summary + '\n');
  }
}

function fail(errorCode, message, extra = {}) {
  emit(
    {
      ok: false,
      error: errorCode,
      message,
      ...extra,
    },
    { json: true },
  );
  process.exit(1);
}

async function dispatch(opts) {
  // HARD GUARD: these commands are disabled (live and dry-run) before any browser launch.
  if (['trash-sender', 'mark-read-triage', 'footer-unsub'].includes(opts.command)) {
    require(path.join(ROOT, 'lib', 'guard.js')).refuse(opts.command);
  }
  const common = {
    tab: opts.tab,
    sender: opts.sender,
    limit: opts.limit,
    dryRun: opts.dryRun,
    headless: opts.headless,
    profile: opts.profile,
  };

  switch (opts.command) {
    case 'help':
    case null:
      console.log(HELP);
      return { ok: true, command: 'help', dryRun: true, result: {}, summary: 'help' };

    case 'scan': {
      if (opts.help) {
        console.error(`Usage: yahoo-mail scan [--tab offers|newsletters|priority|all|social] [--limit N] [--json]
READ-ONLY. Groups visible messages by sender.`);
        return { ok: true, command: 'scan', dryRun: true, result: {}, summary: 'scan help' };
      }
      const { run } = require(path.join(ROOT, 'scan-marketing.js'));
      const result = await run(common);
      return {
        ok: true,
        command: 'scan',
        dryRun: true,
        result,
        summary: result.summary,
      };
    }

    case 'trash-sender': {
      if (opts.help || !opts.sender) {
        console.error(`Usage: yahoo-mail trash-sender --sender "Name" [--tab offers] [--live] [--json]
Default dry-run. Refuses KEEP / borderline (live) senders.`);
        if (!opts.sender && !opts.help) {
          fail('usage', 'trash-sender requires --sender "Name"');
        }
        return { ok: true, command: 'trash-sender', dryRun: opts.dryRun, result: {}, summary: 'trash-sender help' };
      }
      const { run } = require(path.join(ROOT, 'bulk-delete-by-sender.js'));
      const result = await run(common);
      return {
        ok: true,
        command: 'trash-sender',
        dryRun: opts.dryRun,
        result,
        summary: result.summary,
      };
    }

    case 'mark-read-triage': {
      if (opts.help) {
        console.error(`Usage: yahoo-mail mark-read-triage [--live] [--json]
Preferred UI: Unread → select all → uncheck actionable → Mark as read.
Uses config/keep-rules.json (local, untracked).`);
        return { ok: true, command: 'mark-read-triage', dryRun: opts.dryRun, result: {}, summary: 'mark-read-triage help' };
      }
      const { run } = require(path.join(ROOT, 'mark-read-triage.js'));
      const result = await run(common);
      return {
        ok: true,
        command: 'mark-read-triage',
        dryRun: opts.dryRun,
        result: {
          ...result,
          markedRead: result.markedRead || result.markedReadCount,
          leftUnread: result.leftUnread || result.leaveUnread,
        },
        summary: result.summary,
      };
    }

    case 'footer-unsub': {
      if (opts.help || !opts.sender) {
        console.error(`Usage: yahoo-mail footer-unsub --sender "Name" [--live] [--json]
Footer Unsubscribe only — never Yahoo one-click. Never send mail / passwords.`);
        if (!opts.sender && !opts.help) {
          fail('usage', 'footer-unsub requires --sender "Name"');
        }
        return { ok: true, command: 'footer-unsub', dryRun: opts.dryRun, result: {}, summary: 'footer-unsub help' };
      }
      const { run } = require(path.join(ROOT, 'footer-unsubscribe.js'));
      const result = await run(common);
      return {
        ok: true,
        command: 'footer-unsub',
        dryRun: opts.dryRun,
        result,
        summary: result.summary,
      };
    }

    default:
      fail('usage', `Unknown command: ${opts.command}. Run: yahoo-mail help`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  // help without launching browser — including bare --help
  if (opts.command === 'help' || opts.command === null || (opts.help && !opts.command)) {
    if (opts.command && opts.command !== 'help' && opts.help) {
      // per-command help handled in dispatch
    } else {
      console.log(HELP);
      process.exit(0);
    }
  }

  try {
    const payload = await dispatch(opts);
    if (!payload) return;
    // For help-only paths that already printed Usage, still emit compact JSON if requested
    if (payload.summary && String(payload.summary).endsWith(' help')) {
      if (opts.json) {
        process.stdout.write(
          JSON.stringify({
            ok: true,
            command: payload.command,
            dryRun: payload.dryRun,
            result: {},
            summary: payload.summary,
          }) + '\n',
        );
      }
      return;
    }
    emit(
      {
        ok: payload.ok !== false,
        command: payload.command,
        dryRun: payload.dryRun,
        result: payload.result,
        summary: payload.summary,
      },
      { json: opts.json },
    );
  } catch (e) {
    const { BrowserError } = require(path.join(ROOT, 'lib', 'browser.js'));
    if (e && e.name === 'BrowserError') {
      fail(e.code, e.message, { command: opts.command, dryRun: opts.dryRun });
    }
    if (e && (e.code === 'refused_keep' || e.code === 'refused_borderline')) {
      fail(e.code, e.message, { command: opts.command, dryRun: opts.dryRun });
    }
    fail('error', e && e.message ? e.message : String(e), {
      command: opts.command,
      dryRun: opts.dryRun,
    });
  }
}

const isDirect = require.main === module || (require.main && /yahoo-mail(\.js)?$/.test(require.main.filename));
if (isDirect) {
  main();
}

module.exports = { parseArgs, dispatch, HELP };
