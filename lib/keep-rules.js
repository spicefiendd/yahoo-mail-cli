/**
 * KEEP / ACTIONABLE rule engine.
 *
 * Generic matching lives here. Account-specific sender lists belong in
 * config/keep-rules.json (untracked local config), NOT in the reusable skill body.
 */

const fs = require('fs');

function loadRules(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return normalize(raw);
}

function normalize(raw) {
  return {
    alwaysKeep: (raw.alwaysKeep || []).map(normalizeEntry),
    /** { match, until: 'YYYY-MM-DD', afterTreatAs: 'marketing'|'keep' } */
    keepUntil: (raw.keepUntil || []).map((e) => ({
      ...normalizeEntry(e),
      until: e.until,
      afterTreatAs: e.afterTreatAs || 'marketing',
    })),
    actionableUnread: (raw.actionableUnread || []).map(normalizeEntry),
    clearMarketing: (raw.clearMarketing || []).map(normalizeEntry),
    /** Subject/body hints that mean "leave unread" even for known senders */
    actionableSubjectHints: raw.actionableSubjectHints || [
      'bill ready',
      'payment due',
      'upcoming payment',
      'action required',
      'past due',
      'appointment',
      'patient portal',
      'sign',
      'verify',
      'confirm your',
    ],
    /** Subject hints that are FYI → mark read OK */
    fyiSubjectHints: raw.fyiSubjectHints || [
      'estatements notification',
      'notice available',
      'security alert',
      'deposit received',
      'paperless',
      'newsletter',
    ],
    meta: raw.meta || {},
  };
}

function normalizeEntry(e) {
  if (typeof e === 'string') return { match: e, type: 'substring' };
  return {
    match: e.match,
    type: e.type || 'substring', // substring | regex | exact
    note: e.note || '',
  };
}

function matches(entry, text) {
  if (!text) return false;
  const t = String(text);
  if (entry.type === 'exact') return t.toLowerCase() === entry.match.toLowerCase();
  if (entry.type === 'regex') return new RegExp(entry.match, 'i').test(t);
  return t.toLowerCase().includes(String(entry.match).toLowerCase());
}

function matchesAny(entries, text) {
  return entries.find((e) => matches(e, text)) || null;
}

/**
 * Classify a message row { sender, subject } for delete vs keep.
 * @returns {'keep'|'marketing'|'borderline'}
 */
function classifyForDelete(msg, rules, now = new Date()) {
  const blob = `${msg.sender || ''} ${msg.subject || ''}`;

  if (matchesAny(rules.alwaysKeep, blob)) return 'keep';

  for (const e of rules.keepUntil) {
    if (matches(e, blob)) {
      const until = new Date(e.until + 'T23:59:59');
      if (now <= until) return 'keep';
      return e.afterTreatAs === 'marketing' ? 'marketing' : 'keep';
    }
  }

  if (matchesAny(rules.clearMarketing, blob)) return 'marketing';

  // Transactional / actionable → never auto-delete
  if (matchesAny(rules.actionableUnread, blob)) return 'keep';
  if (rules.actionableSubjectHints.some((h) => blob.toLowerCase().includes(h.toLowerCase()))) {
    return 'keep';
  }

  return 'borderline'; // ask human / skip in automated delete
}

/**
 * For mark-read triage: should this unread stay unread?
 */
function shouldLeaveUnread(msg, rules) {
  const blob = `${msg.sender || ''} ${msg.subject || ''}`;
  if (matchesAny(rules.actionableUnread, blob)) return true;
  if (rules.actionableSubjectHints.some((h) => blob.toLowerCase().includes(h.toLowerCase()))) {
    return true;
  }
  // alwaysKeep senders still may be FYI — use subject hints
  if (matchesAny(rules.alwaysKeep, blob)) {
    const fyi = rules.fyiSubjectHints.some((h) => blob.toLowerCase().includes(h.toLowerCase()));
    return !fyi; // keep unread unless clearly FYI
  }
  return false;
}

module.exports = {
  loadRules,
  normalize,
  classifyForDelete,
  shouldLeaveUnread,
  matchesAny,
};
