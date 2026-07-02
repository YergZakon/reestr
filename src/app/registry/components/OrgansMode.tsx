"use client";
/* Режим «Органы и НПА»: дерево узлов справочника (министерство → комитеты) +
   НПА выбранного узла. Ось — authority_code требований, поэтому назначение НПА
   комитету сразу видно здесь. Скоуп: admin — все органы; модератор/аналитик —
   только своё поддерево (аналитик комитета видит один комитет). */
import { useEffect, useMemo, useState } from "react";
import { type Npa } from "../lib";

interface OrgSummary {
  code: string; name_ru: string; short_name: string | null; type: string;
  parent_code: string | null; npa_count: number; req_count: number; npa_active: number;
}

export default function OrgansMode() {
  const [organs, setOrgans] = useState<OrgSummary[]>([]);
  const [scoped, setScoped] = useState(false);
  const [selCode, setSelCode] = useState<string | null>(null);
  const [npaList, setNpaList] = useState<Npa[]>([]);
  const [npaLoading, setNpaLoading] = useState(false);

  useEffect(() => {
    fetch("/api/registry/organs").then((r) => r.json()).then((d) => {
      const list: OrgSummary[] = d.organs || [];
      setOrgans(list); setScoped(!!d.scoped);
      if (list.length) setSelCode(list[0].code);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!selCode) return;
    setNpaLoading(true);
    fetch(`/api/registry/npa?authority=${encodeURIComponent(selCode)}`).then((r) => r.json())
      .then((d) => setNpaList(d.npa || [])).finally(() => setNpaLoading(false));
  }, [selCode]);

  /* два уровня: узел под родителем, если родитель тоже в сводке; иначе — корнем
     (аналитик комитета видит свой комитет корнем без министерства) */
  const ordered = useMemo(() => {
    const codes = new Set(organs.map((o) => o.code));
    const roots = organs.filter((o) => !o.parent_code || !codes.has(o.parent_code));
    const out: { node: OrgSummary; depth: number }[] = [];
    for (const r of roots) {
      out.push({ node: r, depth: 0 });
      for (const c of organs.filter((o) => o.parent_code === r.code))
        out.push({ node: c, depth: 1 });
    }
    return out;
  }, [organs]);

  const sel = organs.find((o) => o.code === selCode);

  return (
    <div className="reg-shell">
      <aside className="reg-sidebar">
        <div className="reg-filters">
          <div className="reg-filters-head"><span className="reg-filters-title">Государственные органы</span></div>
          {scoped && <div className="reg-cost-hint" style={{ margin: "2px 0 8px" }}>Показаны органы вашего доступа.</div>}
          {ordered.map(({ node, depth }) => (
            <div key={node.code}
              className={"reg-org-item" + (selCode === node.code ? " on" : "")}
              style={depth ? { paddingLeft: 22 } : undefined}
              onClick={() => setSelCode(node.code)}>
              <span className="reg-org-name">{depth ? "└ " : ""}{node.short_name || node.name_ru}</span>
              <span className="reg-org-count">{node.npa_count} НПА</span>
            </div>
          ))}
          {!organs.length && <div className="reg-empty">Нет органов с требованиями в вашем доступе.</div>}
        </div>
      </aside>
      <main className="reg-content">
        <div className="reg-catalog">
          <h1 className="reg-cat-h1">{sel ? sel.name_ru : "Органы и НПА"}</h1>
          {sel && <div className="reg-cat-sub">{sel.npa_count} НПА · {Number(sel.req_count).toLocaleString("ru")} требований</div>}
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
