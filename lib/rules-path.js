/**
 * Resolve the local keep-rules file.
 * Order: $YAHOO_MAIL_KEEP_RULES → config/keep-rules.json (untracked, gitignored)
 *        → config/keep-rules.example.json (generic template).
 */
const fs = require('fs');
const path = require('path');

function keepRulesPath() {
  const root = path.join(__dirname, '..');
  const candidates = [
    process.env.YAHOO_MAIL_KEEP_RULES,
    path.join(root, 'config', 'keep-rules.json'),
    path.join(root, 'config', 'keep-rules.example.json'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || candidates[candidates.length - 1];
}

module.exports = { keepRulesPath };
