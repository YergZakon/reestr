// Контракт промпта SYSTEM_EXTRACT: воркер (TS) ↔ Python-конвейер.
// Python-сторона: требования/tests/test_prompt_contract.py (тот же SHA).
// Запуск: npm run test:prompts
import { createHash } from "node:crypto";
import { SYSTEM_EXTRACT } from "../../src/lib/worker/prompts";

// Синхронно с требования/tests/test_prompt_contract.py
const SYSTEM_EXTRACT_SHA256 = "878a924a10eb8291095cbdfcbf6fe97d72eccc9cd7f433095e416f4d42898301";

const actual = createHash("sha256").update(SYSTEM_EXTRACT, "utf-8").digest("hex");
if (actual !== SYSTEM_EXTRACT_SHA256) {
  console.error(`ПРОВАЛ контракта промпта: sha=${actual}, ожидался ${SYSTEM_EXTRACT_SHA256}`);
  console.error("Промпт воркера разошёлся с Python-каноном — синхронизируй оба текста и оба SHA.");
  process.exit(1);
}
console.log("Контракт промпта SYSTEM_EXTRACT: OK (sha совпадает с Python-каноном).");
