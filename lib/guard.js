/**
 * Hard safety guard for known-buggy scripts.
 * Refuses every run (live AND --dry-run) before any browser launch or Yahoo access.
 * Exits 0 on purpose so schedulers do not retry.
 */
const REASONS = {
  'mark-read-triage':
    'mark-read-triage can mark bills and other actionable mail as read (deselect step is unreliable).',
  'trash-sender':
    'trash-sender uses search + select-all, which can catch and trash mail you need to keep.',
  'footer-unsub':
    'footer-unsub auto-fills and auto-submits forms on third-party unsubscribe pages.',
};

function refuse(name) {
  const reason = REASONS[name] || `${name} is disabled.`;
  const msg = [
    `REFUSED: ${name} is disabled by a hard safety guard (2026-10-18).`,
    `Reason: ${reason}`,
    'Use the row-by-row browser method instead (inspect and act on each message individually).',
    'No browser was launched and Yahoo was not touched.',
  ].join('\n');
  process.stdout.write(JSON.stringify({ ok: false, error: 'disabled_by_guard', command: name, message: reason }) + '\n');
  process.stderr.write(msg + '\n');
  process.exit(0);
}

module.exports = { refuse, REASONS };
