"use client";
import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import Pagination from "@/components/Pagination";
import RegistryCard, { RegistryItem } from "@/components/RegistryCard";

interface FilterOpt { ministry?: string; sphere_code?: string; name?: string; trust?: string; review_status?: string; n: number; }
interface Filters {
  ministries: FilterOpt[];
  spheres: FilterOpt[];
  trusts: FilterOpt[];
  review_statuses: FilterOpt[];
  totals: { canonical: number; all_rows: number; ersop_confirmed: number; stale: number };
}

export default function RegistryPage() {
  const [items, setItems] = useState<RegistryItem[]>([]);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [ministry, setMinistry] = useState("");
  const [sphere, setSphere] = useState("");
  const [trust, setTrust] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [npaStatus, setNpaStatus] = useState("");
  const [ersopOnly, setErsopOnly] = useState(false);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");

  useEffect(() => {
    fetch("/api/registry/filters").then((r) => r.json()).then(setFilters).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 400);
    return () => clearTimeout(t);
  }, [q]);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), limit: "15" });
    if (ministry) p.set("ministry", ministry);
    if (sphere) p.set("sphere", sphere);
    if (trust) p.set("trust", trust);
    if (reviewStatus) p.set("review_status", reviewStatus);
    if (npaStatus) p.set("npa_status", npaStatus);
    if (ersopOnly) p.set("ersop_confirmed", "1");
    if (qDebounced) p.set("q", qDebounced);
    return p;
  }, [page, ministry, sphere, trust, reviewStatus, npaStatus, ersopOnly, qDebounced]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/registry/list?${buildParams()}`)
      .then((r) => r.json())
      .then((d) => { setItems(d.items || []); setPages(d.pages || 0); setTotal(d.total || 0); })
      .finally(() => setLoading(false));
  }, [buildParams]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [ministry, sphere, trust, reviewStatus, npaStatus, ersopOnly, qDebounced]);

  const sel = "px-2 py-1.5 text-sm border border-slate-300 rounded-md bg-white outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-bold text-slate-800">Реестр требований к бизнесу</h2>
          {filters?.totals && (
            <span className="text-sm text-slate-500">
              {filters.totals.canonical.toLocaleString("ru")} уникальных · {filters.totals.ersop_confirmed.toLocaleString("ru")} проверяется ЕРСОП · {filters.totals.stale.toLocaleString("ru")} из утративших силу
            </span>
          )}
        </div>

        {/* Фильтры */}
        <div className="bg-white rounded-lg border border-slate-200 p-3 mb-4 flex flex-wrap gap-2 items-center">
          <select className={sel} value={ministry} onChange={(e) => setMinistry(e.target.value)}>
            <option value="">Все органы</option>
            {filters?.ministries.map((m) => (
              <option key={m.ministry} value={m.ministry}>{m.ministry} ({m.n})</option>
            ))}
          </select>
          <select className={sel} value={sphere} onChange={(e) => setSphere(e.target.value)}>
            <option value="">Все сферы</option>
            {filters?.spheres.map((s) => (
              <option key={s.sphere_code} value={s.sphere_code}>{s.name} ({s.n})</option>
            ))}
          </select>
          <select className={sel} value={trust} onChange={(e) => setTrust(e.target.value)}>
            <option value="">Любой источник</option>
            {filters?.trusts.map((t) => (
              <option key={t.trust} value={t.trust}>{t.trust} ({t.n})</option>
            ))}
          </select>
          <select className={sel} value={npaStatus} onChange={(e) => setNpaStatus(e.target.value)}>
            <option value="">Любой статус НПА</option>
            <option value="действующий">действующий</option>
            <option value="утратил силу">утратил силу</option>
          </select>
          <select className={sel} value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}>
            <option value="">Любой статус ревью</option>
            {filters?.review_statuses.map((r) => (
              <option key={r.review_status} value={r.review_status}>{r.review_status} ({r.n})</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={ersopOnly} onChange={(e) => setErsopOnly(e.target.checked)} />
            ✓ ЕРСОП
          </label>
          <input
            className={`${sel} flex-1 min-w-[200px]`}
            placeholder="Поиск по тексту требования…"
            value={q} onChange={(e) => setQ(e.target.value)}
          />
          <a
            href={`/api/registry/export?${buildParams()}`}
            className="px-3 py-1.5 text-sm bg-slate-800 text-white rounded-md hover:bg-slate-700"
          >
            Экспорт CSV
          </a>
        </div>

        {/* Список */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">Загрузка…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-slate-400">Ничего не найдено</div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <RegistryCard key={it.id} item={it} onChanged={load} />
            ))}
          </div>
        )}

        <Pagination page={page} totalPages={pages} total={total} onPageChange={setPage} />
      </main>
    </div>
  );
}
