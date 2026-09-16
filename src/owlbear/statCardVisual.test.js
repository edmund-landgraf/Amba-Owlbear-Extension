import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { rawMdStatCardModel, statCardRowsFromModel, structuredStatCardModel } from "./statCardModel.js";
import { renderStatCardSvgFile } from "./statCardImage.js";

const fixtureDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "statCards");
const goldenDirectory = path.join(fixtureDirectory, "golden");
const diffDirectory = path.join(fixtureDirectory, "diff");
const cases = ["amoeba-swarm", "xulgath-warrior", "red-duchess-sailor", "zoaem", "oregorger", "merfolk-warrior"];
const updateGoldens = process.env.UPDATE_STAT_CARD_GOLDENS === "1";

function input(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDirectory, `${name}.input.json`), "utf8"));
}

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function fixtureToken(name) {
  return new File([`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="29" fill="#356d78" stroke="#171412" stroke-width="3"/><text x="32" y="40" text-anchor="middle" font-family="Arial" font-size="25" font-weight="700" fill="#fff">${name[0].toUpperCase()}</text></svg>`], "badge.svg", { type: "image/svg+xml" });
}

function modelFor(row) {
  return row.RawMD ? rawMdStatCardModel(row.RawMD, row.Name) : structuredStatCardModel(row);
}

async function renderCase(page, name) {
  const row = input(name);
  const model = modelFor(row);
  const art = new File([fs.readFileSync(path.join(fixtureDirectory, "zoaem-art.webp"))], "zoaem-art.webp", { type: "image/webp" });
  const file = await renderStatCardSvgFile({
    header: "1x Normal",
    name: model.name,
    rows: statCardRowsFromModel(model),
    tokenFile: fixtureToken(name),
    artFile: art,
    width: 1040,
  });
  const svg = await file.text();
  await page.setContent(`<style>html,body{margin:0;padding:0;background:#202331}svg{display:block}</style>${svg}`);
  const geometry = await page.evaluate(() => {
    const svg = document.querySelector("#stat-card");
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const value = element.getBBox();
      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };
    return {
      width: Number(svg.getAttribute("width")),
      height: Number(svg.getAttribute("height")),
      title: box("#stat-card-title"),
      creature: box("#stat-card-creature"),
      badge: box("#stat-card-badge"),
      traits: box("#stat-card-traits"),
      artFrame: box("#stat-card-art-frame"),
      art: box("#stat-card-art"),
      finalRule: box("#stat-card-final-rule"),
      children: [...svg.children].map((element) => {
        const value = element.getBBox();
        return { name: element.tagName, x: value.x, y: value.y, width: value.width, height: value.height };
      }),
    };
  });
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: geometry.width, height: geometry.height } });
  return { geometry, png };
}

let browser;
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(async () => { await browser?.close(); });

for (const name of cases) {
  test(`${name} has collision-free SVG geometry and a stable local-art screenshot`, async () => {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1600 }, deviceScaleFactor: 1 });
    const { geometry, png } = await renderCase(page, name);
    await page.close();
    const { title, creature, badge, traits, artFrame, art, finalRule } = geometry;
    assert.ok(title && creature && badge && traits && artFrame && art && finalRule, "expected all card anchors");
    assert.equal(intersects(title, creature), false, "title overlaps CREATURE N");
    assert.ok(title.x + title.width <= creature.x - 20, "title needs a readable gap before CREATURE N");
    assert.equal(intersects(badge, title), false, "badge overlaps title");
    assert.equal(intersects(artFrame, title), false, "art frame overlaps title");
    assert.equal(intersects(artFrame, traits), false, "art frame overlaps traits");
    for (const child of geometry.children) {
      assert.ok(child.x >= -1 && child.y >= -1, `${child.name} begins outside card`);
      assert.ok(child.x + child.width <= geometry.width + 1, `${child.name} crosses card width`);
      assert.ok(child.y + child.height <= geometry.height + 1, `${child.name} crosses card height`);
    }
    assert.ok(geometry.height - (finalRule.y + finalRule.height) <= 24, "card leaves excessive bottom whitespace");

    const screenshot = PNG.sync.read(png);
    let artPixels = 0;
    for (let y = Math.ceil(art.y); y < Math.floor(art.y + art.height); y += 1) for (let x = Math.ceil(art.x); x < Math.floor(art.x + art.width); x += 1) {
      const offset = (y * screenshot.width + x) * 4;
      const [r, g, b] = screenshot.data.subarray(offset, offset + 3);
      if (Math.abs(r - 250) + Math.abs(g - 248) + Math.abs(b - 242) > 30) artPixels += 1;
    }
    assert.ok(artPixels > 200, "art frame rendered as blank");

    const goldenPath = path.join(goldenDirectory, `${name}.png`);
    if (updateGoldens) {
      fs.mkdirSync(goldenDirectory, { recursive: true });
      fs.writeFileSync(goldenPath, png);
      return;
    }
    assert.ok(fs.existsSync(goldenPath), `missing approved golden: ${goldenPath}`);
    const expected = PNG.sync.read(fs.readFileSync(goldenPath));
    assert.equal(`${expected.width}x${expected.height}`, `${screenshot.width}x${screenshot.height}`, "golden dimensions changed");
    const diff = new PNG({ width: screenshot.width, height: screenshot.height });
    const changed = pixelmatch(expected.data, screenshot.data, diff.data, screenshot.width, screenshot.height, { threshold: 0.08, includeAA: false });
    if (changed) {
      fs.mkdirSync(diffDirectory, { recursive: true });
      fs.writeFileSync(path.join(diffDirectory, `${name}.diff.png`), PNG.sync.write(diff));
    }
    assert.ok(changed <= 80, `image changed by ${changed} pixels; inspect ${path.join(diffDirectory, `${name}.diff.png`)}`);
  });
}