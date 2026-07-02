"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

interface UserRow {
  id: number;
  username: string;
  full_name: string | null;
  role: "admin" | "moderator" | "expert";
  is_active: boolean;
  created_at: string;
  assigned_spheres: string[];
  assigned_authorities: string[];
  assigned_org_ids: number[];
}

interface Organization {
  id: number;
  code: string;
  parent_id: number | null;
  type: string;
  name_ru: string;
  short_name: string | null;
  req_count: number;
}
interface Sphere {
  code: string;
  name: string;
  card_count: number;
  is_mvp: boolean;
}

interface Authority {
  code: string;
  name: string;
  short_name: string | null;
  card_count: number;
}

const inputClass =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none";

export default function CardsAdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editSpheresFor, setEditSpheresFor] = useState<UserRow | null>(null);
  const [editAuthoritiesFor, setEditAuthoritiesFor] = useState<UserRow | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [u, s, a, o] = await Promise.all([
        fetch("/api/admin/users").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/spheres").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/authorities").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/organizations").then((r) => (r.ok ? r.json() : null)),
      ]);
      if (!u) {
        router.push("/login");
        return;
      }
      setUsers(u.users || []);
      // Фильтруем сферы и органы без карточек — нет смысла назначать их экспертам.
      const allSpheres: Sphere[] = s?.spheres || [];
      const allAuthorities: Authority[] = a?.authorities || [];
      setSpheres(allSpheres.filter((sp) => sp.card_count > 0));
      setAuthorities(allAuthorities.filter((au) => au.card_count > 0));
      setOrgs(o?.organizations || []);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function toggleActive(u: UserRow) {
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id, isActive: !u.is_active }),
    });
    if (res.ok) fetchAll();
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Ошибка");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Управление пользователями
            </h2>
            <p className="text-sm text-slate-500">
              Назначение сфер и органов. Эксперт видит карточку только если у
              него есть и нужная сфера, и орган-регулятор. Админ — без ограничений.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            + Создать пользователя
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-slate-400">Загрузка…</div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">
                    Логин
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">
                    ФИО
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">
                    Роль
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">
                    Сферы
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">
                    Органы
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">
                    Статус
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100 hover:bg-slate-50 align-top"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">
                      {u.username}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {u.full_name || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          u.role === "admin"
                            ? "bg-purple-100 text-purple-700"
                            : u.role === "moderator"
                            ? "bg-teal-100 text-teal-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {u.role === "admin" ? "Админ" : u.role === "moderator" ? "Модератор" : "Эксперт"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {u.role === "admin" ? (
                        <span className="text-xs text-slate-400 italic">
                          (полный доступ)
                        </span>
                      ) : u.assigned_spheres.length === 0 ? (
                        <span className="text-xs text-amber-600">
                          ⚠ не назначены
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {u.assigned_spheres.map((sc) => {
                            const s = spheres.find((x) => x.code === sc);
                            return (
                              <span
                                key={sc}
                                className="px-1.5 py-0.5 text-xs bg-slate-100 text-slate-700 rounded"
                                title={sc}
                              >
                                {s?.name || sc}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {u.role === "admin" ? (
                        <span className="text-xs text-slate-400 italic">
                          (все органы)
                        </span>
                      ) : u.assigned_authorities.length === 0 ? (
                        <span className="text-xs text-amber-600">
                          ⚠ не назначены
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {u.assigned_authorities.map((ac) => {
                            const a = authorities.find((x) => x.code === ac);
                            return (
                              <span
                                key={ac}
                                className="px-1.5 py-0.5 text-xs bg-indigo-50 text-indigo-700 rounded"
                                title={a?.name || ac}
                              >
                                {a?.short_name || ac}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs ${
                          u.is_active ? "text-green-600" : "text-red-500"
                        }`}
                      >
                        {u.is_active ? "● Активен" : "● Заблокирован"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {u.role === "expert" && (
                          <>
                            <button
                              onClick={() => setEditSpheresFor(u)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Сферы
                            </button>
                            <button
                              onClick={() => setEditAuthoritiesFor(u)}
                              className="text-xs text-indigo-600 hover:text-indigo-800"
                            >
                              Органы
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => toggleActive(u)}
                          className={`text-xs ${
                            u.is_active
                              ? "text-red-500 hover:text-red-700"
                              : "text-green-600 hover:text-green-700"
                          }`}
                        >
                          {u.is_active ? "Заблокировать" : "Разблокировать"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-slate-400"
                    >
                      Пользователей пока нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {showCreate && (
          <CreateUserModal
            spheres={spheres}
            orgs={orgs}
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              fetchAll();
            }}
          />
        )}

        {editSpheresFor && (
          <EditSpheresModal
            user={editSpheresFor}
            spheres={spheres}
            onClose={() => setEditSpheresFor(null)}
            onSaved={() => {
              setEditSpheresFor(null);
              fetchAll();
            }}
          />
        )}

        {editAuthoritiesFor && (
          <EditAuthoritiesModal
            user={editAuthoritiesFor}
            authorities={authorities}
            onClose={() => setEditAuthoritiesFor(null)}
            onSaved={() => {
              setEditAuthoritiesFor(null);
              fetchAll();
            }}
          />
        )}
      </main>
    </div>
  );
}

// ─── Create User Modal ────────────────────────────────────────────────

function CreateUserModal({
  spheres,
  orgs,
  onClose,
  onCreated,
}: {
  spheres: Sphere[];
  orgs: Organization[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "moderator" | "expert">("expert");
  const [pickedSpheres, setPickedSpheres] = useState<Set<string>>(new Set());
  const [pickedOrgs, setPickedOrgs] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleSphere(code: string) {
    const next = new Set(pickedSpheres);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setPickedSpheres(next);
  }
  function toggleOrg(id: number) {
    const next = new Set(pickedOrgs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPickedOrgs(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          fullName: fullName || null,
          email: email || null,
          role,
          assigned_spheres: role !== "admin" ? Array.from(pickedSpheres) : [],
          assigned_orgs: role !== "admin" ? Array.from(pickedOrgs) : [],
        }),
      });
      if (res.ok) onCreated();
      else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || `Ошибка ${res.status}`);
      }
    } catch (e) {
      setErr(`Сеть: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">
            Создать пользователя
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Логин *
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Пароль *
              </label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ФИО
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Email (для уведомлений)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="user@gov.kz"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Роль
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "moderator" | "expert")}
                className={inputClass}
              >
                <option value="expert">Эксперт (рецензент)</option>
                <option value="moderator">Модератор органа</option>
                <option value="admin">Админ (МНЭ)</option>
              </select>
            </div>
          </div>

          {role !== "admin" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Сферы ({pickedSpheres.size}/{spheres.length})
                </label>
                <div className="grid grid-cols-1 gap-1 max-h-64 overflow-y-auto border border-slate-200 rounded-lg p-2">
                  {spheres.map((s) => (
                    <label
                      key={s.code}
                      className="flex items-center gap-2 text-xs px-2 py-1 hover:bg-slate-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={pickedSpheres.has(s.code)}
                        onChange={() => toggleSphere(s.code)}
                      />
                      <span className="flex-1 truncate" title={s.name}>
                        {s.name}
                      </span>
                      <span className="text-slate-400">{s.card_count}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Орган (узел иерархии) — {pickedOrgs.size} выбрано
                  {role === "moderator" && <span className="text-teal-600"> · модератор управляет узлом + потомками</span>}
                </label>
                <div className="grid grid-cols-1 gap-1 max-h-64 overflow-y-auto border border-slate-200 rounded-lg p-2">
                  {/* Дерево по parent_id: министерство → его комитеты (доступ модератора = узел + потомки) */}
                  {(() => {
                    const kids = new Map<number, Organization[]>();
                    for (const o of orgs) {
                      if (o.parent_id == null) continue;
                      if (!kids.has(o.parent_id)) kids.set(o.parent_id, []);
                      kids.get(o.parent_id)!.push(o);
                    }
                    const renderNode = (o: Organization, depth: number): React.ReactNode => (
                      <div key={o.id}>
                        <label
                          className="flex items-center gap-2 text-xs px-2 py-1 hover:bg-slate-50 rounded cursor-pointer"
                          style={{ paddingLeft: 8 + depth * 18 }}
                        >
                          <input type="checkbox" checked={pickedOrgs.has(o.id)} onChange={() => toggleOrg(o.id)} />
                          {depth > 0 && <span className="text-slate-300">└</span>}
                          <span className={"flex-1 truncate" + (depth === 0 ? " font-medium" : "")} title={o.name_ru}>
                            {o.short_name || o.name_ru}
                          </span>
                          {o.req_count > 0 && <span className="text-slate-400">{o.req_count}</span>}
                        </label>
                        {(kids.get(o.id) || []).map((c) => renderNode(c, depth + 1))}
                      </div>
                    );
                    const section = (label: string, roots: Organization[]) =>
                      roots.length ? (
                        <div key={label}>
                          <div className="text-[10px] uppercase tracking-wide text-slate-400 px-2 mt-1">{label}</div>
                          {roots.map((o) => renderNode(o, 0))}
                        </div>
                      ) : null;
                    const rootsOf = (t: string) => orgs.filter((o) => o.type === t && o.parent_id == null);
                    return (
                      <>
                        {section("Министерства и их комитеты", rootsOf("ministry"))}
                        {section("Агентства и Нацбанк", rootsOf("agency"))}
                        {section("Акиматы (местные)", rootsOf("akimat"))}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {err && (
            <div className="p-2 bg-red-50 text-red-700 text-xs rounded">
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Создание…" : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Spheres Modal ──────────────────────────────────────────────

function EditSpheresModal({
  user,
  spheres,
  onClose,
  onSaved,
}: {
  user: UserRow;
  spheres: Sphere[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(
    new Set(user.assigned_spheres),
  );
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(code: string) {
    const next = new Set(picked);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setPicked(next);
  }

  async function save() {
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/spheres`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_spheres: Array.from(picked) }),
      });
      if (res.ok) {
        onSaved();
      } else if (res.status === 401 || res.status === 403) {
        setErr(
          "Сессия истекла или нет прав. Перезайдите в систему как администратор.",
        );
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || `Ошибка ${res.status}`);
      }
    } catch (e) {
      setErr(`Сеть: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              Сферы пользователя
            </h3>
            <p className="text-sm text-slate-500">
              <span className="font-mono">{user.username}</span>
              {user.full_name && ` · ${user.full_name}`}
            </p>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-2">
              Выбрано: {picked.size} из {spheres.length}
            </div>
            <div className="grid grid-cols-1 gap-1 max-h-80 overflow-y-auto border border-slate-200 rounded-lg p-2">
              {spheres.map((s) => (
                <label
                  key={s.code}
                  className="flex items-center gap-2 text-sm px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={picked.has(s.code)}
                    onChange={() => toggle(s.code)}
                  />
                  <span className="flex-1">{s.name}</span>
                  <span className="text-xs text-slate-400">
                    {s.card_count} карточек
                  </span>
                </label>
              ))}
            </div>
          </div>

          {err && (
            <div className="p-2 bg-red-50 text-red-700 text-xs rounded">
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              onClick={save}
              disabled={submitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Authorities Modal ──────────────────────────────────────────

function EditAuthoritiesModal({
  user,
  authorities,
  onClose,
  onSaved,
}: {
  user: UserRow;
  authorities: Authority[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(
    new Set(user.assigned_authorities),
  );
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(code: string) {
    const next = new Set(picked);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setPicked(next);
  }

  async function save() {
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/authorities`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_authorities: Array.from(picked) }),
      });
      if (res.ok) {
        onSaved();
      } else if (res.status === 401 || res.status === 403) {
        setErr(
          "Сессия истекла или нет прав. Перезайдите в систему как администратор.",
        );
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || `Ошибка ${res.status}`);
      }
    } catch (e) {
      setErr(`Сеть: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              Госорганы пользователя
            </h3>
            <p className="text-sm text-slate-500">
              <span className="font-mono">{user.username}</span>
              {user.full_name && ` · ${user.full_name}`}
            </p>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-2">
              Выбрано: {picked.size} из {authorities.length}
            </div>
            <div className="grid grid-cols-1 gap-1 max-h-80 overflow-y-auto border border-slate-200 rounded-lg p-2">
              {authorities.map((a) => (
                <label
                  key={a.code}
                  className="flex items-center gap-2 text-sm px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={picked.has(a.code)}
                    onChange={() => toggle(a.code)}
                  />
                  <span className="flex-1" title={a.name}>
                    {a.short_name ? (
                      <>
                        <span className="font-medium">{a.short_name}</span>
                        <span className="text-xs text-slate-500"> · {a.name}</span>
                      </>
                    ) : (
                      a.name
                    )}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">
                    {a.card_count} карточек
                  </span>
                </label>
              ))}
            </div>
          </div>

          {err && (
            <div className="p-2 bg-red-50 text-red-700 text-xs rounded">
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              onClick={save}
              disabled={submitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
