"use client";
/* Режим «Органы и НПА»: список органов + НПА выбранного органа. Самодостаточный. */
import { useEffect, useState } from "react";
import { minShort, type Organ, type Npa } from "../lib";

export default function OrgansMode() {
  const [organs, setOrgans] = useState<Organ[]>([]);
  const [selOrg, setSelOrg] = useState<string | null>(null);
  const [npaList, setNpaList] = useState<Npa[]>([]);
  const [npaLoading, setNpaLoading] = useState(false);

  useEffect(() => {
    fetch("/api/registry/organs").then((r) => r.json()).then((d) => {
      setOrgans(d.organs || []);
      if (d.organs?.length) setSelOrg(d.organs[0].ministry);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!selOrg) return;
    setNpaLoading(true);
    fetch(`/api/registry/npa?ministry=${encodeURIComponent(selOrg)}`).then((r) => r.json())
      .then((d) => setNpaList(d.npa || [])).finally(() => setNpaLoading(false));
  }, [selOrg]);

  return (
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
  );
}
