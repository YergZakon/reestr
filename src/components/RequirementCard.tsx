"use client";
import { useState } from "react";
import VoteButtons from "./VoteButtons";

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
}

const CATEGORY_COLORS: Record<string, string> = {
  OBL: "bg-blue-100 text-blue-800",
  ZAP: "bg-red-100 text-red-800",
  USL: "bg-yellow-100 text-yellow-800",
  SRK: "bg-purple-100 text-purple-800",
  DOC: "bg-indigo-100 text-indigo-800",
  FIN: "bg-green-100 text-green-800",
  OTV: "bg-orange-100 text-orange-800",
  PRO: "bg-pink-100 text-pink-800",
  STD: "bg-teal-100 text-teal-800",
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

interface Props {
  requirement: Requirement;
  onVoteChange: (reqId: number, vote: string, comment?: string) => void;
  showVoteSummary?: boolean;
}

export default function RequirementCard({
  requirement: r,
  onVoteChange,
  showVoteSummary = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState(r.my_comment || "");
  const [showComment, setShowComment] = useState(false);
  const [voting, setVoting] = useState(false);

  async function handleVote(vote: "confirm" | "reject" | "uncertain") {
    setVoting(true);
    try {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirementId: r.id,
          vote,
          comment: comment || null,
        }),
      });
      if (res.ok) {
        onVoteChange(r.id, vote, comment);
      }
    } finally {
      setVoting(false);
    }
  }

  const textPreview =
    r.text_original.length > 200
      ? r.text_original.slice(0, 200) + "..."
      : r.text_original;

  const confirms = parseInt(r.confirms) || 0;
  const rejects = parseInt(r.rejects) || 0;
  const totalVotes = parseInt(r.total_votes) || 0;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-slate-400">
            {r.external_id}
          </span>
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-full ${
              CATEGORY_COLORS[r.category] || "bg-slate-100 text-slate-700"
            }`}
          >
            {CATEGORY_NAMES[r.category] || r.category}
          </span>
          {r.subject && (
            <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-full">
              {r.subject}
            </span>
          )}
          {r.confidence === "high" && (
            <span className="px-2 py-0.5 text-xs bg-emerald-50 text-emerald-600 rounded-full">
              ★ золотой стандарт
            </span>
          )}
        </div>
        {showVoteSummary && totalVotes > 0 && (
          <div className="flex items-center gap-1 text-xs shrink-0">
            <span className="text-green-600">{confirms}✓</span>
            <span className="text-red-600">{rejects}✗</span>
            <span className="text-slate-400">/{totalVotes}</span>
          </div>
        )}
      </div>

      {/* NPA reference */}
      {r.npa_title && (
        <div className="text-xs text-slate-400 mb-2">
          {r.npa_title}
          {r.article_ref && ` — ${r.article_ref}`}
        </div>
      )}

      {/* Gold standard title */}
      {r.gold_standard_title && (
        <div className="text-xs font-medium text-indigo-600 mb-2">
          {r.gold_standard_title}
        </div>
      )}

      {/* Requirement text */}
      <div
        className={`text-sm text-slate-700 leading-relaxed mb-3 ${
          !expanded ? "line-clamp-3" : ""
        }`}
      >
        {expanded ? r.text_original : textPreview}
      </div>
      {r.text_original.length > 200 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-600 hover:text-blue-800 mb-3"
        >
          {expanded ? "Свернуть" : "Показать полностью"}
        </button>
      )}

      {/* Vote section */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <VoteButtons
          currentVote={r.my_vote}
          onVote={handleVote}
          disabled={voting}
          size="sm"
        />
        <button
          onClick={() => setShowComment(!showComment)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          {showComment ? "Скрыть" : "Комментарий"}
        </button>
      </div>

      {/* Comment */}
      {showComment && (
        <div className="mt-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий к оценке..."
            className="w-full text-sm p-2 border border-slate-200 rounded-md resize-none focus:ring-1 focus:ring-blue-500 focus:border-transparent outline-none"
            rows={2}
          />
        </div>
      )}
    </div>
  );
}
