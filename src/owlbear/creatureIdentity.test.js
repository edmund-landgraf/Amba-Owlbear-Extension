import assert from "node:assert/strict";
import { test } from "node:test";
import { monsterIdentity, parseCreatureIdentity } from "./creatureIdentity.js";
import { labelBaseForBlocks, labelBaseFromName, numberedLabel } from "./monsterLabels.js";

test("parses leading quantity and elite variant", () => {
  assert.deepEqual(parseCreatureIdentity("2x Namorrodor"), {
    name: "Namorrodor",
    count: 2,
    variant: null,
    raw: "2x Namorrodor",
  });
  assert.deepEqual(parseCreatureIdentity("Elite — Greater Shadow"), {
    name: "Greater Shadow",
    count: null,
    variant: "elite",
    raw: "Elite — Greater Shadow",
  });
  assert.deepEqual(parseCreatureIdentity("Type Namorrodor x 2"), {
    name: "Namorrodor",
    count: 2,
    variant: null,
    raw: "Type Namorrodor x 2",
  });
});

test("monsterIdentity prefers parsed count over missing quantity", () => {
  const identity = monsterIdentity({
    name: "2x Namorrodor",
    statBlock: "Namorrodor x 2 Perception +10",
  });
  assert.equal(identity.candidateName, "Namorrodor");
  assert.equal(identity.count, 2);
});

test("monsterIdentity uses structured quantity when title has none", () => {
  const identity = monsterIdentity({ name: "Goblin Warrior", quantity: 2 });
  assert.equal(identity.name, "Goblin Warrior");
  assert.equal(identity.count, 2);
});

test("label bases use word initials and omit numbers for singles", () => {
  assert.equal(labelBaseFromName("Greater Shadow"), "GS");
  assert.equal(labelBaseFromName("Goblin Warrior"), "GW");
  assert.equal(labelBaseFromName("Namorrodor"), "N");
  assert.equal(numberedLabel("GS", 0, 1), "GS");
  assert.equal(numberedLabel("GS", 0, 3), "GS₁");
  assert.equal(numberedLabel("GS", 1, 3), "GS₂");
});

test("colliding initials add a letter from the last word", () => {
  const bases = labelBaseForBlocks(
    [{ name: "Greater Shadow" }, { name: "Giant Spider" }],
    (block) => block.name
  );
  assert.deepEqual(bases, ["GS", "GSp"]);
});

test("AoN remaster hit formats a consistent Greater Shadow stat block", async () => {
  const { creatureFromAonHit, pickAonCreatureHit } = await import("./aonStatBlock.js");
  const hits = [
    { _source: { name: "Greater Shadow", remaster_id: 3187, url: "/Monsters.aspx?ID=363", level: 7 } },
    {
      _source: {
        name: "Greater Shadow",
        legacy_id: 363,
        url: "/Monsters.aspx?ID=3187",
        level: 7,
        size: ["Medium"],
        trait_raw: ["Incorporeal", "Undead", "Unholy"],
        hp_raw: "75 ( void healing )",
        ac: 24,
        perception: 14,
        fortitude_save: 11,
        reflex_save: 18,
        will_save: 15,
        strength: -5,
        dexterity: 5,
        constitution: 0,
        intelligence: 0,
        wisdom: 2,
        charisma: 4,
        language_markdown: "[Necril](/Languages.aspx?ID=20)",
        skill_markdown: "[Acrobatics](/Skills.aspx?ID=1) +16, [Stealth](/Skills.aspx?ID=15) +20",
        immunity_markdown: "bleed, death effects",
        resistance_markdown: "all 10",
        weakness_markdown: "light vulnerability",
        speed_markdown: "fly 30 feet",
        vision: "darkvision",
        source_raw: ["Monster Core pg. 306"],
        text: "Greater Shadow Perception +14 Speed fly 30 feet Melee shadow hand +18, Damage 2d10+6 void Divine Innate Spells DC 25",
      },
    },
  ];
  const hit = pickAonCreatureHit(hits, "Greater Shadow");
  const creature = creatureFromAonHit(hit);
  assert.equal(creature.sourceUrl, "https://2e.aonprd.com/Monsters.aspx?ID=3187");
  assert.match(creature.statBlock, /Creature 7 Medium Incorporeal Undead Unholy/);
  assert.match(creature.statBlock, /Perception \+14; darkvision/);
  assert.match(creature.statBlock, /AC 24/);
  assert.match(creature.statBlock, /HP 75/);
  assert.match(creature.statBlock, /Melee shadow hand \+18/);

  const elite = creatureFromAonHit(hit, "elite");
  assert.equal(elite.level, 8);
  assert.match(elite.statBlock, /Creature 8/);
  assert.match(elite.statBlock, /AC 26/);
  assert.match(elite.statBlock, /HP 95/);
  assert.match(elite.statBlock, /shadow hand \+20/);
  assert.match(elite.statBlock, /DC 27/);
});
