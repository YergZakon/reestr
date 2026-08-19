"use client";
/* Режим «Управление НПА» (только admin/МНЭ): ГО → подразделение → НПА → статьи.
   Действия: передать НПА целиком или выбранные статьи в ЛЮБОЙ орган
   (межминистерский перенос), исключить/вернуть НПА или статьи.
   Кнопки «отменить» нет — историю хранит журнал, исправление = новый перенос. */
import { useCallback, useEffect, useState } from "react";
import { type Lang } from "../i18n";
import { MDICT } from "../i18n-modes";

interface OrgNode { id: number; code: string; parent_id: number | null; type: string; name_ru: string; short_name: string | null; active?: boolean }
interface NpaRow {
  ngr: string; npa_title: string; unit_path: string | null; articles_cnt: number;
  reqs: number; confirmed: number; pending: number; excluded_cnt: number;
  assignments: { org: string; articles: string[] | null }[] | null;
}
interface ArtRow { article: string; reqs: number; live: number; excluded: number; authority_code: string | null; authority_name: string | null }
interface LogRow { id: number; ngr: string; status: string; reason: string | null; articles: string[] | null; created_at: string; target_name: string; by_name: string | null }

export default function NpaAdminMode({ lang = "ru" }: { lang?: Lang }) {
  const t = MDICT[lang];
  const [orgs, setOrgs] = useState<OrgNode[]>([]);
  const [rootId, setRootId] = useState<string>("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<NpaRow[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [sel, setSel] = useState<NpaRow | null>(null);
  const [arts, setArts] = useState<ArtRow[] | null>(null);   // null = статьи не загружены
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(false); // успех/ошибка — для цвета (не по тексту: он локализован)

  useEffect(() => {
    fetch("/api/organizations").then((r) => r.json()).then((d) => {
      const all: OrgNode[] = d.organizations || [];
      setOrgs(all);
      const first = all.find((o) => o.parent_id == null);
      if (first) setRootId(String(first.id));
    }).catch(() => {});
  }, []);
  useEffect(() => { const t = setTimeout(() => setQd(q), 400); return () => clearTimeout(t); }, [q]);

  const load = useCallback(() => {
    if (!rootId) return;
    const p = new URLSearchParams({ org_id: rootId, page: String(page) });
    if (qd) p.set("q", qd);
    fetch(`/api/npa-admin?${p}`).then((r) => r.json()).then((d) => {
      if (d.error) { setMsg(d.error); setMsgOk(false); return; }
      setItems(d.items || []); setLog(d.log || []);
      setSel(null); setArts(null); setChecked(new Set()); setMsg("");
    }).catch(() => { setMsg(t.nmLoadFail); setMsgOk(false); });
  }, [rootId, page, qd, t]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [rootId, qd]);

  const loadArts = (ngr: string) => {
    setArts(null); setChecked(new Set());
    fetch(`/api/npa-admin?ngr=${encodeURIComponent(ngr)}&articles=1`)
      .then((r) => r.json()).then((d) => setArts(d.articles || []))
      .catch(() => { setMsg(t.nmArtsFail); setMsgOk(false); });
  };

  const act = (action: "transfer" | "exclude" | "restore", useArticles: boolean) => {
    if (!sel) return;
    const articles = useArticles ? Array.from(checked) : undefined;
    if (useArticles && !articles?.length) { setMsg(t.nmMarkArts); setMsgOk(false); return; }
    if (action === "transfer" && !target) { setMsg(t.nmPickTarget); setMsgOk(false); return; }
    if (action === "exclude" && reason.trim().length < 5) { setMsg(t.nmReasonRequired); setMsgOk(false); return; }
    setBusy(true); setMsg("");
    fetch("/api/npa-admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ngr: sel.ngr, articles: articles || null,
        target_org_id: action === "transfer" ? Number(target) : undefined, reason: reason || null }),
    }).then((r) => r.json()).then((d) => {
      if (d.error) { setMsg(d.error); setMsgOk(false); return; }
      setMsg(action === "transfer"
        ? t.nmTransferred(d.target, d.cascaded)
        : action === "exclude" ? t.nmExcludedN(d.affected) : t.nmRestoredN(d.affected));
      setMsgOk(true);
      load();
    }).catch(() => { setMsg(t.nmOpFail); setMsgOk(false); }).finally(() => setBusy(false));
  };

  const roots = orgs.filter((o) => o.parent_id == null);
  // дерево целевых органов: корень + всё поддерево с отступами (любой орган)
  const targetOptions: { id: number; label: string }[] = [];
  const walk = (p: OrgNode, d: number) => {
    targetOptions.push({ id: p.id, label: `${" ".repeat(d * 3)}${d ? "└ " : ""}${p.short_name || p.name_ru}` });
    orgs.filter((c) => c.parent_id === p.id).forEach((c) => walk(c, d + 1));
  };
  roots.forEach((r) => walk(r, 0));

  return (
    <div className="reg-biz">
      <div className="reg-biz-hero">
        <h1>{t.nmH1}</h1>
        <p>{t.nmHero}</p>
      </div>

      <div className="reg-dupe-toolbar" style={{ flexWrap: "wrap" }}>
        <select value={rootId} onChange={(e) => setRootId(e.target.value)}
          style={{ height: 34, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px", fontSize: 13, maxWidth: 340 }}>
          {roots.map((o) => <option key={o.id} value={o.id}>{o.short_name || o.name_ru}</option>)}
        </select>
        <input placeholder={t.nmSearchPh} value={q} onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 180, height: 34, border: "1px solid var(--line)", borderRadius: 8, padding: "0 11px", fontSize: 13 }} />
      </div>
      {msg && <div className="reg-cost-hint" style={{ margin: "8px 0", color: msgOk ? "#2E6B4F" : "#A32D2D" }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, alignItems: "start" }}>
        {/* список НПА органа */}
        <div className="reg-rev-list">
          {items.map((it) => (
            <div key={it.ngr} className="reg-rev-row" style={sel?.ngr === it.ngr ? { outline: "2px solid var(--accent, #2E6B4F)", borderRadius: 8 } : undefined}>
              <div className="reg-rev-main" onClick={() => { setSel(it); setArts(null); setChecked(new Set()); setTarget(""); setReason(""); setMsg(""); }}>
                <div className="reg-rev-t">{it.npa_title || it.ngr}</div>
                <div className="reg-rev-m">
                  {it.unit_path ? <>{t.nmUnit} <b>{it.unit_path}</b> · </> : null}
                  {it.ngr} · {t.nmArtsLabel(it.articles_cnt)} · {t.nmReqsLabel(it.reqs)}
                  {it.excluded_cnt ? <> · <span style={{ color: "#A32D2D" }}>{t.nmExcludedLabel(it.excluded_cnt)}</span></> : null}
                  {it.assignments?.length
                    ? <>{t.nmAssignments(it.assignments.map((a) => a.articles ? `${a.org} ${t.nmArtsSuffix}` : a.org).join("; ").slice(0, 90))}</>
                    : null}
                </div>
              </div>
            </div>
          ))}
          {!items.length && <div className="reg-empty">{t.nmNoNpa}</div>}
          <div className="reg-rev-pager">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
            <span>{t.nmPage(page)}</span>
            <button disabled={items.length < 20} onClick={() => setPage(page + 1)}>→</button>
          </div>
        </div>

        {/* панель операций */}
        <div className="reg-cost-params">
          {!sel ? (
            <div className="reg-empty">{t.nmPickLeft}</div>
          ) : (
            <>
              <div className="reg-cost-params-h"><span>{t.nmOpsH}</span></div>
              <div style={{ fontWeight: 650, fontSize: 14.5, lineHeight: 1.4 }}>{sel.npa_title || sel.ngr}</div>
              <div className="reg-cost-hint" style={{ marginTop: 4 }}>
                {sel.ngr} · {t.nmSelInfo(sel.reqs, sel.confirmed, sel.pending)}
                {sel.excluded_cnt ? t.nmSelExcluded(sel.excluded_cnt) : ""}
              </div>

              {/* статьи */}
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t.nmArticles(sel.articles_cnt)}</span>
                {!arts && <button className="reg-stage-pill" onClick={() => loadArts(sel.ngr)}>{t.nmShow}</button>}
                {arts && checked.size > 0 && <span className="reg-cost-hint">{t.nmChecked(checked.size)}</span>}
              </div>
              {arts && (
                <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 9, padding: 8, marginTop: 6, display: "grid", gap: 4 }}>
                  {arts.map((a) => (
                    <label key={a.article} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, cursor: "pointer" }}>
                      <input type="checkbox" checked={checked.has(a.article)}
                        onChange={(e) => { const s = new Set(checked); if (e.target.checked) s.add(a.article); else s.delete(a.article); setChecked(s); }} />
                      <span style={{ fontWeight: 600 }}>{a.article}</span>
                      <span className="reg-cost-hint">{t.nmNorms(a.live)}{a.excluded ? t.nmExclShort(a.excluded) : ""} · {a.authority_name || a.authority_code || "—"}</span>
                    </label>
                  ))}
                  {!arts.length && <div className="reg-empty">{t.nmNoArts}</div>}
                </div>
              )}

              {/* целевой орган + основание */}
              <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600 }}>{t.nmTarget}</div>
              <select value={target} onChange={(e) => setTarget(e.target.value)}
                style={{ width: "100%", height: 36, marginTop: 6, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }}>
                <option value="">{t.nmTargetPh}</option>
                {targetOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600 }}>{t.nmReason}</div>
              <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} rows={2}
                placeholder={t.nmReasonPh}
                style={{ width: "100%", marginTop: 6, border: "1px solid var(--line)", borderRadius: 8, padding: 9, fontSize: 13 }} />
              <div className="reg-cost-hint" style={{ textAlign: "right" }}>{reason.length} / 500</div>

              {/* действия */}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="reg-rev-confirm" disabled={busy || !target} onClick={() => act("transfer", false)}>{t.nmTransferAll}</button>
                <button className="reg-rev-confirm" disabled={busy || !target || !checked.size} onClick={() => act("transfer", true)}>{t.nmTransferArts}</button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button className="reg-rev-reject" disabled={busy} onClick={() => act("exclude", false)}>{t.nmExcludeNpa}</button>
                <button className="reg-rev-reject" disabled={busy || !checked.size} onClick={() => act("exclude", true)}>{t.nmExcludeArts}</button>
                {(sel.excluded_cnt > 0 || checked.size > 0) && (
                  <button className="reg-stage-pill" disabled={busy} onClick={() => act("restore", checked.size > 0)}>
                    {checked.size ? t.nmRestoreChecked : t.nmRestoreExcluded}
                  </button>
                )}
              </div>
              <div className="reg-cost-hint" style={{ marginTop: 8 }}>
                {t.nmSeqHint}
              </div>
            </>
          )}
        </div>
      </div>

      {/* журнал */}
      <div className="reg-biz-blockh reg-biz-blockh-lg" style={{ marginTop: 22 }}>{t.nmLog}<span className="reg-biz-blockh-cnt">{log.length}</span></div>
      <div className="reg-rev-list">
        {log.map((l) => (
          <div key={l.id} className="reg-rev-row">
            <div className="reg-rev-main">
              <div className="reg-rev-t">{l.ngr} → {l.target_name}{l.articles ? t.nmLogArts(`${l.articles.slice(0, 4).join(", ")}${l.articles.length > 4 ? "…" : ""}`) : ""}</div>
              <div className="reg-rev-m">
                {String(l.created_at).slice(0, 16).replace("T", " ")} · {l.by_name || "—"}
                {l.reason ? t.nmReasonShort(l.reason.slice(0, 80)) : ""}
              </div>
            </div>
            <span className={"reg-rb " + (l.status === "назначено" ? "reg-rb-confirmed" : "reg-rb-rejected")}>{t.nmStatusLabel[l.status] || l.status}</span>
          </div>
        ))}
        {!log.length && <div className="reg-empty">{t.nmNoLog}</div>}
      </div>
    </div>
  );
}
