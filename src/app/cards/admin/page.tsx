"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

interface SphereStats {
  code: string;
  name: string;
  total: string | number;
  approved: string | number;
  rejected: string | number;
  in_review: string | number;
  disputed: string | number;
  unchecked: string | number;
}

interface RoleStats {
  role_fragment: string;
  count: string | number;
}

interface Stats {
  overview: {
    total: string | number;
    total_votes: string | number;
    active_experts: string | number;
  };
  by_sphere: SphereStats[];
  by_role: RoleStats[];
  consensus: {
    confirmed: string | number;
    rejected: string | number;
    disputed: string | number;
    partial: string | number;
    pending: string | number;
  };
  expert_progress: {
    id: number;
    username: string;
    full_name: string | null;
    voted: string | number;
    total: string | number;
  }[];
  generated_at: string;
  _cached?: boolean;
}

const SPHERE_COLORS: Record<string, string> = {
  mz_zdrav: "bg-rose-500",
  mz_obshchepit: "bg-orange-500",
  miir_obrabotka: "bg-amber-500",
  miir_transport: "bg-blue-500",
  mnvo: "bg-indigo-500",
  msx: "bg-green-500",
  mtzsn_trud_otn: "bg-purple-500",
  mtzsn_trudoustr: "bg-violet-500",
  mti_torgovlya: "bg-teal-500",
  mtsriap: "bg-cyan-500",
  mchs: "bg-red-500",
  me_neft_uran: "bg-fuchsia-500",
  land: "bg-amber-700",
  ecology: "bg-green-700",
  transport: "bg-blue-700",
};

const ROLE_LABELS: Record<string, string> = {
  "обязанность бизнеса": "Обязанность бизнеса",
  "запрет": "Запрет",
  "условие допуска": "Условие допуска",
  "документ для заявления": "Документ для заявления",
  "доказательство исполнения": "Доказательство исполнения",
  "право бизнеса": "Право бизнеса",
  "обязанность госоргана": "Обязанность госоргана",
};

export default function CardsAdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/cards/stats")
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
          <div className="text-slate-400">Загрузка…</div>
        </div>
      </div>
    );
  }
  if (!stats) return null;

  const o = stats.overview;
  const totalCards = Number(o.total) || 0;
  const maxRoleCount = Math.max(...stats.by_role.map((r) => Number(r.count)), 1);
  const maxSphereCount = Math.max(...stats.by_sphere.map((s) => Number(s.total)), 1);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Карточки требований — сводка
            </h2>
            <p className="text-sm text-slate-500">
              Прогресс экспертов по всем 12 сферам {stats._cached && "· кэш"}
            </p>
          </div>
          <button
            onClick={() => router.push("/cards/review")}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Перейти к оценке →
          </button>
        </div>

        {/* Overview */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Всего карточек" value={String(o.total)} color="text-blue-600" />
          <StatCard label="Голосов экспертов" value={String(o.total_votes)} color="text-green-600" />
          <StatCard label="Активных экспертов" value={String(o.active_experts)} color="text-purple-600" />
        </div>

        {/* Consensus */}
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Консенсус</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard label="Подтверждено (≥3 «за»)" value={String(stats.consensus.confirmed)} color="text-green-600" />
          <StatCard label="Отклонено (≥3 «против»)" value={String(stats.consensus.rejected)} color="text-red-600" />
          <StatCard label="Спорные (за и против)" value={String(stats.consensus.disputed)} color="text-amber-600" />
          <StatCard label="Частичные (1-2 голоса)" value={String(stats.consensus.partial ?? 0)} color="text-slate-600" />
          <StatCard label="Без голосов" value={String(stats.consensus.pending)} color="text-slate-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By sphere */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">
              По сферам ({stats.by_sphere.length})
            </h2>
            <div className="space-y-2">
              {stats.by_sphere
                .filter((s) => Number(s.total) > 0)
                .map((s) => {
                  const total = Number(s.total);
                  const approved = Number(s.approved);
                  const rejected = Number(s.rejected);
                  const inReview = Number(s.in_review);
                  const disputed = Number(s.disputed);
                  const unchecked = Number(s.unchecked);
                  const pct = (total / maxSphereCount) * 100;
                  const reviewedPct = total > 0 ? ((approved + rejected + disputed) / total) * 100 : 0;
                  return (
                    <div key={s.code} className="flex items-center gap-3">
                      <span
                        className="text-xs text-slate-700 w-56 shrink-0 truncate font-medium"
                        title={s.name}
                      >
                        {s.name}
                      </span>
                      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden relative">
                        <div
                          className={`h-full rounded-full ${SPHERE_COLORS[s.code] || "bg-slate-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                        <span className="absolute inset-0 flex items-center pl-2 text-[10px] text-white font-medium">
                          {total} карточек
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 w-48 shrink-0 flex gap-2">
                        <span className="text-green-600" title="Одобрено">{approved}✓</span>
                        <span className="text-red-600" title="Отклонено">{rejected}✗</span>
                        <span className="text-amber-600" title="Спорные">{disputed}!</span>
                        <span className="text-slate-400" title="Без оценки">{unchecked + inReview}…</span>
                        <span className="ml-auto font-medium">
                          {reviewedPct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* By role */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">
              По роли в норме
            </h2>
            <div className="space-y-2">
              {stats.by_role.map((r) => {
                const count = Number(r.count);
                const pct = (count / maxRoleCount) * 100;
                return (
                  <div key={r.role_fragment} className="flex items-center gap-3">
                    <span className="text-xs text-slate-600 w-44 shrink-0 truncate" title={r.role_fragment}>
                      {ROLE_LABELS[r.role_fragment] || r.role_fragment}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-12 text-right">{count}</span>
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
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {stats.expert_progress.length === 0 && (
                <div className="text-sm text-slate-400">Нет активных экспертов</div>
              )}
              {stats.expert_progress.map((e) => {
                const voted = Number(e.voted);
                const total = Number(e.total);
                const pct = total > 0 ? (voted / total) * 100 : 0;
                return (
                  <div key={e.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-700">{e.full_name || e.username}</span>
                      <span className="text-slate-500">
                        {voted}/{total} ({pct.toFixed(1)}%)
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
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-400 text-right">
          Обновлено: {new Date(stats.generated_at).toLocaleString("ru-RU")}
          {totalCards === 0 && (
            <div className="text-amber-600 mt-2">
              В базе пока нет карточек требований
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}
