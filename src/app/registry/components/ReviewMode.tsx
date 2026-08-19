"use client";
/* Режим «Ревью»: очередь подтверждения госоргана. Самодостаточный стейт;
   reload-колбэк регистрируется в page (Drawer после действия обновляет очередь). */
import { useCallback, useEffect, useState } from "react";
import { minShort, reviewLabel, type Req } from "../lib";
import { DICT, type Lang } from "../i18n";

export default function ReviewMode({ onOpen, registerReload, lang = "ru" }:
  { onOpen: (r: Req) => void; registerReload: (fn: () => void) => void; lang?: Lang }) {
  const t = DICT[lang];
  const [rq, setRq] = useState<any>(null);
  const [rqStatus, setRqStatus] = useState("pending");
  const [rqPage, setRqPage] = useState(1);
  const [rqQ, setRqQ] = useState("");
  const [rqQd, setRqQd] = useState("");
  const [rqSel, setRqSel] = useState<number[]>([]);
  const [rqAra, setRqAra] = useState<string>(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 2); return d.toISOString().slice(0, 10); });
  const [rqBusy, setRqBusy] = useState(false);
  const [pageInput, setPageInput] = useState("1"); // прямой переход к странице
  // каскадный фильтр: орган → комитет → НПА (видимость селектов зависит от скоупа роли)
  const [rqOrg, setRqOrg] = useState("");
  const [rqCom, setRqCom] = useState("");
  const [rqNgr, setRqNgr] = useState("");

  useEffect(() => { const t = setTimeout(() => setRqQd(rqQ), 400); return () => clearTimeout(t); }, [rqQ]);
  const loadReviewQueue = useCallback(() => {
    const p = new URLSearchParams({ status: rqStatus, page: String(rqPage), limit: "20" });
    if (rqQd) p.set("q", rqQd);
    const auth = rqCom || rqOrg;
    if (auth) p.set("authority", auth);
    if (rqNgr) p.set("ngr", rqNgr);
    fetch(`/api/registry/review-queue?${p}`).then((r) => r.json()).then((d) => { setRq(d); setRqSel([]); }).catch(() => {});
  }, [rqStatus, rqPage, rqQd, rqOrg, rqCom, rqNgr]);
  useEffect(() => { loadReviewQueue(); }, [loadReviewQueue]);
  useEffect(() => { setPageInput(String(rqPage)); }, [rqPage]);

  const jumpTo = (raw: string) => {
    const pages = Number(rq?.pages || 1);
    const n = Math.min(pages, Math.max(1, parseInt(raw, 10) || 1));
    setPageInput(String(n));
    if (n !== rqPage) setRqPage(n);
  };
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
        <h1>{t.rvH1}</h1>
        <p>{t.rvSub}</p>
      </div>
      {!rq ? <div className="reg-empty">{t.loading}</div> : rq.noAuthorities ? (
        <div className="reg-empty">{t.rvNoAuth}</div>
      ) : (
        <>
          <div className="reg-cost-summary">
            <div className="reg-cost-stat"><b>{Number(rq.counts?.pending || 0).toLocaleString("ru")}</b><span>{t.rvPending}</span></div>
            <div className="reg-cost-stat"><b>{Number(rq.counts?.confirmed || 0).toLocaleString("ru")}</b><span>{t.rvConfirmed}</span></div>
            <div className="reg-cost-stat"><b>{Number(rq.counts?.rejected || 0).toLocaleString("ru")}</b><span>{t.rvRejected}</span></div>
          </div>
          <div className="reg-dupe-toolbar">
            {([["pending", t.rvTabPending], ["confirmed", t.rvTabConfirmed], ["rejected", t.rvTabRejected], ["all", t.rvTabAll]] as [string, string][]).map(([v, l]) => (
              <button key={v} className={"reg-stage-pill" + (rqStatus === v ? " on" : "")} onClick={() => { setRqStatus(v); setRqPage(1); }}>{l}</button>
            ))}
            <input className="reg-mtd-row" style={{ flex: 1, minWidth: 160, height: 34, border: "1px solid var(--line)", borderRadius: 8, padding: "0 11px", fontSize: 13 }} placeholder={t.rvSearchPh} value={rqQ} onChange={(e) => setRqQ(e.target.value)} />
          </div>
          {(() => {
            const SEL: React.CSSProperties = { height: 34, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px", fontSize: 13, maxWidth: 280, background: "#fff" };
            const fa: { code: string; name_ru: string; short_name: string | null; parent_code: string | null; n: number }[] = rq.facets?.authorities || [];
            const codes = new Set(fa.map((a) => a.code));
            const roots = fa.filter((a) => !a.parent_code || !codes.has(a.parent_code));
            const effRoot = rqOrg || (roots.length === 1 ? roots[0].code : "");
            const coms = fa.filter((a) => a.parent_code === effRoot);
            const npas: { ngr: string; npa_title: string; n: number }[] = rq.facets?.npas || [];
            if (roots.length <= 1 && !coms.length && npas.length <= 1) return null;
            return (
              <div className="reg-dupe-toolbar" style={{ flexWrap: "wrap" }}>
                {roots.length > 1 && (
                  <select value={rqOrg} onChange={(e) => { setRqOrg(e.target.value); setRqCom(""); setRqNgr(""); setRqPage(1); }} style={SEL}>
                    <option value="">{t.rvAllOrgans}</option>
                    {roots.map((o) => <option key={o.code} value={o.code}>{(o.short_name || o.name_ru).slice(0, 40)} ({o.n})</option>)}
                  </select>
                )}
                {coms.length > 0 && (
                  <select value={rqCom} onChange={(e) => { setRqCom(e.target.value); setRqNgr(""); setRqPage(1); }} style={SEL}>
                    <option value="">{t.rvAllCommittees}</option>
                    {coms.map((c) => <option key={c.code} value={c.code}>{(c.short_name || c.name_ru).slice(0, 40)} ({c.n})</option>)}
                  </select>
                )}
                {npas.length > 0 && (
                  <select value={rqNgr} onChange={(e) => { setRqNgr(e.target.value); setRqPage(1); }} style={{ ...SEL, maxWidth: 460, flex: 1 }}>
                    <option value="">{t.rvAllNpa}</option>
                    {npas.map((n) => <option key={n.ngr} value={n.ngr}>{(n.npa_title || n.ngr).slice(0, 75)} ({n.n})</option>)}
                  </select>
                )}
              </div>
            );
          })()}
          {rqStatus === "pending" && (
            <div className="reg-rev-bulk">
              <label>{t.rvAra} <input type="date" value={rqAra} onChange={(e) => setRqAra(e.target.value)} /></label>
              <span className="reg-cost-hint">{t.rvSelected} {rqSel.length}</span>
              <button className="reg-rev-confirm" disabled={!rqSel.length || rqBusy} onClick={() => reviewBulk("confirm")}>{t.rvConfirmSel}</button>
              <button className="reg-rev-reject" disabled={!rqSel.length || rqBusy} onClick={() => reviewBulk("reject")}>{t.rvRejectSel}</button>
              <button className="reg-rev-all" onClick={() => setRqSel(rqSel.length === rq.items.length && rq.items.length ? [] : rq.items.map((x: Req) => x.id))}>{rqSel.length === rq.items.length && rq.items.length ? t.rvUnselectAll : t.rvPickPage}</button>
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
                {r.is_canonical === false && (
                  <span className="reg-rb reg-rb-ara" title={t.bDupTitle}>{t.bDup}</span>
                )}
                {(r as Req & { dup_suspect?: boolean | null }).dup_suspect && r.is_canonical !== false && (
                  <span className="reg-rb reg-rb-ara" title={t.rvDupSuspectTitle}>{t.rvDupSuspect}</span>
                )}
                {r.source === "manual" && (
                  <span className="reg-rb reg-rb-edited" title={t.rvManualTitle}>{t.rvManual}</span>
                )}
                <span className={"reg-rb reg-rb-" + (r.review_status || "")}>{reviewLabel(r.review_status || "", lang)}</span>
              </div>
            ))}
            {!rq.items.length && <div className="reg-empty">{t.rvEmpty}</div>}
          </div>
          {rq.pages > 1 && (
            <div className="reg-rev-pager">
              <button disabled={rqPage <= 1} onClick={() => setRqPage(1)} title={t.rvToStart}>⇤</button>
              <button disabled={rqPage <= 1} onClick={() => setRqPage(rqPage - 1)}>←</button>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") jumpTo(pageInput); }}
                  onBlur={() => jumpTo(pageInput)}
                  inputMode="numeric"
                  title={t.rvPageInput}
                  style={{ width: 64, height: 30, textAlign: "center", border: "1px solid var(--line)", borderRadius: 7, fontSize: 13, fontWeight: 600 }}
                />
                <span>/ {Number(rq.pages).toLocaleString("ru")}</span>
              </span>
              <button disabled={rqPage >= rq.pages} onClick={() => setRqPage(rqPage + 1)}>→</button>
              <button disabled={rqPage >= rq.pages} onClick={() => setRqPage(rq.pages)} title={t.rvToEnd}>⇥</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
