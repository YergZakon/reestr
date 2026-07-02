"use client";
/* Реестр обязательных требований — корневая страница.
   После рефакторинга К2 здесь остались: шапка с режимами, каталог (gov),
   бизнес-гид ABLIS (biz) и общий Drawer. Остальные режимы — components/*Mode. */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "./registry.css";
import {
  I, fmtKzt, minShort, mdToHtml, SECTION_ICON, STAGE_LABEL, STAGE_ORDER,
  Card, PermitCard, Drawer, Facet, OptRow, type Req,
} from "./lib";
import NotificationsBell from "@/components/NotificationsBell";
import OrgansMode from "./components/OrgansMode";
import CostMode from "./components/CostMode";
import MethodMode from "./components/MethodMode";
import DupesMode from "./components/DupesMode";
import ReviewMode from "./components/ReviewMode";
import SubmitMode from "./components/SubmitMode";

interface Scenario { id: string; title: string; oked: string; section: string; icon: string; desc: string; }
interface SectionRow { section: string; name_ru: string; biz_total: number | null; workers_thousands: number | null; req_count: number; }
interface OkedRow { code: string; name_ru: string; section: string; section_name: string; }
interface BizProfile { kind: "section" | "scenario" | "oked"; oked?: string; section?: string; title: string; icon?: string; desc?: string; }
interface HorizGroup { sphere_code: string | null; name_ru: string | null; n: number; }
interface BizData { oked: string | null; okedName: string | null; section: string | null; sectionName: string | null; permits: Req[]; sectoral: Req[]; sectoralTotal: number; horizontalGroups: HorizGroup[]; }
interface Question { tag: string; q: string; hint?: string; def: boolean; }
type BizPath = "new" | "expand";
interface Opt { ministry?: string; sphere_code?: string; stage?: string; name?: string; n: number; }

export default function RegistryPage() {
  const [mode, setMode] = useState<"gov" | "biz" | "organs" | "cost" | "dupes" | "method" | "review" | "submit">("gov");
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

  // ——— бизнес-режим (Guided Search: путь → select → survey → report) ———
  const [bizPath, setBizPath] = useState<BizPath | null>(null);
  const [bizStep, setBizStep] = useState<"select" | "survey" | "report">("select");
  const [bizProfile, setBizProfile] = useState<BizProfile | null>(null);
  const [bizData, setBizData] = useState<BizData | null>(null);
  const [bizLoading, setBizLoading] = useState(false);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [scenariosList, setScenariosList] = useState<Scenario[]>([]);
  const [okedQ, setOkedQ] = useState("");
  const [okedResults, setOkedResults] = useState<OkedRow[]>([]);
  const [showHoriz, setShowHoriz] = useState(false);
  const [horizItems, setHorizItems] = useState<Record<string, Req[]>>({});
  const [horizOpen, setHorizOpen] = useState<Record<string, boolean>>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [conclusion, setConclusion] = useState<string | null>(null);
  const [conclLoading, setConclLoading] = useState(false);
  const [conclErr, setConclErr] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "biz" && sections.length === 0)
      fetch("/api/business/sections").then((r) => r.json()).then((d) => setSections(d.sections || []));
    if (mode === "biz" && scenariosList.length === 0)
      fetch("/api/business/scenarios").then((r) => r.json()).then((d) => setScenariosList(d.scenarios || []));
  }, [mode, sections.length, scenariosList.length]);

  useEffect(() => {
    const q = okedQ.trim();
    if (q.length < 2) { setOkedResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/business/okved?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((d) => setOkedResults(d.okveds || []));
    }, 250);
    return () => clearTimeout(t);
  }, [okedQ]);

  useEffect(() => {
    if (mode === "biz" && questions.length === 0)
      fetch("/api/business/questions").then((r) => r.json()).then((d) => {
        const qs: Question[] = d.questions || [];
        setQuestions(qs);
        setAnswers(Object.fromEntries(qs.map((x) => [x.tag, x.def])));
      });
  }, [mode, questions.length]);

  const activeTriggers = useMemo(() => Object.entries(answers).filter(([, v]) => v).map(([k]) => k), [answers]);
  const startProfile = (p: BizProfile) => { setBizProfile(p); setBizStep("survey"); setBizData(null); setConclusion(null); setConclErr(null); };

  const loadReport = () => {
    if (!bizProfile) return;
    setBizStep("report"); setBizLoading(true);
    setShowHoriz(false); setHorizItems({}); setHorizOpen({}); setConclusion(null); setConclErr(null);
    const base = bizProfile.oked ? `oked=${encodeURIComponent(bizProfile.oked)}` : `section=${encodeURIComponent(bizProfile.section || "")}`;
    const tg = activeTriggers.length ? `&triggers=${activeTriggers.join(",")}` : "";
    const pp = bizPath ? `&path=${bizPath}` : "";
    fetch(`/api/business/requirements?${base}${tg}${pp}`).then((r) => r.json()).then(setBizData).finally(() => setBizLoading(false));
  };

  const toggleHoriz = (code: string) => {
    setHorizOpen((p) => ({ ...p, [code]: !p[code] }));
    if (!horizItems[code]) {
      const tg = activeTriggers.length ? `&triggers=${activeTriggers.join(",")}` : "";
      const pp = bizPath ? `&path=${bizPath}` : "";
      fetch(`/api/business/requirements?horizontalSphere=${encodeURIComponent(code)}${tg}${pp}`)
        .then((r) => r.json()).then((d) => setHorizItems((p) => ({ ...p, [code]: d.items || [] })));
    }
  };

  const genConclusion = () => {
    if (!bizProfile) return;
    setConclLoading(true); setConclErr(null); setConclusion(null);
    fetch("/api/business/conclusion", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oked: bizProfile.oked, section: bizProfile.section, title: bizProfile.title, triggers: activeTriggers, path: bizPath }),
    }).then((r) => r.json()).then((d) => { if (d.conclusion) setConclusion(d.conclusion); else setConclErr(d.error || "Не удалось сгенерировать"); })
      .catch(() => setConclErr("Ошибка сети")).finally(() => setConclLoading(false));
  };

  const sectoralByStage = useMemo(() => {
    const sec = bizData?.sectoral || [];
    const byStage = STAGE_ORDER.map((st) => ({ st, reqs: sec.filter((r) => (r.stages || []).includes(st)) })).filter((x) => x.reqs.length);
    const noStage = sec.filter((r) => !(r.stages || []).length);
    return { byStage, noStage };
  }, [bizData]);
  const horizTotal = useMemo(() => (bizData?.horizontalGroups || []).reduce((a, g) => a + g.n, 0), [bizData]);

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
          <button className={mode === "cost" ? "on" : ""} onClick={() => setMode("cost")}><I.coins />Нагрузка</button>
          <button className={mode === "method" ? "on" : ""} onClick={() => setMode("method")}><I.calc />Методика</button>
          <button className={mode === "dupes" ? "on" : ""} onClick={() => setMode("dupes")}><I.copy />Дубли</button>
          <button className={mode === "review" ? "on" : ""} onClick={() => setMode("review")}><I.check />Ревью</button>
          <button className={mode === "biz" ? "on" : ""} onClick={() => { setMode("biz"); setBizProfile(null); setBizStep("select"); setBizPath(null); }}><I.briefcase />Бизнес</button>
          {(me?.role === "admin" || me?.role === "moderator") && <button className={mode === "submit" ? "on" : ""} onClick={() => setMode("submit")}><I.download />Подача НПА</button>}
          {(me?.role === "admin" || me?.role === "moderator") && <button onClick={() => (window.location.href = "/cards/admin/users")}><I.building />Пользователи</button>}
        </div>
        {me && <NotificationsBell />}
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
        <OrgansMode />
      ) : mode === "cost" ? (
        <CostMode costData={costData} setCostData={setCostData} onOpen={setActive} />
      ) : mode === "dupes" ? (
        <DupesMode onOpen={setActive} />
      ) : mode === "method" ? (
        <MethodMode costData={costData} />
      ) : mode === "submit" ? (
        <SubmitMode />
      ) : mode === "review" ? (
        <ReviewMode onOpen={setActive} registerReload={registerReviewReload} />
      ) : (
        /* ——— Бизнес (Guided Search ABLIS) ——— */
        <div className="reg-biz">
          {!bizPath ? (
            <>
              <div className="reg-biz-hero">
                <h1>Запустите бизнес легально — без поиска по тысячам НПА</h1>
                <p>Ответьте на несколько вопросов — система соберёт персональный список разрешений, лицензий и требований и подготовит ИИ-заключение с экспортом в PDF.</p>
              </div>
              <div className="reg-path-grid">
                <button className="reg-path-card" onClick={() => { setBizPath("new"); setBizStep("select"); }}>
                  <div className="reg-path-ic"><I.briefcase /></div>
                  <h3>Запуск нового бизнеса</h3>
                  <p>Вы начинаете с нуля и хотите понять полный перечень того, что нужно оформить для законного старта.</p>
                  <span className="reg-path-go">Начать подбор <I.chevRight /></span>
                </button>
                <button className="reg-path-card" onClick={() => { setBizPath("expand"); setBizStep("select"); }}>
                  <div className="reg-path-ic"><I.layers /></div>
                  <h3>Расширение действующего</h3>
                  <p>У вас уже есть бизнес. Добавляете новый вид деятельности или услугу — покажем только дополнительные требования.</p>
                  <span className="reg-path-go">Подобрать дополнительно <I.chevRight /></span>
                </button>
              </div>
            </>
          ) : (
          <>
          <button className="reg-biz-back" onClick={() => { setBizPath(null); setBizProfile(null); setBizStep("select"); }}><I.chevLeft />{bizPath === "new" ? "Запуск нового бизнеса" : "Расширение действующего"} · начать заново</button>
          <div className="reg-wiz">
            {["Вид деятельности", "Уточнение", "Отчёт"].map((s, i) => {
              const cur = bizStep === "select" ? 0 : bizStep === "survey" ? 1 : 2;
              return (
                <div key={i} className="reg-wiz-item">
                  <div className={"reg-wiz-step" + (i === cur ? " on" : i < cur ? " done" : "")}>
                    <span className="num">{i < cur ? <I.check /> : i + 1}</span>
                    <span className="lbl">{s}</span>
                  </div>
                  {i < 2 && <span className={"reg-wiz-line" + (i < cur ? " done" : "")} />}
                </div>
              );
            })}
          </div>
          {bizStep === "select" ? (
            <>
              <h2 className="reg-wiz-h">{bizPath === "expand" ? "Какой вид деятельности добавляете?" : "Чем будет заниматься бизнес?"}</h2>
              <p className="reg-wiz-sub">Найдите вид деятельности по названию или коду ОКЭД, либо выберите популярный сценарий или отрасль.</p>

              {/* Поиск ОКЭД */}
              <div className="reg-oked-search">
                <div className="reg-search">
                  <I.search />
                  <input value={okedQ} onChange={(e) => setOkedQ(e.target.value)} placeholder="Найти вид деятельности или код ОКЭД (напр. «ремонт» или 4520)…" />
                </div>
                {okedResults.length > 0 && (
                  <div className="reg-oked-results">
                    {okedResults.map((o) => (
                      <button key={o.code} className="reg-oked-row" onClick={() => { startProfile({ kind: "oked", oked: o.code, section: o.section, title: o.name_ru, icon: SECTION_ICON[o.section], desc: `ОКЭД ${o.code} · ${o.section_name}` }); setOkedQ(""); setOkedResults([]); }}>
                        <span className="reg-oked-code">{o.code}</span>
                        <span className="reg-oked-name">{o.name_ru}</span>
                        <span className="reg-oked-sec">{o.section_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Популярные сценарии */}
              {scenariosList.length > 0 && <>
                <div className="reg-biz-blockh">Популярные виды бизнеса</div>
                <div className="reg-scenario-grid">
                  {scenariosList.map((s) => (
                    <button key={s.id} className="reg-scenario" onClick={() => startProfile({ kind: "scenario", oked: s.oked, section: s.section, title: s.title, icon: s.icon, desc: s.desc })}>
                      <div className="reg-scenario-icon">{s.icon}</div>
                      <div className="reg-scenario-title">{s.title}</div>
                      <div className="reg-scenario-desc">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </>}

              {/* Отрасли (секции) */}
              {sections.length > 0 && <>
                <div className="reg-biz-blockh">Все отрасли</div>
                <div className="reg-section-grid">
                  {sections.map((s) => (
                    <button key={s.section} className="reg-section-tile" onClick={() => startProfile({ kind: "section", section: s.section, title: s.name_ru, icon: SECTION_ICON[s.section], desc: `${s.req_count.toLocaleString("ru")} отраслевых требований` })}>
                      <span className="reg-section-ic">{SECTION_ICON[s.section]}</span>
                      <span className="reg-section-body">
                        <span className="reg-section-name">{s.name_ru}</span>
                        <span className="reg-section-meta">{s.biz_total ? `${Number(s.biz_total).toLocaleString("ru")} субъектов` : ""}{s.req_count ? ` · ${s.req_count} треб.` : ""}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>}
            </>
          ) : bizStep === "survey" ? (
            <>
              <button className="reg-biz-back" onClick={() => { setBizStep("select"); setBizProfile(null); }}><I.chevLeft />Назад к выбору</button>
              <div className="reg-biz-profileh">
                <span className="reg-biz-profile-ic">{bizProfile?.icon || "🏢"}</span>
                <div><h1>{bizProfile?.title}</h1><div className="reg-biz-profile-sub">{bizProfile?.desc}</div></div>
              </div>
              <div className="reg-survey">
                <h2 className="reg-wiz-h">Уточняющие вопросы</h2>
                <p className="reg-wiz-sub">Ответы определяют, какие лицензии и требования войдут в отчёт. Отвечайте «Нет», если пункт к вам не относится.</p>
                <div className="reg-q-list">
                  {questions.map((q) => (
                    <div key={q.tag} className={"reg-q-card" + (answers[q.tag] !== undefined ? " answered" : "")}>
                      <div className="reg-q-text">{q.q}</div>
                      {q.hint && <div className="reg-q-hint">{q.hint}</div>}
                      <div className="reg-q-btns">
                        <button className={"reg-q-btn yes" + (answers[q.tag] === true ? " on" : "")} onClick={() => setAnswers((p) => ({ ...p, [q.tag]: true }))}><I.check />Да</button>
                        <button className={"reg-q-btn no" + (answers[q.tag] === false ? " on" : "")} onClick={() => setAnswers((p) => ({ ...p, [q.tag]: false }))}>Нет</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="reg-survey-go" onClick={loadReport}>Сформировать отчёт<I.chevRight /></button>
              </div>
            </>
          ) : (
            <>
              <button className="reg-biz-back" onClick={() => setBizStep("survey")}><I.chevLeft />Изменить ответы</button>
              <div className="reg-biz-profileh">
                <span className="reg-biz-profile-ic">{bizProfile?.icon || "🏢"}</span>
                <div>
                  <h1>{bizProfile?.title}</h1>
                  <div className="reg-biz-profile-sub">{bizProfile?.desc}{bizData?.sectionName ? ` · отрасль: ${bizData.sectionName}` : ""}</div>
                </div>
              </div>

              {bizLoading ? <div className="reg-empty">Подбираю требования…</div> : bizData && (
                <>
                  {/* Сводка отчёта */}
                  <div className="reg-report-head">
                    <div className="reg-report-ic"><I.check /></div>
                    <div style={{ flex: 1 }}>
                      <h2>{bizPath === "expand" ? "Дополнительные требования готовы" : "Персональный отчёт готов"}</h2>
                      <p>{bizPath === "expand" ? "Для расширения" : "Для законного ведения"} «{bizProfile?.title}»{bizData.sectionName ? ` (${bizData.sectionName})` : ""} применимо:{bizPath === "expand" ? " базовая регистрация исключена." : ""}</p>
                      <div className="reg-report-summary">
                        <span className="reg-rs"><b>{bizData.permits.length}</b> к оформлению</span>
                        <span className="reg-rs"><b>{bizData.sectoralTotal.toLocaleString("ru")}</b> отраслевых</span>
                        <span className="reg-rs"><b>{horizTotal.toLocaleString("ru")}</b> общих</span>
                      </div>
                    </div>
                  </div>

                  {/* ИИ-заключение */}
                  <div className="reg-concl">
                    {!conclusion && !conclLoading && !conclErr && (
                      <div className="reg-concl-cta">
                        <div className="reg-concl-cta-txt"><h3>Заключение по вашему бизнесу</h3><p>ИИ соберёт сводный документ: что оформить, пошаговый план по стадиям, постоянные обязанности и риски.</p></div>
                        <button className="reg-concl-btn" onClick={genConclusion}>Сформировать заключение</button>
                      </div>
                    )}
                    {conclLoading && <div className="reg-concl-loading"><span className="reg-spin" />Готовлю заключение… это занимает 10–30 секунд</div>}
                    {conclErr && <div className="reg-concl-err">{conclErr} <button onClick={genConclusion}>Повторить</button></div>}
                    {conclusion && (
                      <div className="reg-concl-doc" id="concl-doc">
                        <div className="reg-concl-head">
                          <div className="reg-concl-doc-title">Заключение: {bizProfile?.title}</div>
                          <div className="reg-concl-actions">
                            <button onClick={() => window.print()}><I.download />Скачать PDF</button>
                            <button className="ghost" onClick={genConclusion}>↻ Пересоздать</button>
                          </div>
                        </div>
                        <div className="reg-concl-md" dangerouslySetInnerHTML={mdToHtml(conclusion)} />
                        <div className="reg-concl-foot">Сформировано ИИ на основе Реестра обязательных требований РК. Проверяйте актуальность по первоисточникам на adilet.zan.kz.</div>
                      </div>
                    )}
                  </div>

                  {/* Что оформить */}
                  {bizData.permits.length > 0 && (
                    <>
                      <div className="reg-biz-blockh reg-biz-blockh-lg">Что оформить<span className="reg-biz-blockh-cnt">{bizData.permits.length} разрешений и лицензий</span></div>
                      <div className="reg-permit-list">{bizData.permits.map((r) => <PermitCard key={r.id} r={r} onOpen={setActive} />)}</div>
                    </>
                  )}

                  {/* Отраслевой чек-лист по стадиям */}
                  <div className="reg-biz-blockh reg-biz-blockh-lg">Что нужно для вашей деятельности
                    <span className="reg-biz-blockh-cnt">{bizData.sectoralTotal.toLocaleString("ru")} требований{bizData.sectoralTotal > bizData.sectoral.length ? ` · первые ${bizData.sectoral.length.toLocaleString("ru")}` : ""}</span>
                  </div>
                  {bizData.sectoral.length === 0 ? (
                    <div className="reg-empty"><h3>Отраслевых требований не найдено</h3><p>Для этого профиля специфических требований нет — ориентируйтесь на «Что оформить» и блок «Общие».</p></div>
                  ) : (
                    <div className="reg-checklist">
                      {sectoralByStage.byStage.map(({ st, reqs }, idx) => (
                        <div key={st} className="reg-stage-block">
                          <div className="reg-stage-block-h"><span className="reg-stage-num">{idx + 1}</span><span className="reg-stage-ttl">{STAGE_LABEL[st]}</span><span className="reg-stage-cnt">{reqs.length}</span></div>
                          <div className="reg-cards">{reqs.map((r) => <Card key={r.id} r={r} onOpen={setActive} />)}</div>
                        </div>
                      ))}
                      {sectoralByStage.noStage.length > 0 && (
                        <div className="reg-stage-block">
                          <div className="reg-stage-block-h"><span className="reg-stage-num">•</span><span className="reg-stage-ttl">Постоянные требования</span><span className="reg-stage-cnt">{sectoralByStage.noStage.length}</span></div>
                          <div className="reg-cards">{sectoralByStage.noStage.map((r) => <Card key={r.id} r={r} onOpen={setActive} />)}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Общие для всех */}
                  {horizTotal > 0 && (
                    <div className="reg-biz-common">
                      <button className="reg-biz-common-head" onClick={() => setShowHoriz((v) => !v)}>
                        <span className="reg-biz-common-ic">📋</span>
                        <span className="reg-biz-common-t">Общие требования (применимы к вашему профилю)</span>
                        <span className="reg-biz-common-n">{horizTotal.toLocaleString("ru")}</span>
                        <span className={"reg-biz-common-chev" + (showHoriz ? " open" : "")}><I.chevDown /></span>
                      </button>
                      {showHoriz && (
                        <div className="reg-biz-common-body">
                          {bizData.horizontalGroups.filter((g) => g.sphere_code).map((g) => (
                            <div key={g.sphere_code} className="reg-biz-group">
                              <button className="reg-biz-group-h" onClick={() => toggleHoriz(g.sphere_code!)}>
                                <span className={"chev2" + (horizOpen[g.sphere_code!] ? " open" : "")}><I.chevRight /></span>
                                {g.name_ru || g.sphere_code} <span>{g.n}</span>
                              </button>
                              {horizOpen[g.sphere_code!] && (
                                <div className="reg-cards" style={{ marginTop: 10 }}>
                                  {horizItems[g.sphere_code!]
                                    ? horizItems[g.sphere_code!].map((r) => <Card key={r.id} r={r} onOpen={setActive} />)
                                    : <div className="reg-empty">Загрузка…</div>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          </>
          )}
        </div>
      )}

      {active && <Drawer r={active} onClose={() => setActive(null)} onSaved={mode === "review" ? () => reviewReloadRef.current?.() : load} role={me?.role} />}
    </div>
  );
}
