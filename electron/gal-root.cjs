/* AI START */
'use strict';

const path = require('path');

/** Map an app:// pathname onto a file inside root. Rejects traversal. */
function resolveAppFile(root, requestPath) {
  if (typeof requestPath !== 'string' || requestPath.length === 0) return null;
  let decoded;
  try { decoded = decodeURIComponent(requestPath.split('?')[0].split('#')[0]); }
  catch { return null; }
  if (decoded.includes('\0')) return null;
  const rel = decoded.replace(/^[/\\]+/, '');
  const base = path.resolve(root);
  const file = path.resolve(base, rel.length === 0 ? 'index.html' : rel);
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  return file;
}

module.exports = { resolveAppFile };
/* AI END */
