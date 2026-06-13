"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

interface Stats {
  overview: {
    total_active: string;
    total_rejected: string;
    active_experts: string;
    total_votes: string;
  };
  byCategory: { category: string; count: string }[];
  byNpa: { title: string; count: string }[];
  bySphere: { sphere: string; count: string }[];
  expertProgress: {
    username: string;
    full_name: string;
    voted: string;
    total_reqs: string;
  }[];
  consensus: {
    confirmed_unanimously: string;
    rejected_unanimously: string;
    disputed: string;
  };
}

const SPHERE_NAMES: Record<string, string> = {
  land: "Земельные",
  ecology: "Экология",
  transport: "Транспорт",
};

const SPHERE_COLORS: Record<string, string> = {
  land: "text-amber-600",
  ecology: "text-green-600",
  transport: "text-blue-600",
};

const CATEGORY_NAMES: Record<string, string> = {
  OBL: "Обязанность",
  ZAP: "Запрет",
  USL: "Условие",
  SRK: "Срок",
  DOC: "Документ",
  FIN: "Финансы",
  OTV: "Ответственность",
  PRO: "Процедура",
  STD: "Стандарт",
};

const CATEGORY_COLORS: Record<string, string> = {
  OBL: "bg-blue-500",
  ZAP: "bg-red-500",
  USL: "bg-yellow-500",
  SRK: "bg-purple-500",
  DOC: "bg-indigo-500",
  FIN: "bg-green-500",
  OTV: "bg-orange-500",
  PRO: "bg-pink-500",
  STD: "bg-teal-500",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => {
        if (!r.ok) throw new Error("unauthorized");
        return r.json();
      })
      .then(setStats)
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="text-slate-400">Загрузка...</div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const o = stats.overview;
  const totalActive = parseInt(o.total_active);
  const maxCategoryCount = Math.max(
    ...stats.byCategory.map((c) => parseInt(c.count))
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Активных требований"
            value={o.total_active}
            color="text-blue-600"
          />
          <StatCard
            label="Отклонено админом"
            value={o.total_rejected}
            color="text-red-500"
          />
          <StatCard
            label="Всего голосов"
            value={o.total_votes}
            color="text-green-600"
          />
          <StatCard
            label="Активных экспертов"
            value={o.active_experts}
            color="text-purple-600"
          />
        </div>

        {/* Sphere distribution */}
        {stats.bySphere && stats.bySphere.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {stats.bySphere.map((s) => (
              <div key={s.sphere} className="bg-white rounded-lg border border-slate-200 p-4">
                <div className={`text-2xl font-bold ${SPHERE_COLORS[s.sphere] || "text-slate-600"}`}>
                  {s.count}
                </div>
                <div className="text-sm text-slate-500">
                  {SPHERE_NAMES[s.sphere] || s.sphere}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Consensus */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-2xl font-bold text-green-600">
              {stats.consensus.confirmed_unanimously}
            </div>
            <div className="text-sm text-slate-500">
              Единогласно подтверждено (≥3 эксперта)
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-2xl font-bold text-red-600">
              {stats.consensus.rejected_unanimously}
            </div>
            <div className="text-sm text-slate-500">
              Единогласно отклонено (≥3 эксперта)
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-2xl font-bold text-amber-600">
              {stats.consensus.disputed}
            </div>
            <div className="text-sm text-slate-500">
              Спорные (есть и за, и против)
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Categories */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">
              По категориям
            </h2>
            <div className="space-y-2">
              {stats.byCategory.map((c) => {
                const count = parseInt(c.count);
                const pct = (count / maxCategoryCount) * 100;
                return (
                  <div key={c.category} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-600 w-24 shrink-0">
                      {CATEGORY_NAMES[c.category] || c.category}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          CATEGORY_COLORS[c.category] || "bg-slate-400"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Expert progress */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">
              Прогресс экспертов
            </h2>
            <div className="space-y-3">
              {stats.expertProgress.map((e) => {
                const voted = parseInt(e.voted);
                const total = parseInt(e.total_reqs);
                const pct = total > 0 ? (voted / total) * 100 : 0;
                return (
                  <div key={e.username}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-700">
                        {e.full_name || e.username}
                      </span>
                      <span className="text-slate-500">
                        {voted}/{total} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {stats.expertProgress.length === 0 && (
                <div className="text-sm text-slate-400">
                  Нет активных экспертов
                </div>
              )}
            </div>
          </div>

          {/* NPA distribution */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">
              По НПА
            </h2>
            <div className="space-y-2">
              {stats.byNpa.map((n) => {
                const count = parseInt(n.count);
                const pct = (count / totalActive) * 100;
                return (
                  <div key={n.title} className="flex items-center gap-3">
                    <span
                      className="text-xs text-slate-600 w-64 shrink-0 truncate"
                      title={n.title}
                    >
                      {n.title}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-slate-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-12 text-right">
                      {count} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => router.push("/review")}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Перейти к оценке требований
          </button>
          <button
            onClick={() => window.open("/api/export?format=csv", "_blank")}
            className="px-5 py-3 bg-slate-600 text-white font-medium rounded-lg hover:bg-slate-700 transition-colors"
          >
            Экспорт CSV
          </button>
          <button
            onClick={() => window.open("/api/export?format=json", "_blank")}
            className="px-5 py-3 bg-slate-500 text-white font-medium rounded-lg hover:bg-slate-600 transition-colors"
          >
            Экспорт JSON
          </button>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}
