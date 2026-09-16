import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { apiStatCardModel, rawMdStatCardModel, statCardRowsFromModel, structuredStatCardModel } from "./statCardModel.js";

const fixtureDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "statCards");
const fixtureNames = ["amoeba-swarm", "xulgath-warrior", "red-duchess-sailor", "zoaem", "oregorger", "merfolk-warrior"];

function fixture(name, suffix) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDirectory, `${name}.${suffix}.json`), "utf8"));
}

for (const name of fixtureNames) {
  test(`${name} normalizes exactly to its reviewed stat-card model`, () => {
    const input = fixture(name, "input");
    const actual = input.RawMD ? rawMdStatCardModel(input.RawMD, input.Name) : structuredStatCardModel(input);
    assert.deepEqual(actual, fixture(name, "expected"));
  });
}

test("structured Demiplane rows never turn source metadata into traits", () => {
  const model = structuredStatCardModel(fixture("red-duchess-sailor", "input"));
  assert.deepEqual(model.traits, ["Common", "Cn", "Medium", "Seafarers"]);
  assert.equal(model.source, "They Watched the Stars");
  assert.equal(model.traits.some((trait) => /source|watched/i.test(trait)), false);
});

test("Amoeba selects the creature section, retains signed modifiers, and keeps each ability separate", () => {
  const input = fixture("amoeba-swarm", "input");
  const model = rawMdStatCardModel(input.RawMD, input.Name);
  const rows = statCardRowsFromModel(model);
  assert.equal(model.creature, "Creature 1");
  assert.deepEqual(model.traits, ["Large", "Amphibious", "Mindless", "Ooze", "Swarm"]);
  assert.equal(rows.find((row) => row.label === "Abilities")?.value, "Str +0, Dex -2, Con +3, Int -5, Wis +0, Cha -5");
  assert.ok(model.rows.some((row) => row.label === "Swarming Slither"));
  assert.ok(model.rows.some((row) => row.label === "Weak Acid"));
  assert.equal(/Amoebas Large And Small/.test(JSON.stringify(model)), false);
});

test("Zoaem and Oregorger do not swallow reactions, passives, or named actions into defenses and strikes", () => {
  const zoaem = rawMdStatCardModel(fixture("zoaem", "input").RawMD, "Zoaem");
  const oregorger = rawMdStatCardModel(fixture("oregorger", "input").RawMD, "Oregorger");
  assert.equal(zoaem.rows.find((row) => row.label === "HP")?.value, "20 ( all-around vision )");
  assert.ok(zoaem.rows.some((row) => row.label === "Archon's Protection"));
  assert.ok(zoaem.rows.some((row) => row.label === "Spells"));
  assert.ok(oregorger.rows.some((row) => row.label === "Caustic Rust"));
  assert.ok(oregorger.rows.some((row) => row.label === "Devour Metal"));
  assert.ok(oregorger.rows.some((row) => row.label === "Searing Spew"));
  assert.equal(oregorger.rows.find((row) => row.label === "Resistances")?.value.includes("Caustic Rust"), false);
});
test("API rows keep direct structured fields while valid AoN RawMD only enriches actions", () => {
  const row = fixture("merfolk-warrior", "input");
  const model = apiStatCardModel(row);
  assert.equal(model.rows.filter((entry) => entry.label === "Perception").length, 1);
  assert.ok(model.rows.some((entry) => entry.label === "Aquatic Dash"));
  assert.ok(model.rows.some((entry) => entry.label === "Melee"));
  const demiplane = apiStatCardModel(fixture("red-duchess-sailor", "input"));
  assert.equal(demiplane.rows.some((entry) => /Source|Watched/i.test(entry.label)), false);
});