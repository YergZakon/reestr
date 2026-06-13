"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import "./registry.css";

/* ——— Иконки ——— */
const I = {
  search: (p: any) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  chevDown: (p: any) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m6 9 6 6 6-6"/></svg>,
  chevRight: (p: any) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 18 6-6-6-6"/></svg>,
  chevLeft: (p: any) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m15 18-6-6 6-6"/></svg>,
  check: (p: any) => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5"/></svg>,
  x: (p: any) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  download: (p: any) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>,
  scale: (p: any) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v18M7 21h10M5 7h14M5 7l-2.5 6a3 3 0 0 0 5 0L5 7Zm14 0-2.5 6a3 3 0 0 0 5 0L19 7ZM8 7l4-2 4 2"/></svg>,
  gov: (p: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 21h18M5 21V10M19 21V10M3 10l9-6 9 6M9 21v-6h6v6"/></svg>,
  briefcase: (p: any) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
  building: (p: any) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/></svg>,
};

/* ——— Маппинги под наши данные ——— */
const SPHERE_COLOR: Record<string, string> = {
  mchs: "#D9663A", mz_zdrav: "#2E8B8B", mz_obshchepit: "#4E944F", me_neft_uran: "#8A6D3B",
  miir_obrabotka: "#5A6BB0", miir_transport: "#3A6EA5", msx: "#4E944F", mnvo: "#7E5AA8",
  mtsriap: "#3E9C6B", mti_torgovlya: "#C2853A", mtzsn_trud_otn: "#C2853A", mtzsn_trudoustr: "#C2853A",
  ecology: "#3E9C6B", land: "#8A6D3B", transport: "#3A6EA5", other_ersop: "#6B7A73",
};
const STAGE_LABEL: Record<string, string> = {
  planning: "Планирование", registration: "Регистрация", pre_launch: "До-запуск", launch: "Запуск",
  operation: "Деятельность", reporting: "Отчётность", inspection: "Проверки", expansion: "Расширение",
  suspension: "Приостановка", closure: "Закрытие",
};
const STAGE_ORDER = ["planning", "registration", "pre_launch", "launch", "operation", "reporting", "inspection", "expansion", "suspension", "closure"];
function minShort(m: string | null): string {
  if (!m) return "—";
  return m.replace("Министерство ", "Мин").replace(" Республики Казахстан", "").replace(" РК", "").slice(0, 28);
}
const SCENARIOS = [
  { id: "sto", title: "Открыть СТО", oked: "45.20", icon: "🔧", desc: "Техобслуживание и ремонт автомобилей" },
  { id: "bakery", title: "Запустить пекарню", oked: "10.71", icon: "🥖", desc: "Производство хлеба и кондитерских изделий" },
  { id: "cafe", title: "Открыть кафе", oked: "56.10", icon: "🍽️", desc: "Рестораны, кафе, доставка питания" },
  { id: "shop", title: "Открыть магазин", oked: "47.11", icon: "🛒", desc: "Розничная торговля" },
  { id: "clinic", title: "Открыть клинику", oked: "86.21", icon: "🩺", desc: "Врачебная практика" },
  { id: "quarry", title: "Карьер / добыча", oked: "08.11", icon: "⛏️", desc: "Добыча камня, песка, глины" },
  { id: "farm", title: "Молочная ферма", oked: "01.41", icon: "🐄", desc: "Разведение КРС" },
  { id: "build", title: "Строительство", oked: "41.20", icon: "🏗️", desc: "Строительство зданий" },
];

interface Req {
  id: number; ngr: string | null; npa_title: string | null; article: string | null;
  ministry: string | null; sphere_code: string | null; sphere_name: string | null;
  okeds: string[] | null; stages: string[] | null;
  title: string | null; legal_text: string | null; canon_text: string | null;
  subject: string | null; action: string | null; object: string | null; condition: string | null;
}
interface Opt { ministry?: string; sphere_code?: string; stage?: string; name?: string; n: number; }

function MetaChip({ children, color, stage }: { children: React.ReactNode; color?: string; stage?: boolean }) {
  return <span className={"reg-mchip" + (stage ? " stage" : "")}>{color && <span className="dot" style={{ background: color }} />}{children}</span>;
}

/* ——— Карточка ——— */
function Card({ r, onOpen }: { r: Req; onOpen: (r: Req) => void }) {
  const heading = r.title || `${r.subject || ""}${r.action ? " → " + r.action : ""}`.trim() || "—";
  const body = r.canon_text || r.legal_text || "";
  return (
    <article className="reg-card" style={{ ["--stripe" as any]: SPHERE_COLOR[r.sphere_code || ""] || "var(--line)" }} onClick={() => onOpen(r)}>
      <div className="reg-card-top">
        <h3 className="reg-card-title">{heading}</h3>
        <span className="reg-card-arrow"><I.chevRight /></span>
      </div>
      {body && <p className="reg-card-snippet">{body}</p>}
      <div className="reg-card-facets">
        {r.sphere_name && <MetaChip color={SPHERE_COLOR[r.sphere_code || ""]}>{r.sphere_name}</MetaChip>}
        {r.ministry && <MetaChip>{minShort(r.ministry)}</MetaChip>}
        {(r.stages || []).slice(0, 3).map((s) => <MetaChip key={s} stage>{STAGE_LABEL[s] || s}</MetaChip>)}
        {(r.stages || []).length > 3 && <MetaChip stage>+{(r.stages || []).length - 3}</MetaChip>}
      </div>
    </article>
  );
}

/* ——— Drawer ——— */
function Drawer({ r, onClose, onSaved }: { r: Req; onClose: () => void; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.canon_text || r.legal_text || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const heading = r.title || `${r.subject || ""}${r.action ? " → " + r.action : ""}`.trim();
  const adilet = r.ngr ? `https://adilet.zan.kz/rus/docs/${r.ngr}` : null;
  async function save() {
    setBusy(true);
    try {
      await fetch("/api/registry/review", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, action: "edit", fields: { canon_text: text } }) });
      onSaved(); setEditing(false);
    } finally { setBusy(false); }
  }
  return (
    <>
      <div className="reg-scrim" onClick={onClose} />
      <aside className="reg-drawer" role="dialog">
        <div className="reg-drawer-head">
          <h2 className="reg-d-title" style={{ flex: 1 }}>{heading}</h2>
          <button className="reg-drawer-close" onClick={onClose}><I.x /></button>
        </div>
        <div className="reg-drawer-body">
          <div className="reg-d-section">
            <div className="reg-d-section-h">Текст требования</div>
            {editing
              ? <textarea className="reg-edit-area" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
              : <p className="reg-d-legal">{r.canon_text || r.legal_text}</p>}
          </div>
          <div className="reg-d-section">
            <div className="reg-d-section-h">Структура</div>
            <dl className="reg-d-grid">
              {r.subject && <><dt>Субъект</dt><dd>{r.subject}</dd></>}
              {r.action && <><dt>Действие</dt><dd>{r.action}</dd></>}
              {r.object && <><dt>Объект</dt><dd>{r.object}</dd></>}
              {r.condition && <><dt>Условие</dt><dd>{r.condition}</dd></>}
              {r.sphere_name && <><dt>Сфера</dt><dd><MetaChip color={SPHERE_COLOR[r.sphere_code || ""]}>{r.sphere_name}</MetaChip></dd></>}
              {r.ministry && <><dt>Орган</dt><dd>{r.ministry}</dd></>}
            </dl>
          </div>
          {r.ngr && (
            <div className="reg-d-section">
              <div className="reg-d-section-h">Нормативно-правовой источник</div>
              <div className="reg-npa-card">
                <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.4 }}>{r.npa_title || r.ngr}{r.article ? `, ${r.article}` : ""}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 6 }}>
                  Госрегномер: <b style={{ color: "var(--ink-2)" }}>{r.ngr}</b>
                  {adilet && <> · <a className="reg-d-link" href={adilet} target="_blank" rel="noreferrer">Открыть на adilet.zan.kz →</a></>}
                </div>
              </div>
            </div>
          )}
          {r.okeds && r.okeds.length > 0 && (
            <div className="reg-d-section">
              <div className="reg-d-section-h">Применимые виды деятельности (ОКЭД)</div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.7 }}>{r.okeds.join(", ")}</div>
            </div>
          )}
          {r.stages && r.stages.length > 0 && (
            <div className="reg-d-section">
              <div className="reg-d-section-h">Стадии жизненного цикла</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {r.stages.map((s) => <MetaChip key={s} stage>{STAGE_LABEL[s] || s}</MetaChip>)}
              </div>
            </div>
          )}
        </div>
        <div className="reg-drawer-foot">
          {editing ? (
            <>
              <button className="reg-act-btn reg-act-save" disabled={busy} onClick={save}>Сохранить</button>
              <button className="reg-act-btn reg-act-edit" onClick={() => { setEditing(false); setText(r.canon_text || r.legal_text || ""); }}>Отмена</button>
            </>
          ) : (
            <button className="reg-act-btn reg-act-edit" onClick={() => setEditing(true)}>✎ Редактировать формулировку</button>
          )}
        </div>
      </aside>
    </>
  );
}

/* ——— Фасет ——— */
function Facet({ title, prime, open, setOpen, children }: any) {
  return (
    <div className={"reg-facet" + (prime ? " reg-facet-prime" : "")}>
      <button className={"reg-facet-head" + (open ? "" : " closed")} onClick={() => setOpen(!open)}>
        <span className="reg-facet-name">{title}</span><span className="chev"><I.chevDown /></span>
      </button>
      {open && <div className="reg-facet-opts">{children}</div>}
    </div>
  );
}
function OptRow({ on, onClick, label, count }: any) {
  return (
    <label className={"reg-opt" + (on ? " on" : "")} onClick={(e) => { e.preventDefault(); onClick(); }}>
      <span className="box"><I.check /></span>
      <span className="reg-opt-label">{label}</span>
      {count != null && <span className="reg-opt-count">{count.toLocaleString("ru")}</span>}
    </label>
  );
}

interface Organ { ministry: string; npa_count: number; npa_active: number; req_count: number; overdue: number; }
interface Npa {
  ngr: string; title: string; ministry: string; npa_status: string;
  date_adopted: string | null; date_revision: string | null; review_deadline: string | null;
  overdue: boolean; req_count: number; adilet_url: string;
}

export default function RegistryPage() {
  const [mode, setMode] = useState<"gov" | "biz" | "organs">("gov");
  const [lang, setLang] = useState<"ru" | "kz">("ru");
  const [items, setItems] = useState<Req[]>([]);
  const [filtersData, setFiltersData] = useState<{ ministries: Opt[]; spheres: Opt[]; stages: Opt[]; totals: { active: number; npa: number } } | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<Req | null>(null);
  const [sort, setSort] = useState("ministry");
  const [openF, setOpenF] = useState({ sphere: true, ministry: false, stage: false });
  const [f, setF] = useState<{ spheres: string[]; ministries: string[]; stages: string[]; q: string }>({ spheres: [], ministries: [], stages: [], q: "" });
  const [qd, setQd] = useState("");

  // бизнес-режим
  const [scenario, setScenario] = useState<typeof SCENARIOS[0] | null>(null);
  const [bizStage, setBizStage] = useState<string | null>(null);

  // режим «Органы и НПА»
  const [organs, setOrgans] = useState<Organ[]>([]);
  const [selOrg, setSelOrg] = useState<string | null>(null);
  const [npaList, setNpaList] = useState<Npa[]>([]);
  const [npaLoading, setNpaLoading] = useState(false);
  useEffect(() => {
    if (mode === "organs" && organs.length === 0)
      fetch("/api/registry/organs").then((r) => r.json()).then((d) => {
        setOrgans(d.organs || []);
        if (d.organs?.length) setSelOrg(d.organs[0].ministry);
      });
  }, [mode, organs.length]);
  useEffect(() => {
    if (!selOrg) return;
    setNpaLoading(true);
    fetch(`/api/registry/npa?ministry=${encodeURIComponent(selOrg)}`).then((r) => r.json())
      .then((d) => setNpaList(d.npa || [])).finally(() => setNpaLoading(false));
  }, [selOrg]);

  useEffect(() => { fetch("/api/registry/filters").then((r) => r.json()).then(setFiltersData).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => setQd(f.q), 400); return () => clearTimeout(t); }, [f.q]);

  const params = useCallback((forExport = false) => {
    const p = new URLSearchParams();
    if (!forExport) { p.set("page", String(page)); p.set("limit", "12"); }
    f.spheres.forEach((s) => p.append("sphere", s));
    f.ministries.forEach((m) => p.append("ministry", m));
    f.stages.forEach((s) => p.append("stage", s));
    if (qd) p.set("q", qd);
    p.set("sort", sort);
    return p;
  }, [page, f.spheres, f.ministries, f.stages, qd, sort]);

  const load = useCallback(() => {
    if (mode !== "gov") return;
    setLoading(true);
    fetch(`/api/registry/list?${params()}`).then((r) => r.json())
      .then((d) => { setItems(d.items || []); setPages(d.pages || 0); setTotal(d.total || 0); })
      .finally(() => setLoading(false));
  }, [params, mode]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [f.spheres, f.ministries, f.stages, qd, sort]);

  const toggle = (key: "spheres" | "ministries" | "stages", v: string) =>
    setF((p) => { const s = new Set(p[key]); if (s.has(v)) s.delete(v); else s.add(v); return { ...p, [key]: Array.from(s) }; });
  const activeCount = f.spheres.length + f.ministries.length + f.stages.length;
  const chips = [
    ...f.spheres.map((v) => ({ key: "spheres" as const, v, label: filtersData?.spheres.find((s) => s.sphere_code === v)?.name || v })),
    ...f.ministries.map((v) => ({ key: "ministries" as const, v, label: minShort(v) })),
    ...f.stages.map((v) => ({ key: "stages" as const, v, label: STAGE_LABEL[v] || v })),
  ];

  // бизнес: требования по сценарию
  const [bizItems, setBizItems] = useState<Req[]>([]);
  useEffect(() => {
    if (mode === "biz" && scenario) {
      fetch(`/api/registry/list?oked=${scenario.oked}&limit=100`).then((r) => r.json()).then((d) => setBizItems(d.items || []));
    }
  }, [mode, scenario]);
  const bizStages = useMemo(() => {
    const set = new Set<string>(); bizItems.forEach((r) => (r.stages || []).forEach((s) => set.add(s)));
    return STAGE_ORDER.filter((s) => set.has(s));
  }, [bizItems]);
  const bizShown = bizStage ? bizItems.filter((r) => (r.stages || []).includes(bizStage)) : bizItems;

  return (
    <div className="reg">
      {/* Шапка */}
      <header className="reg-topbar">
        <div className="reg-brand">
          <div className="reg-emblem"><I.scale /></div>
          <div>
            <div className="reg-brand-title">Реестр обязательных требований</div>
            <div className="reg-brand-sub">Министерство национальной экономики РК</div>
          </div>
        </div>
        <div className="reg-spacer" />
        <div className="reg-mode">
          <button className={mode === "gov" ? "on" : ""} onClick={() => setMode("gov")}><I.gov />Каталог</button>
          <button className={mode === "organs" ? "on" : ""} onClick={() => setMode("organs")}><I.building />Органы и НПА</button>
          <button className={mode === "biz" ? "on" : ""} onClick={() => { setMode("biz"); setScenario(null); setBizStage(null); }}><I.briefcase />Бизнес</button>
        </div>
        <div className="reg-lang">
          <button className={lang === "ru" ? "on" : ""} onClick={() => setLang("ru")}>РУС</button>
          <button className={lang === "kz" ? "on" : ""} onClick={() => setLang("kz")}>ҚАЗ</button>
        </div>
      </header>

      {mode === "gov" ? (
        <div className="reg-shell">
          <aside className="reg-sidebar">
            <div className="reg-filters">
              <div className="reg-filters-head">
                <span className="reg-filters-title">Фильтры</span>
                <button className="reg-filters-clear" disabled={!activeCount} onClick={() => setF({ spheres: [], ministries: [], stages: [], q: f.q })}>
                  Сбросить{activeCount ? ` (${activeCount})` : ""}
                </button>
              </div>
              <Facet title="Сфера регулирования" prime open={openF.sphere} setOpen={(v: boolean) => setOpenF((p) => ({ ...p, sphere: v }))}>
                {filtersData?.spheres.map((s) => (
                  <OptRow key={s.sphere_code} on={f.spheres.includes(s.sphere_code!)} onClick={() => toggle("spheres", s.sphere_code!)} label={s.name} count={s.n} />
                ))}
              </Facet>
              <Facet title="Орган" open={openF.ministry} setOpen={(v: boolean) => setOpenF((p) => ({ ...p, ministry: v }))}>
                {filtersData?.ministries.map((m) => (
                  <OptRow key={m.ministry} on={f.ministries.includes(m.ministry!)} onClick={() => toggle("ministries", m.ministry!)} label={minShort(m.ministry!)} count={m.n} />
                ))}
              </Facet>
              <Facet title="Стадия жизненного цикла" open={openF.stage} setOpen={(v: boolean) => setOpenF((p) => ({ ...p, stage: v }))}>
                {STAGE_ORDER.filter((s) => filtersData?.stages.some((x) => x.stage === s)).map((s) => (
                  <OptRow key={s} on={f.stages.includes(s)} onClick={() => toggle("stages", s)} label={STAGE_LABEL[s]} count={filtersData?.stages.find((x) => x.stage === s)?.n} />
                ))}
              </Facet>
            </div>
          </aside>

          <main className="reg-content">
            <div className="reg-catalog">
              <h1 className="reg-cat-h1">Каталог требований</h1>
              <div className="reg-cat-sub">
                {filtersData ? `${Number(filtersData.totals.active).toLocaleString("ru")} действующих требований · ${Number(filtersData.totals.npa).toLocaleString("ru")} НПА · ${filtersData.ministries.length}+ органов` : "…"}
              </div>

              <div className="reg-toolbar">
                <div className="reg-search">
                  <I.search />
                  <input value={f.q} onChange={(e) => setF((p) => ({ ...p, q: e.target.value }))} placeholder="Поиск по тексту, заголовку, номеру НПА…" />
                </div>
                <div className="reg-select-wrap">
                  <select value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="ministry">По органу</option>
                    <option value="sphere">По сфере</option>
                    <option value="ngr">По НПА</option>
                  </select>
                  <I.chevDown />
                </div>
                <a className="reg-tool-btn" href={`/api/registry/export?${params(true)}`}><I.download />Экспорт CSV</a>
              </div>

              <div className="reg-results-bar">
                <span className="reg-results-count">Найдено <b>{total.toLocaleString("ru")}</b></span>
                {chips.length > 0 && (
                  <div className="reg-chips">
                    {chips.map((c, i) => (
                      <span className="reg-chip" key={i}>{c.label}<button onClick={() => toggle(c.key, c.v)}><I.x style={{ width: 12, height: 12 }} /></button></span>
                    ))}
                  </div>
                )}
              </div>

              {loading ? <div className="reg-empty">Загрузка…</div>
                : items.length === 0 ? <div className="reg-empty"><h3>Ничего не найдено</h3><p>Смягчите фильтры или измените запрос.</p></div>
                : <div className="reg-cards">{items.map((r) => <Card key={r.id} r={r} onOpen={setActive} />)}</div>}

              {pages > 1 && (
                <div className="reg-pager">
                  <button disabled={page === 1} onClick={() => setPage(page - 1)}><I.chevLeft /></button>
                  {Array.from({ length: Math.min(pages, 9) }, (_, i) => {
                    const start = Math.max(1, Math.min(page - 4, pages - 8));
                    return start + i;
                  }).filter((p) => p <= pages).map((p) => (
                    <button key={p} className={p === page ? "on" : ""} onClick={() => setPage(p)}>{p}</button>
                  ))}
                  <button disabled={page === pages} onClick={() => setPage(page + 1)}><I.chevRight /></button>
                </div>
              )}
            </div>
          </main>
        </div>
      ) : mode === "organs" ? (
        /* ——— Органы и НПА ——— */
        <div className="reg-shell">
          <aside className="reg-sidebar">
            <div className="reg-filters">
              <div className="reg-filters-head"><span className="reg-filters-title">Государственные органы</span></div>
              {organs.map((o) => (
                <div key={o.ministry} className={"reg-org-item" + (selOrg === o.ministry ? " on" : "")} onClick={() => setSelOrg(o.ministry)}>
                  <span className="reg-org-name">{minShort(o.ministry)}</span>
                  <span className="reg-org-count">{o.npa_count} НПА</span>
                </div>
              ))}
            </div>
          </aside>
          <main className="reg-content">
            <div className="reg-catalog">
              <h1 className="reg-cat-h1">{selOrg || "Органы и НПА"}</h1>
              {selOrg && (() => {
                const o = organs.find((x) => x.ministry === selOrg);
                return o ? <div className="reg-cat-sub">{o.npa_count} НПА · {Number(o.req_count).toLocaleString("ru")} требований</div> : null;
              })()}
              <div style={{ marginTop: 18 }} className="reg-npa-list">
                {npaLoading ? <div className="reg-empty">Загрузка…</div> : npaList.map((n) => (
                  <div key={n.ngr} className="reg-npa-card">
                    <div className="reg-npa-top">
                      <div className="reg-npa-title">{n.title}</div>
                      <span className="reg-npa-req">{n.req_count} треб.</span>
                    </div>
                    <div className="reg-npa-meta">
                      <span>Госрегномер: <b>{n.ngr}</b></span>
                      {n.date_revision && <span>Редакция: <b>{n.date_revision}</b></span>}
                      {n.review_deadline && <span title="Плановая дата анализа по реестру Минфина">План. анализ: <b>{n.review_deadline}</b></span>}
                      {n.npa_status === "утратил силу" && <span className="reg-npa-dead">утратил силу</span>}
                      <a className="reg-npa-link" href={n.adilet_url} target="_blank" rel="noreferrer">Открыть в adilet.zan.kz →</a>
                    </div>
                  </div>
                ))}
                {!npaLoading && npaList.length === 0 && <div className="reg-empty"><h3>Нет НПА</h3></div>}
              </div>
            </div>
          </main>
        </div>
      ) : (
        /* ——— Бизнес ——— */
        <div className="reg-biz">
          {!scenario ? (
            <>
              <div className="reg-biz-hero">
                <h1>Что вы планируете открыть?</h1>
                <p>Выберите сценарий — система покажет требования к вашему виду деятельности по стадиям жизненного цикла бизнеса.</p>
              </div>
              <div className="reg-scenario-grid">
                {SCENARIOS.map((s) => (
                  <button key={s.id} className="reg-scenario" onClick={() => { setScenario(s); setBizStage(null); }}>
                    <div className="reg-scenario-icon">{s.icon}</div>
                    <div className="reg-scenario-title">{s.title}</div>
                    <div className="reg-scenario-desc">{s.desc}</div>
                    <div className="reg-scenario-oked">ОКЭД {s.oked}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button className="reg-biz-back" onClick={() => { setScenario(null); setBizStage(null); }}><I.chevLeft />Все сценарии</button>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
                <span style={{ fontSize: 30 }}>{scenario.icon}</span>
                <div>
                  <h1 style={{ fontSize: 24, fontWeight: 750, letterSpacing: "-.02em" }}>{scenario.title}</h1>
                  <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{scenario.desc} · ОКЭД {scenario.oked}</div>
                </div>
              </div>
              <p style={{ fontSize: 14, color: "var(--ink-2)" }}>Найдено <b>{bizItems.length}</b> применимых требований. Выберите стадию.</p>
              <div className="reg-stages">
                <button className={"reg-stage-pill" + (bizStage === null ? " on" : "")} onClick={() => setBizStage(null)}>Все <span className="cnt">{bizItems.length}</span></button>
                {bizStages.map((s) => {
                  const c = bizItems.filter((r) => (r.stages || []).includes(s)).length;
                  return <button key={s} className={"reg-stage-pill" + (bizStage === s ? " on" : "")} onClick={() => setBizStage(s)}>{STAGE_LABEL[s]} <span className="cnt">{c}</span></button>;
                })}
              </div>
              <div className="reg-cards">{bizShown.map((r) => <Card key={r.id} r={r} onOpen={setActive} />)}</div>
              {bizItems.length === 0 && <div className="reg-empty"><h3>Требования не найдены</h3><p>Для этого вида деятельности в реестре пока нет привязанных требований.</p></div>}
            </>
          )}
        </div>
      )}

      {active && <Drawer r={active} onClose={() => setActive(null)} onSaved={load} />}
    </div>
  );
}
