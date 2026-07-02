// Общий клиент adilet.zan.kz (превью + облачный воркер).
// adilet не отдаёт промежуточный сертификат цепочки → штатный fetch (undici, Mozilla CA)
// падает UNABLE_TO_VERIFY_LEAF_SIGNATURE. Python-контур работает так же (verify=False).
// TODO Б6 (docs/architecture/09): закреплённый CA-bundle вместо отключения проверки.
import { request as httpsRequest } from "node:https";

export function fetchAdilet(path: string, timeoutMs = 20000, depth = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: "adilet.zan.kz", path, method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (reestr-preview)" },
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location && depth < 2) {
        res.resume();
        const loc = res.headers.location.replace(/^https?:\/\/adilet\.zan\.kz/, "");
        resolve(fetchAdilet(loc, timeoutMs, depth + 1));
        return;
      }
      if (code >= 400) { res.resume(); reject(new Error("adilet HTTP " + code)); return; }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });
    req.on("timeout", () => req.destroy(new Error("adilet timeout")));
    req.on("error", reject);
    req.end();
  });
}
