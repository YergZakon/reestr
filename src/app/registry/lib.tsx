"use client";
/* Общие иконки, утилиты, типы и карточные компоненты реестра.
   Выделено из монолита page.tsx (К2, docs/architecture/09). */
import { useEffect, useState } from "react";

/* ——— Иконки ——— */
export const I = {
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

export const fmtKzt = (n: number): string => {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + " млрд ₸";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " млн ₸";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + " тыс ₸";
  return Math.round(n).toLocaleString("ru") + " ₸";
};

/* ——— Маппинги ——— */
export const SPHERE_COLOR: Record<string, string> = {
  mchs: "#D9663A", mz_zdrav: "#2E8B8B", mz_obshchepit: "#4E944F", me_neft_uran: "#8A6D3B",
  miir_obrabotka: "#5A6BB0", miir_transport: "#3A6EA5", msx: "#4E944F", mnvo: "#7E5AA8",
  mtsriap: "#3E9C6B", mti_torgovlya: "#C2853A", mtzsn_trud_otn: "#C2853A", mtzsn_trudoustr: "#C2853A",
  ecology: "#3E9C6B", land: "#8A6D3B", transport: "#3A6EA5", other_ersop: "#6B7A73",
};
export const STAGE_LABEL: Record<string, string> = {
  planning: "Планирование", registration: "Регистрация", pre_launch: "До-запуск", launch: "Запуск",
  operation: "Деятельность", reporting: "Отчётность", inspection: "Проверки", expansion: "Расширение",
  suspension: "Приостановка", closure: "Закрытие",
};
export const STAGE_ORDER = ["planning", "registration", "pre_launch", "launch", "operation", "reporting", "inspection", "expansion", "suspension", "closure"];
export function minShort(m: string | null): string {
  if (!m) return "—";
  return m.replace("Министерство ", "Мин").replace(" Республики Казахстан", "").replace(" РК", "").slice(0, 28);
}
export const SECTION_ICON: Record<string, string> = {
  A: "🌾", B: "⛏️", C: "🏭", D: "⚡", E: "💧", F: "🏗️", G: "🛒", H: "🚚", I: "🏨",
  J: "📡", K: "🏦", L: "🏢", M: "💼", N: "🗂️", P: "🎓", Q: "🩺", R: "🎭", S: "🛠️",
};

/* ——— Параметры SCM (cost_params) ——— */
export const PARAM_FIELDS: { k: string; label: string; unit: string; pct?: boolean; step?: string }[] = [
  { k: "inspector_rate_kzt", label: "Час проверки (государство)", unit: "₸/ч" },
  { k: "overhead", label: "Накладные расходы", unit: "%", pct: true, step: "0.1" },
  { k: "on_costs", label: "Соц. отчисления работодателя", unit: "%", pct: true, step: "0.1" },
  { k: "hours_per_month", label: "Рабочих часов в месяце", unit: "ч" },
  { k: "mult_clerical", label: "Множитель: делопроизводитель", unit: "×", step: "0.1" },
  { k: "mult_specialist", label: "Множитель: специалист", unit: "×", step: "0.1" },
  { k: "mult_manager", label: "Множитель: руководитель", unit: "×", step: "0.1" },
  { k: "avg_wage_month", label: "Средняя зарплата (резерв)", unit: "₸/мес" },
];
export const paramsToForm = (p: Record<string, unknown> | null): Record<string, string> => {
  const f: Record<string, string> = {};
  if (!p) return f;
  for (const fld of PARAM_FIELDS) {
    const v = Number(p[fld.k]);
    f[fld.k] = fld.pct ? String(Math.round(v * 1000) / 10) : String(v);
  }
  return f;
};
export const formToParams = (f: Record<string, string>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const fld of PARAM_FIELDS) {
    const n = Number(f[fld.k]);
    if (!isNaN(n) && f[fld.k] !== "") out[fld.k] = fld.pct ? n / 100 : n;
  }
  return out;
};

/* ——— Типы ——— */
export interface Req {
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
export const REVIEW_LABEL: Record<string, string> = {
  pending: "на подтверждении", confirmed: "подтверждено", rejected: "отклонено", edited: "отредактировано",
};
export interface Npa {
  ngr: string; title: string; npa_status: string | null;
  date_adopted: string | null; date_revision: string | null; review_deadline: string | null;
  overdue: boolean; req_count: number; adilet_url: string;
}

export function MetaChip({ children, color, stage }: { children: React.ReactNode; color?: string; stage?: boolean }) {
  return <span className={"reg-mchip" + (stage ? " stage" : "")}>{color && <span className="dot" style={{ background: color }} />}{children}</span>;
}

/* ——— Карточка ——— */
export function Card({ r, onOpen }: { r: Req; onOpen: (r: Req) => void }) {
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
export function applyTarget(r: Req): { url: string; label: string } {
  const t = `${r.title || ""} ${r.action || ""} ${r.object || ""} ${r.legal_text || ""}`.toLowerCase();
  if (/лиценз|разрешени|аккредит|аттестац|сертификат|патент|допуск/.test(t))
    return { url: "https://elicense.kz/", label: "Оформить · eLicense.kz" };
  if (/регистрац|налог|на учёт|на учет|постанов|статист|деклар|уведомлен/.test(t) || r.scope === "horizontal")
    return { url: "https://egov.kz/", label: "Оформить · eGov.kz" };
  return { url: "https://elicense.kz/", label: "Оформить · eLicense.kz" };
}

/* ——— Permit-карточка («Что оформить») ——— */
export function PermitCard({ r, onOpen }: { r: Req; onOpen: (r: Req) => void }) {
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
export function Drawer({ r, onClose, onSaved, role }: { r: Req; onClose: () => void; onSaved: () => void; role?: string }) {
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
export function Facet({ title, prime, open, setOpen, children }: any) {
  return (
    <div className={"reg-facet" + (prime ? " reg-facet-prime" : "")}>
      <button className={"reg-facet-head" + (open ? "" : " closed")} onClick={() => setOpen(!open)}>
        <span className="reg-facet-name">{title}</span><span className="chev"><I.chevDown /></span>
      </button>
      {open && <div className="reg-facet-opts">{children}</div>}
    </div>
  );
}
export function OptRow({ on, onClick, label, count }: any) {
  return (
    <label className={"reg-opt" + (on ? " on" : "")} onClick={(e) => { e.preventDefault(); onClick(); }}>
      <span className="box"><I.check /></span>
      <span className="reg-opt-label">{label}</span>
      {count != null && <span className="reg-opt-count">{count.toLocaleString("ru")}</span>}
    </label>
  );
}

/* Минимальный markdown→HTML для ИИ-заключения (## ### - * **bold**) */
export function mdToHtml(md: string): { __html: string } {
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
