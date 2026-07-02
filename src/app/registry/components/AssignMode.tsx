"use client";
/* Режим «Назначения»: ответственный комитет за НПА (admin | moderator).
   Поток по мокапу: госорган → список его НПА (с текущим назначением) →
   карточка НПА → выбор комитета + основание → назначить (каскад на требования,
   уведомление комитету) → журнал назначений. */
import { useCallback, useEffect, useState } from "react";

interface OrgNode { id: number; code: string; parent_id: number | null; type: string; name_ru: string; short_name: string | null }
interface NpaRow {
  ngr: string; npa_title: string; req_count: number; sphere_code: string | null;
  assignment_id: number | null; committee_name: string | null; committee_org_id: number | null; reason: string | null;
}
interface Committee { id: number; code: string; name_ru: string; short_name: string | null }
interface LogRow {
  id: number; ngr: string; status: string; reason: string | null; created_at: string;
  committee_name: string; assigned_by_name: string | null;
}

export default function AssignMode() {
  const [orgs, setOrgs] = useState<OrgNode[]>([]);
  const [minId, setMinId] = useState<string>("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [status, setStatus] = useState<"all" | "assigned" | "unassigned">("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<NpaRow[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [sel, setSel] = useState<NpaRow | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/organizations").then((r) => r.json()).then((d) => {
      const all: OrgNode[] = d.organizations || [];
      setOrgs(all);
      const firstMin = all.find((o) => o.type === "ministry" && o.parent_id == null);
      if (firstMin) setMinId(String(firstMin.id));
    }).catch(() => {});
  }, []);
  useEffect(() => { const t = setTimeout(() => setQd(q), 400); return () => clearTimeout(t); }, [q]);

  const load = useCallback(() => {
    if (!minId) return;
    const p = new URLSearchParams({ org_id: minId, status, page: String(page) });
    if (qd) p.set("q", qd);
    fetch(`/api/npa-assignment?${p}`).then((r) => r.json()).then((d) => {
      if (d.error) { setMsg(d.error); return; }
      setItems(d.items || []); setCommittees(d.committees || []); setLog(d.log || []);
      setSel(null); setPicked(null); setReason(""); setMsg("");
    }).catch(() => setMsg("Сбой загрузки"));
  }, [minId, status, page, qd]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [minId, status, qd]);

  const assign = () => {
    if (!sel || !picked) return;
    setBusy(true); setMsg("");
    fetch("/api/npa-assignment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ngr: sel.ngr, org_id: picked, reason: reason || null }),
    }).then((r) => r.json()).then((d) => {
      if (d.error) setMsg(d.error);
      else { setMsg(`Назначено: ${d.committee} — переведено требований: ${d.cascaded}. Комитет уведомлён.`); load(); }
    }).catch(() => setMsg("Сбой назначения")).finally(() => setBusy(false));
  };
  const cancel = () => {
    if (!sel) return;
    setBusy(true); setMsg("");
    fetch("/api/npa-assignment", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ngr: sel.ngr }),
    }).then((r) => r.json()).then((d) => {
      if (d.error) setMsg(d.error);
      else { setMsg(`Назначение отменено — требования возвращены на ${d.back_to} (${d.cascaded}).`); load(); }
    }).catch(() => setMsg("Сбой отмены")).finally(() => setBusy(false));
  };

  const ministries = orgs.filter((o) => o.type === "ministry" && o.parent_id == null);

  return (
    <div className="reg-biz">
      <div className="reg-biz-hero">
        <h1>Назначение ответственного комитета за НПА</h1>
        <p>Модератор определяет, какой комитет отвечает за конкретный НПА. Назначение применяется ко всем требованиям этого НПА (они переходят в очередь ревью комитета), комитет получает уведомление. Всё фиксируется в журнале с основанием.</p>
      </div>

      {/* фильтры */}
      <div className="reg-dupe-toolbar" style={{ flexWrap: "wrap" }}>
        <select value={minId} onChange={(e) => setMinId(e.target.value)}
          style={{ height: 34, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px", fontSize: 13 }}>
          {ministries.map((mo) => <option key={mo.id} value={mo.id}>{mo.short_name || mo.name_ru}</option>)}
        </select>
        {([["all", "Все"], ["unassigned", "Не назначен"], ["assigned", "Назначен"]] as const).map(([v, l]) => (
          <button key={v} className={"reg-stage-pill" + (status === v ? " on" : "")} onClick={() => setStatus(v)}>{l}</button>
        ))}
        <input placeholder="Поиск: наименование или ngr…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 180, height: 34, border: "1px solid var(--line)", borderRadius: 8, padding: "0 11px", fontSize: 13 }} />
      </div>
      {msg && <div className="reg-cost-hint" style={{ margin: "8px 0", color: msg.startsWith("Назнач") || msg.startsWith("Назначение") ? "#2E6B4F" : "#A32D2D" }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, alignItems: "start" }}>
        {/* список НПА */}
        <div className="reg-rev-list">
          {items.map((it) => (
            <div key={it.ngr} className="reg-rev-row" style={sel?.ngr === it.ngr ? { outline: "2px solid var(--accent, #2E6B4F)", borderRadius: 8 } : undefined}>
              <div className="reg-rev-main" onClick={() => { setSel(it); setPicked(it.committee_org_id); setReason(""); }}>
                <div className="reg-rev-t">{it.npa_title || it.ngr}</div>
                <div className="reg-rev-m">
                  {it.ngr} · требований: {it.req_count}
                  {" · комитет: "}
                  {it.committee_name
                    ? <b style={{ color: "#2E6B4F" }}>{it.committee_name}</b>
                    : <b style={{ color: "#A32D2D" }}>не назначен</b>}
                </div>
              </div>
            </div>
          ))}
          {!items.length && <div className="reg-empty">Нет НПА по фильтру.</div>}
          <div className="reg-rev-pager">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
            <span>стр. {page}</span>
            <button disabled={items.length < 15} onClick={() => setPage(page + 1)}>→</button>
          </div>
        </div>

        {/* панель назначения */}
        <div className="reg-cost-params">
          {!sel ? (
            <div className="reg-empty">Выберите НПА слева.</div>
          ) : (
            <>
              <div className="reg-cost-params-h"><span>Назначение ответственного комитета</span></div>
              <div style={{ fontWeight: 650, fontSize: 14.5, lineHeight: 1.4 }}>{sel.npa_title || sel.ngr}</div>
              <div className="reg-cost-hint" style={{ marginTop: 4 }}>
                {sel.ngr} · связанных требований: {sel.req_count}
                {sel.sphere_code ? ` · сфера: ${sel.sphere_code}` : ""}
              </div>
              <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600 }}>Выберите комитет</div>
              {!committees.length && <div className="reg-cost-hint" style={{ marginTop: 6 }}>У этого министерства нет комитетов в справочнике — добавьте узел в «Структуре органов».</div>}
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {committees.map((cm) => (
                  <label key={cm.id} style={{
                    display: "flex", gap: 8, alignItems: "center", padding: "8px 10px",
                    border: "1px solid " + (picked === cm.id ? "var(--accent, #2E6B4F)" : "var(--line)"),
                    borderRadius: 9, cursor: "pointer", fontSize: 13,
                    background: picked === cm.id ? "#F3F7F4" : "transparent",
                  }}>
                    <input type="radio" name="cmt" checked={picked === cm.id} onChange={() => setPicked(cm.id)} />
                    <span>{cm.short_name || cm.name_ru}</span>
                  </label>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600 }}>Основание назначения</div>
              <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} rows={3}
                placeholder="Укажите основание назначения (при необходимости)"
                style={{ width: "100%", marginTop: 6, border: "1px solid var(--line)", borderRadius: 8, padding: 9, fontSize: 13 }} />
              <div className="reg-cost-hint" style={{ textAlign: "right" }}>{reason.length} / 500</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="reg-rev-confirm" disabled={busy || !picked} onClick={assign}>Назначить комитет</button>
                {sel.assignment_id && (
                  <button className="reg-rev-reject" disabled={busy} onClick={cancel}>Отменить назначение</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* журнал назначений */}
      <div className="reg-biz-blockh reg-biz-blockh-lg" style={{ marginTop: 22 }}>Журнал назначений<span className="reg-biz-blockh-cnt">{log.length}</span></div>
      <div className="reg-rev-list">
        {log.map((l) => (
          <div key={l.id} className="reg-rev-row">
            <div className="reg-rev-main">
              <div className="reg-rev-t">{l.ngr} → {l.committee_name}</div>
              <div className="reg-rev-m">
                {String(l.created_at).slice(0, 16).replace("T", " ")} · {l.assigned_by_name || "—"}
                {l.reason ? ` · основание: ${l.reason.slice(0, 80)}` : ""}
              </div>
            </div>
            <span className={"reg-rb " + (l.status === "назначено" ? "reg-rb-confirmed" : "reg-rb-rejected")}>{l.status}</span>
          </div>
        ))}
        {!log.length && <div className="reg-empty">Назначений пока не было.</div>}
      </div>
    </div>
  );
}
