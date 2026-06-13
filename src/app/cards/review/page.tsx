"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import CardItem, { RequirementCardModel } from "@/components/CardItem";
import Pagination from "@/components/Pagination";

interface Sphere {
  code: string;
  name: string;
  total: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const ROLE_OPTIONS = [
  { value: "", label: "Все роли" },
  { value: "обязанность бизнеса", label: "Обязанность бизнеса" },
  { value: "запрет", label: "Запрет" },
  { value: "условие допуска", label: "Условие допуска" },
  { value: "документ для заявления", label: "Документ для заявления" },
  { value: "доказательство исполнения", label: "Доказательство исполнения" },
  { value: "право бизнеса", label: "Право бизнеса" },
  { value: "обязанность госоргана", label: "Обязанность госоргана" },
];

const VOTE_STATUSES = [
  { value: "unvoted", label: "Не оценённые" },
  { value: "voted", label: "Оценённые" },
  { value: "all", label: "Все" },
];

const TYPE_OPTIONS = [
  { value: "", label: "Все типы" },
  { value: "процедурное", label: "Процедурное" },
  { value: "субстантивное", label: "Субстантивное" },
  { value: "временное", label: "Временное" },
  { value: "финансовое", label: "Финансовое" },
  { value: "техническое", label: "Техническое" },
];

const selectClass =
  "text-sm text-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none";

interface CurrentUser {
  id: number;
  username: string;
  role: "admin" | "expert";
  assigned_spheres: string[];
  assigned_authorities: string[];
}

interface Authority {
  code: string;
  name: string;
  short_name: string | null;
  card_count: number;
}

export default function CardsReviewPage() {
  const router = useRouter();
  const [cards, setCards] = useState<RequirementCardModel[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 15,
    total: 0,
    pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [noSpheresAssigned, setNoSpheresAssigned] = useState(false);
  const [noAuthoritiesAssigned, setNoAuthoritiesAssigned] = useState(false);

  const [sphere, setSphere] = useState("");
  const [authority, setAuthority] = useState("");
  const [voteStatus, setVoteStatus] = useState("unvoted");
  const [roleFragment, setRoleFragment] = useState("");
  const [requirementType, setRequirementType] = useState("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");

  // Fetch current user + список сфер и органов.
  // Для эксперта показываем только назначенные.
  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/cards/stats").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/authorities").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([me, stats, auths]) => {
        const u: CurrentUser | null = me?.user || null;
        setCurrentUser(u);
        if (stats?.by_sphere) {
          let list = stats.by_sphere
            .filter((s: { total: string | number }) => Number(s.total) > 0)
            .map((s: { code: string; name: string; total: string | number }) => ({
              code: s.code,
              name: s.name,
              total: Number(s.total),
            }));
          // Для эксперта оставляем только назначенные ему сферы
          if (u && u.role === "expert") {
            list = list.filter((s: Sphere) => u.assigned_spheres.includes(s.code));
          }
          setSpheres(list);
        }
        if (auths?.authorities) {
          let aList: Authority[] = auths.authorities.filter(
            (a: Authority) => a.card_count > 0,
          );
          if (u && u.role === "expert") {
            aList = aList.filter((a) => u.assigned_authorities.includes(a.code));
          }
          setAuthorities(aList);
        }
      })
      .catch(() => {});
  }, []);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 400);
    return () => clearTimeout(t);
  }, [q]);

  const fetchCards = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "15",
          vote_status: voteStatus,
        });
        if (sphere) params.set("sphere", sphere);
        if (authority) params.set("authority", authority);
        if (roleFragment) params.set("role_fragment", roleFragment);
        if (requirementType) params.set("requirement_type", requirementType);
        if (qDebounced) params.set("q", qDebounced);

        const res = await fetch(`/api/cards/list?${params}`);
        if (!res.ok) {
          if (res.status === 401) router.push("/login");
          throw new Error(String(res.status));
        }
        const data = await res.json();
        setCards(data.cards || []);
        setNoSpheresAssigned(Boolean(data.no_spheres_assigned));
        setNoAuthoritiesAssigned(Boolean(data.no_authorities_assigned));
        setPagination({
          page: data.page,
          limit: data.limit,
          total: data.total,
          pages: data.pages,
        });
      } catch {
        setCards([]);
      } finally {
        setLoading(false);
      }
    },
    [sphere, authority, voteStatus, roleFragment, requirementType, qDebounced, router],
  );

  useEffect(() => {
    fetchCards(1);
  }, [fetchCards]);

  function handleVoteChange(cardId: number, vote: string, comment?: string) {
    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId ? { ...c, my_vote: vote, my_comment: comment ?? c.my_comment } : c,
      ),
    );
  }

  const votedOnPage = cards.filter((c) => c.my_vote).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Карточки требований
            </h2>
            <p className="text-sm text-slate-500">
              Структурированные карточки требований из НПА. Оцените:
              подтвердить, отклонить или отметить как спорное.
            </p>
          </div>
          {!loading && (
            <div className="text-sm text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
              Оценено на странице:{" "}
              <span className="font-medium text-blue-600">
                {votedOnPage}/{cards.length}
              </span>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center mb-4">
          <select
            value={sphere}
            onChange={(e) => setSphere(e.target.value)}
            className={selectClass}
          >
            <option value="">Все сферы ({spheres.reduce((a, s) => a + s.total, 0)})</option>
            {spheres.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.total})
              </option>
            ))}
          </select>

          <select
            value={authority}
            onChange={(e) => setAuthority(e.target.value)}
            className={selectClass}
          >
            <option value="">Все органы</option>
            {authorities.map((a) => (
              <option key={a.code} value={a.code}>
                {a.short_name || a.name} ({a.card_count})
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

          <select
            value={requirementType}
            onChange={(e) => setRequirementType(e.target.value)}
            className={selectClass}
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <select
            value={voteStatus}
            onChange={(e) => setVoteStatus(e.target.value)}
            className={selectClass}
          >
            {VOTE_STATUSES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>

          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по тексту…"
            className={`${selectClass} flex-1 min-w-[200px]`}
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-slate-400">Загрузка карточек…</div>
          </div>
        ) : noSpheresAssigned || noAuthoritiesAssigned ? (
          <div className="flex flex-col items-center justify-center h-48 bg-amber-50 border border-amber-200 rounded-lg p-6">
            <div className="text-amber-700 text-lg font-medium mb-2">
              {noSpheresAssigned && noAuthoritiesAssigned
                ? "Сферы и госорганы не назначены"
                : noSpheresAssigned
                  ? "Сферы не назначены"
                  : "Госорганы не назначены"}
            </div>
            <div className="text-sm text-amber-600 text-center max-w-md">
              Эксперту назначаются сферы и органы-регуляторы администратором.
              Обратитесь к администратору, чтобы получить доступ к карточкам.
            </div>
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 bg-white rounded-lg border border-slate-200">
            <div className="text-slate-400 text-lg mb-2">
              {voteStatus === "unvoted"
                ? "Все карточки оценены или нет под фильтры"
                : "Нет карточек под фильтры"}
            </div>
            {voteStatus === "unvoted" && (
              <button
                onClick={() => setVoteStatus("all")}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Показать все
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((c) => {
              const canVote =
                !currentUser ||
                currentUser.role === "admin" ||
                (currentUser.assigned_spheres.includes(c.sphere_code) &&
                  c.controller_authority !== null &&
                  currentUser.assigned_authorities.includes(c.controller_authority));
              return (
                <CardItem
                  key={c.id}
                  card={c}
                  onVoteChange={handleVoteChange}
                  canVote={canVote}
                />
              );
            })}
          </div>
        )}

        <Pagination
          page={pagination.page}
          totalPages={pagination.pages}
          total={pagination.total}
          onPageChange={fetchCards}
        />
      </main>
    </div>
  );
}
