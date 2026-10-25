// ── Job description → blocks ─────────────────────────────────────────────────
// Scraped descriptions arrive as plain text whose only structure is its line
// breaks and its bullets. Rendering that as one string throws both away and
// gives the wall of text. These are the headings airlines actually use; a line
// that is one of them becomes a heading, "-", "*", "·" and "•" start a list,
// and everything else is a paragraph.
const HEADINGS = /^(about (the )?(role|us|the company|the position)|the role|role overview|key responsibilities|responsibilities|duties|what you('| wi)ll do|requirements|essential requirements|essential|minimum requirements|qualifications|experience( required)?|desirable|preferred|nice to have|what we offer|benefits|package|salary( and benefits)?|how to apply|application process|next steps|about you)\s*:?\s*$/i;
const BULLET = /^[-*·•\u2022\u2023\u25E6\u2043]\s+/;
const NUMBERED = /^\d{1,2}[.)]\s+/;

export function parseDescriptionBlocks(text) {
  if (!text) return [];
  const plain = /<[a-z][\s\S]*?>/i.test(text)
    ? text.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h[1-6])>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, ' ')
    : text;
  const out = [];
  let bullets = [];
  const flush = () => { if (bullets.length) { out.push({ type: 'ul', items: bullets.slice() }); bullets = []; } };
  for (const raw of plain.split('\n')) {
    const line = raw.replace(/[ \t]+/g, ' ').trim();
    if (!line) { flush(); continue; }
    if (BULLET.test(line) || NUMBERED.test(line)) { bullets.push(line.replace(BULLET, '').replace(NUMBERED, '')); continue; }
    flush();
    if (line.length <= 60 && HEADINGS.test(line)) out.push({ type: 'h', text: line.replace(/\s*:\s*$/, '') });
    else out.push({ type: 'p', text: line });
  }
  flush();
  return out;
}
