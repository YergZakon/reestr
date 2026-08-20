"use client";
/* Вкладка «АРА»: планомерный цикл пересмотра актов (план 2026-08-20).
   МНЭ — 5 групп + разрез по органам + провал в акты (может вернуть/утвердить);
   модератор — свой орган: открыть цикл → поручить → утвердить заключение;
   аналитик — суб-вкладка «Мои поручения»: принять → дать заключение. */
import { useCallback, useEffect, useState } from "react";
import { MDICT } from "../i18n-modes";
import type { Lang } from "../i18n";

interface Kpi { total: number; overdue: number; not_due: number; on_time: number; no_deadline: number }
interface OrgRow extends Kpi { code: string; name: string }
interface Act {
  id: number; ngr: string | null; ext_ref: string | null; authority_code: string | null;
  npa_title: string | null; npa_kind: string; deadlines: string[] | null; deadline: string | null;
  deadline_src: string; deadline_calc: string | null; portal_status: string | null;
  ara_group: string; authority_short: string | null; authority_name: string | null;
  review_id: number | null; review_status: string | null; review_conclusion: string | null;
  req_count: number; assignees: string | null;
}
interface Task {
  id: number; review_id: number; note: string | null; due_date: string | null; assign_status: string;
  assigned_by_name: string | null; review_status: string; conclusion: string | null;
  ara_id: number; ngr: string | null; npa_title: string | null; npa_kind: string; deadline: string | null;
}
interface Analyst { id: number; username: string; full_name: string | null; role: string; is_active: boolean }

const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

export default function AraMode({ lang = "ru", role }: { lang?: Lang; role?: string }) {
  const t = MDICT[lang];
  const manager = role === "admin" || role === "mne" || role === "moderator";
  const [tab, setTab] = useState<"acts" | "my">(role === "expert" ? "my" : "acts");
  const [summary, setSummary] = useState<{ kpi: Kpi | null; byOrg: OrgRow[]; isMne: boolean; noAuthorities?: boolean } | null>(null);
  const [org, setOrg] = useState<string | null>(null);
  const [group, setGroup] = useState<string>("");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [page, setPage] = useState(1);
  const [acts, setActs] = useState<{ items: Act[]; total: number; pages: number } | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [openForm, setOpenForm] = useState<{ act: Act; kind: "assign" | "conclude" | "approve" } | null>(null);
  const [analysts, setAnalysts] = useState<Analyst[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [concl, setConcl] = useState<"keep" | "revise">("keep");
  const [rationale, setRationale] = useState("");
  const [proposals, setProposals] = useState("");
  const [applyCards, setApplyCards] = useState<"none" | "confirm" | "exclude">("none");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/ara/summary").then((r) => r.json()).then(setSummary).catch(() => {});
  }, []);
  useEffect(() => { const h = setTimeout(() => setQd(q), 400); return () => clearTimeout(h); }, [q]);

  const showActs = !summary?.isMne || org !== null;
  const loadActs = useCallback(() => {
    if (!summary || !showActs) return;
    const p = new URLSearchParams({ page: String(page) });
    if (org) p.set("authority", org);
    if (group) p.set("group", group);
    if (qd) p.set("q", qd);
    if (lang === "kz") p.set("lang", "kz");
    fetch(`/api/ara/acts?${p}`).then((r) => r.json()).then(setActs).catch(() => {});
  }, [summary, showActs, org, group, qd, page, lang]);
  useEffect(() => { loadActs(); }, [loadActs]);
  useEffect(() => { setPage(1); }, [org, group, qd]);

  const loadTasks = useCallback(() => {
    fetch(`/api/ara/my-assignments${lang === "kz" ? "?lang=kz" : ""}`)
      .then((r) => r.json()).then((d) => setTasks(d.items || [])).catch(() => {});
  }, [lang]);
  useEffect(() => { if (tab === "my") loadTasks(); }, [tab, loadTasks]);

  const post = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/ara/review", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Ошибка"); return false; }
      return true;
    } catch { setErr("Сеть недоступна"); return false; }
    finally { setBusy(false); }
  };
  const refresh = () => { loadActs(); if (tab === "my") loadTasks(); setOpenForm(null); setPicked([]); setNote(""); setDue(""); setRationale(""); setProposals(""); setApplyCards("none"); };

  const startForm = (act: Act, kind: "assign" | "conclude" | "approve") => {
    setErr(""); setOpenForm({ act, kind });
    if (kind === "assign" && !analysts)
      fetch("/api/admin/users").then((r) => r.json())
        .then((d) => setAnalysts((d.users || []).filter((u: Analyst) => u.role === "expert" && u.is_active)))
        .catch(() => setAnalysts([]));
  };

  if (!summary) return <div className="reg-empty">{t.arLoading}</div>;
  if (summary.noAuthorities) return <div className="reg-empty">{t.arNoAuth}</div>;

  const kpi = org && summary.isMne ? summary.byOrg.find((o) => o.code === org) || summary.kpi : summary.kpi;
  const GROUPS: [string, string, string][] = [
    ["overdue", t.arOverdue, "#A32D2D"],
    ["not_due", t.arNotDue, "#2E6B4F"],
    ["on_time", t.arOnTime, "#0E7A5F"],
    ["no_deadline", t.arNoDeadline, "#8a7a3b"],
  ];
  const stLabel = (s: string | null) =>
    s === "open" ? t.arStOpen : s === "assigned" ? t.arStAssigned : s === "in_progress" ? t.arStInProgress
    : s === "concluded" ? t.arStConcluded : s === "approved" ? t.arStApproved : s || "";

  const concludeForm = (reviewId: number) => (
    <div className="reg-ara-form">
      <div style={{ display: "flex", gap: 14 }}>
        <label><input type="radio" checked={concl === "keep"} onChange={() => setConcl("keep")} /> {t.arKeep}</label>
        <label><input type="radio" checked={concl === "revise"} onChange={() => setConcl("revise")} /> {t.arRevise}</label>
      </div>
      <textarea placeholder={t.arRationalePh} value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} />
      <textarea placeholder={t.arProposalsPh} value={proposals} onChange={(e) => setProposals(e.target.value)} rows={2} />
      <div className="reg-ara-form-btns">
        <button className="reg-rev-confirm" disabled={busy || !rationale.trim()}
          onClick={async () => { if (await post({ action: "conclude", review_id: reviewId, conclusion: concl, rationale, proposals: proposals || null })) refresh(); }}>
          {t.arSendConclusion}</button>
        <button className="reg-tool-btn" onClick={() => setOpenForm(null)}>{t.arCancelBtn}</button>
      </div>
    </div>
  );

  return (
    <div className="reg-mon">
      <h1 className="reg-cat-h1">{t.arH1}</h1>
      <div className="reg-cat-sub">{t.arSub}</div>

      {role === "expert" && (
        <div className="reg-rev-tabs" style={{ marginTop: 10 }}>
          <button className={tab === "my" ? "on" : ""} onClick={() => setTab("my")}>{t.arMyTasks}</button>
          <button className={tab === "acts" ? "on" : ""} onClick={() => setTab("acts")}>{t.arActsTab}</button>
        </div>
      )}
      {err && <div className="reg-form-err" style={{ marginTop: 8 }}>{err}</div>}

      {tab === "my" ? (
        <div className="reg-rev-list" style={{ marginTop: 10 }}>
          {tasks === null ? <div className="reg-empty">{t.arLoading}</div> : !tasks.length ? <div className="reg-empty">{t.arNoTasks}</div>
            : tasks.map((k) => (
              <div key={k.id} className="reg-rev-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div className="reg-rev-main">
                    <div className="reg-rev-t">{(k.npa_title || k.ngr || "—").slice(0, 130)}</div>
                    <div className="reg-rev-m">
                      {k.ngr && <a className="reg-d-link" href={`https://adilet.zan.kz/rus/docs/${k.ngr}`} target="_blank" rel="noreferrer">{k.ngr}</a>}
                      {" · "}{t.arDeadline} <b>{dt(k.deadline)}</b>
                      {k.due_date && <> · {t.arDue} <b>{dt(k.due_date)}</b></>}
                      {k.assigned_by_name && <> · {t.arFrom} {k.assigned_by_name}</>}
                    </div>
                    {k.note && <div className="reg-rev-m" style={{ marginTop: 2 }}>{t.arNoteLabel} {k.note}</div>}
                  </div>
                  <span className={"reg-rb " + (k.assign_status === "done" ? "reg-rb-confirmed" : "reg-rb-pending")}>
                    {k.assign_status === "done" ? t.arDone : k.assign_status === "accepted" ? t.arStInProgress : t.arStAssigned}
                  </span>
                </div>
                {k.assign_status === "assigned" && (
                  <div><button className="reg-rev-confirm" disabled={busy}
                    onClick={async () => { if (await post({ action: "accept", review_id: k.review_id })) refresh(); }}>{t.arAccept}</button></div>
                )}
                {k.assign_status === "accepted" && ["assigned", "in_progress", "open"].includes(k.review_status) && (
                  openForm?.kind === "conclude" && openForm.act.id === k.ara_id
                    ? concludeForm(k.review_id)
                    : <div><button className="reg-tool-btn" onClick={() => startForm({ id: k.ara_id } as Act, "conclude")}>{t.arConclude}</button></div>
                )}
                {k.assign_status === "done" && k.conclusion && (
                  <div className="reg-rev-m">{t.arConclusionLabel} <b>{k.conclusion === "keep" ? t.arKeep : t.arRevise}</b> · {stLabel(k.review_status)}</div>
                )}
              </div>
            ))}
        </div>
      ) : (
        <>
          {org && summary.isMne && (
            <button className="reg-biz-back" onClick={() => { setOrg(null); setActs(null); }}>← {t.arBackToOrgs}</button>
          )}
          {kpi && (
            <div className="reg-cost-summary" style={{ marginTop: 10 }}>
              <div className="reg-cost-stat"><b>{Number(kpi.total).toLocaleString("ru")}</b><span>{t.arSubject}</span></div>
              {GROUPS.map(([g, label, col]) => (
                <div key={g} className="reg-cost-stat" style={{ cursor: showActs ? "pointer" : undefined, outline: group === g ? `2px solid ${col}` : undefined }}
                  onClick={() => showActs && setGroup(group === g ? "" : g)}>
                  <b style={{ color: col }}>{Number(kpi[g as keyof Kpi] || 0).toLocaleString("ru")}</b><span>{label}</span>
                </div>
              ))}
            </div>
          )}

          {summary.isMne && !org && (
            <table className="reg-mon-table" style={{ marginTop: 14 }}>
              <thead><tr>
                <th style={{ textAlign: "left" }}>{t.arOrgan}</th><th>{t.arSubject}</th>
                <th style={{ color: "#A32D2D" }}>{t.arOverdue}</th><th>{t.arNotDue}</th>
                <th>{t.arOnTime}</th><th>{t.arNoDeadline}</th>
              </tr></thead>
              <tbody>
                {summary.byOrg.map((o) => (
                  <tr key={o.code} style={{ cursor: o.code !== "—" ? "pointer" : undefined }}
                    onClick={() => o.code !== "—" && setOrg(o.code)}>
                    <td style={{ textAlign: "left" }}>{o.name}</td>
                    <td><b>{o.total}</b></td>
                    <td style={{ color: "#A32D2D", fontWeight: 700 }}>{o.overdue}</td>
                    <td>{o.not_due}</td><td>{o.on_time}</td><td>{o.no_deadline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {showActs && (
            <>
              <div className="reg-dupe-toolbar" style={{ marginTop: 12 }}>
                <input style={{ flex: 1, minWidth: 200, height: 34, border: "1px solid var(--line)", borderRadius: 8, padding: "0 11px", fontSize: 13 }}
                  placeholder={t.arSearchPh} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="reg-rev-list" style={{ marginTop: 8 }}>
                {(acts?.items || []).map((a) => (
                  <div key={a.id} className="reg-rev-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div className="reg-rev-main">
                        <div className="reg-rev-t">{(a.npa_title || a.ngr || a.ext_ref || "—").slice(0, 130)}</div>
                        <div className="reg-rev-m">
                          {a.ngr
                            ? <a className="reg-d-link" href={`https://adilet.zan.kz/rus/docs/${a.ngr}`} target="_blank" rel="noreferrer">{a.ngr}</a>
                            : <span title={a.ext_ref || ""}>{t.arNoNgr}</span>}
                          {" · "}{a.authority_short || a.authority_name || a.authority_code || t.arOrgUnmatched}
                          {" · "}{a.npa_kind === "code" ? t.arKindCode : a.npa_kind === "law" ? t.arKindLaw : t.arKindBylaw}
                          {a.req_count > 0 && <> · {a.req_count} {t.arReqs}</>}
                        </div>
                        <div className="reg-rev-m" style={{ marginTop: 2 }}>
                          {t.arDeadline} <b>{dt(a.deadline)}</b>
                          {a.deadline_src === "portal_import" && <span title={t.arSrcPortalTitle}> · {t.arSrcPortal}</span>}
                          {a.deadline_src === "cycle" && <> · {t.arSrcCycle}</>}
                          {!a.deadline && a.deadline_calc && <> · {t.arCalc} {dt(a.deadline_calc)}</>}
                          {(a.deadlines || []).length > 1 && <span title={(a.deadlines || []).map(dt).join(", ")}> · {t.arMultiDates((a.deadlines || []).length)}</span>}
                          {a.review_id && <> · <b>{stLabel(a.review_status)}</b>{a.review_conclusion && <> ({a.review_conclusion === "keep" ? t.arKeep : t.arRevise})</>}</>}
                          {a.assignees && <> · {t.arAssignees} {a.assignees}</>}
                        </div>
                      </div>
                      <span className={"reg-rb " + (a.ara_group === "overdue" ? "reg-rb-rejected" : a.ara_group === "on_time" ? "reg-rb-confirmed" : "reg-rb-pending")}>
                        {a.ara_group === "overdue" ? t.arOverdue : a.ara_group === "not_due" ? t.arNotDue : a.ara_group === "on_time" ? t.arOnTime : t.arNoDeadline}
                      </span>
                    </div>

                    {manager && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {!a.review_id && (
                          <button className="reg-tool-btn" disabled={busy}
                            onClick={async () => { if (await post({ action: "open", ara_id: a.id })) refresh(); }}>{t.arOpenCycle}</button>
                        )}
                        {a.review_id && ["open", "assigned", "in_progress"].includes(a.review_status || "") && (
                          <>
                            <button className="reg-tool-btn" onClick={() => startForm(a, "assign")}>{t.arAssign}</button>
                            <button className="reg-tool-btn" onClick={() => startForm(a, "conclude")}>{t.arConclude}</button>
                          </>
                        )}
                        {a.review_id && a.review_status === "concluded" && (
                          <>
                            <button className="reg-rev-confirm" onClick={() => startForm(a, "approve")}>{t.arApprove}</button>
                            <button className="reg-tool-btn" disabled={busy}
                              onClick={async () => { if (await post({ action: "return", review_id: a.review_id, note: null })) refresh(); }}>{t.arReturn}</button>
                          </>
                        )}
                        {a.review_id && !["approved", "cancelled"].includes(a.review_status || "") && (
                          <button className="reg-tool-btn" style={{ color: "#A32D2D" }} disabled={busy}
                            onClick={async () => { if (await post({ action: "cancel", review_id: a.review_id })) refresh(); }}>{t.arCancelCycle}</button>
                        )}
                      </div>
                    )}

                    {openForm?.act.id === a.id && openForm.kind === "assign" && (
                      <div className="reg-ara-form">
                        {analysts === null ? <div className="reg-rev-m">{t.arLoading}</div> : !analysts.length
                          ? <div className="reg-rev-m">{t.arNoAnalysts}</div>
                          : <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              {analysts.map((u) => (
                                <label key={u.id} style={{ fontSize: 13 }}>
                                  <input type="checkbox" checked={picked.includes(u.id)}
                                    onChange={(e) => setPicked(e.target.checked ? [...picked, u.id] : picked.filter((x) => x !== u.id))} />
                                  {" "}{u.full_name || u.username}
                                </label>
                              ))}
                            </div>}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ height: 32 }} />
                          <input placeholder={t.arNotePh} value={note} onChange={(e) => setNote(e.target.value)}
                            style={{ flex: 1, minWidth: 180, height: 32, border: "1px solid var(--line)", borderRadius: 6, padding: "0 9px" }} />
                        </div>
                        <div className="reg-ara-form-btns">
                          <button className="reg-rev-confirm" disabled={busy || !picked.length}
                            onClick={async () => {
                              if (await post({ action: "assign", review_id: a.review_id, analyst_ids: picked, note: note || null, due_date: due || undefined })) refresh();
                            }}>{t.arSendAssign}</button>
                          <button className="reg-tool-btn" onClick={() => setOpenForm(null)}>{t.arCancelBtn}</button>
                        </div>
                      </div>
                    )}

                    {openForm?.act.id === a.id && openForm.kind === "conclude" && concludeForm(a.review_id!)}

                    {openForm?.act.id === a.id && openForm.kind === "approve" && (
                      <div className="reg-ara-form">
                        <div className="reg-rev-m">{t.arApproveHint(a.npa_kind === "bylaw" ? 2 : 3)}</div>
                        <select value={applyCards} onChange={(e) => setApplyCards(e.target.value as "none" | "confirm" | "exclude")} style={{ height: 32 }}>
                          <option value="none">{t.arCardsNone}</option>
                          <option value="confirm">{t.arCardsConfirm}</option>
                          <option value="exclude">{t.arCardsExclude}</option>
                        </select>
                        <input placeholder={t.arNotePh} value={note} onChange={(e) => setNote(e.target.value)}
                          style={{ height: 32, border: "1px solid var(--line)", borderRadius: 6, padding: "0 9px" }} />
                        <div className="reg-ara-form-btns">
                          <button className="reg-rev-confirm" disabled={busy}
                            onClick={async () => {
                              if (await post({ action: "approve", review_id: a.review_id, note: note || null, apply_cards: applyCards })) refresh();
                            }}>{t.arApprove}</button>
                          <button className="reg-tool-btn" onClick={() => setOpenForm(null)}>{t.arCancelBtn}</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {acts && !acts.items.length && <div className="reg-empty">{t.arEmpty}</div>}
              </div>
              {acts && acts.pages > 1 && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 12 }}>
                  <button className="reg-tool-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
                  <span className="reg-rev-m">{page} / {acts.pages}</span>
                  <button className="reg-tool-btn" disabled={page >= acts.pages} onClick={() => setPage(page + 1)}>→</button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
