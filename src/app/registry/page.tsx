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
  layers: (p: any) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></svg>,
  coins: (p: any) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/></svg>,
  copy: (p: any) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  calc: (p: any) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h4"/></svg>,
};
const fmtKzt = (n: number): string => {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + " млрд ₸";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " млн ₸";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + " тыс ₸";
  return Math.round(n).toLocaleString("ru") + " ₸";
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
const SECTION_ICON: Record<string, string> = {
  A: "🌾", B: "⛏️", C: "🏭", D: "⚡", E: "💧", F: "🏗️", G: "🛒", H: "🚚", I: "🏨",
  J: "📡", K: "🏦", L: "🏢", M: "💼", N: "🗂️", P: "🎓", Q: "🩺", R: "🎭", S: "🛠️",
};

// Настраиваемые параметры расчёта нагрузки (cost_params). pct — хранится долей (0.30), показываем %.
const PARAM_FIELDS: { k: string; label: string; unit: string; pct?: boolean; step?: string }[] = [
  { k: "inspector_rate_kzt", label: "Час проверки (государство)", unit: "₸/ч" },
  { k: "overhead", label: "Накладные расходы", unit: "%", pct: true, step: "0.1" },
  { k: "on_costs", label: "Соц. отчисления работодателя", unit: "%", pct: true, step: "0.1" },
  { k: "hours_per_month", label: "Рабочих часов в месяце", unit: "ч" },
  { k: "mult_clerical", label: "Множитель: делопроизводитель", unit: "×", step: "0.1" },
  { k: "mult_specialist", label: "Множитель: специалист", unit: "×", step: "0.1" },
  { k: "mult_manager", label: "Множитель: руководитель", unit: "×", step: "0.1" },
  { k: "avg_wage_month", label: "Средняя зарплата (резерв)", unit: "₸/мес" },
];
const paramsToForm = (p: Record<string, unknown> | null): Record<string, string> => {
  const f: Record<string, string> = {};
  if (!p) return f;
  for (const fld of PARAM_FIELDS) {
    const v = Number(p[fld.k]);
    f[fld.k] = fld.pct ? String(Math.round(v * 1000) / 10) : String(v);
  }
  return f;
};
const formToParams = (f: Record<string, string>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const fld of PARAM_FIELDS) {
    const n = Number(f[fld.k]);
    if (!isNaN(n) && f[fld.k] !== "") out[fld.k] = fld.pct ? n / 100 : n;
  }
  return out;
};

interface Req {
  id: number; ngr: string | null; npa_title: string | null; article: string | null;
  ministry: string | null; sphere_code: string | null; sphere_name: string | null;
  okeds: string[] | null; stages: string[] | null;
  title: string | null; legal_text: string | null; canon_text: string | null;
  subject: string | null; action: string | null; object: string | null; condition: string | null;
  scope?: string | null; sections?: string[] | null; triggers?: string[] | null; is_permit?: boolean | null;
  action_type?: string | null; time_hours?: number | null; frequency_per_year?: number | null;
  external_cost_kzt?: number | null; cost_per_entity_kzt?: number | null; staff_role?: string | null;
  inspection_hours_biz?: number | null; inspection_cost_biz?: number | null; inspection_cost_gov?: number | null;
  authority_code?: string | null; review_status?: string | null; ara_status?: string | null;
  ara_deadline?: string | null; review_comment?: string | null; norm_url?: string | null;
}
const REVIEW_LABEL: Record<string, string> = {
  pending: "на подтверждении", confirmed: "подтверждено", rejected: "отклонено", edited: "отредактировано",
};
interface Scenario { id: string; title: string; oked: string; section: string; icon: string; desc: string; }
interface SectionRow { section: string; name_ru: string; biz_total: number | null; workers_thousands: number | null; req_count: number; }
interface OkedRow { code: string; name_ru: string; section: string; section_name: string; }
interface BizProfile { kind: "section" | "scenario" | "oked"; oked?: string; section?: string; title: string; icon?: string; desc?: string; }
interface HorizGroup { sphere_code: string | null; name_ru: string | null; n: number; }
interface BizData { oked: string | null; okedName: string | null; section: string | null; sectionName: string | null; permits: Req[]; sectoral: Req[]; sectoralTotal: number; horizontalGroups: HorizGroup[]; }
interface Question { tag: string; q: string; hint?: string; def: boolean; }
type BizPath = "new" | "expand";
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
        {r.review_status === "confirmed" && <span className="reg-rb reg-rb-confirmed">подтверждено госорганом</span>}
        {(!r.review_status || r.review_status === "pending" || r.review_status === "edited") && <span className="reg-rb reg-rb-pending">на подтверждении</span>}
        {r.ara_status === "исключён" && <span className="reg-rb reg-rb-rejected">исключён</span>}
        {r.sphere_name && <MetaChip color={SPHERE_COLOR[r.sphere_code || ""]}>{r.sphere_name}</MetaChip>}
        {r.ministry && <MetaChip>{minShort(r.ministry)}</MetaChip>}
        {(r.stages || []).slice(0, 3).map((s) => <MetaChip key={s} stage>{STAGE_LABEL[s] || s}</MetaChip>)}
        {(r.stages || []).length > 3 && <MetaChip stage>+{(r.stages || []).length - 3}</MetaChip>}
      </div>
    </article>
  );
}

/* Куда подавать заявку: eLicense (лицензии/разрешения) или eGov (регистрация/налоги/уведомления). */
function applyTarget(r: Req): { url: string; label: string } {
  const t = `${r.title || ""} ${r.action || ""} ${r.object || ""} ${r.legal_text || ""}`.toLowerCase();
  if (/лиценз|разрешени|аккредит|аттестац|сертификат|патент|допуск/.test(t))
    return { url: "https://elicense.kz/", label: "Оформить · eLicense.kz" };
  if (/регистрац|налог|на учёт|на учет|постанов|статист|деклар|уведомлен/.test(t) || r.scope === "horizontal")
    return { url: "https://egov.kz/", label: "Оформить · eGov.kz" };
  return { url: "https://elicense.kz/", label: "Оформить · eLicense.kz" };
}

/* ——— Permit-карточка («Что оформить») ——— */
function PermitCard({ r, onOpen }: { r: Req; onOpen: (r: Req) => void }) {
  const name = r.title || `${r.subject || ""}${r.action ? " → " + r.action : ""}`.trim() || "—";
  const ap = applyTarget(r);
  const adilet = r.norm_url || (r.ngr ? `https://adilet.zan.kz/rus/docs/${r.ngr}` : null);
  return (
    <div className="reg-permit">
      <div className="reg-permit-main" onClick={() => onOpen(r)}>
        <div className="reg-permit-name">{name}</div>
        {r.ministry && <div className="reg-permit-issuer">Выдаёт: {minShort(r.ministry)}</div>}
        {r.npa_title && <div className="reg-permit-npa">{r.npa_title}{r.article ? `, ${r.article}` : ""}</div>}
        {(r.stages || []).length > 0 && <div className="reg-permit-meta">{(r.stages || []).slice(0, 3).map((s) => <span key={s} className="reg-permit-stage">{STAGE_LABEL[s] || s}</span>)}</div>}
      </div>
      <div className="reg-permit-side">
        <a className="reg-apply-btn" href={ap.url} target="_blank" rel="noreferrer">{ap.label}<I.chevRight /></a>
        {adilet && <a className="reg-permit-npalink" href={adilet} target="_blank" rel="noreferrer">Текст НПА</a>}
      </div>
    </div>
  );
}

/* ——— Drawer ——— */
function Drawer({ r, onClose, onSaved, role }: { r: Req; onClose: () => void; onSaved: () => void; role?: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.canon_text || r.legal_text || "");
  const [busy, setBusy] = useState(false);
  const [rbusy, setRbusy] = useState(false);
  const [araDate, setAraDate] = useState<string>(() => {
    if (r.ara_deadline) return String(r.ara_deadline).slice(0, 10);
    const d = new Date(); d.setFullYear(d.getFullYear() + (/^[KZ]/i.test(r.ngr || "") ? 3 : 2));
    return d.toISOString().slice(0, 10);
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const heading = r.title || `${r.subject || ""}${r.action ? " → " + r.action : ""}`.trim();
  const adilet = r.norm_url || (r.ngr ? `https://adilet.zan.kz/rus/docs/${r.ngr}` : null);
  async function save() {
    setBusy(true);
    try {
      await fetch("/api/registry/review", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, action: "edit", fields: { canon_text: text } }) });
      onSaved(); setEditing(false);
    } finally { setBusy(false); }
  }
  async function review(action: string, extra: Record<string, unknown> = {}) {
    setRbusy(true);
    try {
      const res = await fetch("/api/registry/review", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, action, ...extra }) });
      if (res.ok) { onSaved(); onClose(); }
      else { const e = await res.json().catch(() => ({})); alert(e.error || "Ошибка"); }
    } finally { setRbusy(false); }
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
          {r.review_status && (role === "expert" || role === "admin") && (
            <div className="reg-d-section reg-review-box">
              <div className="reg-d-section-h">Ревью госоргана</div>
              <div className="reg-review-status">
                Статус: <b className={"reg-rb reg-rb-" + r.review_status}>{REVIEW_LABEL[r.review_status] || r.review_status}</b>
                {r.ara_status && <span className="reg-rb reg-rb-ara">{r.ara_status}</span>}
              </div>
              {r.review_comment && <div className="reg-review-comment">Комментарий: {r.review_comment}</div>}
              <label className="reg-review-ara">Срок проведения АРА
                <input type="date" value={araDate} onChange={(e) => setAraDate(e.target.value)} />
              </label>
              <div className="reg-review-acts">
                <button className="reg-rev-confirm" disabled={rbusy} onClick={() => review("confirm", { ara_deadline: araDate })}>Подтвердить</button>
                <button className="reg-rev-reject" disabled={rbusy} onClick={() => review("reject")}>Отклонить</button>
                {role === "admin" && r.review_status === "confirmed" && (
                  <button className="reg-rev-include" disabled={rbusy} onClick={() => review("include")}>Включить в реестр</button>
                )}
              </div>
            </div>
          )}
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
          {r.cost_per_entity_kzt != null && (
            <div className="reg-d-section">
              <div className="reg-d-section-h">Оценка нагрузки (Standard Cost Model)</div>
              <dl className="reg-d-grid">
                <dt>Стоимость</dt><dd><b>{fmtKzt(Number(r.cost_per_entity_kzt))}</b> / субъект / год</dd>
                {r.time_hours != null && <><dt>Трудозатраты</dt><dd>{Number(r.time_hours)} ч × {Number(r.frequency_per_year)}/год{r.staff_role ? ` · ${r.staff_role}` : ""}</dd></>}
                {Number(r.external_cost_kzt) > 0 && <><dt>Внешние расходы</dt><dd>{fmtKzt(Number(r.external_cost_kzt))} (пошлины/услуги)</dd></>}
                {Number(r.inspection_cost_gov) > 0 && <><dt>Стоимость проверки</dt><dd>государству {fmtKzt(Number(r.inspection_cost_gov))} · бизнесу {fmtKzt(Number(r.inspection_cost_biz))}{r.inspection_hours_biz ? ` (${Number(r.inspection_hours_biz)} ч)` : ""}</dd></>}
              </dl>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>Предварительная ИИ-оценка; госорган может уточнить.</div>
            </div>
          )}
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

/* Минимальный markdown→HTML для ИИ-заключения (## ### - * **bold**) */
function mdToHtml(md: string): { __html: string } {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, "<i>$1</i>");
  let html = "", inList = false;
  for (let ln of esc(md).split("\n")) {
    ln = ln.trimEnd();
    const close = () => { if (inList) { html += "</ul>"; inList = false; } };
    if (/^#{1,3}\s+/.test(ln)) { close(); const lvl = ln.match(/^#+/)![0].length; html += `<h${lvl === 1 ? 3 : lvl + 1}>${inline(ln.replace(/^#+\s+/, ""))}</h${lvl === 1 ? 3 : lvl + 1}>`; }
    else if (/^[-*]\s+/.test(ln)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(ln.replace(/^[-*]\s+/, ""))}</li>`; }
    else if (/^\d+\.\s+/.test(ln)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(ln.replace(/^\d+\.\s+/, ""))}</li>`; }
    else if (ln.trim() === "") close();
    else { close(); html += `<p>${inline(ln)}</p>`; }
  }
  if (inList) html += "</ul>";
  return { __html: html };
}

interface Organ { ministry: string; npa_count: number; npa_active: number; req_count: number; overdue: number; }
interface Npa {
  ngr: string; title: string; ministry: string; npa_status: string;
  date_adopted: string | null; date_revision: string | null; review_deadline: string | null;
  overdue: boolean; req_count: number; adilet_url: string;
}

export default function RegistryPage() {
  const [mode, setMode] = useState<"gov" | "biz" | "organs" | "cost" | "dupes" | "method" | "review">("gov");
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

  // Ревью госоргана (очередь апрува по органам)
  const [me, setMe] = useState<{ id: number; username: string; role: string; assigned_authorities: string[] } | null>(null);
  const [rq, setRq] = useState<any>(null);
  const [rqStatus, setRqStatus] = useState("pending");
  const [rqPage, setRqPage] = useState(1);
  const [rqQ, setRqQ] = useState("");
  const [rqQd, setRqQd] = useState("");
  const [rqSel, setRqSel] = useState<number[]>([]);
  const [rqAra, setRqAra] = useState<string>(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 2); return d.toISOString().slice(0, 10); });
  const [rqBusy, setRqBusy] = useState(false);
  useEffect(() => { fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => setMe(d?.user || null)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => setRqQd(rqQ), 400); return () => clearTimeout(t); }, [rqQ]);
  const loadReviewQueue = useCallback(() => {
    const p = new URLSearchParams({ status: rqStatus, page: String(rqPage), limit: "20" });
    if (rqQd) p.set("q", rqQd);
    fetch(`/api/registry/review-queue?${p}`).then((r) => r.json()).then((d) => { setRq(d); setRqSel([]); }).catch(() => {});
  }, [rqStatus, rqPage, rqQd]);
  useEffect(() => { if (mode === "review") loadReviewQueue(); }, [mode, loadReviewQueue]);
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

  // бизнес-режим (Guided Search: путь → select → survey → report)
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
  // опросник
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  // ИИ-заключение
  const [conclusion, setConclusion] = useState<string | null>(null);
  const [conclLoading, setConclLoading] = useState(false);
  const [conclErr, setConclErr] = useState<string | null>(null);
  // cost-management (Нагрузка)
  const [costData, setCostData] = useState<any>(null);
  const [costParams, setCostParams] = useState<Record<string, string>>({});
  const [paramsSaving, setParamsSaving] = useState(false);
  // методика — параметры интерактивного калькулятора
  const [mWage, setMWage] = useState(441998);
  const [mTime, setMTime] = useState(2);
  const [mFreq, setMFreq] = useState(12);
  const [mRole, setMRole] = useState("specialist");
  // дубли
  const [dupes, setDupes] = useState<{ groups: any[]; totalDuplicates: number; totalGroups: number; crossGroups?: number; rawCrossGroups?: number } | null>(null);
  const [dupeCross, setDupeCross] = useState(true);
  const [openDupe, setOpenDupe] = useState<string | null>(null);
  const [dupeItems, setDupeItems] = useState<Record<string, Req[]>>({});

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
  // Нагрузка
  useEffect(() => {
    if ((mode === "cost" || mode === "method") && !costData)
      fetch("/api/registry/cost").then((r) => r.json()).then((d) => { setCostData(d); setCostParams(paramsToForm(d.params)); });
  }, [mode, costData]);
  // Дубли
  useEffect(() => {
    if (mode === "dupes")
      fetch(`/api/registry/duplicates?cross=${dupeCross ? "1" : "0"}`).then((r) => r.json()).then(setDupes);
  }, [mode, dupeCross]);
  const toggleDupe = (gid: string) => {
    setOpenDupe((o) => (o === gid ? null : gid));
    if (!dupeItems[gid]) fetch(`/api/registry/duplicates?group=${encodeURIComponent(gid)}`).then((r) => r.json()).then((d) => setDupeItems((p) => ({ ...p, [gid]: d.items || [] })));
  };
  const saveCostParams = () => {
    setParamsSaving(true);
    fetch("/api/registry/cost/params", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formToParams(costParams)) })
      .then((r) => r.json())
      .then(() => fetch("/api/registry/cost").then((r) => r.json()))
      .then((d) => { setCostData(d); setCostParams(paramsToForm(d.params)); })
      .finally(() => setParamsSaving(false));
  };
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

  // бизнес: справочники входа (секции + сценарии)
  useEffect(() => {
    if (mode === "biz" && sections.length === 0)
      fetch("/api/business/sections").then((r) => r.json()).then((d) => setSections(d.sections || []));
    if (mode === "biz" && scenariosList.length === 0)
      fetch("/api/business/scenarios").then((r) => r.json()).then((d) => setScenariosList(d.scenarios || []));
  }, [mode, sections.length, scenariosList.length]);

  // автокомплит ОКЭД
  useEffect(() => {
    const q = okedQ.trim();
    if (q.length < 2) { setOkedResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/business/okved?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((d) => setOkedResults(d.okveds || []));
    }, 250);
    return () => clearTimeout(t);
  }, [okedQ]);

  // опросник: загрузка вопросов + дефолты
  useEffect(() => {
    if (mode === "biz" && questions.length === 0)
      fetch("/api/business/questions").then((r) => r.json()).then((d) => {
        const qs: Question[] = d.questions || [];
        setQuestions(qs);
        setAnswers(Object.fromEntries(qs.map((x) => [x.tag, x.def])));
      });
  }, [mode, questions.length]);

  const activeTriggers = useMemo(() => Object.entries(answers).filter(([, v]) => v).map(([k]) => k), [answers]);

  // выбор профиля → шаг опросника
  const startProfile = (p: BizProfile) => { setBizProfile(p); setBizStep("survey"); setBizData(null); setConclusion(null); setConclErr(null); };

  // показать отчёт (после опросника), с активными триггерами
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

  // ИИ-заключение
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
          {(me?.role === "admin" || me?.role === "moderator") && <button onClick={() => (window.location.href = "/cards/admin/users")}><I.building />Пользователи</button>}
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
      ) : mode === "cost" ? (
        /* ——— Нагрузка (cost-management, SCM) ——— */
        <div className="reg-biz">
          <div className="reg-biz-hero">
            <h1>Регуляторная нагрузка на бизнес</h1>
            <p>Оценка стоимости выполнения требований по модели Standard Cost Model (₸/год). Параметры настраиваемые; время и частота — предварительная ИИ-оценка.</p>
          </div>
          {!costData ? <div className="reg-empty">Загрузка…</div> : (
            <>
              <div className="reg-cost-summary">
                <div className="reg-cost-stat"><b>{fmtKzt(costData.medianPerEntity)}</b><span>медианная стоимость выполнения требования (₸/субъект/год)</span></div>
                <div className="reg-cost-stat"><b>{Number(costData.count).toLocaleString("ru")}</b><span>оценённых требований</span></div>
                <div className="reg-cost-stat"><b>{Number(costData.withExternal).toLocaleString("ru")}</b><span>с пошлинами / внешними расходами</span></div>
              </div>

              {/* Настраиваемые параметры расчёта — смена пересчитывает всё мгновенно (view) */}
              <div className="reg-cost-params">
                <div className="reg-cost-params-h">
                  <span>Параметры расчёта</span>
                  <span className="reg-cost-hint">Значения по умолчанию — БНС / Standard Cost Model. Измените любой — стоимость пересчитается для всех требований.</span>
                </div>
                <div className="reg-cost-params-grid">
                  {PARAM_FIELDS.map((fld) => (
                    <label key={fld.k} className="reg-cost-param">
                      <span className="reg-cost-param-l">{fld.label}</span>
                      <span className="reg-cost-param-in">
                        <input type="number" step={fld.step || "1"} value={costParams[fld.k] ?? ""}
                          onChange={(e) => setCostParams((p) => ({ ...p, [fld.k]: e.target.value }))} />
                        <i>{fld.unit}</i>
                      </span>
                    </label>
                  ))}
                </div>
                <button className="reg-cost-apply" onClick={saveCostParams} disabled={paramsSaving}>
                  {paramsSaving ? "Пересчёт…" : "Применить и пересчитать"}
                </button>
              </div>

              {/* Стоимость проверок — зависит от «часа проверки» и трудозатрат на сопровождение */}
              {Number(costData.withInspection) > 0 && (
                <>
                  <div className="reg-biz-blockh reg-biz-blockh-lg">Стоимость проверок<span className="reg-biz-blockh-cnt">{Number(costData.withInspection).toLocaleString("ru")} требований с выездной проверкой</span></div>
                  <div className="reg-cost-summary">
                    <div className="reg-cost-stat"><b>{fmtKzt(costData.medianInspGov)}</b><span>стоимость проверки государству — медиана (₸)</span></div>
                    <div className="reg-cost-stat"><b>{fmtKzt(costData.avgInspGov)}</b><span>стоимость проверки государству — средняя (₸)</span></div>
                    <div className="reg-cost-stat"><b>{fmtKzt(costData.avgInspBiz)}</b><span>сопровождение проверки бизнесом — средняя (₸)</span></div>
                  </div>
                </>
              )}

              <div className="reg-biz-blockh reg-biz-blockh-lg">Средняя стоимость требования по органам<span className="reg-biz-blockh-cnt">₸/субъект/год</span></div>
              <div className="reg-cost-bars">
                {costData.byMinistry.map((m: any, i: number) => (
                  <div key={i} className="reg-cost-bar">
                    <span className="reg-cost-bar-l" title={m.ministry}>{minShort(m.ministry)}</span>
                    <span className="reg-cost-bar-track"><span className="reg-cost-bar-fill" style={{ width: (Number(m.burden) / Number(costData.byMinistry[0]?.burden || 1) * 100).toFixed(1) + "%" }} /></span>
                    <span className="reg-cost-bar-v">{fmtKzt(Number(m.burden))}</span>
                  </div>
                ))}
              </div>

              <div className="reg-biz-blockh reg-biz-blockh-lg">Топ-50 самых дорогих требований<span className="reg-biz-blockh-cnt">₸ на субъект / год</span></div>
              <div className="reg-cost-table">
                {costData.top.map((r: any) => (
                  <div key={r.id} className="reg-cost-row" onClick={() => setActive(r)}>
                    <span className="reg-cost-row-t">{r.title}</span>
                    <span className="reg-cost-row-meta">{minShort(r.ministry)} · {r.action_type} · {Number(r.time_hours)}ч ×{Number(r.frequency_per_year)}/год{Number(r.external_cost_kzt) > 0 ? ` · пошлина ${fmtKzt(Number(r.external_cost_kzt))}` : ""}</span>
                    <span className="reg-cost-row-v">{fmtKzt(Number(r.cost_per_entity_kzt))}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : mode === "dupes" ? (
        /* ——— Дубли и избыточность ——— */
        <div className="reg-biz">
          <div className="reg-biz-hero">
            <h1>Дублирующие и избыточные требования</h1>
            <p>Группы уточнены по сектору: процедурно похожие действия из разных сфер (например, заявления на разные лицензии) разведены и не считаются дублем. «Кросс-орган» — одно обязательство в одном секторе контролируют разные органы (приоритет для гильотины и правила «1 вошло — 2 вышло»).</p>
          </div>
          <div className="reg-dupe-toolbar">
            <button className={"reg-stage-pill" + (dupeCross ? " on" : "")} onClick={() => setDupeCross(true)}>Кросс-орган</button>
            <button className={"reg-stage-pill" + (!dupeCross ? " on" : "")} onClick={() => setDupeCross(false)}>Все группы</button>
            {dupes && <span className="reg-cost-hint">{Number(dupes.totalDuplicates).toLocaleString("ru")} дублей в {Number(dupes.totalGroups).toLocaleString("ru")} группах{dupeCross && dupes.rawCrossGroups ? ` · разведено по сферам ${(Number(dupes.rawCrossGroups) - Number(dupes.crossGroups)).toLocaleString("ru")} ложных склеек` : ""}</span>}
          </div>
          {!dupes ? <div className="reg-empty">Загрузка…</div> : (
            <div className="reg-dupe-list">
              {dupes.groups.map((g: any) => (
                <div key={g.gid} className="reg-dupe-group">
                  <button className="reg-dupe-head" onClick={() => toggleDupe(String(g.gid))}>
                    <span className={"chev2" + (openDupe === String(g.gid) ? " open" : "")}><I.chevRight /></span>
                    <span className="reg-dupe-title">{g.canon_title || "(группа дублей)"}</span>
                    {g.sphere_code && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: (SPHERE_COLOR[g.sphere_code] || "#6B7A73") + "22", color: SPHERE_COLOR[g.sphere_code] || "#6B7A73", whiteSpace: "nowrap" }}>{g.sphere_name || g.sphere_code}</span>}
                    <span className="reg-dupe-badge">{g.size}× · {g.organs} орг.</span>
                    {Number(g.potential_saving) > 0 && <span className="reg-dupe-save">~{fmtKzt(Number(g.potential_saving))}</span>}
                  </button>
                  {openDupe === String(g.gid) && (
                    <div className="reg-dupe-body">
                      {dupeItems[String(g.gid)]
                        ? dupeItems[String(g.gid)].map((r: any) => (
                          <div key={r.id} className={"reg-dupe-item" + (r.is_canonical ? " canon" : "")} onClick={() => setActive(r)}>
                            <span className="reg-dupe-item-t">{r.title || r.action}{r.is_canonical ? " · канон" : ""}</span>
                            <span className="reg-dupe-item-m">{minShort(r.ministry)}{r.npa_title ? ` · ${minShort(r.npa_title)}` : ""}</span>
                          </div>
                        ))
                        : <div className="reg-empty">Загрузка…</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : mode === "method" ? (
        /* ——— Методика расчёта ——— */
        (() => {
          const P: any = costData?.params || {};
          const HRS = Number(P.hours_per_month ?? 160);
          const ONC = 1 + Number(P.on_costs ?? 0.175);
          const OVH = 1 + Number(P.overhead ?? 0.30);
          const RM: Record<string, number> = { clerical: Number(P.mult_clerical ?? 0.8), specialist: Number(P.mult_specialist ?? 1), manager: Number(P.mult_manager ?? 1.4) };
          const SUBJ = 2181112;
          const rmv = RM[mRole] ?? 1;
          const tariff = (mWage / HRS) * ONC * OVH * rmv;
          const perEntity = tariff * mTime * mFreq;
          const total = perEntity * SUBJ;
          const ru = (n: number) => Math.round(n).toLocaleString("ru-RU");
          const cf = (n: number, d: number) => n.toFixed(d).replace(".", ",");
          return (
            <div className="reg-biz">
              <div className="reg-biz-hero">
                <h1>Методика расчёта регуляторной нагрузки</h1>
                <p>Стоимость каждого требования считается по международной модели Standard Cost Model. Покрутите параметры — видно, из чего складывается нагрузка. Коэффициенты берутся из живых настроек реестра (раздел «Нагрузка»).</p>
              </div>

              <div className="reg-mtd-f">
                <div><span className="reg-mtd-lbl">Тариф часа труда (₸/ч) — полная стоимость часа специалиста</span>
                  = (зарплата <span className="reg-mtd-v">{ru(mWage)}</span> ₸ <span className="reg-mtd-op">÷</span> <span className="reg-mtd-c">{HRS} ч</span>)
                  <span className="reg-mtd-op">×</span> <span className="reg-mtd-c">{cf(ONC, 3)}</span> <span className="reg-mtd-x">соц.</span>
                  <span className="reg-mtd-op">×</span> <span className="reg-mtd-c">{cf(OVH, 2)}</span> <span className="reg-mtd-x">накл.</span>
                  <span className="reg-mtd-op">×</span> <span className="reg-mtd-v">{cf(rmv, 1)}</span> <span className="reg-mtd-x">роль</span>
                  <span className="reg-mtd-op">=</span> <span className="reg-mtd-res">{ru(tariff)}</span> ₸/ч</div>
                <div style={{ marginTop: 6 }}><span className="reg-mtd-lbl">Стоимость на 1 субъект (₸/год) — нагрузка на один бизнес</span>
                  = (<span className="reg-mtd-res">{ru(tariff)}</span> ₸/ч <span className="reg-mtd-op">×</span> <span className="reg-mtd-v">{cf(mTime, 1)}</span> ч)
                  <span className="reg-mtd-op">×</span> <span className="reg-mtd-v">{mFreq}</span> раз/год
                  <span className="reg-mtd-op">=</span> <span className="reg-mtd-res">{ru(perEntity)}</span> ₸/год</div>
              </div>

              <div className="reg-mtd-controls">
                <div className="reg-mtd-row"><label>Зарплата в отрасли, ₸/мес</label>
                  <input type="range" min={200000} max={1200000} step={1000} value={mWage} onChange={(e) => setMWage(Number(e.target.value))} />
                  <output>{ru(mWage)}</output></div>
                <div className="reg-mtd-row"><label>Время на выполнение</label>
                  <input type="range" min={0.5} max={40} step={0.5} value={mTime} onChange={(e) => setMTime(Number(e.target.value))} />
                  <output>{cf(mTime, 1)} ч</output></div>
                <div className="reg-mtd-row"><label>Частота</label>
                  <input type="range" min={1} max={52} step={1} value={mFreq} onChange={(e) => setMFreq(Number(e.target.value))} />
                  <output>{mFreq}/год</output></div>
                <div className="reg-mtd-row"><label>Категория исполнителя</label>
                  <select value={mRole} onChange={(e) => setMRole(e.target.value)}>
                    <option value="clerical">Делопроизводитель (×{cf(RM.clerical, 1)})</option>
                    <option value="specialist">Специалист (×{cf(RM.specialist, 1)})</option>
                    <option value="manager">Руководитель (×{cf(RM.manager, 1)})</option>
                  </select>
                  <output>×{cf(rmv, 1)}</output></div>
              </div>

              <div className="reg-cost-summary" style={{ marginTop: 18 }}>
                <div className="reg-cost-stat"><b>{ru(tariff)} ₸</b><span>тариф часа труда</span></div>
                <div className="reg-cost-stat"><b>{ru(perEntity)} ₸</b><span>нагрузка на субъект / год</span></div>
                <div className="reg-cost-stat"><b>{fmtKzt(total)}</b><span>суммарно по МСБ / год · одно требование × 2,18 млн</span></div>
              </div>

              <div className="reg-biz-blockh reg-biz-blockh-lg">На опыте каких стран построена методика<span className="reg-biz-blockh-cnt">международные практики</span></div>
              <div className="reg-mtd-prov">
                <div className="reg-mtd-card">
                  <h4>Standard Cost Model</h4>
                  <span className="reg-mtd-tag reg-mtd-t-core">Ядро формулы · Нидерланды, ЕС</span>
                  <p>Само уравнение «Стоимость = Цена × Количество» и структура тарифа (зарплата + надбавки + накладные). Родина — Нидерланды, сеть SCM Network с 2003 г.</p>
                  <div className="reg-mtd-fact">NL: админбремя €16,4 млрд/год ≈ 3,6% ВВП; применяют Дания, Норвегия, Швеция, Великобритания.</div>
                </div>
                <div className="reg-mtd-card">
                  <h4>RBMF</h4>
                  <span className="reg-mtd-tag reg-mtd-t-ext">Расширение · Австралия</span>
                  <p>Деление издержек на 3 типа: административные, существенные (оборудование, обучение) и издержки задержки. Множитель надбавок к зарплате.</p>
                  <div className="reg-mtd-fact">Office of Impact Analysis: $48,67/ч × 1,75 = $85,17/ч.</div>
                </div>
                <div className="reg-mtd-card">
                  <h4>One-for-one rule</h4>
                  <span className="reg-mtd-tag reg-mtd-t-ext">Расширение · Канада</span>
                  <p>Дисконтированная SCM-формула (ставка 7%) и принцип «одно требование вошло — одно вышло» для сдерживания роста нагрузки.</p>
                  <div className="reg-mtd-fact">Red Tape Reduction Act, 2015. В ЕС аналог «one-in-one-out» с 2022 г.</div>
                </div>
                <div className="reg-mtd-card">
                  <h4>Bürokratiekostenindex</h4>
                  <span className="reg-mtd-tag reg-mtd-t-ext">Расширение · Германия</span>
                  <p>Индекс динамики бюрократических издержек на базе SCM — отслеживать рост или снижение совокупной нагрузки во времени.</p>
                  <div className="reg-mtd-fact">Ведётся Statistisches Bundesamt; база для цели сокращения нагрузки.</div>
                </div>
                <div className="reg-mtd-card">
                  <h4>Регуляторная гильотина</h4>
                  <span className="reg-mtd-tag reg-mtd-t-cut">Поиск дублей · Корея, Хорватия</span>
                  <p>Массовый пересмотр: каждое требование классифицируется «оставить / упростить / отменить» по чек-листу (законность, нужность, бизнес-дружелюбность).</p>
                  <div className="reg-mtd-fact">Методология Jacobs, Cordova &amp; Associates. Корея 1998–99: 11 000+ норм за 11 мес, отменено ≈50%.</div>
                </div>
                <div className="reg-mtd-card">
                  <h4>OECD</h4>
                  <span className="reg-mtd-tag reg-mtd-t-fr">Рамка качества · международная</span>
                  <p>Принципы: измерять и административные, и существенные издержки; пропорциональность (больше доказательств — для весомых норм) и риск-ориентированный контроль.</p>
                  <div className="reg-mtd-fact">Regulatory Policy Outlook 2025, команда Measuring Regulatory Performance.</div>
                </div>
              </div>

              <div className="reg-biz-blockh reg-biz-blockh-lg">Как реестр находит дубли<span className="reg-biz-blockh-cnt">три уровня</span></div>
              <div className="reg-mtd-steps">
                <div className="reg-mtd-step">
                  <div className="reg-mtd-step-n">1</div>
                  <h4>Структурный фильтр</h4>
                  <p>Сравнение по полям карточки: сектор (сфера), орган, ОКЭД, тип обязательства, ссылка на НПА. Разводит процедурно похожие действия из разных секторов.</p>
                </div>
                <div className="reg-mtd-step">
                  <div className="reg-mtd-step-n">2</div>
                  <h4>Семантический</h4>
                  <p>Эмбеддинги bge-m3 + косинусное сходство (порог ≈0,93) — ловит совпадения по смыслу даже при разной формулировке, внутри одного сектора.</p>
                </div>
                <div className="reg-mtd-step">
                  <div className="reg-mtd-step-n">3</div>
                  <h4>Гильотина</h4>
                  <p>Совпадения классифицируются по чек-листу (законность, нужность, бизнес-дружелюбность). Приоритет — кросс-орган.</p>
                  <div className="reg-mtd-guill"><span className="g-keep">оставить</span><span className="g-simpl">упростить</span><span className="g-cut">отменить</span></div>
                </div>
              </div>
              <div className="reg-mtd-effect">Структурный фильтр по сектору развёл <b>648 ложных кросс-секторных склеек</b> (заявления на разные лицензии в разных отраслях) — настоящих кросс-орган групп осталось <b>300</b> вместо 958.</div>
            </div>
          );
        })()
      ) : mode === "review" ? (
        /* ——— Ревью госоргана (очередь апрува) ——— */
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
                    <div className="reg-rev-main" onClick={() => setActive(r)}>
                      <div className="reg-rev-t">{r.title || r.action}</div>
                      <div className="reg-rev-m">{r.ngr}{r.article ? ` · ${r.article}` : ""} · {minShort(r.ministry)}{r.sphere_name ? ` · ${r.sphere_name}` : ""}</div>
                    </div>
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
      ) : (
        /* ——— Бизнес ——— */
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

      {active && <Drawer r={active} onClose={() => setActive(null)} onSaved={mode === "review" ? loadReviewQueue : load} role={me?.role} />}
    </div>
  );
}
