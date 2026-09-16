const FILL = "#251f1a";

function chevron(x) {
  return `<path d="M ${x} 3.2 L ${x + 5.6} 9 L ${x} 14.8" fill="none" stroke="${FILL}" stroke-width="2.15" stroke-linejoin="round" stroke-linecap="round"/>`;
}

export const ACTION_ICON_MARKUP = {
  one: chevron(5.2),
  two: `${chevron(2.2)}${chevron(7.4)}`,
  three: `${chevron(0.4)}${chevron(5.2)}${chevron(10)}`,
  free: `<polygon points="9,1.6 16.4,9 9,16.4 1.6,9" fill="none" stroke="${FILL}" stroke-width="1.7" stroke-dasharray="2.2 1.6" stroke-linejoin="round"/>`,
  reaction: `<path d="M 4.2 12.4 A 5.6 5.6 0 1 1 13.6 12.2" fill="none" stroke="${FILL}" stroke-width="1.9" stroke-linecap="round"/><path d="M 11.4 8.6 L 14.2 12.4 L 9.8 13.2 Z" fill="${FILL}"/>`,
  variable: `${chevron(0.4)}${chevron(5.2)}${chevron(10)}<line x1="2.2" y1="16.2" x2="15.8" y2="16.2" stroke="${FILL}" stroke-width="1.4" stroke-linecap="round"/>`,
};

const ACTION_KIND = {
  "one to three actions": "variable",
  "one to three action": "variable",
  "three actions": "three",
  "three action": "three",
  "two actions": "two",
  "two action": "two",
  "single action": "one",
  "one action": "one",
  "free action": "free",
  reaction: "reaction",
};

const ACTION_PHRASE =
  /one\s+to\s+three\s+actions?|three[\s-]+actions?|two[\s-]+actions?|single\s+action|one\s+action|free\s+action/gi;
const REACTION_PHRASE = /(?<![A-Za-z])Reaction(?![A-Za-z])/g;
const GLYPH_PHRASE = /(?:^|(?<=\s))(?:>>>|>>|>|◆◆◆|◆◆|◆|◇|↻|↺)(?=\s|$)/g;
const BARE_ACTION_PHRASE = /(?:^|(?<=\s))[123](?=\s+(?:[A-Z]|\())/g;

function kindFromGlyph(raw) {
  if (raw === ">>>" || raw === "◆◆◆" || raw === "3") return "three";
  if (raw === ">>" || raw === "◆◆" || raw === "2") return "two";
  if (raw === ">" || raw === "◆" || raw === "1") return "one";
  if (raw === "◇") return "free";
  if (raw === "↻" || raw === "↺") return "reaction";
  return "one";
}

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(value) {
  let text = String(value ?? "");
  for (let pass = 0; pass < 3; pass += 1) {
    const next = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      const key = String(entity);
      if (key[0] === "#") {
        const code = key[1] === "x" || key[1] === "X" ? Number.parseInt(key.slice(2), 16) : Number(key.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[key.toLocaleLowerCase()] ?? match;
    });
    if (next === text) break;
    text = next;
  }
  return text;
}

function previousWord(text, index) {
  return text.slice(0, index).trimEnd().match(/([A-Za-z][A-Za-z0-9'/-]*)$/)?.[1] ?? "";
}

function isBareActionMarker(text, index) {
  if (index === 0) return true;
  return /^[A-Z]/.test(previousWord(text, index));
}

function actionMatches(text) {
  return [
    ...text.matchAll(ACTION_PHRASE),
    ...text.matchAll(REACTION_PHRASE),
    ...text.matchAll(GLYPH_PHRASE),
    ...text.matchAll(BARE_ACTION_PHRASE).filter((match) => isBareActionMarker(text, match.index ?? 0)),
  ].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
}

export function normalizePf2eActionTokens(value) {
  return decodeHtmlEntities(String(value ?? ""))
    .replace(/\[one-to-three-actions?\]/gi, " One to Three Actions ")
    .replace(/\[one-action\]/gi, " Single Action ")
    .replace(/\[two-actions?\]/gi, " Two Actions ")
    .replace(/\[three-actions?\]/gi, " Three Actions ")
    .replace(/\[free-action\]/gi, " Free Action ")
    .replace(/\[reaction\]/gi, " Reaction ")
    .replace(/\bone-to-three-actions?\b/gi, " One to Three Actions ")
    .replace(/\bone-action\b/gi, " Single Action ")
    .replace(/\btwo-actions?\b/gi, " Two Actions ")
    .replace(/\bthree-actions?\b/gi, " Three Actions ")
    .replace(/\bfree-action\b/gi, " Free Action ");
}

export function tokenizeStatValue(value) {
  const text = normalizePf2eActionTokens(value).replace(/\s+/g, " ").trim();
  if (!text) return [];
  const matches = actionMatches(text);
  const tokens = [];
  let cursor = 0;
  for (const match of matches) {
    const start = match.index ?? 0;
    if (start < cursor) continue;
    if (start > cursor) tokens.push({ text: text.slice(cursor, start) });
    const raw = match[0];
    if (/^[123>◆◇↻↺]+$/.test(raw)) {
      tokens.push({ icon: kindFromGlyph(raw) });
    } else {
      const key = raw.replace(/[\s-]+/g, " ").trim().toLocaleLowerCase();
      tokens.push({ icon: ACTION_KIND[key] ?? "one" });
    }
    cursor = start + raw.length;
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor) });
  return tokens.filter((token) => token.icon || token.text);
}

const TRAILING_RIDER_WORDS = new Set(["Grab", "Trip", "Shove", "Disarm", "Grapple", "Knockdown", "Push", "Pull"]);

function namedActionStart(text, actionIndex) {
  if (actionIndex <= 0) return 0;
  const before = text.slice(0, actionIndex).trimEnd();
  const match = before.match(/(?:^|[\s,;])((?:[A-Z][A-Za-z0-9'/-]*\s+){0,5}[A-Z][A-Za-z0-9'/-]*)$/);
  if (!match) return actionIndex;
  const words = match[1].trim().split(/\s+/);
  while (words.length > 1 && TRAILING_RIDER_WORDS.has(words[0])) words.shift();
  const phrase = words.join(" ");
  return before.length - phrase.length;
}

function actionBlockStarts(text) {
  const starts = new Set([0]);
  for (const match of actionMatches(text)) {
    const index = match.index ?? 0;
    if (index === 0) continue;
    starts.add(namedActionStart(text, index));
  }
  return starts;
}

export function splitActionBlocks(value) {
  const text = normalizePf2eActionTokens(value).replace(/\s+/g, " ").trim();
  if (!text) return [];
  const indices = [...actionBlockStarts(text)].sort((left, right) => left - right);
  const parts = [];
  for (let index = 0; index < indices.length; index += 1) {
    const chunk = text.slice(indices[index], indices[index + 1]).trim();
    if (chunk) parts.push(chunk);
  }
  return parts.length ? parts : [text];
}

export function iconLayoutSize(fontSize) {
  return fontSize * 1.12;
}

export function actionIconGroup(kind, x, y, size) {
  const markup = ACTION_ICON_MARKUP[kind];
  if (!markup) return "";
  const scale = size / 18;
  return `<g transform="translate(${x} ${y}) scale(${scale})">${markup}</g>`;
}
