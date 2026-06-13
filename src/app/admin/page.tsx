"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Pagination from "@/components/Pagination";

interface Requirement {
  id: number;
  external_id: string;
  category: string;
  text_original: string;
  article_ref: string | null;
  npa_title: string | null;
  confidence: string;
  admin_status: string;
  confirms: string;
  rejects: string;
  total_votes: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface User {
  id: number;
  username: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

const SPHERES = [
  { value: "", label: "Все сферы" },
  { value: "land", label: "Земельные" },
  { value: "ecology", label: "Экология" },
  { value: "transport", label: "Транспорт" },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"requirements" | "users" | "iterations">("requirements");
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-slate-200">
          <button
            onClick={() => setActiveTab("requirements")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "requirements"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Требования
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "users"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Пользователи
          </button>
          <button
            onClick={() => setActiveTab("iterations")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "iterations"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Итерации
          </button>
        </div>

        {activeTab === "requirements" ? (
          <RequirementsTab router={router} />
        ) : activeTab === "users" ? (
          <UsersTab router={router} />
        ) : (
          <IterationsTab router={router} />
        )}
      </main>
    </div>
  );
}

/* ==================== Requirements Tab ==================== */

function RequirementsTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1, limit: 20, total: 0, totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("active");
  const [sphere, setSphere] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: "20",
          status,
          vote_status: "all",
        });
        if (sphere) params.set("sphere", sphere);
        const res = await fetch(`/api/requirements?${params}`);
        if (!res.ok) throw new Error("unauthorized");
        const data = await res.json();
        setRequirements(data.requirements);
        setPagination(data.pagination);
        setSelected(new Set());
      } catch {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    },
    [status, sphere, router]
  );

  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === requirements.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(requirements.map((r) => r.id)));
    }
  }

  async function handleReject() {
    if (selected.size === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirementIds: Array.from(selected),
          reason: "admin_review",
        }),
      });
      if (res.ok) fetchData(pagination.page);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRestore() {
    if (selected.size === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/reject", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementIds: Array.from(selected) }),
      });
      if (res.ok) fetchData(pagination.page);
    } finally {
      setActionLoading(false);
    }
  }

  function handleExport(format: "csv" | "json") {
    const params = new URLSearchParams({ format, status });
    if (sphere) params.set("sphere", sphere);
    window.open(`/api/export?${params}`, "_blank");
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <select
            value={sphere}
            onChange={(e) => setSphere(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white"
          >
            {SPHERES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="active">Активные</option>
            <option value="rejected">Отклонённые</option>
          </select>
          {selected.size > 0 && (
            <>
              <span className="text-sm text-slate-500">
                Выбрано: {selected.size}
              </span>
              {status === "active" ? (
                <button
                  onClick={handleReject}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  Отклонить
                </button>
              ) : (
                <button
                  onClick={handleRestore}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  Восстановить
                </button>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport("csv")}
            className="px-3 py-1.5 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700"
          >
            Экспорт CSV
          </button>
          <button
            onClick={() => handleExport("json")}
            className="px-3 py-1.5 text-sm bg-slate-500 text-white rounded-lg hover:bg-slate-600"
          >
            Экспорт JSON
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-slate-400">Загрузка...</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={selected.size === requirements.length && requirements.length > 0}
                    onChange={selectAll}
                  />
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">ID</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Кат.</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Текст</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">НПА</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-500">Голоса</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requirements.map((r) => (
                <tr
                  key={r.id}
                  className={`hover:bg-slate-50 ${
                    selected.has(r.id) ? "bg-blue-50" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {r.external_id}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs font-medium">{r.category}</span>
                  </td>
                  <td className="px-3 py-2 max-w-md">
                    <div className="text-xs text-slate-700 line-clamp-2">
                      {r.text_original}
                    </div>
                  </td>
                  <td className="px-3 py-2 max-w-40">
                    <div className="text-xs text-slate-500 truncate">
                      {r.npa_title || "\u2014"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-xs">
                      <span className="text-green-600">{r.confirms}</span>{" "}
                      <span className="text-red-600">{r.rejects}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={(p) => fetchData(p)}
      />
    </>
  );
}

/* ==================== Users Tab ==================== */

function UsersTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    fullName: "",
    role: "expert",
  });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("unauthorized");
      const data = await res.json();
      setUsers(data.users);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Ошибка создания");
        return;
      }
      setFormData({ username: "", password: "", fullName: "", role: "expert" });
      setShowForm(false);
      fetchUsers();
    } catch {
      setFormError("Ошибка сети");
    } finally {
      setFormLoading(false);
    }
  }

  async function toggleActive(userId: number, isActive: boolean) {
    try {
      await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isActive }),
      });
      fetchUsers();
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-slate-400">Загрузка...</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold text-slate-700">
          Всего пользователей: {users.length}
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showForm ? "Отмена" : "Добавить пользователя"}
        </button>
      </div>

      {/* Add user form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-lg border border-slate-200 p-4 mb-6 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Логин"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
            <input
              type="password"
              placeholder="Пароль (мин. 6 символов)"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              required
              minLength={6}
            />
            <input
              type="text"
              placeholder="ФИО"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="expert">Эксперт</option>
              <option value="admin">Администратор</option>
            </select>
          </div>
          {formError && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {formError}
            </div>
          )}
          <button
            type="submit"
            disabled={formLoading}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {formLoading ? "Создание..." : "Создать"}
          </button>
        </form>
      )}

      {/* Users table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Логин</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">ФИО</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Роль</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-slate-500">Статус</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Создан</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-slate-500">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium text-slate-700">{u.username}</td>
                <td className="px-4 py-2 text-slate-600">{u.full_name || "\u2014"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      u.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {u.role === "admin" ? "Админ" : "Эксперт"}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      u.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {u.is_active ? "Активен" : "Заблокирован"}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {new Date(u.created_at).toLocaleDateString("ru-RU")}
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => toggleActive(u.id, !u.is_active)}
                    className={`text-xs px-3 py-1 rounded ${
                      u.is_active
                        ? "bg-red-50 text-red-600 hover:bg-red-100"
                        : "bg-green-50 text-green-600 hover:bg-green-100"
                    }`}
                  >
                    {u.is_active ? "Заблокировать" : "Активировать"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ==================== Iterations Tab ==================== */

interface Iteration {
  id: number;
  iteration_number: number;
  status: string;
  description: string;
  created_at: string;
  completed_at: string | null;
  req_count: string;
  vote_count: string;
}

function IterationsTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const fetchIterations = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/iterations");
      if (!res.ok) throw new Error("unauthorized");
      const data = await res.json();
      setIterations(data.iterations);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchIterations();
  }, [fetchIterations]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setFormLoading(true);
    try {
      const res = await fetch("/api/admin/iterations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (res.ok) {
        setDescription("");
        setShowForm(false);
        fetchIterations();
      }
    } finally {
      setFormLoading(false);
    }
  }

  async function handleAction(iterationId: number, action: "complete" | "archive") {
    await fetch("/api/admin/iterations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iterationId, action }),
    });
    fetchIterations();
  }

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    active: { label: "Активна", color: "bg-green-100 text-green-700" },
    completed: { label: "Завершена", color: "bg-blue-100 text-blue-700" },
    archived: { label: "Архив", color: "bg-slate-100 text-slate-500" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-slate-400">Загрузка...</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold text-slate-700">
          Итераций: {iterations.length}
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showForm ? "Отмена" : "Новая итерация"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-lg border border-slate-200 p-4 mb-6 flex gap-3">
          <input
            type="text"
            placeholder="Описание итерации"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            required
          />
          <button
            type="submit"
            disabled={formLoading}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {formLoading ? "Создание..." : "Создать"}
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">#</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Описание</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-slate-500">Статус</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-slate-500">Требований</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-slate-500">Голосов</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Создана</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-slate-500">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {iterations.map((it) => {
              const st = STATUS_LABELS[it.status] || { label: it.status, color: "bg-slate-100" };
              return (
                <tr key={it.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{it.iteration_number}</td>
                  <td className="px-4 py-2 text-slate-600">{it.description}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-2 text-center">{it.req_count}</td>
                  <td className="px-4 py-2 text-center">{it.vote_count}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {new Date(it.created_at).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {it.status === "active" && (
                      <button
                        onClick={() => handleAction(it.id, "complete")}
                        className="text-xs px-3 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                      >
                        Завершить
                      </button>
                    )}
                    {it.status === "completed" && (
                      <button
                        onClick={() => handleAction(it.id, "archive")}
                        className="text-xs px-3 py-1 rounded bg-slate-50 text-slate-500 hover:bg-slate-100"
                      >
                        В архив
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
