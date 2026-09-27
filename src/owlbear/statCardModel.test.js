import assert from "node:assert/strict";
import { test } from "node:test";
import { rawMdStatCardModel, statCardRowsFromModel, structuredStatCardModel } from "./statCardModel.js";
import { renderStatCardSvgFile } from "./statCardImage.js";

const SEA_HAG = [
  "### Sea Hag Creature 3",
  "- Common",
  "- Medium",
  "- Hag",
  "**Source** Bestiary",
  "**Perception** +10; darkvision",
  "**Languages** Aklo, Common, Jotun",
  "**Skills** Acrobatics +8, Athletics +11, Deception +10, Occultism +8, Stealth +8",
  "**Str** +4",
  "**Dex** +3",
  "**Con** +4",
  "**Int** +1",
  "**Wis** +3",
  "**Cha** +3",
  "**AC** 19",
  "**Fort** +11",
  "**Ref** +8",
  "**Will** +10",
  "**HP** 45",
  "**Weaknesses** cold iron 3",
  "**Speed** 25 feet, swim 35 feet",
  "**Melee** ◆ claw +12 (agile, magical)",
  "**Damage** 1d10+4 slashing",
  "**Dread Gaze** ◆◆ (curse, emotion, fear, mental, occult) The hag gazes upon a creature.",
].join("\n");

test("raw markdown statblocks become grouped PF2 card rows", () => {
  const model = rawMdStatCardModel(SEA_HAG, "Sea Hag");
  const rows = statCardRowsFromModel(model);

  assert.equal(model.name, "Sea Hag");
  assert.equal(model.creature, "Creature 3");
  assert.deepEqual(model.traits, ["Common", "Medium", "Hag"]);
  assert.equal(rows.find((row) => row.label === "Abilities")?.value, "Str +4, Dex +3, Con +4, Int +1, Wis +3, Cha +3");
  assert.equal(rows.find((row) => row.label === "AC")?.value, "19; Fort +11, Ref +8, Will +10");
  assert.ok(rows.some((row) => row.label === "Dread Gaze"));
});

test("raw markdown preserves full innate spellcasting labels", () => {
  const model = rawMdStatCardModel(
    [
      "### Arbiter Creature 1",
      "- Tiny",
      "- Aeon",
      "- Monitor",
      "**Melee** ◆ shortsword +7 (agile, finesse, magical)",
      "**Damage** 1d6+1 piercing",
      "**Divine Innate Spells** DC 17; **4th** read omens; **1st** command, mending (x3), sanctuary",
      "**Electrical Burst** ◆◆ The arbiter releases an electrical burst.",
    ].join("\n"),
    "Arbiter"
  );
  const rows = statCardRowsFromModel(model);

  assert.equal(rows.find((row) => row.label === "Divine Innate Spells")?.value, "DC 17; 4th read omens; 1st command, mending (x3), sanctuary");
  assert.equal(rows.some((row) => row.label === "Spells"), false);
});

test("structured PF2 API rows normalize direct fields", () => {
  const model = structuredStatCardModel({
    Name: "Merfolk Warrior",
    Level: 0,
    Rarity: "common",
    Size: "medium",
    Family: "merfolk",
    Perception: 4,
    Senses: "low-light vision",
    StrMod: 2,
    DexMod: 3,
    ConMod: 1,
    IntMod: 0,
    WisMod: 2,
    ChaMod: 1,
    AC: "16",
    Fortitude: 4,
    Reflex: 7,
    Will: 6,
    HP: "18",
  });
  const rows = statCardRowsFromModel(model);

  assert.equal(model.creature, "Creature 0");
  assert.deepEqual(model.traits, ["Common", "Medium", "Merfolk"]);
  assert.equal(rows.find((row) => row.label === "Perception")?.value, "+4; low-light vision");
  assert.equal(rows.find((row) => row.label === "AC")?.value, "16; Fort +4, Ref +7, Will +6");
});

test("stat card SVG renders PF2 anchors and dynamic dimensions", async () => {
  const rows = statCardRowsFromModel(rawMdStatCardModel(SEA_HAG, "Sea Hag"));
  const tokenFile = new File(["<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"], "token.svg", { type: "image/svg+xml" });
  const file = await renderStatCardSvgFile({ header: "1x Normal", name: "Sea Hag", rows, tokenFile });
  const svg = await file.text();

  assert.equal(file.statCardWidth, 1400);
  assert.ok(file.statCardHeight > 250);
  assert.match(svg, /id="stat-card"/);
  assert.match(svg, /id="stat-card-title"/);
  assert.match(svg, /id="stat-card-creature"/);
  assert.match(svg, /id="stat-card-traits"/);
  assert.match(svg, />SEA HAG</);
  assert.match(svg, />CREATURE 3</);
  assert.match(svg, /<tspan font-weight="700"[^>]*>Dread<\/tspan>/);
  assert.match(svg, /<tspan font-weight="700"[^>]*>Gaze<\/tspan>/);
});

test("stat card SVG keeps innate spellcasting label separate from melee damage", async () => {
  const rows = [
    { label: "Melee", value: "◆ shortsword +7 (agile, finesse, magical), Damage 1d6+1 piercing" },
    { label: "Divine Innate Spells", value: "DC 17; 4th read omens; 1st command, mending (x3), sanctuary" },
    { label: "", value: "Electrical Burst ◆◆ The arbiter releases an electrical burst." },
  ];
  const file = await renderStatCardSvgFile({ header: "2x Normal", name: "Arbiter", rows });
  const svg = await file.text();

  assert.match(svg, /Divine/);
  assert.match(svg, /Innate/);
  assert.match(svg, /Spells/);
  assert.match(svg, /read/);
  assert.match(svg, /omens/);
  assert.doesNotMatch(svg, /piercing\s*Divine/);
  assert.doesNotMatch(svg, /command,<\/tspan>/);
});
