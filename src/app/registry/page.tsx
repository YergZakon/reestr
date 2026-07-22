"use client";
/* Реестр обязательных требований — корневая страница.
   После рефакторинга К2 здесь остались: шапка с режимами, каталог (gov),
   бизнес-гид ABLIS (biz) и общий Drawer. Остальные режимы — components/*Mode. */
import { useEffect, useRef, useState, useCallback } from "react";
import "./registry.css";
import {
  I, minShort, STAGE_LABEL, STAGE_ORDER,
  Card, Drawer, Facet, OptRow, type Req,
} from "./lib";
import NotificationsBell from "@/components/NotificationsBell";
import OrgansMode from "./components/OrgansMode";
import CostMode from "./components/CostMode";
import MethodMode from "./components/MethodMode";
import DupesMode from "./components/DupesMode";
import ReviewMode from "./components/ReviewMode";
import SubmitMode from "./components/SubmitMode";
import AssignMode from "./components/AssignMode";
import HelpMode from "./components/HelpMode";

interface Opt { ministry?: string; sphere_code?: string; stage?: string; name?: string; n: number; }

// Видимость вкладок каталога. Режимы и их код сохранены — скрыты только кнопки
// в шапке; чтобы вернуть вкладку, поставь true.
const SHOW_TABS = { cost: false, method: false, dupes: false, business: false };

export default function RegistryPage() {
  const [mode, setMode] = useState<"gov" | "organs" | "cost" | "dupes" | "method" | "review" | "submit" | "assign" | "help">("gov");
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

  const [me, setMe] = useState<{ id: number; username: string; role: string; assigned_authorities: string[] } | null>(null);
  useEffect(() => { fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => setMe(d?.user || null)).catch(() => {}); }, []);

  // Drawer после действия в режиме «Ревью» обновляет очередь (колбэк регистрирует ReviewMode)
  const reviewReloadRef = useRef<(() => void) | null>(null);
  const registerReviewReload = useCallback((fn: () => void) => { reviewReloadRef.current = fn; }, []);

  // costData общий для режимов «Нагрузка» и «Методика»
  const [costData, setCostData] = useState<any>(null);
  useEffect(() => {
    if ((mode === "cost" || mode === "method") && !costData)
      fetch("/api/registry/cost").then((r) => r.json()).then(setCostData).catch(() => {});
  }, [mode, costData]);

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
          {SHOW_TABS.cost && <button className={mode === "cost" ? "on" : ""} onClick={() => setMode("cost")}><I.coins />Нагрузка</button>}
          {SHOW_TABS.method && <button className={mode === "method" ? "on" : ""} onClick={() => setMode("method")}><I.calc />Методика</button>}
          {SHOW_TABS.dupes && <button className={mode === "dupes" ? "on" : ""} onClick={() => setMode("dupes")}><I.copy />Дубли</button>}
          <button className={mode === "review" ? "on" : ""} onClick={() => setMode("review")}><I.check />Ревью</button>
          {SHOW_TABS.business && process.env.NEXT_PUBLIC_BUSINESS_URL && <a className="reg-mode-ext" href={process.env.NEXT_PUBLIC_BUSINESS_URL} target="_blank" rel="noreferrer"><I.briefcase />Бизнес<I.chevRight style={{ width: 13, height: 13, opacity: 0.55 }} /></a>}
          {(me?.role === "admin" || me?.role === "moderator") && <button className={mode === "submit" ? "on" : ""} onClick={() => setMode("submit")}><I.download />Подача НПА</button>}
          {(me?.role === "admin" || me?.role === "moderator") && <button className={mode === "assign" ? "on" : ""} onClick={() => setMode("assign")}><I.layers />Назначения</button>}
          {me?.role === "admin" && <button onClick={() => (window.location.href = "/admin/moderators")}><I.building />Модераторы</button>}
          {me?.role === "moderator" && <button onClick={() => (window.location.href = "/moderator/analysts")}><I.building />Аналитики</button>}
          <button className={mode === "help" ? "on" : ""} onClick={() => setMode("help")}><I.help />Помощь</button>
        </div>
        {me && <NotificationsBell />}
        <div className="reg-lang">
          <button className={lang === "ru" ? "on" : ""} onClick={() => setLang("ru")}>РУС</button>
          <button className={lang === "kz" ? "on" : ""} onClick={() => setLang("kz")}>ҚАЗ</button>
        </div>
        {me && (
          <div className="reg-user">
            <span className="reg-user-name">{me.username}</span>
            <span className={`reg-user-role reg-user-role-${me.role}`}>
              {me.role === "admin" ? "Админ" : me.role === "moderator" ? "Модератор" : "Аналитик"}
            </span>
            <button
              className="reg-user-exit"
              title="Выйти"
              onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
            >
              Выйти
            </button>
          </div>
        )}
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
        <OrgansMode />
      ) : mode === "cost" ? (
        <CostMode costData={costData} setCostData={setCostData} onOpen={setActive} />
      ) : mode === "dupes" ? (
        <DupesMode onOpen={setActive} />
      ) : mode === "method" ? (
        <MethodMode costData={costData} />
      ) : mode === "submit" ? (
        <SubmitMode />
      ) : mode === "assign" ? (
        <AssignMode />
      ) : mode === "review" ? (
        <ReviewMode onOpen={setActive} registerReload={registerReviewReload} />
      ) : mode === "help" ? (
        <HelpMode role={me?.role} />
      ) : null}

      {active && <Drawer r={active} onClose={() => setActive(null)} onSaved={mode === "review" ? () => reviewReloadRef.current?.() : load} role={me?.role} />}
    </div>
  );
}
