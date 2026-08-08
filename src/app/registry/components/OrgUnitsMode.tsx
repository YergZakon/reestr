"use client";
/* Режим «Подразделения»: модератор ведёт структуру своего органа — создаёт
   подразделения (комитеты, департаменты), переименовывает и отключает их.
   Созданный узел сразу доступен для привязки аналитиков, подачи НПА и
   назначения актов (все справочники читают /api/organizations). */
import { useEffect, useMemo, useState } from "react";
import { I } from "../lib";

interface Org {
  id: number; code: string; parent_id: number | null; type: string;
  name_ru: string; short_name: string | null; active: boolean;
  req_count: number; npa_count: number; user_count: number;
}
interface Me { id: number; username: string; role: string; assigned_authorities: string[] }

const TYPE_LABEL: Record<string, string> = {
  ministry: "Министерство", committee: "Комитет", department: "Департамент",
  agency: "Агентство", akimat: "Акимат", akimat_dept: "Управление акимата",
};

/** Транслитерация для подсказки кода узла. */
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
function slug(s: string): string {
  return s.toLowerCase().split("").map((c) => TRANSLIT[c] ?? c).join("")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 18);
}

export default function OrgUnitsMode({ me }: { me: Me | null }) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // форма создания
  const [parentId, setParentId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);

  // правка
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editShort, setEditShort] = useState("");

  const isAdmin = (me?.role === "admin" || me?.role === "mne");

  const load = () => {
    fetch("/api/organizations").then((r) => r.json())
      .then((d) => setOrgs(d.organizations || [])).catch(() => {});
  };
  useEffect(load, []);

  /* Узлы моего органа: admin — все; модератор — по кодам своего доступа */
  const mine = useMemo(() => {
    if (!orgs.length) return [];
    if (isAdmin) return orgs;
    const allowed = new Set(me?.assigned_authorities || []);
    return orgs.filter((o) => allowed.has(o.code));
  }, [orgs, isAdmin, me]);

  /* Дерево: корни моего доступа + потомки с отступом */
  const tree = useMemo(() => {
    const ids = new Set(mine.map((o) => o.id));
    const roots = mine.filter((o) => o.parent_id == null || !ids.has(o.parent_id));
    const out: { node: Org; depth: number }[] = [];
    const walk = (n: Org, depth: number) => {
      out.push({ node: n, depth });
      mine.filter((c) => c.parent_id === n.id)
        .sort((a, b) => a.name_ru.localeCompare(b.name_ru, "ru"))
        .forEach((c) => walk(c, depth + 1));
    };
    roots.sort((a, b) => a.name_ru.localeCompare(b.name_ru, "ru")).forEach((r) => walk(r, 0));
    return out;
  }, [mine]);

  // подсказка кода: <код родителя>_<транслит наименования>
  useEffect(() => {
    if (codeTouched) return;
    const p = orgs.find((o) => o.id === parentId);
    const base = p ? `${p.code}_` : "";
    setCode(name.trim() ? (base + slug(name)).slice(0, 30) : "");
  }, [name, parentId, codeTouched, orgs]);

  const create = async () => {
    setErr(null); setMsg(null);
    if (!parentId || !name.trim() || !code.trim()) { setErr("Заполните вышестоящий орган, наименование и код"); return; }
    const parent = orgs.find((o) => o.id === parentId);
    // комитет — внутри министерства/агентства, глубже — департамент
    const type = parent && (parent.type === "ministry" || parent.type === "agency") ? "committee" : "department";
    setBusy(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), parent_id: parentId, type, name_ru: name.trim(), short_name: shortName.trim() || null }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "Не удалось создать"); return; }
      setMsg(`Подразделение «${name.trim()}» создано. Теперь его можно выбрать при закреплении сотрудников, подаче НПА и назначении актов.`);
      setName(""); setShortName(""); setCode(""); setCodeTouched(false);
      load();
    } catch { setErr("Сбой запроса"); } finally { setBusy(false); }
  };

  const patch = async (body: Record<string, unknown>, okMsg: string) => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error || "Не удалось изменить"); return; }
      setMsg(okMsg); setEditId(null); load();
    } catch { setErr("Сбой запроса"); } finally { setBusy(false); }
  };

  /* Куда можно добавлять: свои узлы (модератор — весь свой доступ) */
  const parentOptions = mine;

  return (
    <div className="reg-mon">
      <h1 className="reg-cat-h1">Подразделения органа</h1>
      <div className="reg-cat-sub">
        Ведите структуру своего органа: комитеты и департаменты. Созданное подразделение сразу доступно
        для закрепления сотрудников, подачи НПА и назначения актов.
      </div>

      {err && <div className="reg-concl-err" style={{ marginTop: 14 }}>{err}</div>}
      {msg && <div className="reg-mon-ok" style={{ marginTop: 14 }}>{msg}</div>}

      {/* создание */}
      <div className="reg-cost-params" style={{ marginTop: 18 }}>
        <div className="reg-cost-params-h"><span>Новое подразделение</span></div>
        <div className="reg-cost-params-grid">
          <div className="reg-cost-param">
            <span className="reg-cost-param-l">Вышестоящий орган *</span>
            <select value={parentId} onChange={(e) => { setParentId(e.target.value ? Number(e.target.value) : ""); setCodeTouched(false); }}
              style={{ height: 36, border: "1px solid var(--line)", borderRadius: 9, padding: "0 10px", fontSize: 13.5 }}>
              <option value="">— выбрать —</option>
              {parentOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.short_name || o.name_ru} · {TYPE_LABEL[o.type] || o.type}</option>
              ))}
            </select>
          </div>
          <div className="reg-cost-param">
            <span className="reg-cost-param-l">Наименование *</span>
            <div className="reg-cost-param-in"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. Департамент лицензирования" /></div>
          </div>
          <div className="reg-cost-param">
            <span className="reg-cost-param-l">Краткое наименование</span>
            <div className="reg-cost-param-in"><input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="напр. ДЛ" /></div>
          </div>
          <div className="reg-cost-param">
            <span className="reg-cost-param-l">Код (латиница, автоматически)</span>
            <div className="reg-cost-param-in">
              <input value={code} onChange={(e) => { setCode(e.target.value); setCodeTouched(true); }} style={{ fontFamily: "ui-monospace,Menlo,monospace" }} />
            </div>
          </div>
        </div>
        <button className="reg-cost-apply" disabled={busy || !parentId || !name.trim()} onClick={create}>
          {busy ? "…" : "Создать подразделение"}
        </button>
      </div>

      {/* структура */}
      <div className="reg-biz-blockh" style={{ marginTop: 26 }}>Структура органа ({mine.length})</div>
      <div className="reg-mon-tablewrap">
        <table className="reg-mon-table">
          <thead>
            <tr><th>Наименование</th><th>Тип</th><th>Код</th><th>Сотрудников</th><th>НПА</th><th>Требований</th><th>Действия</th></tr>
          </thead>
          <tbody>
            {tree.map(({ node, depth }) => {
              const editable = isAdmin || (node.parent_id != null && (node.type === "committee" || node.type === "department"));
              return (
                <tr key={node.id}>
                  <td className="t-name" style={{ paddingLeft: 12 + depth * 20 }}>
                    {depth > 0 && <span style={{ color: "var(--ink-3)" }}>└ </span>}
                    {editId === node.id ? (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)}
                          style={{ height: 30, border: "1px solid var(--line)", borderRadius: 7, padding: "0 8px", fontSize: 13, minWidth: 220 }} />
                        <input value={editShort} onChange={(e) => setEditShort(e.target.value)} placeholder="кратко"
                          style={{ height: 30, border: "1px solid var(--line)", borderRadius: 7, padding: "0 8px", fontSize: 13, width: 110 }} />
                        <button className="reg-rev-confirm" style={{ height: 30 }} disabled={busy}
                          onClick={() => patch({ id: node.id, name_ru: editName.trim(), short_name: editShort.trim() || null }, "Наименование изменено")}>ок</button>
                        <button className="reg-rev-all" style={{ height: 30, marginLeft: 0 }} onClick={() => setEditId(null)}>×</button>
                      </span>
                    ) : (
                      <>{node.name_ru}{node.short_name ? <span className="t-code">{node.short_name}</span> : null}</>
                    )}
                  </td>
                  <td>{TYPE_LABEL[node.type] || node.type}</td>
                  <td><code style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{node.code}</code></td>
                  <td className="num">{node.user_count || "—"}</td>
                  <td className="num">{node.npa_count || "—"}</td>
                  <td className="num b">{Number(node.req_count || 0).toLocaleString("ru")}</td>
                  <td className="nowrap">
                    {editable && editId !== node.id && (
                      <>
                        <button className="reg-permit-more" onClick={() => { setEditId(node.id); setEditName(node.name_ru); setEditShort(node.short_name || ""); }}>переименовать</button>
                        {node.parent_id != null && (
                          <button className="reg-permit-more" style={{ color: "#C0392B", marginLeft: 10 }} disabled={busy}
                            onClick={() => patch({ id: node.id, active: false }, "Подразделение отключено")}>отключить</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!tree.length && <div className="reg-empty">За вами не закреплён ни один орган — обратитесь к администратору (МНЭ).</div>}
      </div>

      <div className="reg-help-note" style={{ marginTop: 8 }}>
        <b>Как использовать подразделения. </b>
        Закрепление сотрудников — раздел <b>«Аналитики»</b>: выберите созданное подразделение в поле «Узел органа».
        Привязка актов — раздел <b>«Назначения»</b>: выберите НПА и назначьте подразделение ответственным (требования акта
        перейдут в его очередь). При подаче НПА укажите подразделение в поле «Ответственный орган (узел)».
        Отключить можно только подразделение без сотрудников, актов и вложенных узлов.
      </div>
    </div>
  );
}
