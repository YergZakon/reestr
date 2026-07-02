// Цикл облачного воркера: тик каждые 30 с, за тик обрабатывает подряд до 5 подач.
// Однопроцессный guard (busy) — Railway держит один инстанс; при рестарте контейнера
// зависшие задачи возвращаются в очередь по истечении lease (claimNext).
import { processOne } from "./pipeline";

let started = false;
let busy = false;

export function startWorkerLoop() {
  if (started) return;
  started = true;
  console.log("[worker] цикл запущен (тик 30 с)");
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      for (let i = 0; i < 5; i++) {
        const did = await processOne();
        if (!did) break;
      }
    } catch (e) {
      console.error("[worker] тик упал:", (e as Error).message);
    } finally {
      busy = false;
    }
  };
  setInterval(tick, 30_000);
  setTimeout(tick, 5_000); // первый прогон вскоре после старта
}
