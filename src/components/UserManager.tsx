"use client";
/* Управление пользователями, разнесённое по ролям (общее ядро двух страниц):
   - kind="moderators" (/admin/moderators, только admin): создание модераторов
     госорганов — учётка role='moderator' + узел иерархии (user_orgs, org_role='moderator').
   - kind="analysts" (/moderator/analysts, только moderator): создание аналитиков
     (role='expert') в узлах своего поддерева.
   Поверх существующего /api/admin/users (скоуп и форс роли — на сервере). */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Me { id: number; username: string; role: string; assigned_authorities: string[] }
interface OrgNode { id: number; code: string; parent_id: number | null; type: string; name_ru: string; short_name: string | null }
interface Row {
  id: number; username: string; full_name: string | null; email: string | null;
  role: string; is_active: boolean; created_at: string; assigned_org_ids: number[];
}

const ORG_TYPE_LABEL: Record<string, string> = {
  ministry: "Министерства", agency: "Агентства и ведомства", akimat: "Акиматы",
};

function genPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (x) => chars[x % chars.length]).join("");
}

export default function UserManager({ kind }: { kind: "moderators" | "analysts" }) {
  const router = useRouter();
  const isMods = kind === "moderators";
  const noun = isMods ? "модератор" : "аналитик";

  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<OrgNode[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // форма создания
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(genPassword);
  const [orgId, setOrgId] = useState<string>("");
  // одноразовый показ выданных кредов (создание / сброс пароля)
  const [creds, setCreds] = useState<{ username: string; password: string } | null>(null);
  const [emailEdit, setEmailEdit] = useState<{ id: number; value: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const u: Me | null = d?.user || null;
      if (!u) { router.replace("/login"); return; }
      // гвард ролей: страница модераторов — admin; страница аналитиков — moderator
      if (isMods && u.role !== "admin") { router.replace(u.role === "moderator" ? "/moderator/analysts" : "/registry"); return; }
      if (!isMods && u.role !== "moderator") { router.replace(u.role === "admin" ? "/admin/moderators" : "/registry"); return; }
      setMe(u);
    }).catch(() => router.replace("/login"));
  }, [isMods, router]);

  const load = useCallback(() => {
    fetch("/api/admin/users").then((r) => r.json()).then((d) => setRows(d.users || []));
    fetch("/api/organizations").then((r) => r.json()).then((d) => setOrgs(d.organizations || []));
  }, []);
  useEffect(() => { if (me) load(); }, [me, load]);

  /* Дерево органов для селекта: DFS с отступами. Для аналитиков —
     только узлы поддерева модератора (коды из /api/auth/me). */
  const orgOptions = useMemo(() => {
    const allowed = isMods ? null : new Set(me?.assigned_authorities || []);
    const byParent = new Map<number | null, OrgNode[]>();
    for (const o of orgs) {
      const key = o.parent_id ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(o);
    }
    const out: { id: number; label: string; group: string }[] = [];
    const walk = (node: OrgNode, depth: number, group: string) => {
      if (!allowed || allowed.has(node.code))
        out.push({ id: node.id, label: " ".repeat(depth * 3) + (depth ? "└ " : "") + (node.short_name ? `${node.short_name} — ` : "") + node.name_ru, group });
      for (const c of byParent.get(node.id) || []) walk(c, depth + 1, group);
    };
    for (const root of (byParent.get(null) || []))
      walk(root, 0, ORG_TYPE_LABEL[root.type] || "Прочие");
    return out;
  }, [orgs, isMods, me]);

  useEffect(() => {
    if (!orgId && orgOptions.length) setOrgId(String(orgOptions[0].id));
  }, [orgOptions, orgId]);

  const orgName = useCallback((ids: number[]) => {
    const names = ids.map((id) => {
      const o = orgs.find((x) => x.id === id);
      return o ? (o.short_name || o.name_ru) : `#${id}`;
    });
    return names.join(", ") || "—";
  }, [orgs]);

  const list = rows.filter((u) => (isMods ? u.role === "moderator" : u.role === "expert"));

  const create = () => {
    setErr(""); setCreds(null);
    if (!username || !password || !orgId) { setErr("Заполните логин, пароль и орган"); return; }
    setBusy(true);
    fetch("/api/admin/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username, password, email: email || null, fullName: fullName || null,
        role: isMods ? "moderator" : "expert", assigned_orgs: [Number(orgId)],
      }),
    }).then((r) => r.json()).then((d) => {
      if (d.error) { setErr(d.error); return; }
      setCreds({ username, password });
      setUsername(""); setFullName(""); setEmail(""); setPassword(genPassword());
      load();
    }).catch(() => setErr("Сбой запроса")).finally(() => setBusy(false));
  };

  const put = (body: Record<string, unknown>, after?: () => void) => {
    setErr("");
    fetch("/api/admin/users", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then((r) => r.json()).then((d) => {
      if (d.error) { setErr(d.error); return; }
      after?.(); load();
    }).catch(() => setErr("Сбой запроса"));
  };

  const resetPassword = (u: Row) => {
    const pwd = genPassword();
    put({ userId: u.id, password: pwd }, () => setCreds({ username: u.username, password: pwd }));
  };

  if (!me) return null;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h2 className="text-xl font-bold text-slate-800">
        {isMods ? "Модераторы госорганов" : "Аналитики"}
      </h2>
      <p className="text-sm text-slate-500 mt-1 max-w-3xl">
        {isMods
          ? "Модератор — ответственный от госоргана: управляет аналитиками своего органа, подаёт НПА, назначает комитеты. Создайте учётную запись и передайте данные для входа представителю органа."
          : "Аналитик рассматривает требования в очереди ревью вашего органа (подтверждает или отклоняет карточки). Создайте учётную запись и передайте данные для входа сотруднику."}
      </p>

      {err && <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">{err}</div>}
      {creds && (
        <div className="mt-4 rounded-md bg-amber-50 border border-amber-300 px-4 py-3 text-sm text-amber-900">
          <b>Данные для входа</b> (показываются один раз — передайте пользователю):
          логин <code className="font-mono bg-white border border-amber-200 rounded px-1.5 py-0.5">{creds.username}</code>{" "}
          пароль <code className="font-mono bg-white border border-amber-200 rounded px-1.5 py-0.5">{creds.password}</code>
          <button className="ml-3 text-amber-700 underline" onClick={() => navigator.clipboard.writeText(`${creds.username} / ${creds.password}`).catch(() => {})}>копировать</button>
        </div>
      )}

      {/* создание */}
      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
        <div className="text-sm font-semibold text-slate-700">Новый {noun}</div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">Логин *
            <input value={username} onChange={(e) => setUsername(e.target.value.trim())} placeholder="латиница, цифры, ._-"
              className="mt-1 w-full h-9 rounded-md border border-slate-300 px-3 text-sm text-slate-800" />
          </label>
          <label className="text-xs text-slate-500">ФИО
            <input value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-slate-300 px-3 text-sm text-slate-800" />
          </label>
          <label className="text-xs text-slate-500">Email (для уведомлений)
            <input value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="name@gov.kz"
              className="mt-1 w-full h-9 rounded-md border border-slate-300 px-3 text-sm text-slate-800" />
          </label>
          <label className="text-xs text-slate-500">Пароль *
            <span className="mt-1 flex gap-2">
              <input value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-300 px-3 text-sm font-mono text-slate-800" />
              <button type="button" onClick={() => setPassword(genPassword())}
                className="h-9 px-3 rounded-md border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 whitespace-nowrap">сгенерировать</button>
            </span>
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">{isMods ? "Госорган *" : "Узел органа *"}
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-slate-300 px-2 text-sm text-slate-800 bg-white">
              {Object.entries(
                orgOptions.reduce<Record<string, typeof orgOptions>>((acc, o) => {
                  (acc[o.group] = acc[o.group] || []).push(o); return acc;
                }, {}),
              ).map(([g, opts]) => (
                <optgroup key={g} label={g}>
                  {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        {!isMods && !orgOptions.length && (
          <div className="mt-3 text-sm text-slate-500">За вами не закреплён ни один орган — обратитесь к администратору.</div>
        )}
        <button onClick={create} disabled={busy || !orgOptions.length}
          className="mt-4 h-9 px-4 rounded-md bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
          Создать {noun}а
        </button>
      </div>

      {/* список */}
      <div className="mt-6 rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 text-sm font-semibold text-slate-700 border-b border-slate-200">
          {isMods ? "Модераторы" : "Аналитики"} <span className="text-slate-400 font-normal">({list.length})</span>
        </div>
        {!list.length && <div className="px-5 py-6 text-sm text-slate-400">Пока никого нет — создайте первую учётную запись выше.</div>}
        <ul className="divide-y divide-slate-100">
          {list.map((u) => (
            <li key={u.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="min-w-[220px]">
                <div className="text-sm font-medium text-slate-800">{u.username}{u.full_name ? <span className="text-slate-400 font-normal"> — {u.full_name}</span> : null}</div>
                <div className="text-xs text-slate-500">{orgName(u.assigned_org_ids)}</div>
              </div>
              <div className="text-xs text-slate-500 min-w-[180px]">
                {emailEdit?.id === u.id ? (
                  <span className="flex gap-1">
                    <input value={emailEdit.value} onChange={(e) => setEmailEdit({ id: u.id, value: e.target.value })}
                      className="h-7 rounded border border-slate-300 px-2 text-xs w-44" placeholder="name@gov.kz" />
                    <button className="text-slate-600 underline" onClick={() => put({ userId: u.id, email: emailEdit.value || null }, () => setEmailEdit(null))}>ок</button>
                    <button className="text-slate-400" onClick={() => setEmailEdit(null)}>×</button>
                  </span>
                ) : (
                  <button className="hover:underline" title="Изменить email" onClick={() => setEmailEdit({ id: u.id, value: u.email || "" })}>
                    {u.email || "email не указан"}
                  </button>
                )}
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded ${u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {u.is_active ? "активен" : "выключен"}
              </span>
              <div className="ml-auto flex gap-3 text-xs">
                <button className="text-slate-500 hover:text-slate-800 underline" onClick={() => resetPassword(u)}>сбросить пароль</button>
                <button className={u.is_active ? "text-red-500 hover:text-red-700 underline" : "text-emerald-600 hover:text-emerald-800 underline"}
                  onClick={() => put({ userId: u.id, isActive: !u.is_active })}>
                  {u.is_active ? "деактивировать" : "включить"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
