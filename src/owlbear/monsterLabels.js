const SKIP_WORDS = new Set(["the", "of", "a", "an", "elite", "weak"]);

function words(value) {
  return String(value ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9 ]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function significantWords(name) {
  return words(name).filter((word) => !SKIP_WORDS.has(word.toLocaleLowerCase()));
}

export function labelBaseFromName(name) {
  const parts = significantWords(name);
  if (!parts.length) return "M";
  return parts.map((word) => word[0].toUpperCase()).join("");
}

function disambiguatedBase(name, base, used) {
  const parts = significantWords(name);
  const last = parts[parts.length - 1] ?? "";
  let candidate = base;
  for (let index = 1; index < last.length; index += 1) {
    candidate = `${base}${last.slice(1, index + 1)}`;
    if (!used.has(candidate)) return candidate;
  }

  let suffix = 2;
  candidate = `${base}${suffix}`;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  return candidate;
}

export function labelBaseForBlocks(blocks, getName) {
  const bases = blocks.map((block) => labelBaseFromName(getName(block)));
  const counts = new Map();
  for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1);

  const used = new Set();
  return blocks.map((block, index) => {
    const base = bases[index];
    if ((counts.get(base) ?? 0) === 1 && !used.has(base)) {
      used.add(base);
      return base;
    }

    const next = used.has(base) ? disambiguatedBase(getName(block), base, used) : base;
    used.add(next);
    return next;
  });
}

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function subscriptNumber(value) {
  return String(value)
    .split("")
    .map((digit) => SUBSCRIPT_DIGITS[digit] ?? digit)
    .join("");
}

export function numberedLabel(base, index, count = 2) {
  if (count <= 1) return base;
  return `${base}${subscriptNumber(index + 1)}`;
}

export function labelFontSize(label) {
  if (label.length <= 2) return 250;
  if (label.length === 3) return 190;
  return 150;
}
