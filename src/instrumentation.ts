// Next instrumentation hook: старт фонового воркера подач вместе с сервером.
// Отключение: WORKER_DISABLED=1 (например, при локальных e2e-прогонах).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.WORKER_DISABLED === "1") {
    console.log("[worker] отключён (WORKER_DISABLED=1)");
    return;
  }
  const { startWorkerLoop } = await import("@/lib/worker/loop");
  startWorkerLoop();
}
