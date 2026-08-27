import { aonMonsterUrl, extractAonCreaturePath } from "./aonStatBlock.js";

const VARIANT_PATTERN = /^(elite|weak)\b\s*[—–\-:]*\s*/i;
const LEADING_QUANTITY = /^(\d+)\s*[x×]\s+/i;
const TRAILING_QUANTITY = /\s+[x×]\s*(\d+)\s*$/i;

function normalizeText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\*\*/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function positiveInt(value) {
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

const GROUP_SEPARATOR = /\s*[—–]\s*|\s+-\s+/;
const EMBEDDED_QUANTITY = /(?:^|\s)(\d+)\s*[x×]\s+/i;

function stripGroupPrefix(text) {
  const parts = text.split(GROUP_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return text;
  return parts[parts.length - 1];
}

function stripEmbeddedQuantity(text, count) {
  const match = text.match(EMBEDDED_QUANTITY);
  if (!match) return { text, count };
  const nextCount = count ?? positiveInt(match[1]);
  const after = text.slice(match.index + match[0].length).trim();
  return { text: after || text, count: nextCount };
}

export function parseCreatureIdentity(value) {
  let text = normalizeText(value).replace(/\s*[|]\s*source:.*$/i, "").trim();
  const raw = text;
  if (!text) return { name: "", count: null, variant: null, raw };

  let count = null;
  let variant = null;

  const leadingQty = text.match(LEADING_QUANTITY);
  if (leadingQty) {
    count = positiveInt(leadingQty[1]);
    text = text.slice(leadingQty[0].length).trim();
  }

  const leadingVariant = text.match(VARIANT_PATTERN);
  if (leadingVariant) {
    variant = leadingVariant[1].toLocaleLowerCase();
    text = text.slice(leadingVariant[0].length).trim();
  }

  text = stripGroupPrefix(text);

  const embedded = stripEmbeddedQuantity(text, count);
  text = embedded.text;
  count = embedded.count;

  const trailingQty = text.match(TRAILING_QUANTITY);
  if (trailingQty) {
    count ??= positiveInt(trailingQty[1]);
    text = text.slice(0, trailingQty.index).trim();
  }

  text = text.replace(/^type\s+/i, "").trim();

  return { name: text, count, variant, raw };
}

export function monsterRawTitle(block) {
  return block?.name ?? block?.title ?? block?.npc?.name ?? block?.monster?.name ?? "";
}

function statIntro(block) {
  const text = normalizeText(
    block?.statBlock ??
      block?.content ??
      block?.description ??
      block?.payload?.statBlock ??
      block?.payload?.content ??
      block?.npc?.statBlock ??
      block?.monster?.statBlock ??
      ""
  );
  const cut = text.search(/\b(Perception|Creature|AC|HP)\b/i);
  return (cut > 0 ? text.slice(0, cut) : text).trim();
}

function structuredCount(block) {
  return positiveInt(block?.count ?? block?.quantity ?? block?.number ?? block?.instances?.length);
}

function structuredVariant(block) {
  const value = String(block?.variant ?? "").trim().toLocaleLowerCase();
  return value === "elite" || value === "weak" ? value : null;
}

function blockLookupText(block) {
  return [
    block?.sourceUrl,
    block?.statBlock,
    block?.content,
    block?.description,
    block?.payload?.statBlock,
    block?.payload?.content,
    block?.npc?.statBlock,
    block?.monster?.statBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

export function monsterAonPath(block) {
  return extractAonCreaturePath(blockLookupText(block));
}

const DEMIPLANE_MARKDOWN =
  /\[([^\]]*)\]\(\s*((?:https?:\/\/)?(?:www\.)?(?:app\.)?demiplane\.com[^)\s]+)\)/gi;
const DEMIPLANE_HTML =
  /<a\b[^>]*href=["']((?:https?:\/\/)?(?:www\.)?(?:app\.)?demiplane\.com[^"']+)["'][^>]*>(.*?)<\/a>/gi;
const DEMIPLANE_BARE = /(?:https?:\/\/)?(?:www\.)?(?:app\.)?demiplane\.com\/[^\s"'<>)]+/gi;

function toAbsoluteHttpUrl(raw) {
  const cleaned = String(raw ?? "").replace(/&amp;/g, "&").trim();
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned.startsWith("http") ? cleaned : `https://${cleaned.replace(/^\/+/, "")}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function extractDemiplaneUrl(value) {
  const text = String(value ?? "");
  const labeled = [];
  const unlabeled = [];
  const seen = new Set();

  const push = (raw, label = "") => {
    const href = toAbsoluteHttpUrl(raw);
    if (!href || !/demiplane\.com/i.test(href)) return;
    const key = href.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const entry = { href, label: String(label ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
    if (/demiplane/i.test(entry.label)) labeled.push(entry);
    else unlabeled.push(entry);
  };

  for (const match of text.matchAll(DEMIPLANE_MARKDOWN)) push(match[2], match[1]);
  for (const match of text.matchAll(DEMIPLANE_HTML)) push(match[1], match[2]);
  for (const match of text.matchAll(DEMIPLANE_BARE)) push(match[0]);
  return (labeled[0] ?? unlabeled[0])?.href ?? null;
}

export function monsterDemiplaneUrl(block) {
  return extractDemiplaneUrl(blockLookupText(block));
}

export function monsterSourceUrl(block) {
  const existing = toAbsoluteHttpUrl(block?.sourceUrl);
  if (existing && /demiplane\.com/i.test(existing)) return existing;
  const demiplane = monsterDemiplaneUrl(block);
  if (demiplane) return demiplane;
  if (existing) return existing;
  const aonPath = monsterAonPath(block);
  return aonPath ? aonMonsterUrl(aonPath) : null;
}

export function monsterIdentity(block) {
  const rawTitle = monsterRawTitle(block);
  const fromTitle = parseCreatureIdentity(rawTitle);
  const fromStat = parseCreatureIdentity(statIntro(block));
  const candidateName = fromTitle.name || fromStat.name || "";
  const count = fromTitle.count ?? fromStat.count ?? structuredCount(block) ?? 1;
  const variant = fromTitle.variant ?? fromStat.variant ?? structuredVariant(block);

  return {
    name: block?.resolvedName || candidateName || "Monster",
    candidateName,
    count,
    variant,
    rawTitle,
    aonPath: monsterAonPath(block),
    sourceUrl: monsterSourceUrl(block),
  };
}
