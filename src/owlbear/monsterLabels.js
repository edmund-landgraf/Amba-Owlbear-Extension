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

function twoLetterBase(name, used) {
  const parts = words(name);
  const first = (parts[0]?.[0] ?? "M").toUpperCase();
  const candidates = [
    parts[1]?.[0],
    parts[0]?.[1],
    parts[0]?.[2],
    parts[0]?.[3],
  ]
    .filter(Boolean)
    .map((letter) => `${first}${letter.toLowerCase()}`);

  for (const candidate of candidates) {
    if (!used.has(candidate)) return candidate;
  }

  let suffix = "a".charCodeAt(0);
  while (suffix <= "z".charCodeAt(0)) {
    const candidate = `${first}${String.fromCharCode(suffix)}`;
    if (!used.has(candidate)) return candidate;
    suffix += 1;
  }

  return `${first}x`;
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

    const base = twoLetterBase(name, usedTwoLetterBases);
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
