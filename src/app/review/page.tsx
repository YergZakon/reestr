"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import RequirementCard from "@/components/RequirementCard";
import Filters from "@/components/Filters";
import Pagination from "@/components/Pagination";

interface Requirement {
  id: number;
  external_id: string;
  category: string;
  text_original: string;
  text_summary: string | null;
  article_ref: string | null;
  subject: string | null;
  expert_category: string | null;
  confidence: string;
  detection_method: string;
  npa_title: string | null;
  npa_code: string | null;
  gold_standard_title: string | null;
  my_vote: string | null;
  my_comment: string | null;
  confirms: string;
  rejects: string;
  total_votes: string;
  admin_status: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function ReviewPage() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [sphere, setSphere] = useState("");
  const [category, setCategory] = useState("");
  const [voteStatus, setVoteStatus] = useState("unvoted");
  const [npaId, setNpaId] = useState("");
  const router = useRouter();

  const fetchRequirements = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: "15",
          status: "active",
          vote_status: voteStatus,
        });
        if (sphere) params.set("sphere", sphere);
        if (category) params.set("category", category);
        if (npaId) params.set("npa_id", npaId);

        const res = await fetch(`/api/requirements?${params}`);
        if (!res.ok) throw new Error("unauthorized");
        const data = await res.json();
        setRequirements(data.requirements);
        setPagination(data.pagination);
      } catch {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    },
    [sphere, category, voteStatus, npaId, router]
  );

  useEffect(() => {
    fetchRequirements(1);
  }, [fetchRequirements]);

  function handleVoteChange(reqId: number, vote: string, comment?: string) {
    setRequirements((prev) =>
      prev.map((r) =>
        r.id === reqId
          ? { ...r, my_vote: vote, my_comment: comment || r.my_comment }
          : r
      )
    );
  }

  // Progress counter
  const votedCount = requirements.filter((r) => r.my_vote).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Оценка требований
            </h2>
            <p className="text-sm text-slate-500">
              Оцените каждое требование: подтвердить, отклонить или отметить как
              спорное
            </p>
          </div>
          {!loading && (
            <div className="text-sm text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
              Оценено на этой странице:{" "}
              <span className="font-medium text-blue-600">
                {votedCount}/{requirements.length}
              </span>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="mb-4">
          <Filters
            sphere={sphere}
            onSphereChange={(v) => {
              setSphere(v);
              setNpaId("");
            }}
            category={category}
            onCategoryChange={(v) => {
              setCategory(v);
            }}
            voteStatus={voteStatus}
            onVoteStatusChange={(v) => {
              setVoteStatus(v);
            }}
            npaId={npaId}
            onNpaChange={(v) => {
              setNpaId(v);
            }}
          />
        </div>

        {/* Requirements list */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-slate-400">Загрузка требований...</div>
          </div>
        ) : requirements.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 bg-white rounded-lg border border-slate-200">
            <div className="text-slate-400 text-lg mb-2">
              {voteStatus === "unvoted"
                ? "Все требования оценены!"
                : "Нет требований по заданным фильтрам"}
            </div>
            {voteStatus === "unvoted" && (
              <button
                onClick={() => setVoteStatus("all")}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Показать все требования
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {requirements.map((r) => (
              <RequirementCard
                key={r.id}
                requirement={r}
                onVoteChange={handleVoteChange}
                showVoteSummary={false}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={(p) => fetchRequirements(p)}
        />
      </main>
    </div>
  );
}
