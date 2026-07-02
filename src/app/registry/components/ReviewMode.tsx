"use client";
/* Режим «Ревью»: очередь подтверждения госоргана. Самодостаточный стейт;
   reload-колбэк регистрируется в page (Drawer после действия обновляет очередь). */
import { useCallback, useEffect, useState } from "react";
import { minShort, REVIEW_LABEL, type Req } from "../lib";

export default function ReviewMode({ onOpen, registerReload }:
  { onOpen: (r: Req) => void; registerReload: (fn: () => void) => void }) {
  const [rq, setRq] = useState<any>(null);
  const [rqStatus, setRqStatus] = useState("pending");
  const [rqPage, setRqPage] = useState(1);
  const [rqQ, setRqQ] = useState("");
  const [rqQd, setRqQd] = useState("");
  const [rqSel, setRqSel] = useState<number[]>([]);
  const [rqAra, setRqAra] = useState<string>(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 2); return d.toISOString().slice(0, 10); });
  const [rqBusy, setRqBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => setRqQd(rqQ), 400); return () => clearTimeout(t); }, [rqQ]);
  const loadReviewQueue = useCallback(() => {
    const p = new URLSearchParams({ status: rqStatus, page: String(rqPage), limit: "20" });
    if (rqQd) p.set("q", rqQd);
    fetch(`/api/registry/review-queue?${p}`).then((r) => r.json()).then((d) => { setRq(d); setRqSel([]); }).catch(() => {});
  }, [rqStatus, rqPage, rqQd]);
  useEffect(() => { loadReviewQueue(); }, [loadReviewQueue]);
  useEffect(() => { registerReload(loadReviewQueue); }, [registerReload, loadReviewQueue]);

  const reviewBulk = (action: string) => {
    if (!rqSel.length) return;
    setRqBusy(true);
    const body: Record<string, unknown> = { ids: rqSel, action };
    if (action === "confirm") body.ara_deadline = rqAra;
    fetch("/api/registry/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (!ok) alert(j.error || "Ошибка"); loadReviewQueue(); })
      .finally(() => setRqBusy(false));
  };

  return (
    <div className="reg-biz">
      <div className="reg-biz-hero">
        <h1>Подтверждение требований госорганом</h1>
        <p>Извлечённые требования вашего органа — подтвердите, отклоните или поправьте. Подтверждённые включаются в реестр после согласования с уполномоченным органом (МНЭ). Срок проведения АРА обязателен при подтверждении.</p>
      </div>
      {!rq ? <div className="reg-empty">Загрузка…</div> : rq.noAuthorities ? (
        <div className="reg-empty">Вам не назначены органы. Обратитесь к администратору (МНЭ) для назначения.</div>
      ) : (
        <>
          <div className="reg-cost-summary">
            <div className="reg-cost-stat"><b>{Number(rq.counts?.pending || 0).toLocaleString("ru")}</b><span>на подтверждении</span></div>
            <div className="reg-cost-stat"><b>{Number(rq.counts?.confirmed || 0).toLocaleString("ru")}</b><span>подтверждено</span></div>
            <div className="reg-cost-stat"><b>{Number(rq.counts?.rejected || 0).toLocaleString("ru")}</b><span>отклонено</span></div>
          </div>
          <div className="reg-dupe-toolbar">
            {([["pending", "На подтверждении"], ["confirmed", "Подтверждённые"], ["rejected", "Отклонённые"], ["all", "Все"]] as [string, string][]).map(([v, l]) => (
              <button key={v} className={"reg-stage-pill" + (rqStatus === v ? " on" : "")} onClick={() => { setRqStatus(v); setRqPage(1); }}>{l}</button>
            ))}
            <input className="reg-mtd-row" style={{ flex: 1, minWidth: 160, height: 34, border: "1px solid var(--line)", borderRadius: 8, padding: "0 11px", fontSize: 13 }} placeholder="Поиск по тексту / ngr…" value={rqQ} onChange={(e) => setRqQ(e.target.value)} />
          </div>
          {rqStatus === "pending" && (
            <div className="reg-rev-bulk">
              <label>Срок АРА <input type="date" value={rqAra} onChange={(e) => setRqAra(e.target.value)} /></label>
              <span className="reg-cost-hint">Выбрано: {rqSel.length}</span>
              <button className="reg-rev-confirm" disabled={!rqSel.length || rqBusy} onClick={() => reviewBulk("confirm")}>Подтвердить выбранные</button>
              <button className="reg-rev-reject" disabled={!rqSel.length || rqBusy} onClick={() => reviewBulk("reject")}>Отклонить выбранные</button>
              <button className="reg-rev-all" onClick={() => setRqSel(rqSel.length === rq.items.length && rq.items.length ? [] : rq.items.map((x: Req) => x.id))}>{rqSel.length === rq.items.length && rq.items.length ? "Снять все" : "Выбрать страницу"}</button>
            </div>
          )}
          <div className="reg-rev-list">
            {rq.items.map((r: Req) => (
              <div key={r.id} className="reg-rev-row">
                {rqStatus === "pending" && <input type="checkbox" checked={rqSel.includes(r.id)} onChange={(e) => setRqSel(e.target.checked ? [...rqSel, r.id] : rqSel.filter((x) => x !== r.id))} />}
                <div className="reg-rev-main" onClick={() => onOpen(r)}>
                  <div className="reg-rev-t">{r.title || r.action}</div>
                  <div className="reg-rev-m">{r.ngr}{r.article ? ` · ${r.article}` : ""} · {minShort(r.ministry)}{r.sphere_name ? ` · ${r.sphere_name}` : ""}</div>
                </div>
                {(r as Req & { dup_suspect?: boolean | null }).dup_suspect && (
                  <span className="reg-rb reg-rb-ara" title="Похожее требование уже есть в реестре — проверьте перед подтверждением">возможный дубль</span>
                )}
                <span className={"reg-rb reg-rb-" + (r.review_status || "")}>{REVIEW_LABEL[r.review_status || ""] || r.review_status}</span>
              </div>
            ))}
            {!rq.items.length && <div className="reg-empty">Нет требований в этом статусе.</div>}
          </div>
          {rq.pages > 1 && (
            <div className="reg-rev-pager">
              <button disabled={rqPage <= 1} onClick={() => setRqPage(rqPage - 1)}>←</button>
              <span>{rqPage} / {rq.pages}</span>
              <button disabled={rqPage >= rq.pages} onClick={() => setRqPage(rqPage + 1)}>→</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
