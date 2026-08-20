"use client";
/* Демонстрационная витрина для руководства (ТЗ 2026-08: 5 экранов, 1920×1080 с
   масштабированием, ← → экраны, F — полный экран, автопрокрутка, тёмная/светлая).
   Порт утверждённого дизайна (Claude Design «Regulatory Dashboard»); данные — из
   /api/dashboard (снапшот, admin-only). Денежные оценки (SCM, % ВВП) убраны
   сознательно — на витрине только твёрдые величины.
   (Прежний легаси-дашборд MVP-контура удалён: не имел входящих ссылок.) */
import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";

type Row = { name: string; v: number };
type Profile = {
  name: string; total: number; permits: number; start: number; annual: number;
  s_plan: number; s_reg: number; s_launch: number; s_work: number; s_report: number; s_close: number;
};
interface Snap {
  at: string;
  totals: { req: number; uniq: number; npa: number; permits: number };
  cleanup: { excluded: number; repealed: number };
  dups: { groups: number; reqs: number };
  ara: { total: number; overdue: number; not_due: number; on_time: number; no_deadline: number };
  counts: { spheres: number; organs: number };
  topInd: Row[]; topAuth: Row[]; regions: Row[]; audience: Row[];
  months: { name: string; added: number; removed: number }[];
  profiles: Profile[];
  service: { ai: number; profilesTotal: number };
}

const FONTS = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Spectral:wght@500;600&display=swap";
const NAV = ["Нагрузка", "Карта", "Цена входа", "Чистка", "Сервис"];
const STAGE_KEYS: [keyof Profile, string][] = [
  ["s_plan", "Планирование"], ["s_reg", "Регистрация"], ["s_launch", "Запуск"],
  ["s_work", "Работа"], ["s_report", "Отчётность"], ["s_close", "Закрытие"],
];
const fmt = (v: number) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const card: CSSProperties = {
  background: "var(--srf)", border: "1px solid var(--bd)", borderRadius: 18,
  boxShadow: "var(--shadow)",
};
const kpiLabel: CSSProperties = { font: "700 22px/1.25 Manrope,sans-serif", color: "var(--mu)", letterSpacing: ".02em" };
const h1s: CSSProperties = { margin: 0, font: "600 46px/1.05 Spectral,Georgia,serif", letterSpacing: "-.015em" };
const subs: CSSProperties = { margin: "0 0 5px", font: "500 22px/1.35 Manrope,sans-serif", color: "var(--mu)", maxWidth: 900 };

export default function DashboardPage() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [err, setErr] = useState("");
  const [screen, setScreen] = useState(1);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [service, setService] = useState(false);
  const [auto, setAuto] = useState(false);
  const [profile, setProfile] = useState(0);
  const [t, setT] = useState(0);
  const [scale, setScale] = useState(1);
  const raf = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sRef = useRef(screen);
  sRef.current = screen;

  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setSnap(d)))
      .catch(() => setErr("Сбой загрузки снапшота"));
  }, []);

  const animate = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 1100);
      setT(p);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setScreen((s) => (s >= 5 ? 1 : s + 1));
      else if (e.key === "ArrowLeft") setScreen((s) => (s <= 1 ? 5 : s - 1));
      else if (e.key === "ArrowDown") setProfile((p) => (p + 1) % 10);
      else if (e.key === "ArrowUp") setProfile((p) => (p + 9) % 10);
      else if (e.key === "f" || e.key === "F") {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
        else document.exitFullscreen();
      }
    };
    const onResize = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    onResize();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf.current);
      if (timer.current) clearInterval(timer.current);
    };
  }, []);
  useEffect(() => { animate(); }, [screen, animate]);

  const toggleAuto = () => {
    if (timer.current) clearInterval(timer.current);
    if (!auto) timer.current = setInterval(() => setScreen((s) => (s >= 5 ? 1 : s + 1)), 12000);
    setAuto(!auto);
  };

  if (err) return <div style={{ padding: 40, font: "600 18px Manrope,sans-serif" }}>{err}</div>;
  if (!snap) return <div style={{ padding: 40, font: "600 18px Manrope,sans-serif", color: "#888" }}>Готовим витрину…</div>;

  const ease = 1 - Math.pow(1 - t, 3);
  const an = (v: number) => fmt(Math.round(v * ease));
  const chip = (active: boolean): CSSProperties => ({
    font: "600 15px/1 Manrope,sans-serif", padding: "9px 13px", borderRadius: 8, cursor: "pointer",
    border: "1px solid " + (active ? "transparent" : "var(--bd)"),
    background: active ? "var(--ac)" : "transparent",
    color: active ? "var(--bg)" : "var(--mu)", letterSpacing: ".01em",
  });
  const bar = (pct: number, color: string, d: number): CSSProperties => ({
    width: pct + "%", height: "100%", background: color, borderRadius: 3,
    transformOrigin: "left center", animation: `grow .9s cubic-bezier(.2,.8,.2,1) ${d}s both`,
  });

  const S = snap;
  const addedPeriod = S.months.reduce((a, m) => a + m.added, 0);
  const removedPeriod = S.months.reduce((a, m) => a + m.removed, 0);
  const balance = removedPeriod - addedPeriod;
  const mMax = Math.max(1, ...S.months.map((m) => Math.max(m.added, m.removed)));
  const maxInd = Math.max(1, ...S.topInd.map((r) => r.v));
  const maxAuth = Math.max(1, ...S.topAuth.map((r) => r.v));
  const maxReg = Math.max(1, ...S.regions.map((r) => r.v));
  const audSum = Math.max(1, S.audience.reduce((a, x) => a + x.v, 0));
  const audCols = ["var(--ac)", "var(--gd)", "var(--rd)", "var(--gr)"];
  const p = S.profiles[profile] || S.profiles[0];
  const stages = STAGE_KEYS.map(([k, name]) => ({ name, v: p[k] as number }));
  const stageMax = Math.max(1, ...stages.map((s) => s.v));
  const cum: number[] = [];
  S.months.reduce((a, m) => { const n = a + m.removed; cum.push(n); return n; }, 0);
  const cumMax = Math.max(1, cum[cum.length - 1] || 1);
  const pts = cum.map((v, i) => `${40 + (728 / Math.max(1, cum.length - 1)) * i},${(200 - (v / cumMax) * 166.3).toFixed(1)}`);

  return (
    <div data-theme={theme} style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "var(--bg)", fontFamily: "Manrope,system-ui,sans-serif" }}>
      <style>{`
        @import url("${FONTS}");
        html,body{margin:0;padding:0;background:#0A1417}
        [data-theme]{--bg:#09151A;--srf:#0F2027;--srf2:#14282F;--bd:rgba(255,255,255,.12);--tx:#EAF3F4;--mu:rgba(234,243,244,.56);--ac:#2FC2D6;--gd:#F2C230;--gr:#57C08C;--rd:#E4735A;--shadow:0 1px 0 rgba(255,255,255,.04) inset}
        [data-theme="light"]{--bg:#F1EEE8;--srf:#FFFFFF;--srf2:#F8F6F2;--bd:rgba(10,22,26,.13);--tx:#0B1A1F;--mu:rgba(11,26,31,.60);--ac:#0C7284;--gd:#96690A;--gr:#26805A;--rd:#AE4127;--shadow:0 1px 2px rgba(10,22,26,.06)}
        @keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
        @keyframes fade{from{opacity:0}to{opacity:1}}
        @keyframes draw{from{stroke-dashoffset:1400}to{stroke-dashoffset:0}}
        @keyframes swell{from{transform:scaleY(0)}to{transform:scaleY(1)}}
      `}</style>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "center center", flex: "none" }}>
        <div style={{ width: 1920, height: 1080, flex: "none", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--tx)", fontVariantNumeric: "tabular-nums" }}>

          <header style={{ height: 104, flex: "none", display: "flex", alignItems: "center", gap: 28, padding: "0 44px", borderBottom: "1px solid var(--bd)" }}>
            <div style={{ width: 54, height: 54, flex: "none", border: "1px dashed var(--bd)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", font: "600 11px/1 Manrope,sans-serif", letterSpacing: ".08em", color: "var(--mu)" }}>ГЕРБ</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <div style={{ font: "600 25px/1.15 Spectral,Georgia,serif" }}>Реестр обязательных требований</div>
              <div style={{ font: "500 16px/1.2 Manrope,sans-serif", color: "var(--mu)" }}>Министерство национальной экономики Республики Казахстан</div>
            </div>
            <div style={{ flex: 1 }} />
            <nav style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {NAV.map((label, i) => (
                <button key={label} onClick={() => setScreen(i + 1)} style={chip(screen === i + 1)}>{i + 1}. {label}</button>
              ))}
            </nav>
            <div style={{ width: 1, height: 44, background: "var(--bd)", flex: "none" }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flex: "none" }}>
              <div style={{ font: "700 17px/1.1 Manrope,sans-serif" }}>срез на {S.at}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={chip(false)}>{theme === "dark" ? "☀ светлая" : "☾ тёмная"}</button>
                <button onClick={toggleAuto} style={chip(auto)}>{auto ? "❙❙ автопрокрутка" : "▶ автопрокрутка"}</button>
                <button onClick={() => setService(!service)} style={{ ...chip(false), ...(service ? { color: "var(--rd)", borderColor: "var(--rd)" } : {}) }}>служебный</button>
              </div>
            </div>
          </header>

          <main style={{ flex: 1, minHeight: 0, padding: "30px 44px 0", display: "flex", flexDirection: "column" }}>

            {screen === 1 && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22, animation: "fade .4s ease" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 36 }}>
                  <h1 style={h1s}>Регуляторная нагрузка страны</h1>
                  <p style={{ ...subs, maxWidth: 820 }}>Впервые нагрузка на бизнес измерена как единая управляемая величина — в требованиях и в динамике.</p>
                </div>
                <div style={{ display: "flex", gap: 22, flex: "none" }}>
                  <section style={{ ...card, width: 760, flex: "none", padding: "34px 38px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
                    <div style={{ font: "700 20px/1.2 Manrope,sans-serif", letterSpacing: ".10em", textTransform: "uppercase", color: "var(--gd)" }}>снято избыточных требований</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
                      <div style={{ font: "800 134px/.92 Manrope,sans-serif", letterSpacing: "-.045em", color: "var(--gd)" }}>{an(S.cleanup.excluded)}</div>
                      <div style={{ font: "700 30px/1.1 Manrope,sans-serif", color: "var(--mu)" }}>исключено<br />с причиной</div>
                    </div>
                    <div style={{ height: 1, background: "var(--bd)", margin: "16px 0 14px" }} />
                    <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                      <div style={{ font: "800 62px/1 Manrope,sans-serif", letterSpacing: "-.03em" }}>{an(S.cleanup.repealed)}</div>
                      <div style={{ font: "600 26px/1.25 Manrope,sans-serif", color: "var(--mu)" }}>снято автоматически<br />по утратившим силу актам</div>
                    </div>
                  </section>
                  <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 22 }}>
                    <div style={{ ...card, padding: "26px 30px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div style={kpiLabel}>Действующих обязательных требований к бизнесу</div>
                      <div style={{ font: "800 74px/1 Manrope,sans-serif", letterSpacing: "-.035em" }}>{an(S.totals.req)}</div>
                    </div>
                    <div style={{ ...card, padding: "26px 30px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div style={kpiLabel}>Уникальных после ИИ-дедупликации</div>
                      <div style={{ font: "800 74px/1 Manrope,sans-serif", letterSpacing: "-.035em", color: "var(--ac)" }}>{an(S.totals.uniq)}</div>
                    </div>
                    <div style={{ ...card, padding: "26px 30px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div style={kpiLabel}>Охват реестра</div>
                      <div style={{ display: "flex", gap: 34 }}>
                        {([[S.totals.npa, "НПА"], [S.counts.spheres, "сфер"], [S.counts.organs, "органов"]] as [number, string][]).map(([v, l]) => (
                          <div key={l} style={{ display: "flex", flexDirection: "column" }}>
                            <div style={{ font: "800 50px/1 Manrope,sans-serif", letterSpacing: "-.03em" }}>{fmt(v)}</div>
                            <div style={{ font: "600 20px/1.2 Manrope,sans-serif", color: "var(--mu)" }}>{l}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ ...card, padding: "26px 30px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div style={kpiLabel}>Разрешительных документов (лицензии, разрешения)</div>
                      <div style={{ font: "800 74px/1 Manrope,sans-serif", letterSpacing: "-.035em" }}>{an(S.totals.permits)}</div>
                    </div>
                  </div>
                </div>
                <section style={{ ...card, flex: 1, minHeight: 0, padding: "26px 38px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <div style={{ font: "700 22px/1.2 Manrope,sans-serif" }}>Регуляторные весы за период (8 месяцев)</div>
                    <div style={{ font: "700 22px/1.2 Manrope,sans-serif", color: balance >= 0 ? "var(--gr)" : "var(--rd)" }}>
                      баланс {balance >= 0 ? "−" : "+"}{fmt(Math.abs(balance))} требований: реестр {balance >= 0 ? "сокращается" : "пополняется"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 24, flex: "none" }}>
                    <div style={{ width: 290, flex: "none", textAlign: "right" }}>
                      <div style={{ font: "700 38px/1 Manrope,sans-serif", color: "var(--gr)" }}>{an(removedPeriod)}</div>
                      <div style={{ font: "600 21px/1.2 Manrope,sans-serif", color: "var(--mu)" }}>исключено избыточных</div>
                    </div>
                    <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                      <div style={{ flex: 1, height: 44, display: "flex", justifyContent: "flex-end" }}>
                        <div style={{ width: `${Math.min(100, (removedPeriod / Math.max(1, removedPeriod, addedPeriod)) * 100)}%`, height: "100%", background: "var(--gr)", borderRadius: "6px 0 0 6px", transformOrigin: "right center", animation: "grow 1s cubic-bezier(.2,.8,.2,1)" }} />
                      </div>
                      <div style={{ width: 3, height: 70, background: "var(--tx)", opacity: .45, flex: "none" }} />
                      <div style={{ flex: 1, height: 44, display: "flex" }}>
                        <div style={{ width: `${Math.min(100, (addedPeriod / Math.max(1, removedPeriod, addedPeriod)) * 100)}%`, height: "100%", background: "var(--rd)", borderRadius: "0 6px 6px 0", transformOrigin: "left center", animation: "grow 1s cubic-bezier(.2,.8,.2,1)" }} />
                      </div>
                    </div>
                    <div style={{ width: 290, flex: "none" }}>
                      <div style={{ font: "700 38px/1 Manrope,sans-serif", color: "var(--rd)" }}>{an(addedPeriod)}</div>
                      <div style={{ font: "600 21px/1.2 Manrope,sans-serif", color: "var(--mu)" }}>добавлено в реестр</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 24, alignItems: "stretch" }}>
                    <div style={{ width: 290, flex: "none", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "right" }}>
                      <div style={{ font: "600 19px/1.3 Manrope,sans-serif", color: "var(--mu)" }}>по месяцам: исключено ▲<br />добавлено ▼ · единый масштаб</div>
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                      <div style={{ flex: 1, display: "flex", gap: 16, alignItems: "flex-end", paddingBottom: 4 }}>
                        {S.months.map((m, i) => (
                          <div key={m.name} style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "flex-end" }}>
                            <div style={{ width: "100%", height: `${(m.removed / mMax) * 100}%`, background: "var(--gr)", borderRadius: "3px 3px 0 0", transformOrigin: "bottom center", animation: `swell .7s cubic-bezier(.2,.8,.2,1) ${0.35 + i * 0.05}s both` }} />
                          </div>
                        ))}
                      </div>
                      <div style={{ height: 3, background: "var(--tx)", opacity: .4, flex: "none" }} />
                      <div style={{ flex: 1, display: "flex", gap: 16, alignItems: "flex-start", paddingTop: 4 }}>
                        {S.months.map((m, i) => (
                          <div key={m.name} style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "flex-start" }}>
                            <div style={{ width: "100%", height: `${(m.added / mMax) * 100}%`, background: "var(--rd)", borderRadius: "0 0 3px 3px", transformOrigin: "top center", animation: `swell .7s cubic-bezier(.2,.8,.2,1) ${0.35 + i * 0.05}s both` }} />
                          </div>
                        ))}
                      </div>
                      <div style={{ flex: "none", display: "flex", gap: 16, paddingTop: 4 }}>
                        {S.months.map((m) => (
                          <div key={m.name} style={{ flex: 1, minWidth: 0, font: "600 18px/1.2 Manrope,sans-serif", color: "var(--mu)", textAlign: "center" }}>{m.name}</div>
                        ))}
                      </div>
                    </div>
                    <div style={{ width: 290, flex: "none" }} />
                  </div>
                  {service && (
                    <div style={{ font: "500 16px/1.3 Manrope,sans-serif", color: "var(--rd)" }}>
                      служебное: «добавлено» = новые карточки реестра за месяц (включая дозаливку хвостов парсинга); историзация балансов — этап 2 (registry_snapshot)
                    </div>
                  )}
                </section>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "none", paddingBottom: 2 }}>
                  <div style={{ width: 9, height: 9, background: "var(--ac)", flex: "none" }} />
                  <div style={{ font: "500 21px/1.3 Manrope,sans-serif", color: "var(--mu)" }}>Каждое требование извлечено из официального текста НПА (ИПС «Әділет») и подтверждается ответственным государственным органом.</div>
                </div>
              </div>
            )}

            {screen === 2 && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, animation: "fade .4s ease" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 36 }}>
                  <h1 style={h1s}>Карта нагрузки</h1>
                  <p style={subs}>Где нагрузка сконцентрирована: отрасли, органы-регуляторы, регионы.</p>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 20 }}>
                  {([["Топ-10 сфер по числу требований", S.topInd, maxInd, "var(--ac)"],
                     ["Топ-10 органов-регуляторов", S.topAuth, maxAuth, "var(--gd)"]] as [string, Row[], number, string][]).map(([title, rows, mx, col]) => (
                    <section key={title} style={{ ...card, flex: 1.3, minWidth: 0, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ font: "700 21px/1.2 Manrope,sans-serif" }}>{title}</div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        {rows.map((r, i) => (
                          <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 300, flex: "none", font: "600 21px/1.2 Manrope,sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                            <div style={{ flex: 1, height: 16, background: "var(--srf2)", borderRadius: 3, overflow: "hidden" }}><div style={bar((r.v / mx) * 100, col, i * 0.04)} /></div>
                            <div style={{ width: 92, flex: "none", textAlign: "right", font: "700 21px/1.2 Manrope,sans-serif" }}>{fmt(r.v)}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
                    <section style={{ ...card, flex: 1.25, minHeight: 0, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ font: "700 21px/1.2 Manrope,sans-serif" }}>Требования актов акиматов<span style={{ color: "var(--mu)", fontWeight: 600 }}> · по регионам</span></div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        {S.regions.map((r, i) => (
                          <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 230, flex: "none", font: "600 19px/1.2 Manrope,sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                            <div style={{ flex: 1, minWidth: 0, height: 18, background: "var(--srf2)", borderRadius: 3, overflow: "hidden" }}><div style={bar((r.v / maxReg) * 100, "var(--ac)", i * 0.05)} /></div>
                            <div style={{ width: 56, flex: "none", textAlign: "right", font: "700 20px/1.2 Manrope,sans-serif" }}>{r.v}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section style={{ ...card, flex: 1, minHeight: 0, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 14 }}>
                      <div style={{ font: "700 21px/1.2 Manrope,sans-serif" }}>Кому адресованы требования</div>
                      <div style={{ height: 26, display: "flex", borderRadius: 5, overflow: "hidden", transformOrigin: "left center", animation: "grow .9s cubic-bezier(.2,.8,.2,1)" }}>
                        {S.audience.map((a, i) => (
                          <div key={a.name} style={{ width: `${(a.v / audSum) * 100}%`, background: audCols[i], height: "100%" }} />
                        ))}
                      </div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-around" }}>
                        {S.audience.map((a, i) => (
                          <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 14, height: 14, borderRadius: 3, background: audCols[i], flex: "none" }} />
                            <div style={{ flex: 1, font: "600 21px/1.2 Manrope,sans-serif" }}>{a.name}</div>
                            <div style={{ font: "700 21px/1.2 Manrope,sans-serif" }}>{Math.round((a.v / audSum) * 100)} %</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "none" }}>
                  <div style={{ width: 9, height: 9, background: "var(--ac)", flex: "none" }} />
                  <div style={{ font: "600 23px/1.3 Manrope,sans-serif" }}>
                    Нагрузка не размазана: шесть сфер из {S.counts.spheres} держат {Math.round(S.topInd.slice(0, 6).reduce((a, r) => a + r.v, 0) / Math.max(1, S.totals.req) * 100)} % всех требований — дерегулирование начинается здесь.
                  </div>
                </div>
              </div>
            )}

            {screen === 3 && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, animation: "fade .4s ease" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 36 }}>
                  <h1 style={h1s}>Цена входа в бизнес</h1>
                  <p style={subs}>Адресные требования типовых профилей — по классификатору ОКЭД реестра.</p>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 20 }}>
                  <section style={{ ...card, width: 430, flex: "none", padding: "22px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ font: "700 21px/1.2 Manrope,sans-serif" }}>Профиль бизнеса</div>
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {S.profiles.map((pr, i) => (
                        <button key={pr.name} onClick={() => setProfile(i)} style={{
                          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, cursor: "pointer",
                          padding: "14px 16px", borderRadius: 12, textAlign: "left",
                          border: "1px solid " + (i === profile ? "transparent" : "var(--bd)"),
                          background: i === profile ? "var(--ac)" : "var(--srf2)",
                          color: i === profile ? "var(--bg)" : "var(--tx)", transition: "background .15s ease",
                        }}>
                          <span style={{ font: "700 20px/1.15 Manrope,sans-serif" }}>{pr.name}</span>
                          <span style={{ font: "600 15px/1.2 Manrope,sans-serif", opacity: i === profile ? 0.75 : 0.55 }}>{fmt(pr.total)} требований</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ font: "500 20px/1.3 Manrope,sans-serif", color: "var(--mu)" }}>Ведущий выбирает профиль кликом или клавишами ↑ ↓ — отклик мгновенный.</div>
                  </section>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ flex: "none", display: "flex", gap: 20 }}>
                      {([["Требований на старте", p.start, false], ["Разрешительных документов", p.permits, false], ["В ежегодной работе", p.annual, false], ["Всего адресных требований", p.total, true]] as [string, number, boolean][]).map(([l, v, gold]) => (
                        <div key={l} style={{ ...card, flex: gold ? 1.25 : 1, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ font: "700 21px/1.25 Manrope,sans-serif", color: gold ? "var(--gd)" : "var(--mu)" }}>{l}</div>
                          <div style={{ font: "800 66px/1 Manrope,sans-serif", letterSpacing: "-.035em", color: gold ? "var(--gd)" : "var(--tx)" }}>{an(v)}</div>
                        </div>
                      ))}
                    </div>
                    <section style={{ ...card, flex: 1, minHeight: 0, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                        <div style={{ font: "700 22px/1.2 Manrope,sans-serif" }}>Жизненный цикл дела</div>
                        <div style={{ font: "600 19px/1.2 Manrope,sans-serif", color: "var(--mu)" }}>{p.name} · всего {fmt(p.total)} требований</div>
                      </div>
                      <div style={{ flex: 1, display: "flex", gap: 12, alignItems: "stretch" }}>
                        {stages.map((s, i) => (
                          <div key={s.name} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 10 }}>
                            <div style={{ font: "800 34px/1 Manrope,sans-serif", textAlign: "center" }}>{fmt(s.v)}</div>
                            <div style={{ height: `${Math.max(6, (s.v / stageMax) * 100)}%`, background: i === 3 ? "var(--gd)" : "var(--ac)", borderRadius: "5px 5px 0 0", transformOrigin: "bottom center", animation: `swell .7s cubic-bezier(.2,.8,.2,1) ${i * 0.06}s both` }} />
                            <div style={{ font: "600 20px/1.2 Manrope,sans-serif", color: "var(--mu)", textAlign: "center", height: 42 }}>{s.name}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section style={{ ...card, flex: "none", padding: "20px 28px", display: "flex", alignItems: "center", gap: 30 }}>
                      <div style={{ font: "700 21px/1.2 Manrope,sans-serif", width: 180, flex: "none" }}>Сравнение<br /><span style={{ fontWeight: 600, color: "var(--mu)", fontSize: 19 }}>рядом</span></div>
                      {[S.profiles[0], S.profiles[1], S.profiles[3]].filter(Boolean).map((c) => (
                        <div key={c.name} style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 14, borderLeft: "1px solid var(--bd)", paddingLeft: 24 }}>
                          <div style={{ font: "800 46px/1 Manrope,sans-serif", letterSpacing: "-.03em", color: "var(--ac)" }}>{fmt(c.total)}</div>
                          <div style={{ font: "600 19px/1.25 Manrope,sans-serif" }}>{c.name}<br /><span style={{ color: "var(--mu)", fontWeight: 500 }}>{c.permits} разрешений</span></div>
                        </div>
                      ))}
                    </section>
                  </div>
                </div>
                {service && (
                  <div style={{ font: "500 16px/1.3 Manrope,sans-serif", color: "var(--rd)", flex: "none" }}>
                    служебное: счётчики профиля = адресные требования по ОКЭД-префиксам; полный персональный перечень (с отраслевыми нормами) строит Бизнес-навигатор
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "none" }}>
                  <div style={{ width: 9, height: 9, background: "var(--ac)", flex: "none" }} />
                  <div style={{ font: "600 23px/1.3 Manrope,sans-serif" }}>Абстрактные тысячи превращаются в понятную цену конкретного дела.</div>
                </div>
              </div>
            )}

            {screen === 4 && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, animation: "fade .4s ease" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 36 }}>
                  <h1 style={h1s}>Чистка и качество регуляторики</h1>
                  <p style={subs}>Как государство сокращает нагрузку и не даёт ей накапливаться заново.</p>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 20 }}>
                  <div style={{ flex: 1.15, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
                    <section style={{ ...card, flex: 1, minHeight: 0, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ font: "700 22px/1.2 Manrope,sans-serif" }}>Исключено избыточных требований — накопленный итог</div>
                      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "stretch" }}>
                        <svg viewBox="0 0 800 220" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
                          <line x1="40" y1="200" x2="790" y2="200" stroke="var(--bd)" strokeWidth="1" />
                          <line x1="40" y1="33.7" x2="790" y2="33.7" stroke="var(--bd)" strokeWidth="1" strokeDasharray="4 6" />
                          <path d={`M${pts.join(" L")} L${pts[pts.length - 1]?.split(",")[0] || 768},200 L40,200 Z`} fill="color-mix(in oklab, var(--gr) 16%, transparent)" style={{ animation: "fade 1.1s ease" }} />
                          <polyline points={pts.join(" ")} fill="none" stroke="var(--gr)" strokeWidth="4" strokeLinejoin="round" strokeDasharray="1400" style={{ animation: "draw 1.3s cubic-bezier(.3,.7,.2,1) forwards" }} />
                        </svg>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", font: "600 16px/1 Manrope,sans-serif", color: "var(--mu)", padding: "0 6px" }}>
                        <span>{S.months[0]?.name}</span><span>{S.months[Math.floor(S.months.length / 2)]?.name}</span><span>{S.months[S.months.length - 1]?.name}</span>
                      </div>
                    </section>
                    <div style={{ flex: "none", display: "flex", gap: 20 }}>
                      <div style={{ ...card, flex: 1, padding: "24px 28px" }}>
                        <div style={{ ...kpiLabel, marginBottom: 8 }}>Исключено с причиной, всего</div>
                        <div style={{ font: "800 68px/1 Manrope,sans-serif", letterSpacing: "-.035em", color: "var(--gr)" }}>{an(S.cleanup.excluded)}</div>
                      </div>
                      <div style={{ ...card, flex: 1.2, padding: "24px 28px" }}>
                        <div style={{ ...kpiLabel, marginBottom: 8 }}>Снято автоматически по утратившим силу актам</div>
                        <div style={{ font: "800 68px/1 Manrope,sans-serif", letterSpacing: "-.035em", color: "var(--gr)" }}>{an(S.cleanup.repealed)}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
                    <section style={{ ...card, flex: 1, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ font: "700 22px/1.2 Manrope,sans-serif" }}>Дублирующие требования</div>
                      <div style={{ font: "500 20px/1.3 Manrope,sans-serif", color: "var(--mu)" }}>Семантический анализ ИИ по всему реестру</div>
                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 34 }}>
                        <div><div style={{ font: "800 76px/1 Manrope,sans-serif", letterSpacing: "-.035em" }}>{an(S.dups.groups)}</div><div style={{ font: "600 21px/1.2 Manrope,sans-serif", color: "var(--mu)" }}>групп дублей</div></div>
                        <div style={{ width: 1, height: 70, background: "var(--bd)" }} />
                        <div><div style={{ font: "800 76px/1 Manrope,sans-serif", letterSpacing: "-.035em" }}>{an(S.dups.reqs)}</div><div style={{ font: "600 21px/1.2 Manrope,sans-serif", color: "var(--mu)" }}>требований в них</div></div>
                      </div>
                      <div style={{ font: "600 18px/1.35 Manrope,sans-serif" }}>Подсвечены ответственным органам для устранения в установленном порядке.</div>
                    </section>
                    <section style={{ ...card, flex: 1.15, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ font: "700 22px/1.2 Manrope,sans-serif" }}>Срок годности требования (АРА)</div>
                      <div style={{ font: "500 20px/1.3 Manrope,sans-serif", color: "var(--mu)" }}>Автоматический пересмотр раз в 2–3 года — регуляторика перестаёт «жить вечно»</div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
                        {([[S.ara.overdue, "просрочено", "var(--rd)"], [S.ara.not_due, "срок не наступил", "var(--gd)"], [S.ara.on_time, "рассмотрено в срок", "var(--ac)"], [S.ara.no_deadline, "срок не проставлен", "var(--mut)"]] as [number, string, string][]).map(([v, name, col], i) => (
                          <div key={name} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                            <div style={{ width: 112, flex: "none", font: "800 32px/1 Manrope,sans-serif", textAlign: "right" }}>{fmt(v)}</div>
                            <div style={{ flex: 1, height: 22, background: "var(--srf2)", borderRadius: 4, overflow: "hidden" }}>
                              <div style={bar((v / Math.max(1, S.ara.total)) * 100, col, i * 0.08)} />
                            </div>
                            <div style={{ width: 230, flex: "none", font: "600 20px/1.2 Manrope,sans-serif", color: "var(--mu)" }}>{name}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section style={{ flex: "none", background: "var(--srf2)", border: "1px solid var(--bd)", borderRadius: 18, padding: "20px 28px", display: "flex", alignItems: "center", gap: 20 }}>
                      <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--gr)", flex: "none", boxShadow: "0 0 0 6px color-mix(in oklab, var(--gr) 22%, transparent)" }} />
                      <div style={{ font: "600 19px/1.35 Manrope,sans-serif" }}>Реестр синхронизирован с ИПС «Әділет»: утратившие силу акты исключаются автоматически — {fmt(S.cleanup.repealed)} требований снято без ручного участия.</div>
                    </section>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "none" }}>
                  <div style={{ width: 9, height: 9, background: "var(--ac)", flex: "none" }} />
                  <div style={{ font: "600 23px/1.3 Manrope,sans-serif" }}>Требования больше не накапливаются бесконечно: у каждого есть срок пересмотра и владелец.</div>
                </div>
              </div>
            )}

            {screen === 5 && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22, animation: "fade .4s ease" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 36 }}>
                  <h1 style={h1s}>Сервис для бизнеса</h1>
                  <p style={subs}>Реестр работает на предпринимателя уже сегодня — business.rot.kz</p>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 22 }}>
                  <section style={{ ...card, flex: 1.5, minWidth: 0, padding: "30px 34px", display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ font: "700 24px/1.2 Manrope,sans-serif" }}>Бизнес-навигатор: три минуты вместо визита в госорган</div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 16 }}>
                      {[["1", "Указать вид деятельности", `ОКЭД или один из ${S.service.profilesTotal} готовых профилей Бизнес-навигатора`],
                        ["2", "Получить персональный перечень", "Только те требования, что относятся к этому делу — со ссылкой на норму НПА"],
                        ["3", "Прочитать ИИ-заключение", "Что делать на старте, какие разрешения нужны, что сдавать ежегодно"]].map(([n, title, text]) => (
                        <div key={n} style={{ flex: 1, display: "flex", alignItems: "center", gap: 26, background: "var(--srf2)", borderRadius: 14, padding: "22px 26px" }}>
                          <div style={{ width: 62, height: 62, flex: "none", borderRadius: "50%", background: "var(--bg)", border: "1px solid var(--bd)", display: "flex", alignItems: "center", justifyContent: "center", font: "800 28px/1 Manrope,sans-serif", color: "var(--ac)" }}>{n}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ font: "700 25px/1.2 Manrope,sans-serif", marginBottom: 5 }}>{title}</div>
                            <div style={{ font: "500 19px/1.3 Manrope,sans-serif", color: "var(--mu)" }}>{text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ font: "600 21px/1.35 Manrope,sans-serif", color: "var(--ac)" }}>Ни одного визита в госорган, ни одного запроса — перечень требований формирует сам реестр.</div>
                  </section>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 22 }}>
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 22 }}>
                      {[["Требований в основе сервиса", fmt(S.totals.req)], ["Выдано ИИ-заключений", fmt(S.service.ai)],
                        ["Готовых профилей бизнеса", String(S.service.profilesTotal)], ["Время до перечня", "≈3 мин"]].map(([l, v]) => (
                        <div key={l} style={{ ...card, padding: "24px 26px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                          <div style={{ font: "700 21px/1.25 Manrope,sans-serif", color: "var(--mu)" }}>{l}</div>
                          <div style={{ font: "800 62px/1 Manrope,sans-serif", letterSpacing: "-.035em" }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <section style={{ ...card, flex: "none", padding: "26px 30px", display: "flex", alignItems: "center", gap: 26 }}>
                      <div style={{ width: 148, height: 148, flex: "none", border: "1px dashed var(--bd)", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--mu)", textAlign: "center" }}>
                        <div style={{ font: "700 15px/1.2 Manrope,sans-serif", letterSpacing: ".06em" }}>QR-КОД</div>
                        <div style={{ font: "500 13px/1.25 Manrope,sans-serif" }}>business.rot.kz</div>
                      </div>
                      <div>
                        <div style={{ font: "700 25px/1.2 Manrope,sans-serif", marginBottom: 8 }}>Откройте с телефона прямо в зале</div>
                        <div style={{ font: "500 19px/1.35 Manrope,sans-serif", color: "var(--mu)" }}>business.rot.kz — тот же реестр, что на экране, в руках предпринимателя.</div>
                      </div>
                    </section>
                  </div>
                </div>
                {service && (
                  <div style={{ font: "500 16px/1.3 Manrope,sans-serif", color: "var(--rd)", flex: "none" }}>служебное: счётчик персональных отчётов — доработка (не журналируется); ИИ-заключения — business_conclusion_cache</div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "none" }}>
                  <div style={{ width: 9, height: 9, background: "var(--ac)", flex: "none" }} />
                  <div style={{ font: "600 23px/1.3 Manrope,sans-serif" }}>Реестр — не архив документов, а работающий сервис: перечень своих требований предприниматель получает за три минуты.</div>
                </div>
              </div>
            )}

          </main>

          <footer style={{ height: 66, flex: "none", display: "flex", alignItems: "center", gap: 24, padding: "0 44px", borderTop: "1px solid var(--bd)" }}>
            <div style={{ font: "600 20px/1.2 Manrope,sans-serif", color: "var(--mu)" }}>По данным реестра обязательных требований на {S.at}</div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
              {NAV.map((_, i) => (
                <div key={i} style={{ width: screen === i + 1 ? 34 : 10, height: 10, borderRadius: 5, background: screen === i + 1 ? "var(--ac)" : "var(--bd)", transition: "width .25s ease" }} />
              ))}
            </div>
            <div style={{ width: 1, height: 26, background: "var(--bd)" }} />
            <div style={{ font: "600 20px/1.2 Manrope,sans-serif", color: "var(--mu)" }}>← → экраны · F полный экран · демонстрационный стенд</div>
          </footer>

        </div>
      </div>
    </div>
  );
}
