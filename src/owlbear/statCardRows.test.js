import assert from "node:assert/strict";
import { test } from "node:test";
import { splitActionBlocks } from "./pf2eActionIcons.js";
import { pf2eStatRows } from "./statCardRows.js";

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
