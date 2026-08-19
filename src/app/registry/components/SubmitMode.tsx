"use client";
/* Режим «Подача НПА» (самообслуживание модератора): превью по ngr + очередь подач. Самодостаточный. */
import { useCallback, useEffect, useState } from "react";
import { type Lang } from "../i18n";
import { MDICT } from "../i18n-modes";

export default function SubmitMode({ lang = "ru" }: { lang?: Lang }) {
  const t = MDICT[lang];
  const [subNgr, setSubNgr] = useState("");
  const [subPrev, setSubPrev] = useState<any>(null);
  const [subBusy, setSubBusy] = useState(false);
  const [subOrgs, setSubOrgs] = useState<any[]>([]);
  const [subOrgId, setSubOrgId] = useState("");
  const [subSphere, setSubSphere] = useState("");
  const [subAra, setSubAra] = useState("");
  const [subList, setSubList] = useState<any[]>([]);
  const [subMsg, setSubMsg] = useState("");
  const [subTried, setSubTried] = useState(false); // «Проверить» нажимали → форму подачи показываем даже если превью упало
  const [subArticles, setSubArticles] = useState(""); // направленная доподача: только эти статьи
  // ручное добавление требования (последний рубеж, когда парсер не справился)
  const [mOpen, setMOpen] = useState(false);
  const [mNgr, setMNgr] = useState("");
  const [mOrgId, setMOrgId] = useState("");
  const [mArticle, setMArticle] = useState("");
  const [mSubject, setMSubject] = useState("");
  const [mAction, setMAction] = useState("");
  const [mCondition, setMCondition] = useState("");
  const [mMsg, setMMsg] = useState("");
  const [mSimilar, setMSimilar] = useState<any[]>([]);
  const [mBusy, setMBusy] = useState(false);

  const loadSubs = useCallback(() => { fetch("/api/npa-submission").then((r) => r.json()).then((d) => setSubList(d.submissions || [])).catch(() => {}); }, []);
  useEffect(() => {
    loadSubs();
    fetch("/api/organizations").then((r) => r.json()).then((d) => setSubOrgs(d.organizations || [])).catch(() => {});
  }, [loadSubs]);

  const runPreview = () => {
    setSubBusy(true); setSubMsg(""); setSubPrev(null); setSubTried(false);
    fetch("/api/npa-submission/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ngr: String(subNgr || "").trim() }) })
      .then((r) => r.json()).then((d) => { if (d.error) setSubMsg(d.error); else setSubPrev(d); }).catch(() => setSubMsg(t.smPreviewFail))
      .finally(() => { setSubBusy(false); setSubTried(true); });
  };
  const submitNpa = () => {
    if (!subOrgId) { setSubMsg(t.smPickOrg); return; }
    setSubBusy(true); setSubMsg("");
    fetch("/api/npa-submission", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ngr: String(subNgr || "").trim(), npa_title: subPrev?.title, org_id: Number(subOrgId), sphere_code: subSphere || null, ara_deadline: subAra || null, preview_json: subPrev, articles: subArticles.trim() || null }) })
      .then((r) => r.json()).then((d) => { if (d.error) setSubMsg(d.error); else { setSubMsg(t.smSubmitted); setSubNgr(""); setSubPrev(null); setSubArticles(""); loadSubs(); } })
      .finally(() => setSubBusy(false));
  };
  const submitManual = (force: boolean) => {
    setMBusy(true); setMMsg(""); if (!force) setMSimilar([]);
    fetch("/api/registry/manual", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ngr: mNgr.trim(), org_id: Number(mOrgId), article: mArticle.trim(),
        subject: mSubject.trim(), action: mAction.trim(), condition: mCondition.trim() || null, force }) })
      .then(async (r) => {
        const d = await r.json();
        if (d.need_confirm) { setMSimilar(d.similar || []); setMMsg(d.message); return; }
        if (d.error) { setMMsg(d.error); return; }
        setMMsg(t.smManualAdded);
        setMSimilar([]); setMArticle(""); setMSubject(""); setMAction(""); setMCondition("");
      })
      .catch(() => setMMsg(t.smReqFail))
      .finally(() => setMBusy(false));
  };

  return (
    <div className="reg-biz">
      <div className="reg-biz-hero">
        <h1>{t.smH1}</h1>
        <p>{t.smHero}</p>
      </div>
      <div className="reg-cost-params">
        <div className="reg-cost-params-h"><span>{t.smNewNpa}</span><span className="reg-cost-hint">{t.smByRegNo}</span></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input style={{ flex: 1, minWidth: 240, height: 38, border: "1px solid var(--line)", borderRadius: 9, padding: "0 12px", fontSize: 14 }}
            value={subNgr} onChange={(e) => setSubNgr(e.target.value)} placeholder={t.smNgrPh} />
          <button className="reg-cost-apply" style={{ marginTop: 0 }} onClick={runPreview} disabled={subBusy || !subNgr}>{subBusy ? "…" : t.smCheck}</button>
        </div>
        {subMsg && <div className="reg-cost-hint" style={{ color: "#A32D2D", marginTop: 8 }}>{subMsg}</div>}
        {subPrev && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 650, fontSize: 15 }}>{subPrev.title || subNgr}</div>
            <div className="reg-cost-hint" style={{ marginTop: 3 }}>{t.smArticlesPrev(subPrev.articleCount, (subPrev.previewedArticles || []).join(", ") || "—")}</div>
            <div style={{ margin: "10px 0" }}>
              {(subPrev.requirements || []).length ? (subPrev.requirements as any[]).map((r, i) => (
                <div key={i} className="reg-rev-row" style={{ marginBottom: 6 }}>
                  <div className="reg-rev-main"><div className="reg-rev-t">{r.action}</div><div className="reg-rev-m">{r.subject}{r.quote ? ` · «${r.quote}»` : ""}</div></div>
                </div>
              )) : <div className="reg-empty">{subPrev.note || t.smNoPrevReqs}</div>}
            </div>
          </div>
        )}
        {/* Форма подачи доступна и без превью: сбой ИИ/adilet не должен блокировать подачу —
            авторитетный парсинг всё равно выполняет Python-конвейер оператора. */}
        {(subPrev || (subTried && !subBusy)) && (
          <div style={{ marginTop: 6 }}>
            {!subPrev && (
              <div className="reg-cost-hint" style={{ margin: "6px 0 10px" }}>
                {t.smNoPreview}
              </div>
            )}
            <div className="reg-cost-params-grid">
              <label className="reg-cost-param"><span className="reg-cost-param-l">{t.smRespOrgan}</span>
                <span className="reg-cost-param-in"><select value={subOrgId} onChange={(e) => setSubOrgId(e.target.value)} style={{ width: "100%", height: 36, border: "1px solid var(--line)", borderRadius: 8 }}>
                  <option value="">{t.smPick}</option>
                  {/* иерархия: министерство → его комитеты; затем агентства и акиматы */}
                  {subOrgs.filter((o: any) => o.type === "ministry" && o.parent_id == null).map((m: any) => {
                    // всё поддерево министерства: комитеты и созданные модератором подразделения
                    const branch: { o: any; d: number }[] = [];
                    const walk = (p: any, d: number) => subOrgs
                      .filter((c: any) => c.parent_id === p.id)
                      .forEach((c: any) => { branch.push({ o: c, d }); walk(c, d + 1); });
                    walk(m, 1);
                    return (
                      <optgroup key={m.id} label={m.short_name || m.name_ru}>
                        <option key={`m-${m.id}`} value={m.id}>{m.short_name || m.name_ru} {t.smMinistryItself}</option>
                        {branch.map(({ o, d }) => (
                          <option key={o.id} value={o.id}>{" ".repeat(d * 2)}└ {o.short_name || o.name_ru}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                  <optgroup label={t.smAgencies}>
                    {subOrgs.filter((o: any) => o.type === "agency").map((o: any) => (
                      <option key={o.id} value={o.id}>{o.short_name || o.name_ru}</option>
                    ))}
                  </optgroup>
                  <optgroup label={t.smAkimats}>
                    {subOrgs.filter((o: any) => o.type === "akimat").map((o: any) => (
                      <option key={o.id} value={o.id}>{o.short_name || o.name_ru}</option>
                    ))}
                  </optgroup>
                </select></span></label>
              <label className="reg-cost-param"><span className="reg-cost-param-l">{t.smSphereCode}</span>
                <span className="reg-cost-param-in"><input value={subSphere} onChange={(e) => setSubSphere(e.target.value)} placeholder={t.smSpherePh} /></span></label>
              <label className="reg-cost-param"><span className="reg-cost-param-l">{t.smAra}</span>
                <span className="reg-cost-param-in"><input type="date" value={subAra} onChange={(e) => setSubAra(e.target.value)} /></span></label>
              <label className="reg-cost-param"><span className="reg-cost-param-l">{t.smOnlyArticles}</span>
                <span className="reg-cost-param-in"><input value={subArticles} onChange={(e) => setSubArticles(e.target.value)} placeholder={t.smOnlyArticlesPh} /></span></label>
            </div>
            {subArticles.trim() && (
              <div className="reg-cost-hint" style={{ margin: "6px 0" }}>
                {t.smTargeted(subArticles.trim())}
              </div>
            )}
            <button className="reg-cost-apply" onClick={submitNpa} disabled={subBusy}>
              {subPrev ? t.smSubmitQueue : t.smSubmitNoPrev}
            </button>
          </div>
        )}
      </div>
      {/* Ручное добавление — последний рубеж: таблицы, приложения, перечни, где экстрактор бессилен */}
      <div className="reg-cost-params" style={{ marginTop: 14 }}>
        <div className="reg-cost-params-h">
          <span>{t.smManualH}</span>
          <button className="reg-tool-btn" onClick={() => setMOpen(!mOpen)}>{mOpen ? t.smCollapse : t.smOpenForm}</button>
        </div>
        {mOpen && (
          <div>
            <div className="reg-cost-hint" style={{ marginBottom: 10 }}>
              {t.smManualHint}
            </div>
            <div className="reg-cost-params-grid">
              <label className="reg-cost-param"><span className="reg-cost-param-l">{t.smNgrLabel}</span>
                <span className="reg-cost-param-in"><input value={mNgr} onChange={(e) => setMNgr(e.target.value)} placeholder={t.smNgrExPh} /></span></label>
              <label className="reg-cost-param"><span className="reg-cost-param-l">{t.smArticleLabel}</span>
                <span className="reg-cost-param-in"><input value={mArticle} onChange={(e) => setMArticle(e.target.value)} placeholder={t.smArticlePh} /></span></label>
              <label className="reg-cost-param"><span className="reg-cost-param-l">{t.smOrgan}</span>
                <span className="reg-cost-param-in"><select value={mOrgId} onChange={(e) => setMOrgId(e.target.value)} style={{ width: "100%", height: 36, border: "1px solid var(--line)", borderRadius: 8 }}>
                  <option value="">{t.smPick}</option>
                  {subOrgs.map((o: any) => <option key={o.id} value={o.id}>{o.short_name || o.name_ru}</option>)}
                </select></span></label>
              <label className="reg-cost-param"><span className="reg-cost-param-l">{t.smSubject}</span>
                <span className="reg-cost-param-in"><input value={mSubject} onChange={(e) => setMSubject(e.target.value)} placeholder={t.smSubjectPh} /></span></label>
            </div>
            <label className="reg-cost-param" style={{ display: "block", marginTop: 8 }}>
              <span className="reg-cost-param-l">{t.smActionLabel}</span>
              <textarea value={mAction} onChange={(e) => setMAction(e.target.value)} rows={3}
                style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: 8, fontSize: 14 }}
                placeholder={t.smActionPh} />
            </label>
            <label className="reg-cost-param" style={{ display: "block", marginTop: 8 }}>
              <span className="reg-cost-param-l">{t.smCondition}</span>
              <input value={mCondition} onChange={(e) => setMCondition(e.target.value)}
                style={{ width: "100%", height: 36, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px" }} />
            </label>
            {mMsg && <div className="reg-cost-hint" style={{ color: mSimilar.length ? "#A35A00" : undefined, marginTop: 8 }}>{mMsg}</div>}
            {mSimilar.length > 0 && (
              <div style={{ margin: "8px 0" }}>
                {mSimilar.map((s: any) => (
                  <div key={s.id} className="reg-rev-row" style={{ marginBottom: 6 }}>
                    <div className="reg-rev-main"><div className="reg-rev-t">{s.text}</div><div className="reg-rev-m">{s.article} · {t.smSimilarity(Math.round((s.sim || 0) * 100))}</div></div>
                  </div>
                ))}
                <button className="reg-cost-apply" onClick={() => submitManual(true)} disabled={mBusy}>{t.smNotDup}</button>
              </div>
            )}
            {!mSimilar.length && (
              <button className="reg-cost-apply" style={{ marginTop: 10 }} onClick={() => submitManual(false)}
                disabled={mBusy || !mNgr.trim() || !mOrgId || !mArticle.trim() || !mSubject.trim() || mAction.trim().length < 15}>
                {mBusy ? "…" : t.smAddReq}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="reg-biz-blockh reg-biz-blockh-lg">{t.smMySubs}<span className="reg-biz-blockh-cnt">{subList.length}</span></div>
      <div className="reg-rev-list">
        {subList.map((s: any) => (
          <div key={s.id} className="reg-rev-row">
            <div className="reg-rev-main"><div className="reg-rev-t">{s.npa_title || s.ngr}</div><div className="reg-rev-m">{s.ngr} · {s.org_short || s.org_name || "—"} · {t.smSubmittedBy(s.submitter)}</div></div>
            <span className={"reg-rb reg-rb-" + (s.status === "parsed" ? "confirmed" : s.status === "error" ? "rejected" : "pending")}>{t.smStatus[s.status] || s.status}{s.cards_created ? ` · ${t.smCards(s.cards_created)}` : ""}</span>
          </div>
        ))}
        {!subList.length && <div className="reg-empty">{t.smNoSubs}</div>}
      </div>
    </div>
  );
}
