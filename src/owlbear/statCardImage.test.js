import assert from "node:assert/strict";
import { test } from "node:test";
import { renderStatCardSvgFile } from "./statCardImage.js";
import { pf2eStatRows } from "./statCardRows.js";

const SEA_HAG = [
  "Sea Hag CREATURE 3 [COMMON] [MEDIUM] [HAG]",
  "Perception +10; darkvision",
  "Languages Aklo, Common, Jotun",
  "Skills Acrobatics +8, Athletics +11, Deception +10, Occultism +8, Stealth +8",
  "Str +4, Dex +3, Con +4, Int +1, Wis +3, Cha +3",
  "AC 19; Fort +11, Ref +8, Will +10",
  "HP 45",
  "Weaknesses cold iron 3",
  "Speed 25 feet, swim 35 feet",
  "Melee ◆ claw +12 (Agile, Magical), Damage 1d10+4 slashing; Dread Gaze ◆◆ (Curse, Emotion, Fear, Mental, Occult)",
  "The hag gazes upon a creature, afflicting it with intense distress and a gnawing sense of impending doom.",
].join(" ");

test("renders a real Sea Hag fixture in the compact PF2 reference layout", async () => {
  const rows = pf2eStatRows(SEA_HAG, "Sea Hag");
  const icon = new File(["<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"], "badge.svg", { type: "image/svg+xml" });
  const art = new File(["<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"], "art.svg", { type: "image/svg+xml" });
  const file = await renderStatCardSvgFile({
    header: "1x Normal",
    name: "Sea Hag",
    rows,
    tokenFile: icon,
    artFile: art,
    width: 1040,
  });
  const svg = await file.text();
  const height = Number(svg.match(/<svg[^>]+height="(\d+)"/)?.[1]);

  assert.equal(file.statCardWidth, 1040);
  assert.equal(file.statCardHeight, height);
  assert.ok(height > 250 && height < 700, "expected compact content height, got " + height);
  assert.match(svg, />SEA HAG</);
  assert.match(svg, />CREATURE 3</);
  assert.match(svg, />COMMON</);
  assert.match(svg, />MEDIUM</);
  assert.match(svg, />HAG</);
  assert.equal((svg.match(/<image /g) ?? []).length, 2);
  assert.match(svg, />AC</);
  assert.match(svg, />HP</);
  assert.match(svg, />Melee</);
  assert.match(svg, /<tspan[^>]*>Languages<\/tspan><tspan[^>]*> <\/tspan><tspan[^>]*>Aklo,<\/tspan>/);
  assert.match(svg, /id="stat-card-title"/);
  assert.match(svg, /id="stat-card-creature"/);
  assert.match(svg, /id="stat-card-traits"/);
  assert.match(svg, /<tspan font-weight="700"[^>]*>Dread<\/tspan>/);
  assert.match(svg, /<circle[^>]+fill="#4d4a45"/);
  assert.doesNotMatch(svg, /aspx|aonprd\.com|demiplane\.com/i);
  assert.equal((svg.match(/>HP</g) ?? []).length, 1);
  assert.equal((svg.match(/>Speed</g) ?? []).length, 1);
});

test("keeps the full action text without inventing fields", () => {
  const rows = pf2eStatRows(SEA_HAG, "Sea Hag");
  assert.equal(rows.filter((row) => row.label === "HP").length, 1);
  assert.equal(rows.filter((row) => row.label === "Speed").length, 1);
  assert.ok(rows.some((row) => /Dread Gaze/.test(row.value ?? "")));
  assert.equal(rows.some((row) => /afflicting it/.test(row.value ?? "") && row.label === "HP"), false);
});