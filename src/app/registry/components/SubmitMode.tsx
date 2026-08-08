"use client";
/* Режим «Подача НПА» (самообслуживание модератора): превью по ngr + очередь подач. Самодостаточный. */
import { useCallback, useEffect, useState } from "react";

export default function SubmitMode() {
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
      .then((r) => r.json()).then((d) => { if (d.error) setSubMsg(d.error); else setSubPrev(d); }).catch(() => setSubMsg("Сбой превью"))
      .finally(() => { setSubBusy(false); setSubTried(true); });
  };
  const submitNpa = () => {
    if (!subOrgId) { setSubMsg("Выберите орган"); return; }
    setSubBusy(true); setSubMsg("");
    fetch("/api/npa-submission", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ngr: String(subNgr || "").trim(), npa_title: subPrev?.title, org_id: Number(subOrgId), sphere_code: subSphere || null, ara_deadline: subAra || null, preview_json: subPrev, articles: subArticles.trim() || null }) })
      .then((r) => r.json()).then((d) => { if (d.error) setSubMsg(d.error); else { setSubMsg("Подано. Обработка автоматическая, около минуты — карточки попадут в очередь ревью вашего органа."); setSubNgr(""); setSubPrev(null); setSubArticles(""); loadSubs(); } })
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
        setMMsg("Требование добавлено (в очередь ревью вашего органа, с пометкой «добавлено вручную»).");
        setMSimilar([]); setMArticle(""); setMSubject(""); setMAction(""); setMCondition("");
      })
      .catch(() => setMMsg("Сбой запроса"))
      .finally(() => setMBusy(false));
  };

  return (
    <div className="reg-biz">
      <div className="reg-biz-hero">
        <h1>Подача НПА на включение в реестр</h1>
        <p>Укажите ngr или ссылку adilet — система покажет черновой разбор на требования. После подачи система автоматически разберёт документ (обычно до минуты), извлечённые карточки попадут в очередь ревью вашего органа.</p>
      </div>
      <div className="reg-cost-params">
        <div className="reg-cost-params-h"><span>Новый НПА</span><span className="reg-cost-hint">по государственному регистрационному номеру</span></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input style={{ flex: 1, minWidth: 240, height: 38, border: "1px solid var(--line)", borderRadius: 9, padding: "0 12px", fontSize: 14 }}
            value={subNgr} onChange={(e) => setSubNgr(e.target.value)} placeholder="напр. V2300032977 или https://adilet.zan.kz/rus/docs/…" />
          <button className="reg-cost-apply" style={{ marginTop: 0 }} onClick={runPreview} disabled={subBusy || !subNgr}>{subBusy ? "…" : "Проверить"}</button>
        </div>
        {subMsg && <div className="reg-cost-hint" style={{ color: "#A32D2D", marginTop: 8 }}>{subMsg}</div>}
        {subPrev && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 650, fontSize: 15 }}>{subPrev.title || subNgr}</div>
            <div className="reg-cost-hint" style={{ marginTop: 3 }}>Статей: {subPrev.articleCount} · разобрано в превью: {(subPrev.previewedArticles || []).join(", ") || "—"}</div>
            <div style={{ margin: "10px 0" }}>
              {(subPrev.requirements || []).length ? (subPrev.requirements as any[]).map((r, i) => (
                <div key={i} className="reg-rev-row" style={{ marginBottom: 6 }}>
                  <div className="reg-rev-main"><div className="reg-rev-t">{r.action}</div><div className="reg-rev-m">{r.subject}{r.quote ? ` · «${r.quote}»` : ""}</div></div>
                </div>
              )) : <div className="reg-empty">{subPrev.note || "Требования в превью не найдены (проверит полный парсинг)."}</div>}
            </div>
          </div>
        )}
        {/* Форма подачи доступна и без превью: сбой ИИ/adilet не должен блокировать подачу —
            авторитетный парсинг всё равно выполняет Python-конвейер оператора. */}
        {(subPrev || (subTried && !subBusy)) && (
          <div style={{ marginTop: 6 }}>
            {!subPrev && (
              <div className="reg-cost-hint" style={{ margin: "6px 0 10px" }}>
                Превью недоступно — НПА можно подать без него: полный разбор выполнится автоматически.
              </div>
            )}
            <div className="reg-cost-params-grid">
              <label className="reg-cost-param"><span className="reg-cost-param-l">Ответственный орган (узел)</span>
                <span className="reg-cost-param-in"><select value={subOrgId} onChange={(e) => setSubOrgId(e.target.value)} style={{ width: "100%", height: 36, border: "1px solid var(--line)", borderRadius: 8 }}>
                  <option value="">— выбрать —</option>
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
                        <option key={`m-${m.id}`} value={m.id}>{m.short_name || m.name_ru} (само министерство)</option>
                        {branch.map(({ o, d }) => (
                          <option key={o.id} value={o.id}>{" ".repeat(d * 2)}└ {o.short_name || o.name_ru}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                  <optgroup label="Агентства и Нацбанк">
                    {subOrgs.filter((o: any) => o.type === "agency").map((o: any) => (
                      <option key={o.id} value={o.id}>{o.short_name || o.name_ru}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Акиматы (местные)">
                    {subOrgs.filter((o: any) => o.type === "akimat").map((o: any) => (
                      <option key={o.id} value={o.id}>{o.short_name || o.name_ru}</option>
                    ))}
                  </optgroup>
                </select></span></label>
              <label className="reg-cost-param"><span className="reg-cost-param-l">Сфера (код)</span>
                <span className="reg-cost-param-in"><input value={subSphere} onChange={(e) => setSubSphere(e.target.value)} placeholder="напр. taxes / labor" /></span></label>
              <label className="reg-cost-param"><span className="reg-cost-param-l">Срок АРА</span>
                <span className="reg-cost-param-in"><input type="date" value={subAra} onChange={(e) => setSubAra(e.target.value)} /></span></label>
              <label className="reg-cost-param"><span className="reg-cost-param-l">Только статьи (доподача)</span>
                <span className="reg-cost-param-in"><input value={subArticles} onChange={(e) => setSubArticles(e.target.value)} placeholder="напр. 20, 27-1 — пусто = весь акт" /></span></label>
            </div>
            {subArticles.trim() && (
              <div className="reg-cost-hint" style={{ margin: "6px 0" }}>
                Направленная доподача: будут разобраны только статьи {subArticles.trim()} — используйте, когда из акта не извлеклись отдельные статьи.
              </div>
            )}
            <button className="reg-cost-apply" onClick={submitNpa} disabled={subBusy}>
              {subPrev ? "Подать в очередь" : "Подать без превью"}
            </button>
          </div>
        )}
      </div>
      {/* Ручное добавление — последний рубеж: таблицы, приложения, перечни, где экстрактор бессилен */}
      <div className="reg-cost-params" style={{ marginTop: 14 }}>
        <div className="reg-cost-params-h">
          <span>Добавить требование вручную</span>
          <button className="reg-tool-btn" onClick={() => setMOpen(!mOpen)}>{mOpen ? "Свернуть" : "Открыть форму"}</button>
        </div>
        {mOpen && (
          <div>
            <div className="reg-cost-hint" style={{ marginBottom: 10 }}>
              Для случаев, когда автоматический разбор не извлёк конкретную норму (таблицы, приложения).
              Сначала попробуйте доподачу по статьям выше. Карточка получит пометку «добавлено вручную» и пройдёт обычное ревью.
            </div>
            <div className="reg-cost-params-grid">
              <label className="reg-cost-param"><span className="reg-cost-param-l">Госрегномер НПА (ngr)</span>
                <span className="reg-cost-param-in"><input value={mNgr} onChange={(e) => setMNgr(e.target.value)} placeholder="напр. V1800017030" /></span></label>
              <label className="reg-cost-param"><span className="reg-cost-param-l">Статья / пункт</span>
                <span className="reg-cost-param-in"><input value={mArticle} onChange={(e) => setMArticle(e.target.value)} placeholder="напр. ст.20 п.8" /></span></label>
              <label className="reg-cost-param"><span className="reg-cost-param-l">Орган</span>
                <span className="reg-cost-param-in"><select value={mOrgId} onChange={(e) => setMOrgId(e.target.value)} style={{ width: "100%", height: 36, border: "1px solid var(--line)", borderRadius: 8 }}>
                  <option value="">— выбрать —</option>
                  {subOrgs.map((o: any) => <option key={o.id} value={o.id}>{o.short_name || o.name_ru}</option>)}
                </select></span></label>
              <label className="reg-cost-param"><span className="reg-cost-param-l">Субъект (кто обязан)</span>
                <span className="reg-cost-param-in"><input value={mSubject} onChange={(e) => setMSubject(e.target.value)} placeholder="напр. недропользователь" /></span></label>
            </div>
            <label className="reg-cost-param" style={{ display: "block", marginTop: 8 }}>
              <span className="reg-cost-param-l">Формулировка требования (что обязан сделать)</span>
              <textarea value={mAction} onChange={(e) => setMAction(e.target.value)} rows={3}
                style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: 8, fontSize: 14 }}
                placeholder="Дословно или близко к тексту нормы, от 15 символов" />
            </label>
            <label className="reg-cost-param" style={{ display: "block", marginTop: 8 }}>
              <span className="reg-cost-param-l">Условие (когда применяется; можно пусто)</span>
              <input value={mCondition} onChange={(e) => setMCondition(e.target.value)}
                style={{ width: "100%", height: 36, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px" }} />
            </label>
            {mMsg && <div className="reg-cost-hint" style={{ color: mSimilar.length ? "#A35A00" : undefined, marginTop: 8 }}>{mMsg}</div>}
            {mSimilar.length > 0 && (
              <div style={{ margin: "8px 0" }}>
                {mSimilar.map((s: any) => (
                  <div key={s.id} className="reg-rev-row" style={{ marginBottom: 6 }}>
                    <div className="reg-rev-main"><div className="reg-rev-t">{s.text}</div><div className="reg-rev-m">{s.article} · похожесть {Math.round((s.sim || 0) * 100)}%</div></div>
                  </div>
                ))}
                <button className="reg-cost-apply" onClick={() => submitManual(true)} disabled={mBusy}>Не дубль — всё равно добавить</button>
              </div>
            )}
            {!mSimilar.length && (
              <button className="reg-cost-apply" style={{ marginTop: 10 }} onClick={() => submitManual(false)}
                disabled={mBusy || !mNgr.trim() || !mOrgId || !mArticle.trim() || !mSubject.trim() || mAction.trim().length < 15}>
                {mBusy ? "…" : "Добавить требование"}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="reg-biz-blockh reg-biz-blockh-lg">Мои подачи<span className="reg-biz-blockh-cnt">{subList.length}</span></div>
      <div className="reg-rev-list">
        {subList.map((s: any) => (
          <div key={s.id} className="reg-rev-row">
            <div className="reg-rev-main"><div className="reg-rev-t">{s.npa_title || s.ngr}</div><div className="reg-rev-m">{s.ngr} · {s.org_short || s.org_name || "—"} · подал {s.submitter}</div></div>
            <span className={"reg-rb reg-rb-" + (s.status === "parsed" ? "confirmed" : s.status === "error" ? "rejected" : "pending")}>{s.status}{s.cards_created ? ` · ${s.cards_created} карт.` : ""}</span>
          </div>
        ))}
        {!subList.length && <div className="reg-empty">Пока нет подач.</div>}
      </div>
    </div>
  );
}
