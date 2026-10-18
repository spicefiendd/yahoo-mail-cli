/**
 * Launch helpers for Yahoo Mail automation.
 *
 * Auth model:
 * - Preferred: reuse a box Chrome user-data-dir that already has Yahoo logged in.
 *   Observed profiles with mail.yahoo.com IndexedDB:
 *     /home/box/chrome-profile
 *     /home/box/chrome-profile-2  (also has login.yahoo.com)
 * - Fallback: run these scripts as a *thin driver* under browserUse (agent already
 *   signed in on the desktop browser) — see README "browserUse thin driver".
 *
 * NEVER enter passwords from scripts. If login wall appears, abort.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const CANDIDATE_PROFILES = [
  process.env.YAHOO_CHROME_PROFILE,
  '/home/box/chrome-profile-2',
  '/home/box/chrome-profile',
  '/home/box/chrome-profile-7',
  '/home/box/chrome-profile-3',
  '/home/box/chrome-profile-4',
  '/home/box/chrome-profile-6',
].filter(Boolean);

class BrowserError extends Error {
  /**
   * @param {'no_profile'|'login_expired'|'browser'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'BrowserError';
    this.code = code;
  }
}

function resolveUserDataDir() {
  for (const p of CANDIDATE_PROFILES) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * @param {object} opts
 * @param {boolean} [opts.headless=false]  Yahoo often breaks when headless
 * @param {boolean} [opts.dryRun=true]     Soft flag passed through to callers
 * @param {string}  [opts.userDataDir]
 */
async function launchYahooBrowser(opts = {}) {
  const dryRun = opts.dryRun !== false; // default SAFE
  const headless = opts.headless === true;
  const userDataDir = opts.userDataDir || resolveUserDataDir();

  if (!userDataDir) {
    throw new BrowserError(
      'no_profile',
      'No Chrome user-data-dir found. Set YAHOO_CHROME_PROFILE or sign in via desktop, then re-run. Never paste passwords into scripts.',
    );
  }

  // launchPersistentContext keeps cookies/localStorage from prior Yahoo login.
  // NOTE: profile must not already be locked by a running Chrome — TODO: detect lock.
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless,
      channel: process.env.YAHOO_CHROME_CHANNEL || undefined, // e.g. 'chrome'
      args: ['--disable-blink-features=AutomationControlled'],
      viewport: { width: 1400, height: 900 },
      ignoreDefaultArgs: ['--enable-automation'],
    });
  } catch (e) {
    throw new BrowserError(
      'browser',
      `Failed to launch Chrome with profile ${userDataDir}: ${e.message}`,
    );
  }

  const page = context.pages()[0] || (await context.newPage());

  return {
    context,
    page,
    dryRun,
    userDataDir,
    async close() {
      await context.close();
    },
  };
}

/**
 * Detect Yahoo / AOL sign-in wall. Call after navigation.
 * Throws BrowserError('login_expired') — never attempts to fill credentials.
 */
async function assertNotLoginWall(page) {
  const url = (page.url() || '').toLowerCase();
  if (
    /login\.yahoo\.com|login\.aol\.com|guce\.yahoo|consent\.yahoo/.test(url) ||
    (/yahoo\.com\/.*(login|auth)/.test(url) && !/mail\.yahoo\.com\/n\//.test(url))
  ) {
    throw new BrowserError(
      'login_expired',
      'Yahoo sign-in wall detected. Hand the user the desktop to sign in (never paste passwords), then re-run.',
    );
  }

  // Visible login chrome on page
  const signIn = page.getByRole('heading', { name: /sign in/i }).or(
    page.getByRole('button', { name: /^Sign in$/i }),
  );
  const password = page.locator('input[type="password"]');
  const onMail = /mail\.yahoo\.com\/n\//.test(url);
  if (!onMail && ((await signIn.count().catch(() => 0)) > 0 || (await password.count().catch(() => 0)) > 0)) {
    throw new BrowserError(
      'login_expired',
      'Yahoo sign-in wall detected. Hand the user the desktop to sign in (never paste passwords), then re-run.',
    );
  }
}

function parseCliFlags(argv = process.argv.slice(2)) {
  const flags = {
    dryRun: !argv.includes('--live'),
    headless: argv.includes('--headless'),
    json: argv.includes('--json') || !argv.includes('--no-json'),
    tab: null,
    sender: null,
    limit: null,
    help: argv.includes('--help') || argv.includes('-h'),
    live: argv.includes('--live'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tab') flags.tab = argv[++i];
    else if (a === '--sender') flags.sender = argv[++i];
    else if (a === '--limit') flags.limit = Number(argv[++i]);
    else if (a === '--profile') flags.profile = argv[++i];
  }
  if (flags.live) flags.dryRun = false;
  return flags;
}

function log(...args) {
  const ts = new Date().toISOString();
  console.error(`[yahoo-mail ${ts}]`, ...args);
}

module.exports = {
  launchYahooBrowser,
  resolveUserDataDir,
  parseCliFlags,
  log,
  assertNotLoginWall,
  BrowserError,
  CANDIDATE_PROFILES,
};
