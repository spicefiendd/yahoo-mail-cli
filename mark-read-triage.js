#!/usr/bin/env node
/**
 * mark-read-triage.js
 * Select all in All/Primary → deselect ACTIONABLE unread → Mark as read.
 * Leaves bills / patient-portal / upcoming payments unread.
 *
 * Preferred UI flow:
 *   Unread → select all → uncheck actionable → Mark as read
 * (scripts often land on All/Primary list; Unread filter is preferred when available.)
 *
 * DEFAULT DRY-RUN. Pass --live / dryRun:false to mark read.
 *
 * Usage:
 *   node mark-read-triage.js --tab all
 *   node mark-read-triage.js --tab all --live
 *
 * Prefer: require('./mark-read-triage').run(opts)
 */

// HARD GUARD: refuse every run (live or dry-run) before any browser/Yahoo access.
require('./lib/guard').refuse('mark-read-triage');

const path = require('path');
const fs = require('fs');
const { launchYahooBrowser, parseCliFlags, log, assertNotLoginWall } = require('./lib/browser');
const { URLS } = require('./lib/yahoo-urls');
const { selectors } = require('./lib/yahoo-selectors');
const { listVisibleMessages, selectedCount } = require('./lib/list-messages');
const { loadRules, shouldLeaveUnread } = require('./lib/keep-rules');

/**
 * @param {object} opts
 * @param {string} [opts.tab='all']
 * @param {boolean} [opts.dryRun=true]
 * @param {boolean} [opts.headless]
 * @param {string} [opts.profile]
 * @param {boolean} [opts.writeLog=true]
 */
async function run(opts = {}) {
  const tab = opts.tab || 'all';
  const dryRun = opts.dryRun !== false;
  const rules = loadRules(require('./lib/rules-path').keepRulesPath());
  const { page, close, userDataDir } = await launchYahooBrowser({
    dryRun,
    headless: opts.headless === true,
    userDataDir: opts.profile,
  });
  const sel = selectors(page);

  try {
    const url = tab === 'priority' || tab === 'primary' ? URLS.primary() : URLS.all();
    log('goto', url, 'dryRun', dryRun, 'profile', userDataDir);
    log(
      'preferred UI: Unread → select all → uncheck actionable → Mark as read (keep rules untouched)',
    );
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    await assertNotLoginWall(page);

    // Prefer Unread filter when present (UI preference)
    if (await sel.navUnread().count()) {
      await sel.navUnread().click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    const rows = await listVisibleMessages(page);
    const unread = rows.filter((r) => r.unread);
    const leave = [];
    const mark = [];
    for (const r of unread) {
      if (shouldLeaveUnread(r, rules)) leave.push(r);
      else mark.push(r);
    }

    const report = {
      tab,
      dryRun,
      unreadVisible: unread.length,
      leaveUnread: leave.map((r) => r.name.slice(0, 120)),
      leftUnread: leave.map((r) => ({
        sender: r.sender,
        subject: r.subject,
        name: r.name.slice(0, 120),
      })),
      markedRead: [],
      wouldMarkReadCount: mark.length,
      markSample: mark.slice(0, 30),
      errors: [],
    };

    if (opts.writeLog !== false) {
      const outPath = path.join(__dirname, 'dry-run-logs', `mark-read-${Date.now()}.json`);
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
      log('wrote', outPath);
    }

    log('unread', unread.length, 'leave', leave.length, 'mark-ish', mark.length);
    leave.forEach((l) => log('LEAVE UNREAD', l.name.slice(0, 120)));

    if (dryRun) {
      log('DRY-RUN complete. Pass --live to mark non-actionable as read.');
      return {
        ...report,
        summary: `mark-read-triage: dry-run — ${mark.length} would mark read, ${leave.length} left unread (actionable)`,
      };
    }

    if (!(await sel.selectAll().count())) {
      throw new Error('Select all checkbox not found');
    }
    await sel.selectAll().click();
    await page.waitForTimeout(500);

    for (const l of leave) {
      const needle = (l.sender || l.name).slice(0, 28);
      const hit = page.getByRole('checkbox', {
        name: new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      });
      if (await hit.count()) {
        const box = hit.first();
        if (await box.isChecked().catch(() => true)) {
          await box.click();
          log('deselected actionable', needle);
        }
      } else {
        log('TODO: checkbox not found for actionable', needle);
        report.errors.push(`checkbox not found: ${needle}`);
      }
    }

    const n = await selectedCount(page);
    log('marking read', n);
    await sel.markReadSelected().first().click();
    await page.waitForTimeout(1500);
    log('done');

    report.markedRead = [{ count: n }];
    return {
      ...report,
      markedReadCount: n,
      summary: `mark-read-triage: marked ~${n} read, ${leave.length} left unread`,
    };
  } finally {
    await close();
  }
}

async function main() {
  const flags = parseCliFlags();
  const tab = flags.tab || 'all';
  if (flags.help) {
    console.log(`Usage: node mark-read-triage.js [--tab all|priority] [--live]
Default dry-run.
Preferred UI: Unread → select all → uncheck actionable → Mark as read.`);
    process.exit(0);
  }

  const result = await run({
    tab,
    dryRun: flags.dryRun,
    headless: flags.headless,
    profile: flags.profile,
  });
  console.log(JSON.stringify(result, null, 2));
  console.error(result.summary);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { run };
