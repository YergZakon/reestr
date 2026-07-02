"use client";
/* Режим «Дубли»: группы дублирующих требований (кросс-орган приоритетно). Самодостаточный. */
import { useEffect, useState } from "react";
import { I, fmtKzt, minShort, SPHERE_COLOR, type Req } from "../lib";

export default function DupesMode({ onOpen }: { onOpen: (r: Req) => void }) {
  const [dupes, setDupes] = useState<{ groups: any[]; totalDuplicates: number; totalGroups: number; crossGroups?: number; rawCrossGroups?: number } | null>(null);
  const [dupeCross, setDupeCross] = useState(true);
  const [openDupe, setOpenDupe] = useState<string | null>(null);
  const [dupeItems, setDupeItems] = useState<Record<string, Req[]>>({});

  useEffect(() => {
    fetch(`/api/registry/duplicates?cross=${dupeCross ? "1" : "0"}`).then((r) => r.json()).then(setDupes).catch(() => {});
  }, [dupeCross]);
  const toggleDupe = (gid: string) => {
    setOpenDupe((o) => (o === gid ? null : gid));
    if (!dupeItems[gid]) fetch(`/api/registry/duplicates?group=${encodeURIComponent(gid)}`).then((r) => r.json()).then((d) => setDupeItems((p) => ({ ...p, [gid]: d.items || [] })));
  };

  return (
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
                      <div key={r.id} className={"reg-dupe-item" + (r.is_canonical ? " canon" : "")} onClick={() => onOpen(r)}>
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
  );
}
