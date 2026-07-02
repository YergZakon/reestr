// Контрактный тест TS-чанкера (src/lib/npaParse.ts) против общих фикстур.
// Python-сторона: требования/tests/test_chunker_contract.py (те же фикстуры/expected.json —
// менять СИНХРОННО). Запуск: npm run test:chunker
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArticles } from "../../src/lib/npaParse";

const FIX = join(__dirname, "fixtures");
const expected = JSON.parse(readFileSync(join(FIX, "expected.json"), "utf-8"));

let failures = 0;
function check(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
}

function segs(name: string) {
  return parseArticles(readFileSync(join(FIX, `${name}.html`), "utf-8"));
}

console.log("[law] статьи закона по якорям");
{
  const arts = segs("law");
  const nums = arts.filter((a) => a.num).map((a) => a.num);
  check(JSON.stringify(nums) === JSON.stringify(expected.law.article_nums),
    `номера статей = ${JSON.stringify(expected.law.article_nums)} (получено ${JSON.stringify(nums)})`);
  check(arts.every((a) => a.label.startsWith("ст.")), "метки «ст.N»");
  const blob = arts.map((a) => a.text).join(" ");
  for (const p of expected.law.must_contain) check(blob.includes(p), `содержит «${p}»`);
}

console.log("[prikaz] пункт-блоки приказа (якоря без «Статья N»)");
{
  const arts = segs("prikaz");
  check(arts.length >= expected.prikaz.min_segments, `сегментов ≥ ${expected.prikaz.min_segments} (получено ${arts.length})`);
  check(arts.every((a) => a.label.startsWith("п.z")), "метки «п.zN» (deep-link-совместимые)");
  const blob = arts.map((a) => a.text).join(" ");
  for (const p of expected.prikaz.must_contain) check(blob.includes(p), `содержит «${p}»`);
}

console.log("[plain] документ без якорей → окна по тексту");
{
  const arts = segs("plain");
  check(arts.length >= expected.plain.min_segments, `сегментов ≥ ${expected.plain.min_segments} (получено ${arts.length})`);
  const blob = arts.map((a) => a.text).join(" ");
  for (const p of expected.plain.must_contain) check(blob.includes(p), `содержит «${p}»`);
}

if (failures) { console.error(`\nПРОВАЛ: ${failures} проверок`); process.exit(1); }
console.log("\nКонтракт чанкера: все проверки пройдены.");
