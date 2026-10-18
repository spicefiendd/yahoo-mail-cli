#!/usr/bin/env node
/**
 * bulk-delete-by-sender.js
 * Search by sender/keyword → Select all → Delete.
 * DEFAULT IS DRY-RUN (logs actions only). Pass --live / dryRun:false to actually delete.
 *
 * Usage:
 *   node bulk-delete-by-sender.js --sender "Example Restaurant"           # dry-run
 *   node bulk-delete-by-sender.js --sender "Example Marketer" --live
 *   node bulk-delete-by-sender.js --sender "Example Cable Co" --tab offers --live
 *
 * SAFETY: refuses senders matching alwaysKeep / keepUntil (still active).
 * Does NOT send email. Does NOT unsubscribe (use footer-unsubscribe.js).
 *
 * Prefer: require('./bulk-delete-by-sender').run(opts)
 */

// HARD GUARD: refuse every run (live or dry-run) before any browser/Yahoo access.
require('./lib/guard').refuse('trash-sender');

const path = require('path');
const fs = require('fs');
const { launchYahooBrowser, parseCliFlags, log, assertNotLoginWall } = require('./lib/browser');
const { URLS } = require('./lib/yahoo-urls');
const { selectors } = require('./lib/yahoo-selectors');
const { listVisibleMessages, selectedCount } = require('./lib/list-messages');
const { loadRules, classifyForDelete } = require('./lib/keep-rules');

/**
 * @param {object} opts
 * @param {string} opts.sender
 * @param {string} [opts.tab]
 * @param {boolean} [opts.dryRun=true]
 * @param {boolean} [opts.headless]
 * @param {string} [opts.profile]
 * @param {boolean} [opts.writeLog=true]
 */
async function run(opts = {}) {
  if (!opts.sender) {
    throw new Error('sender is required');
  }

  const rules = loadRules(require('./lib/rules-path').keepRulesPath());
  const verdict = classifyForDelete({ sender: opts.sender, subject: '' }, rules);
  if (verdict === 'keep') {
    const err = new Error(`REFUSING: "${opts.sender}" classified as KEEP by rules.`);
    err.code = 'refused_keep';
    throw err;
  }
  const dryRun = opts.dryRun !== false;
  if (verdict === 'borderline' && !dryRun) {
    const err = new Error(
      `REFUSING --live on borderline sender "${opts.sender}". Re-run dry-run or add to clearMarketing.`,
    );
    err.code = 'refused_borderline';
    throw err;
  }

  const { page, close, userDataDir } = await launchYahooBrowser({
    dryRun,
    headless: opts.headless === true,
    userDataDir: opts.profile,
  });
  const sel = selectors(page);

  try {
    log('profile', userDataDir, 'dryRun', dryRun, 'sender', opts.sender);
    const searchUrl = URLS.search(opts.sender, {
      listFilter: opts.tab === 'offers' ? 'OFFERS' : undefined,
    });
    log('goto', searchUrl);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    await assertNotLoginWall(page);

    const rows = await listVisibleMessages(page);
    log('visible matches', rows.length);
    rows.slice(0, 15).forEach((r, i) => log(`  [${i}]`, r.unread ? 'U' : ' ', r.name.slice(0, 100)));

    const base = {
      sender: opts.sender,
      tab: opts.tab || null,
      dryRun,
      visible: rows.length,
      sample: rows.slice(0, 20),
      class: verdict,
      trashed: 0,
      errors: [],
    };

    if (dryRun) {
      log('DRY-RUN: would select-all and delete. Re-run with --live to execute.');
      if (opts.writeLog !== false) {
        const outPath = path.join(__dirname, 'dry-run-logs', `delete-sender-${Date.now()}.json`);
        fs.writeFileSync(outPath, JSON.stringify(base, null, 2));
        log('wrote', outPath);
      }
      return {
        ...base,
        summary: `trash-sender: dry-run — would trash ~${rows.length} visible for "${opts.sender}"`,
      };
    }

    // LIVE path
    if (await sel.selectAll().count()) {
      await sel.selectAll().click();
    } else {
      log('TODO: Select all checkbox not found — trying Ctrl+A');
      await page.keyboard.press('Control+a');
    }
    await page.waitForTimeout(800);
    let n = await selectedCount(page);
    log('selected', n);

    const selectAllMatch = page.getByText(/Select all (conversations|messages).*(match|search|folder)/i);
    if (await selectAllMatch.count()) {
      log('clicking expand-selection link');
      await selectAllMatch.first().click();
      await page.waitForTimeout(500);
      n = (await selectedCount(page)) || n;
    }

    await sel.deleteSelected().first().click();
    await page.waitForTimeout(1500);
    log('deleted (approx selected count was)', n);

    return {
      ...base,
      trashed: n,
      summary: `trash-sender: trashed ~${n} for "${opts.sender}"`,
    };
  } finally {
    await close();
  }
}

async function main() {
  const flags = parseCliFlags();
  if (flags.help || !flags.sender) {
    console.log(`Usage: node bulk-delete-by-sender.js --sender "Name" [--tab offers] [--live] [--headless]
Default: dry-run (no delete).`);
    process.exit(flags.sender ? 0 : 1);
  }

  try {
    const result = await run({
      sender: flags.sender,
      tab: flags.tab,
      dryRun: flags.dryRun,
      headless: flags.headless,
      profile: flags.profile,
    });
    console.log(JSON.stringify(result, null, 2));
    console.error(result.summary);
  } catch (e) {
    if (e.code === 'refused_keep' || e.code === 'refused_borderline') {
      console.error(e.message);
      process.exit(2);
    }
    throw e;
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { run };
