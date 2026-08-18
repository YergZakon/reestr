"use client";
/* Правовой мониторинг по ЗАН: события «утратил силу» / «новая редакция» по НПА
   органа (admin/mne — все). Суточная сверка с базой законодательства — воркер.
   Решения — за органом: исключить карточки, переподать акт, отметить обработанным. */
import { useCallback, useEffect, useState } from "react";

interface ZanEvent {
  id: number; ngr: string; authority_code: string; authority_name: string | null;
  event_type: "repealed" | "amended"; npa_title: string | null; req_count: number | null;
  details: Record<string, unknown> | null; detected_at: string; status: string;
  status_note: string | null; status_by_name: string | null; status_at: string | null;
  live_total: number | null; live_confirmed: number | null;
  live_pending: number | null; live_rejected: number | null;
}

const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("ru",
  { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

export default function ZanMonitorMode() {
  const [tab, setTab] = useState<"new" | "acked" | "processed" | "all">("new");
  const [items, setItems] = useState<ZanEvent[]>([]);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`/api/zan-events?status=${tab}&page=${page}`).then((r) => r.json()).then((d) => {
      setItems(d.items || []); setLastCheck(d.last_check);
      setCounts(d.counts || {}); setPages(d.pages || 1);
    }).catch(() => {});
  }, [tab, page]);
  useEffect(() => { load(); }, [load]);
  const openTab = (t: typeof tab) => { setTab(t); setPage(1); };
  const allCount = (counts["new"] || 0) + (counts["acked"] || 0) + (counts["processed"] || 0);
  const n = (x?: number) => (x ? ` (${x})` : "");

  const act = (id: number, action: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(id); setMsg("");
    fetch("/api/zan-events", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: id, action }) })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setMsg(d.error); return; }
        if (action === "exclude_cards") setMsg(`Снято с учёта карточек: ${d.cards}`);
        if (action === "resubmit") setMsg(`Акт переподан на извлечение (подача #${d.submission_id}) — новая редакция разберётся автоматически.`);
        load();
      })
      .catch(() => setMsg("Сбой запроса"))
      .finally(() => setBusy(null));
  };

  const stale = lastCheck && Date.now() - new Date(lastCheck).getTime() > 48 * 3600_000;

  return (
    <div className="reg-mon">
      <h1 className="reg-cat-h1">Правовой мониторинг (база ЗАН)</h1>
      <div className="reg-cat-sub">
        Ежедневная сверка НПА реестра с эталонной базой законодательства: утрата силы и новые редакции.
        Решение по каждому событию принимает орган.
        {lastCheck && (
          <span style={{ marginLeft: 8, color: stale ? "#A32D2D" : undefined }}>
            Последняя сверка: {dt(lastCheck)}{stale ? " — данные устарели (>48 ч)" : ""}
          </span>
        )}
      </div>

      <div className="reg-mon-tabs">
        <button className={tab === "new" ? "on" : ""} onClick={() => openTab("new")}>
          Новые{n(counts["new"])}</button>
        <button className={tab === "acked" ? "on" : ""} onClick={() => openTab("acked")}>
          Принятые{n(counts["acked"])}</button>
        <button className={tab === "processed" ? "on" : ""} onClick={() => openTab("processed")}>
          Обработанные{n(counts["processed"])}</button>
        <button className={tab === "all" ? "on" : ""} onClick={() => openTab("all")}>
          Все{n(allCount)}</button>
      </div>
      {msg && <div className="reg-cost-hint" style={{ margin: "8px 0" }}>{msg}</div>}

      <div className="reg-rev-list">
        {items.map((e) => (
          <div key={e.id} className="reg-rev-row" style={{ alignItems: "flex-start" }}>
            <div className="reg-rev-main">
              <div className="reg-rev-t">
                <span className={"reg-rb " + (e.event_type === "repealed" ? "reg-rb-rejected" : "reg-rb-ara")}
                  style={{ marginRight: 8, marginLeft: 0 }}>
                  {e.event_type === "repealed" ? "утратил силу" : `новая редакция от ${String(e.details?.new_dl || "")}`}
                </span>
                {(e.npa_title || e.ngr).slice(0, 130)}
              </div>
              <div className="reg-rev-m">
                <a className="reg-d-link" href={`https://adilet.zan.kz/rus/docs/${e.ngr}`} target="_blank" rel="noreferrer">{e.ngr}</a>
                {" · "}{e.authority_name || e.authority_code}
                {" · обнаружено "}{dt(e.detected_at)}
                {e.status !== "new" && <> · {e.status === "acked" ? "принято" : "обработано"} {e.status_by_name ? `(${e.status_by_name})` : ""}{e.status_note ? ` — ${e.status_note}` : ""}</>}
              </div>
              {/* сопоставление со стороны реестра: что сейчас стоит на учёте по акту */}
              <div className="reg-rev-m" style={{ marginTop: 2 }}>
                {e.live_total ? (
                  <>В реестре на учёте: <b>{e.live_total}</b> требований
                    {e.live_confirmed ? ` · ${e.live_confirmed} подтверждено` : ""}
                    {e.live_pending ? ` · ${e.live_pending} ожидает` : ""}
                    {e.live_rejected ? ` · ${e.live_rejected} отклонено` : ""}</>
                ) : (
                  <span style={{ color: "#2E7D46" }}>В реестре живых карточек не осталось — расхождение устранено.</span>
                )}
              </div>
            </div>
            {e.status !== "processed" && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {e.event_type === "repealed" && (
                  <button className="reg-tool-btn" disabled={busy === e.id}
                    onClick={() => act(e.id, "exclude_cards",
                      `Снять с учёта ${e.req_count ?? "все"} карточек НПА ${e.ngr} как утратившие силу? Действие обратимо.`)}>
                    Снять карточки с учёта
                  </button>
                )}
                {e.event_type === "amended" && (
                  <button className="reg-tool-btn" disabled={busy === e.id}
                    onClick={() => act(e.id, "resubmit",
                      `Переподать НПА ${e.ngr} на автоматическое извлечение новой редакции?`)}>
                    Переподать акт
                  </button>
                )}
                {e.status === "new" && (
                  <button className="reg-tool-btn" disabled={busy === e.id} onClick={() => act(e.id, "ack")}>Принято</button>
                )}
                <button className="reg-tool-btn" disabled={busy === e.id} onClick={() => act(e.id, "processed")}>Обработано</button>
              </div>
            )}
          </div>
        ))}
        {!items.length && (
          <div className="reg-empty">
            {tab === "new"
              ? "Расхождений с базой ЗАН нет — реестр синхронизирован: все утратившие силу акты сняты с учёта."
              : "Событий нет."}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 12 }}>
          <button className="reg-tool-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
          <span className="reg-rev-m">стр. {page} из {pages}</span>
          <button className="reg-tool-btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>→</button>
        </div>
      )}
    </div>
  );
}
