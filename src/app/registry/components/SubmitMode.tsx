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

  const loadSubs = useCallback(() => { fetch("/api/npa-submission").then((r) => r.json()).then((d) => setSubList(d.submissions || [])).catch(() => {}); }, []);
  useEffect(() => {
    loadSubs();
    fetch("/api/organizations").then((r) => r.json()).then((d) => setSubOrgs(d.organizations || [])).catch(() => {});
  }, [loadSubs]);

  const runPreview = () => {
    setSubBusy(true); setSubMsg(""); setSubPrev(null); setSubTried(false);
    fetch("/api/npa-submission/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ngr: subNgr }) })
      .then((r) => r.json()).then((d) => { if (d.error) setSubMsg(d.error); else setSubPrev(d); }).catch(() => setSubMsg("Сбой превью"))
      .finally(() => { setSubBusy(false); setSubTried(true); });
  };
  const submitNpa = () => {
    if (!subOrgId) { setSubMsg("Выберите орган"); return; }
    setSubBusy(true); setSubMsg("");
    fetch("/api/npa-submission", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ngr: subNgr, npa_title: subPrev?.title, org_id: Number(subOrgId), sphere_code: subSphere || null, ara_deadline: subAra || null, preview_json: subPrev }) })
      .then((r) => r.json()).then((d) => { if (d.error) setSubMsg(d.error); else { setSubMsg("Подано. Авторитетный парсинг выполнит оператор."); setSubNgr(""); setSubPrev(null); loadSubs(); } })
      .finally(() => setSubBusy(false));
  };

  return (
    <div className="reg-biz">
      <div className="reg-biz-hero">
        <h1>Подача НПА на включение в реестр</h1>
        <p>Укажите ngr или ссылку adilet — система покажет черновой разбор на требования. После подачи авторитетный парсинг выполнит оператор, извлечённые карточки попадут в очередь ревью вашего органа.</p>
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
                Превью недоступно — НПА можно подать без него: полный разбор выполнит оператор.
              </div>
            )}
            <div className="reg-cost-params-grid">
              <label className="reg-cost-param"><span className="reg-cost-param-l">Ответственный орган (узел)</span>
                <span className="reg-cost-param-in"><select value={subOrgId} onChange={(e) => setSubOrgId(e.target.value)} style={{ width: "100%", height: 36, border: "1px solid var(--line)", borderRadius: 8 }}>
                  <option value="">— выбрать —</option>
                  {/* иерархия: министерство → его комитеты; затем агентства и акиматы */}
                  {subOrgs.filter((o: any) => o.type === "ministry" && o.parent_id == null).map((m: any) => (
                    <optgroup key={m.id} label={m.short_name || m.name_ru}>
                      <option value={m.id}>{m.short_name || m.name_ru} (само министерство)</option>
                      {subOrgs.filter((c: any) => c.parent_id === m.id).map((c: any) => (
                        <option key={c.id} value={c.id}>&nbsp;&nbsp;└ {c.short_name || c.name_ru}</option>
                      ))}
                    </optgroup>
                  ))}
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
            </div>
            <button className="reg-cost-apply" onClick={submitNpa} disabled={subBusy}>
              {subPrev ? "Подать в очередь" : "Подать без превью"}
            </button>
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
