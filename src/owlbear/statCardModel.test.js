import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apiStatCardModel, mergeStatRows, rawMdStatCardModel, statCardRowsFromModel, structuredStatCardModel } from "./statCardModel.js";
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

test("API stat cards keep markdown fields the structured columns shorten", () => {
  const row = JSON.parse(readFileSync(new URL("./fixtures/statCards/amoeba-swarm.input.json", import.meta.url), "utf8"));
  const rows = statCardRowsFromModel(apiStatCardModel(row));

  assert.equal(rows.find((entry) => entry.label === "Skills")?.value, "Stealth +1");
  assert.equal(rows.find((entry) => entry.label === "Weaknesses")?.value, "area 3, fire 3, splash damage 3");
  assert.ok(rows.some((entry) => entry.label === "Weak Acid"));
});

test("API stat cards use extra markdown when RawMD is missing", () => {
  const rows = statCardRowsFromModel(
    apiStatCardModel(
      {
        Name: "Goblin Rabble",
        Level: 4,
        Skills: "Acrobatics, Athletics",
        HP: 60,
        Weaknesses: "{\"area\": 4}",
      },
      [
        "## Goblin Rabble Creature 4",
        "**Skills** Acrobatics +12, Athletics +10",
        "**HP** 60 (4 segments); Thresholds 40 (3 segments), 20 (2 segments)",
        "**Weaknesses** area damage 4, splash damage 4",
        "**Troop Defenses** The troop disperses.",
      ].join("\n")
    )
  );

  assert.equal(rows.find((entry) => entry.label === "Skills")?.value, "Acrobatics +12, Athletics +10");
  assert.equal(rows.find((entry) => entry.label === "HP")?.value, "60 (4 segments); Thresholds 40 (3 segments), 20 (2 segments)");
  assert.equal(rows.find((entry) => entry.label === "Weaknesses")?.value, "area damage 4, splash damage 4");
  assert.match(rows.find((entry) => entry.label === "Troop Defenses")?.value ?? "", /disperses/);
});

test("merged stat rows keep the longer field text", () => {
  const rows = mergeStatRows(
    [{ label: "Skills", value: "Stealth" }, { label: "HP", value: "60" }],
    [{ label: "Skills", value: "Stealth +1" }, { label: "HP", value: "60 (4 segments)" }, { label: "Troop Defenses", value: "disperses" }]
  );
  assert.equal(rows.find((entry) => entry.label === "Skills")?.value, "Stealth +1");
  assert.equal(rows.find((entry) => entry.label === "HP")?.value, "60 (4 segments)");
  assert.equal(rows.find((entry) => entry.label === "Troop Defenses")?.value, "disperses");
});

test("raw markdown creature headers can be HTML or unhashed", () => {
  const html = rawMdStatCardModel(
    "<h2>Sea Hag Creature 3</h2>\n<strong>Skills</strong> Occultism +8\n<strong>HP</strong> 45",
    "Sea Hag"
  );
  const plain = rawMdStatCardModel("Sea Hag Creature 3\n**Skills** Occultism +8\n**HP** 45", "Sea Hag");
  assert.equal(html.creature, "Creature 3");
  assert.equal(html.rows.find((row) => row.label === "Skills")?.value, "Occultism +8");
  assert.equal(plain.rows.find((row) => row.label === "HP")?.value, "45");
});

test("API stat cards keep troop segments, thresholds, and defenses from markdown", () => {
  const row = {
    Name: "Goblin Rabble",
    Level: 4,
    Rarity: "common",
    Size: "gargantuan",
    Family: "goblin",
    Perception: 11,
    Senses: "darkvision",
    Languages: "Common, Goblin",
    Skills: "Acrobatics, Athletics, Stealth, Thievery",
    StrMod: 1,
    DexMod: 5,
    ConMod: 2,
    IntMod: 0,
    WisMod: 1,
    ChaMod: 1,
    AC: 20,
    Fortitude: 11,
    Reflex: 14,
    Will: 8,
    HP: 60,
    Weaknesses: "{\"area\": 4}",
    Speed: "30 feet, troop movement",
    RawMD: [
      "## Goblin Rabble Creature 4",
      "- Gargantuan",
      "- Goblin",
      "- Humanoid",
      "- Troop",
      "**Perception** +11; darkvision",
      "**Languages** Common, Goblin",
      "**Skills** Acrobatics +12, Athletics +10, Stealth +12, Thievery +12",
      "**Str** +1",
      "**Dex** +5",
      "**Con** +2",
      "**Int** +0",
      "**Wis** +1",
      "**Cha** +1",
      "**AC** 20",
      "**Fort** +11",
      "**Ref** +14",
      "**Will** +8",
      "**HP** 60 (4 segments); Thresholds 40 (3 segments), 20 (2 segments)",
      "**Weaknesses** area damage 4, splash damage 4",
      "**Troop Defenses** When the troop is reduced to 0 Hit Points, it disperses.",
      "**Speed** 30 feet, troop movement",
    ].join("\n"),
  };
  const model = apiStatCardModel(row);
  const rows = statCardRowsFromModel(model);

  assert.ok(model.traits.includes("Humanoid"));
  assert.ok(model.traits.includes("Troop"));
  assert.equal(rows.find((entry) => entry.label === "Skills")?.value, "Acrobatics +12, Athletics +10, Stealth +12, Thievery +12");
  assert.equal(rows.find((entry) => entry.label === "HP")?.value, "60 (4 segments); Thresholds 40 (3 segments), 20 (2 segments)");
  assert.equal(rows.find((entry) => entry.label === "Weaknesses")?.value, "area damage 4, splash damage 4");
  assert.match(rows.find((entry) => entry.label === "Troop Defenses")?.value ?? "", /disperses/);
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
