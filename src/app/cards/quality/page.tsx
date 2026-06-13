"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

interface AgreementData {
  fleissKappa: number;
  fleissKappaInterpretation: string;
  percentAgreement: number;
  itemCount: number;
  raterCount: number;
  byCategory: Record<string, { kappa: number; interpretation: string; itemCount: number }>;
  bySphere: Record<string, { kappa: number; interpretation: string; itemCount: number }>;
  pairwiseKappa: { user1: string; user2: string; kappa: number; itemCount: number }[];
  heatmap: { users: string[]; matrix: number[][] };
  expertStats: {
    username: string;
    fullName: string;
    totalVotes: number;
    distribution: Record<string, number>;
    biasIndicator: Record<string, number>;
    agreementWithConsensus: number;
  }[];
}

interface GoldLabelData {
  summary: { total: number; gold: number; silver: number; disputed: number; insufficient: number };
}

interface Sphere {
  code: string;
  name: string;
  total: number;
}

const KAPPA_COLORS: Record<string, string> = {
  poor: "text-red-700 bg-red-50",
  slight: "text-red-600 bg-red-50",
  fair: "text-amber-600 bg-amber-50",
  moderate: "text-yellow-600 bg-yellow-50",
  substantial: "text-green-600 bg-green-50",
  almost_perfect: "text-green-700 bg-green-50",
  insufficient_data: "text-slate-400 bg-slate-50",
};
const KAPPA_LABELS: Record<string, string> = {
  poor: "Плохое",
  slight: "Слабое",
  fair: "Удовлетворительное",
  moderate: "Умеренное",
  substantial: "Существенное",
  almost_perfect: "Почти идеальное",
  insufficient_data: "Нет данных",
};
const ROLE_LABELS: Record<string, string> = {
  "обязанность бизнеса": "Обязанность бизнеса",
  "запрет": "Запрет",
  "условие допуска": "Условие допуска",
  "документ для заявления": "Документ",
  "доказательство исполнения": "Доказательство",
  "право бизнеса": "Право",
  "обязанность госоргана": "Гос. орган",
};

const ROLE_OPTIONS = [
  { value: "", label: "Все роли" },
  { value: "обязанность бизнеса", label: "Обязанность бизнеса" },
  { value: "запрет", label: "Запрет" },
  { value: "условие допуска", label: "Условие допуска" },
  { value: "документ для заявления", label: "Документ" },
  { value: "доказательство исполнения", label: "Доказательство" },
];

function kappaColor(kappa: number): string {
  if (kappa < 0) return "bg-red-200";
  if (kappa <= 0.2) return "bg-red-100";
  if (kappa <= 0.4) return "bg-amber-100";
  if (kappa <= 0.6) return "bg-yellow-100";
  if (kappa <= 0.8) return "bg-green-100";
  return "bg-green-200";
}

const selectClass =
  "text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none";

export default function CardsQualityPage() {
  const [agreement, setAgreement] = useState<AgreementData | null>(null);
  const [goldLabels, setGoldLabels] = useState<GoldLabelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sphere, setSphere] = useState("");
  const [roleFragment, setRoleFragment] = useState("");
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const router = useRouter();

  // load sphere list from cards/stats
  useEffect(() => {
    fetch("/api/cards/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.by_sphere) {
          setSpheres(
            d.by_sphere
              .filter((s: { total: string | number }) => Number(s.total) > 0)
              .map((s: { code: string; name: string; total: string | number }) => ({
                code: s.code,
                name: s.name,
                total: Number(s.total),
              })),
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (sphere) params.set("sphere", sphere);
    if (roleFragment) params.set("role_fragment", roleFragment);
    const qs = params.toString() ? `?${params}` : "";
    Promise.all([
      fetch(`/api/cards/quality${qs}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/cards/gold-labels${qs}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([ag, gl]) => {
        setAgreement(ag);
        setGoldLabels(gl);
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [sphere, roleFragment, router]);

  if (loading && !agreement) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="text-slate-400">Загрузка метрик…</div>
        </div>
      </div>
    );
  }
  if (!agreement) return null;
  const gl = goldLabels?.summary;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Качество разметки карточек
            </h2>
            <p className="text-sm text-slate-500">
              Согласованность экспертов по карточкам требований
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={sphere}
              onChange={(e) => setSphere(e.target.value)}
              className={selectClass}
            >
              <option value="">Все сферы</option>
              {spheres.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.total})
                </option>
              ))}
            </select>
            <select
              value={roleFragment}
              onChange={(e) => setRoleFragment(e.target.value)}
              className={selectClass}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Overall metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Stat
            value={agreement.fleissKappa.toFixed(3)}
            label="Fleiss' Kappa"
            badge={KAPPA_LABELS[agreement.fleissKappaInterpretation] || ""}
            badgeClass={KAPPA_COLORS[agreement.fleissKappaInterpretation] || ""}
            color="text-slate-800"
          />
          <Stat
            value={`${(agreement.percentAgreement * 100).toFixed(1)}%`}
            label="Полное согласие"
            color="text-blue-600"
          />
          <Stat value={String(agreement.itemCount)} label="Оценённых карточек" color="text-slate-700" />
          <Stat value={String(agreement.raterCount)} label="Экспертов" color="text-purple-600" />
        </div>

        {/* Gold-labels summary */}
        {gl && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat value={String(gl.gold)} label="Gold (единогласно)" color="text-green-600" />
            <Stat value={String(gl.silver)} label="Silver (большинство)" color="text-blue-600" />
            <Stat value={String(gl.disputed)} label="Disputed (спорные)" color="text-amber-600" />
            <Stat value={String(gl.insufficient)} label="Мало голосов" color="text-slate-400" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Per-expert table */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">
              Статистика экспертов ({agreement.expertStats.length})
            </h3>
            {agreement.expertStats.length > 0 ? (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-1">Эксперт</th>
                      <th className="text-center py-2 px-1">Голосов</th>
                      <th className="text-center py-2 px-1">Подтв.%</th>
                      <th className="text-center py-2 px-1">Откл.%</th>
                      <th className="text-center py-2 px-1">Не ув.%</th>
                      <th className="text-center py-2 px-1">Согл.%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agreement.expertStats
                      .sort((a, b) => b.totalVotes - a.totalVotes)
                      .map((e) => (
                        <tr key={e.username} className="border-b border-slate-50">
                          <td className="py-2 px-1 font-medium truncate max-w-[140px]">
                            {e.fullName}
                          </td>
                          <td className="text-center py-2 px-1">{e.totalVotes}</td>
                          <td className="text-center py-2 px-1 text-green-600">
                            {(e.biasIndicator.confirmRate * 100).toFixed(0)}%
                          </td>
                          <td className="text-center py-2 px-1 text-red-600">
                            {(e.biasIndicator.rejectRate * 100).toFixed(0)}%
                          </td>
                          <td className="text-center py-2 px-1 text-amber-600">
                            {(e.biasIndicator.uncertainRate * 100).toFixed(0)}%
                          </td>
                          <td className="text-center py-2 px-1 font-medium">
                            {(e.agreementWithConsensus * 100).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-slate-400">Нет данных</div>
            )}
          </div>

          {/* Heatmap (top-15 only — иначе сетка нечитаема при 100 экспертах) */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">
              Попарное согласие (Cohen&apos;s Kappa)
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Матрица для top-{Math.min(15, agreement.heatmap.users.length)} экспертов по объёму
            </p>
            {agreement.heatmap.users.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr>
                      <th className="p-1"></th>
                      {agreement.heatmap.users.slice(0, 15).map((u) => (
                        <th
                          key={u}
                          className="p-1 text-center font-medium text-slate-600 max-w-[3rem] truncate"
                          title={u}
                        >
                          {u.replace("expert", "Э").replace("_", "")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {agreement.heatmap.users.slice(0, 15).map((u, i) => (
                      <tr key={u}>
                        <td className="p-1 font-medium text-slate-600" title={u}>
                          {u.replace("expert", "Э").replace("_", "")}
                        </td>
                        {agreement.heatmap.matrix[i].slice(0, 15).map((val, j) => (
                          <td
                            key={j}
                            className={`p-1 text-center font-mono ${
                              i === j ? "bg-slate-100" : kappaColor(val)
                            }`}
                          >
                            {val.toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-slate-400">Нет данных</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Per-role kappa */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Kappa по ролям</h3>
            <div className="space-y-2">
              {Object.entries(agreement.byCategory)
                .sort(([, a], [, b]) => b.kappa - a.kappa)
                .map(([cat, data]) => (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-600 w-44 shrink-0 truncate" title={cat}>
                      {ROLE_LABELS[cat] || cat}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${kappaColor(data.kappa)}`}
                        style={{ width: `${Math.max(0, data.kappa) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-20 text-right">
                      {data.kappa.toFixed(2)} ({data.itemCount})
                    </span>
                  </div>
                ))}
              {Object.keys(agreement.byCategory).length === 0 && (
                <div className="text-sm text-slate-400">Нет данных</div>
              )}
            </div>
          </div>

          {/* Per-sphere kappa */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Kappa по сферам</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {Object.entries(agreement.bySphere)
                .sort(([, a], [, b]) => b.itemCount - a.itemCount)
                .map(([sp, data]) => {
                  const sphereName = spheres.find((s) => s.code === sp)?.name || sp;
                  return (
                    <div key={sp} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{sphereName}</div>
                        <div className="text-xs text-slate-500">{data.itemCount} карточек</div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className="text-lg font-bold">{data.kappa.toFixed(3)}</div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${KAPPA_COLORS[data.interpretation] || ""}`}
                        >
                          {KAPPA_LABELS[data.interpretation] || data.interpretation}
                        </span>
                      </div>
                    </div>
                  );
                })}
              {Object.keys(agreement.bySphere).length === 0 && (
                <div className="text-sm text-slate-400">Нет данных</div>
              )}
            </div>
          </div>
        </div>

        {/* Экспорт результатов */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">
            Экспорт результатов голосования
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Текущие фильтры применяются:{" "}
            {sphere ? `сфера = ${sphere}` : "все сферы"},{" "}
            {roleFragment ? `роль = ${roleFragment}` : "все роли"}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                const p = new URLSearchParams({ format: "csv" });
                if (sphere) p.set("sphere", sphere);
                if (roleFragment) p.set("role_fragment", roleFragment);
                window.open(`/api/cards/export/vote-matrix?${p}`, "_blank");
              }}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              title="Широкая матрица: 1 строка = карточка, по колонке на каждого эксперта"
            >
              Матрица голосов (CSV)
            </button>
            <button
              onClick={() => {
                const p = new URLSearchParams({ format: "json" });
                if (sphere) p.set("sphere", sphere);
                if (roleFragment) p.set("role_fragment", roleFragment);
                window.open(`/api/cards/export/vote-matrix?${p}`, "_blank");
              }}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Матрица голосов (JSON)
            </button>
            <button
              onClick={() => {
                const p = new URLSearchParams({
                  format: "csv",
                  split: "true",
                  min_votes: "3",
                });
                if (sphere) p.set("sphere", sphere);
                if (roleFragment) p.set("role_fragment", roleFragment);
                window.open(`/api/cards/export/ml-dataset?${p}`, "_blank");
              }}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
              title="Только карточки с консенсусом (≥3 голосов), стратифицированный train/val/test split"
            >
              ML Dataset (CSV)
            </button>
            <button
              onClick={() => {
                const p = new URLSearchParams({
                  format: "json",
                  split: "true",
                  min_votes: "3",
                });
                if (sphere) p.set("sphere", sphere);
                if (roleFragment) p.set("role_fragment", roleFragment);
                window.open(`/api/cards/export/ml-dataset?${p}`, "_blank");
              }}
              className="px-4 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600"
            >
              ML Dataset (JSON)
            </button>
            <button
              onClick={() => {
                const p = new URLSearchParams({ format: "csv", min_votes: "1" });
                if (sphere) p.set("sphere", sphere);
                if (roleFragment) p.set("role_fragment", roleFragment);
                window.open(`/api/cards/export/vote-matrix?${p}`, "_blank");
              }}
              className="px-4 py-2 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700"
              title="Только карточки с хотя бы 1 голосом — быстро, маленький файл"
            >
              Только проголосованные (CSV)
            </button>
          </div>
          <div className="text-xs text-slate-400 mt-3">
            <strong>Матрица голосов</strong> — широкий формат для анализа в Excel.{" "}
            <strong>ML Dataset</strong> — узкий формат с gold-разметкой и
            train/val/test для обучения моделей. Доступно только админам.
          </div>
        </div>

        <div className="text-xs text-slate-400 text-right">
          Оценено: {agreement.itemCount} карточек, {agreement.raterCount} экспертов
        </div>
      </main>
    </div>
  );
}

function Stat({
  value,
  label,
  color,
  badge,
  badgeClass,
}: {
  value: string;
  label: string;
  color: string;
  badge?: string;
  badgeClass?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
      {badge && (
        <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${badgeClass}`}>
          {badge}
        </span>
      )}
    </div>
  );
}
