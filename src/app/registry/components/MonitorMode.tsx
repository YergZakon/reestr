"use client";
/* Мониторинг (только МНЭ): ход ревью по органам, активность пользователей,
   журнал подач НПА. Данные — GET /api/admin/monitor. */
import { useEffect, useMemo, useState } from "react";
import { I } from "../lib";

interface Kpi { total: number; pending: number; confirmed: number; rejected: number; edited: number; in_registry: number; dupes: number; npa_count: number; }
interface Users { moderators: number; analysts: number; analysts_active: number; moderators_active: number; }
interface Subs { by_users: number; by_system: number; parsed: number; failed: number; cards: number; submitters: number; last7: number; }
interface OrgRow {
  org_id: number; code: string; name: string; moderators: number; analysts: number;
  total: number; pending: number; confirmed: number; rejected: number; edited: number; dupes: number; npa: number; submissions: number;
}
interface Reviewer {
  id: number; username: string; full_name: string; role: string; is_active: boolean; org: string | null;
  confirmed: number; rejected: number; edited: number; total: number; last_at: string | null;
}
interface Submission {
  id: number; ngr: string; npa_title: string | null; status: string; cards_created: number | null;
  created_at: string; submitted_by: string | null; org_name: string | null; root_name: string | null;
}
interface Submitter { username: string; full_name: string; org: string | null; submissions: number; cards: number; last_at: string | null; }
interface Data { kpi: Kpi; users: Users; subs: Subs; byOrg: OrgRow[]; reviewers: Reviewer[]; submissions: Submission[]; submitters: Submitter[]; }

const n = (v: number | null | undefined) => Number(v || 0).toLocaleString("ru");
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("ru", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

function Stat({ v, label, tone }: { v: string; label: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className={"reg-mon-stat" + (tone ? " " + tone : "")}>
      <b>{v}</b><span>{label}</span>
    </div>
  );
}

export default function MonitorMode() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"orgs" | "people" | "npa">("orgs");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/monitor").then(async (r) => {
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || "Ошибка загрузки"); }
      return r.json();
    }).then(setD).catch((e) => setErr(e.message));
  }, []);

  const done = d ? d.kpi.confirmed + d.kpi.rejected + d.kpi.edited : 0;
  const pct = d && d.kpi.total ? (done / d.kpi.total) * 100 : 0;

  const orgs = useMemo(() => {
    if (!d) return [];
    const s = q.trim().toLowerCase();
    return s ? d.byOrg.filter((o) => o.name.toLowerCase().includes(s) || o.code.toLowerCase().includes(s)) : d.byOrg;
  }, [d, q]);

  const subsFiltered = useMemo(() => {
    if (!d) return [];
    const s = q.trim().toLowerCase();
    return s ? d.submissions.filter((x) =>
      (x.npa_title || "").toLowerCase().includes(s) || x.ngr.toLowerCase().includes(s) ||
      (x.submitted_by || "").toLowerCase().includes(s) || (x.root_name || "").toLowerCase().includes(s)) : d.submissions;
  }, [d, q]);

  if (err) return <div className="reg-mon"><div className="reg-empty"><h3>Нет доступа</h3><p>{err}</p></div></div>;
  if (!d) return <div className="reg-mon"><div className="reg-empty">Загрузка…</div></div>;

  return (
    <div className="reg-mon">
      <h1 className="reg-cat-h1">Мониторинг работы государственных органов</h1>
      <div className="reg-cat-sub">Ход подтверждения требований, активность сотрудников и поданные НПА. Раздел доступен уполномоченному органу.</div>

      {/* KPI */}
      <div className="reg-mon-stats">
        <Stat v={n(d.kpi.total)} label="действующих требований" />
        <Stat v={n(d.kpi.pending)} label="ожидают подтверждения" tone="warn" />
        <Stat v={n(d.kpi.confirmed)} label="подтверждено" tone="ok" />
        <Stat v={n(d.kpi.rejected)} label="отклонено" tone="bad" />
        <Stat v={n(d.kpi.edited)} label="отредактировано" />
        <Stat v={n(d.kpi.dupes)} label="из них дублей (к устранению)" />
        <Stat v={n(d.kpi.npa_count)} label="НПА в реестре" />
      </div>

      <div className="reg-mon-progress">
        <div className="reg-mon-progress-h">
          <span>Обработано госорганами: <b>{n(done)}</b> из {n(d.kpi.total)}</span>
          <span className="reg-mon-pct">{pct.toFixed(pct < 1 ? 2 : 1)}%</span>
        </div>
        <div className="reg-mon-bar"><span style={{ width: `${Math.max(pct, 0.4)}%` }} /></div>
      </div>

      <div className="reg-mon-stats">
        <Stat v={n(d.users.moderators_active)} label="модераторов (активных)" />
        <Stat v={n(d.users.analysts_active)} label="аналитиков (активных)" />
        <Stat v={n(d.reviewers.length)} label="приступили к ревью" />
        <Stat v={n(d.subs.by_users)} label="НПА подано органами" />
        <Stat v={n(d.subs.last7)} label="подач за 7 дней" />
        <Stat v={n(d.subs.cards)} label="требований из подач" />
      </div>

      {/* вкладки */}
      <div className="reg-mon-tabs">
        <button className={tab === "orgs" ? "on" : ""} onClick={() => setTab("orgs")}>По органам</button>
        <button className={tab === "people" ? "on" : ""} onClick={() => setTab("people")}>Сотрудники</button>
        <button className={tab === "npa" ? "on" : ""} onClick={() => setTab("npa")}>Поданные НПА</button>
        <div className="reg-search reg-mon-search">
          <I.search />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по органу, НПА, пользователю…" />
        </div>
        <a className="reg-tool-btn" href="/api/registry/export" title="Выгрузить требования реестра"><I.download />Экспорт CSV</a>
      </div>

      {tab === "orgs" && (
        <div className="reg-mon-tablewrap">
          <table className="reg-mon-table">
            <thead>
              <tr>
                <th>Государственный орган</th>
                <th>Модер.</th><th>Аналит.</th>
                <th>НПА</th><th>Требований</th><th>Дублей</th>
                <th>Ожидают</th><th>Подтв.</th><th>Откл.</th><th>Отред.</th>
                <th>Обработано</th><th>Подано НПА</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => {
                const dn = o.confirmed + o.rejected + o.edited;
                const p = o.total ? (dn / o.total) * 100 : 0;
                return (
                  <tr key={o.org_id}>
                    <td className="t-name">{o.name}<span className="t-code">{o.code}</span></td>
                    <td className={"num" + (o.moderators === 0 ? " zero" : "")}>{o.moderators}</td>
                    <td className={"num" + (o.analysts === 0 ? " zero" : "")}>{o.analysts}</td>
                    <td className="num">{n(o.npa)}</td>
                    <td className="num b">{n(o.total)}</td>
                    <td className="num">{o.dupes ? n(o.dupes) : "—"}</td>
                    <td className="num">{n(o.pending)}</td>
                    <td className="num ok">{o.confirmed ? n(o.confirmed) : "—"}</td>
                    <td className="num bad">{o.rejected ? n(o.rejected) : "—"}</td>
                    <td className="num">{o.edited ? n(o.edited) : "—"}</td>
                    <td className="num">
                      <div className="reg-mon-minibar"><span style={{ width: `${Math.min(p, 100)}%` }} /></div>
                      <i>{p ? p.toFixed(p < 1 ? 2 : 1) + "%" : "0%"}</i>
                    </td>
                    <td className="num">{o.submissions ? n(o.submissions) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {orgs.length === 0 && <div className="reg-empty">Ничего не найдено</div>}
        </div>
      )}

      {tab === "people" && (
        <>
          <div className="reg-biz-blockh">Приступили к ревью ({d.reviewers.length})</div>
          <div className="reg-mon-tablewrap">
            <table className="reg-mon-table">
              <thead><tr><th>Пользователь</th><th>Орган</th><th>Роль</th><th>Подтв.</th><th>Откл.</th><th>Отред.</th><th>Всего</th><th>Последнее действие</th></tr></thead>
              <tbody>
                {d.reviewers.map((r) => (
                  <tr key={r.id}>
                    <td className="t-name">{r.username}{r.full_name ? <span className="t-code">{r.full_name}</span> : null}</td>
                    <td>{r.org || "—"}</td>
                    <td>{r.role === "admin" ? "Админ" : r.role === "moderator" ? "Модератор" : "Аналитик"}</td>
                    <td className="num ok">{r.confirmed || "—"}</td>
                    <td className="num bad">{r.rejected || "—"}</td>
                    <td className="num">{r.edited || "—"}</td>
                    <td className="num b">{r.total}</td>
                    <td>{dt(r.last_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="reg-biz-blockh">Подавали НПА ({d.submitters.length})</div>
          <div className="reg-mon-tablewrap">
            <table className="reg-mon-table">
              <thead><tr><th>Пользователь</th><th>Орган</th><th>Подач</th><th>Извлечено требований</th><th>Последняя подача</th></tr></thead>
              <tbody>
                {d.submitters.map((s, i) => (
                  <tr key={i}>
                    <td className="t-name">{s.username}{s.full_name ? <span className="t-code">{s.full_name}</span> : null}</td>
                    <td>{s.org || "—"}</td>
                    <td className="num b">{s.submissions}</td>
                    <td className="num">{n(s.cards)}</td>
                    <td>{day(s.last_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "npa" && (
        <>
          <div className="reg-cost-hint" style={{ margin: "0 0 12px" }}>
            Показаны НПА, поданные сотрудниками органов ({n(d.subs.by_users)}). Акты, загруженные системой при закрытии
            пробелов правового мониторинга ({n(d.subs.by_system)}), в перечень не включены.
          </div>
          <div className="reg-mon-tablewrap">
            <table className="reg-mon-table">
              <thead><tr><th>Дата</th><th>Госрегномер</th><th>Наименование НПА</th><th>Кто подал</th><th>Орган</th><th>Требований</th><th>Статус</th></tr></thead>
              <tbody>
                {subsFiltered.map((s) => (
                  <tr key={s.id}>
                    <td className="nowrap">{day(s.created_at)}</td>
                    <td className="nowrap"><a className="reg-d-link" href={`https://adilet.zan.kz/rus/docs/${s.ngr}`} target="_blank" rel="noreferrer">{s.ngr}</a></td>
                    <td className="t-title">{(s.npa_title || "—").replace(/&quot;/g, "«").slice(0, 110)}</td>
                    <td className="nowrap">{s.submitted_by || "—"}</td>
                    <td>{s.root_name || s.org_name || "—"}</td>
                    <td className="num b">{s.cards_created ? n(s.cards_created) : "—"}</td>
                    <td><span className={"reg-rb " + (s.status === "parsed" ? "reg-rb-confirmed" : s.status === "error" ? "reg-rb-rejected" : "reg-rb-pending")}>{s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {subsFiltered.length === 0 && <div className="reg-empty">Ничего не найдено</div>}
        </>
      )}
    </div>
  );
}
