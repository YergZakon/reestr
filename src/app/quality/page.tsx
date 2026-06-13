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

const CATEGORY_NAMES: Record<string, string> = {
  OBL: "Обязанность", ZAP: "Запрет", USL: "Условие", SRK: "Срок",
  DOC: "Документ", FIN: "Финансы", OTV: "Ответственность", PRO: "Процедура", STD: "Стандарт",
};

const SPHERE_NAMES: Record<string, string> = {
  land: "Земельные", ecology: "Экология", transport: "Транспорт",
};

function kappaColor(kappa: number): string {
  if (kappa < 0) return "bg-red-200";
  if (kappa <= 0.2) return "bg-red-100";
  if (kappa <= 0.4) return "bg-amber-100";
  if (kappa <= 0.6) return "bg-yellow-100";
  if (kappa <= 0.8) return "bg-green-100";
  return "bg-green-200";
}

export default function QualityPage() {
  const [agreement, setAgreement] = useState<AgreementData | null>(null);
  const [goldLabels, setGoldLabels] = useState<GoldLabelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sphere, setSphere] = useState("");
  const router = useRouter();

  useEffect(() => {
    setLoading(true);
    const params = sphere ? `?sphere=${sphere}` : "";
    Promise.all([
      fetch(`/api/admin/agreement${params}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/admin/gold-labels${params}`).then((r) => r.ok ? r.json() : null),
    ])
      .then(([ag, gl]) => {
        setAgreement(ag);
        setGoldLabels(gl);
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [sphere, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="text-slate-400">Загрузка метрик...</div>
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
        {/* Title + sphere filter */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-800">Качество разметки</h2>
          <select
            value={sphere}
            onChange={(e) => setSphere(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">Все сферы</option>
            <option value="land">Земельные</option>
            <option value="ecology">Экология</option>
            <option value="transport">Транспорт</option>
          </select>
        </div>

        {/* Section 1: Overall metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-2xl font-bold text-slate-800">
              {agreement.fleissKappa.toFixed(3)}
            </div>
            <div className="text-sm text-slate-500">Fleiss&apos; Kappa</div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${KAPPA_COLORS[agreement.fleissKappaInterpretation] || ""}`}>
              {KAPPA_LABELS[agreement.fleissKappaInterpretation] || agreement.fleissKappaInterpretation}
            </span>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-2xl font-bold text-blue-600">
              {(agreement.percentAgreement * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-slate-500">Полное согласие</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-2xl font-bold text-slate-700">{agreement.itemCount}</div>
            <div className="text-sm text-slate-500">Оцененных требований</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-2xl font-bold text-purple-600">{agreement.raterCount}</div>
            <div className="text-sm text-slate-500">Экспертов</div>
          </div>
        </div>

        {/* Section 2: Gold label summary */}
        {gl && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-2xl font-bold text-green-600">{gl.gold}</div>
              <div className="text-sm text-slate-500">Gold (единогласно)</div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-2xl font-bold text-blue-600">{gl.silver}</div>
              <div className="text-sm text-slate-500">Silver (большинство)</div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-2xl font-bold text-amber-600">{gl.disputed}</div>
              <div className="text-sm text-slate-500">Disputed (спорные)</div>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="text-2xl font-bold text-slate-400">{gl.insufficient}</div>
              <div className="text-sm text-slate-500">Мало голосов</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Section 3: Per-expert stats */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Статистика экспертов</h3>
            {agreement.expertStats.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
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
                    {agreement.expertStats.map((e) => (
                      <tr key={e.username} className="border-b border-slate-50">
                        <td className="py-2 px-1 font-medium">{e.fullName}</td>
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

          {/* Section 4: Heatmap */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">
              Попарное согласие (Cohen&apos;s Kappa)
            </h3>
            {agreement.heatmap.users.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <thead>
                    <tr>
                      <th className="p-1"></th>
                      {agreement.heatmap.users.map((u) => (
                        <th key={u} className="p-1 text-center font-medium text-slate-600 max-w-16 truncate">
                          {u.replace("expert_", "Э")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {agreement.heatmap.users.map((u, i) => (
                      <tr key={u}>
                        <td className="p-1 font-medium text-slate-600">{u.replace("expert_", "Э")}</td>
                        {agreement.heatmap.matrix[i].map((val, j) => (
                          <td
                            key={j}
                            className={`p-1 text-center font-mono ${i === j ? "bg-slate-100" : kappaColor(val)}`}
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
          {/* Section 5: Per-category kappa */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Kappa по категориям</h3>
            <div className="space-y-2">
              {Object.entries(agreement.byCategory)
                .sort(([, a], [, b]) => b.kappa - a.kappa)
                .map(([cat, data]) => (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-600 w-24 shrink-0">
                      {CATEGORY_NAMES[cat] || cat}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${kappaColor(data.kappa)}`}
                        style={{ width: `${Math.max(0, data.kappa) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-16 text-right">
                      {data.kappa.toFixed(2)} ({data.itemCount})
                    </span>
                  </div>
                ))}
              {Object.keys(agreement.byCategory).length === 0 && (
                <div className="text-sm text-slate-400">Нет данных</div>
              )}
            </div>
          </div>

          {/* Section 6: Per-sphere kappa */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Kappa по сферам</h3>
            <div className="space-y-3">
              {Object.entries(agreement.bySphere).map(([sp, data]) => (
                <div key={sp} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <div className="text-sm font-medium">{SPHERE_NAMES[sp] || sp}</div>
                    <div className="text-xs text-slate-500">{data.itemCount} требований</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">{data.kappa.toFixed(3)}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${KAPPA_COLORS[data.interpretation] || ""}`}>
                      {KAPPA_LABELS[data.interpretation] || data.interpretation}
                    </span>
                  </div>
                </div>
              ))}
              {Object.keys(agreement.bySphere).length === 0 && (
                <div className="text-sm text-slate-400">Нет данных</div>
              )}
            </div>
          </div>
        </div>

        {/* Section 7: Export controls */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Экспорт данных</h3>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => window.open(`/api/export/vote-matrix?format=csv${sphere ? `&sphere=${sphere}` : ""}`, "_blank")}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Матрица голосов (CSV)
            </button>
            <button
              onClick={() => window.open(`/api/export/vote-matrix?format=json${sphere ? `&sphere=${sphere}` : ""}`, "_blank")}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Матрица голосов (JSON)
            </button>
            <button
              onClick={() => window.open(`/api/export/ml-dataset?format=csv&split=true&min_votes=3${sphere ? `&sphere=${sphere}` : ""}`, "_blank")}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              ML Dataset (CSV)
            </button>
            <button
              onClick={() => window.open(`/api/export/ml-dataset?format=json&split=true&min_votes=3${sphere ? `&sphere=${sphere}` : ""}`, "_blank")}
              className="px-4 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600"
            >
              ML Dataset (JSON)
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
