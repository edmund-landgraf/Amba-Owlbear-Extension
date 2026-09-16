import assert from "node:assert/strict";
import { test } from "node:test";
import { splitActionBlocks } from "./pf2eActionIcons.js";
import { cleanStatText, pf2eStatRows } from "./statCardRows.js";

const THORNWICK = [
  "CREATURE 3 [UNCOMMON] [MEDIUM] [INCORPOREAL] [SPIRIT] [UNDEAD]",
  "The fractured, lingering psychic remnant of a villager consumed by the veil-tear.",
  "Perception +9; darkvision Languages Common",
  "Skills Acrobatics +9, Intimidation +9, Stealth +11",
  "Str 5, Dex +4, Con +0, Int 2, Wis +2, Cha +2",
  "AC 19 Fort +6, Ref +11, Will +9 HP 30 (void healing)",
  "Resistances all damage 3 except force, ghost touch , or vitality",
  "Speed fly 30 feet",
  "Melee &#9670; Spectral Grasp +11 (finesse, magical), Damage 2d8 void",
  "Draining Wail &#9670;&#9670; (auditory, emotion, fear, mental)",
].join(" ");

test("ability and save rows do not keep source commas when joined", () => {
  const rows = pf2eStatRows(THORNWICK, "Thornwick Echo");
  const abilities = rows.find((row) => row.label === "Abilities")?.value;
  const ac = rows.find((row) => row.label === "AC")?.value;
  assert.equal(abilities, "Str +5, Dex +4, Con +0, Int +2, Wis +2, Cha +2");
  assert.equal(ac, "19; Fort +6, Ref +11, Will +9");
  assert.equal(rows.some((row) => row.label === "Saves"), false);
  assert.doesNotMatch(abilities, /,,/);
  assert.doesNotMatch(ac, /,,/);
});

test("splits creature traits from flavor and unbrackets traits", () => {
  const rows = pf2eStatRows(THORNWICK, "Thornwick Echo");
  assert.equal(
    rows.find((row) => row.label === "Type")?.value,
    "Creature 3, Uncommon, Medium, Incorporeal, Spirit, Undead"
  );
  assert.match(rows.find((row) => row.label === "Flavor")?.value ?? "", /fractured, lingering psychic remnant/);
});

test("collapses doubled commas and spaces before punctuation", () => {
  const rows = pf2eStatRows(
    "Resistances all damage 3 except force, ghost touch , or vitality; Speed fly 30 feet",
    "Thornwick Echo"
  );
  const resistances = rows.find((row) => row.label === "Resistances")?.value;
  assert.equal(resistances, "all damage 3 except force, ghost touch, or vitality");
});

test("splits melee strike from a following named ability", () => {
  const rows = pf2eStatRows(THORNWICK, "Thornwick Echo");
  const melee = rows.find((row) => row.label === "Melee")?.value;
  const wail = rows.find((row) => /Draining Wail/.test(row.value ?? ""))?.value;
  assert.match(melee ?? "", /Spectral Grasp \+11/);
  assert.doesNotMatch(melee ?? "", /Draining Wail/);
  assert.match(wail ?? "", /Draining Wail/);
});

test("splitActionBlocks starts a new block on a capitalized strike glyph", () => {
  const parts = splitActionBlocks("◆ Spectral Grasp +11 ◆◆ Draining Wail (fear)");
  assert.equal(parts.length, 2);
  assert.match(parts[0], /Spectral Grasp/);
  assert.match(parts[1], /Draining Wail/);
});
test("removes source links before stat labels are parsed", () => {
  const text = "Skills [Acrobatics](/Skills.aspx?ID=34) +12; [Athletics](https://2e.aonprd.com/Skills.aspx?ID=36) +15";
  assert.equal(cleanStatText(text), "Skills Acrobatics +12; Athletics +15");
  assert.deepEqual(pf2eStatRows(text, "Veteran War Horse"), [
    { label: "Skills", value: "Acrobatics +12; Athletics +15" },
  ]);
});
test("ignores field-like words inside ability prose", () => {
  const rows = pf2eStatRows("HP 170 Speed 25 feet Melee ◆ claw +18, Damage 2d8+7; Blood Drain ◆ The creature loses HP as it moves at high speed.", "Blood Hag");
  assert.equal(rows.filter((row) => row.label === "HP").length, 1);
  assert.equal(rows.filter((row) => row.label === "Speed").length, 1);
  assert.match(rows.find((row) => /Blood Drain/.test(row.value ?? ""))?.value ?? "", /Blood Drain/);
});

test("splits PF2 API bare numeric action markers into separate ability rows", () => {
  const woodWraith = [
    "Perception +8; low-light vision, tremorsense 30 feet",
    "Languages Hallit, Sylvan (cannot speak intelligibly; wails in shrieks)",
    "Skills Acrobatics +6, Athletics +8, Intimidation +8, Nature +8, Stealth +7",
    "Str +4; Dex +2; Con +3; Int +1; Wis +2; Cha +2",
    "AC 18; Fort +9, Ref +6, Will +8",
    "HP 45; Immunities bleed, death effects, disease, paralyzed, poison, unconscious; Weaknesses fire 5; Resistances bludgeoning 3, piercing 3",
    "Speed 25 feet",
    "Melee 1 Blood-Antler Gore +10, Damage 1d8+4 piercing plus 1d4 void",
    "Melee 1 Root Lash +10 (reach 10 ft.), Damage 1d6+4 bludgeoning plus Grab",
    "Defoliating Shriek 2 (auditory, emotion, fear, mental) The Wood Wraith emits an agonizing screech of splintering wood and dying timber.",
    "Erupting Roots 2 (primal) Thorny subterranean roots burst up in a 15-foot radius centered on a point within 60 feet.",
    "Summon Logger Echoes 2 (primal) Frequency once per encounter Effect The Wraith summons the spectral, weeping echoes of dead loggers.",
  ].join(" ");

  const rows = pf2eStatRows(woodWraith, "Wood Wraith");
  const meleeRows = rows.filter((row) => row.label === "Melee" || /^\d\s+(?:Blood-Antler|Root Lash)/.test(row.value ?? ""));
  const defoliating = rows.find((row) => /Defoliating Shriek/.test(row.value ?? ""));
  const erupting = rows.find((row) => /Erupting Roots/.test(row.value ?? ""));
  const summon = rows.find((row) => /Summon Logger Echoes/.test(row.value ?? ""));

  assert.equal(meleeRows.length, 2);
  assert.match(rows.find((row) => row.label === "Melee")?.value ?? "", /Blood-Antler Gore/);
  assert.doesNotMatch(rows.find((row) => row.label === "Melee")?.value ?? "", /Defoliating Shriek/);
  assert.match(defoliating?.value ?? "", /^Defoliating Shriek 2/);
  assert.match(erupting?.value ?? "", /^Erupting Roots 2/);
  assert.match(summon?.value ?? "", /^Summon Logger Echoes 2/);
});
