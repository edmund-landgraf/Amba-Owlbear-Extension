function words(value) {
  return String(value ?? "")
    .replace(/[^a-z0-9 ]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function baseInitial(name) {
  return (words(name)[0]?.[0] ?? "M").toUpperCase();
}

function twoLetterBase(initial, used) {
  let suffix = "a".charCodeAt(0);
  while (suffix <= "z".charCodeAt(0)) {
    const candidate = `${initial}${String.fromCharCode(suffix)}`;
    if (!used.has(candidate)) return candidate;
    suffix += 1;
  }

  return `${initial}x`;
}

export function labelBaseForBlocks(blocks, getName) {
  const byInitial = new Map();
  for (const block of blocks) {
    const initial = baseInitial(getName(block));
    byInitial.set(initial, (byInitial.get(initial) ?? 0) + 1);
  }

  const usedTwoLetterBases = new Set();
  return blocks.map((block) => {
    const name = getName(block);
    const initial = baseInitial(name);
    if ((byInitial.get(initial) ?? 0) === 1) return initial;

    const base = twoLetterBase(initial, usedTwoLetterBases);
    usedTwoLetterBases.add(base);
    return base;
  });
}

export function numberedLabel(base, index) {
  return `${base}${index + 1}`;
}

export function labelFontSize(label) {
  if (label.length <= 2) return 250;
  if (label.length === 3) return 190;
  return 150;
}
