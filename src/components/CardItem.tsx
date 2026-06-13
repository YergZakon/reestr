"use client";
import { useState } from "react";
import VoteButtons from "./VoteButtons";

export interface RequirementCardModel {
  id: number;
  card_code: string;
  sphere_code: string;
  sphere_name: string | null;
  subsphere: string | null;
  short_title: string | null;
  canonical_text: string | null;
  legal_text: string | null;
  business_text: string | null;
  subject: string | null;
  action: string | null;
  object: string | null;
  condition_text: string | null;
  exception_text: string | null;
  requirement_type: string | null;
  role_fragment: string | null;
  requirement_specificity: string | null;
  mandatory_level: string | null;
  timing: string | null;
  frequency: string | null;
  life_cycle_stage: string | null;
  evidence_required: boolean | null;
  evidence_form: string | null;
  consequences: string | null;
  can_be_online: boolean | null;
  expert_status: string | null;
  model_confidence: number | null;
  controller_authority: string | null;
  authority_short: string | null;
  authority_name: string | null;
  npa_link: {
    npa_title: string | null;
    article_ref: string | null;
    npa_url: string | null;
  } | null;
  confirms: string | number;
  rejects: string | number;
  uncertains: string | number;
  my_vote: string | null;
  my_comment: string | null;
}

const ROLE_COLORS: Record<string, string> = {
  "обязанность бизнеса": "bg-blue-100 text-blue-800",
  "запрет": "bg-red-100 text-red-800",
  "условие допуска": "bg-amber-100 text-amber-800",
  "документ для заявления": "bg-indigo-100 text-indigo-800",
  "доказательство исполнения": "bg-teal-100 text-teal-800",
  "право бизнеса": "bg-emerald-100 text-emerald-800",
  "обязанность госоргана": "bg-slate-100 text-slate-700",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  approved: { label: "одобрено", cls: "bg-green-50 text-green-700" },
  rejected: { label: "отклонено", cls: "bg-red-50 text-red-700" },
  in_review: { label: "обсуждается", cls: "bg-amber-50 text-amber-700" },
  disputed: { label: "спорное", cls: "bg-orange-50 text-orange-700" },
  unchecked: { label: "новое", cls: "bg-slate-50 text-slate-600" },
};

interface Props {
  card: RequirementCardModel;
  onVoteChange: (cardId: number, vote: string, comment?: string) => void;
  /** Если false — кнопки голосования заблокированы (нет доступа к сфере). */
  canVote?: boolean;
}

export default function CardItem({ card: c, onVoteChange, canVote = true }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState(c.my_comment || "");
  const [showComment, setShowComment] = useState(false);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVote(vote: "confirm" | "reject" | "uncertain") {
    setVoting(true);
    setError(null);
    try {
      const res = await fetch("/api/cards/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: c.id,
          vote,
          comment: comment || null,
        }),
      });
      if (res.ok) {
        onVoteChange(c.id, vote, comment);
      } else if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setError(`Слишком частое голосование. Подождите ${data.retry_after || 60} сек.`);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Ошибка голосования");
      }
    } catch (e) {
      setError(`Сеть: ${(e as Error).message}`);
    } finally {
      setVoting(false);
    }
  }

  const text = c.canonical_text || c.legal_text || c.business_text || "";
  const preview = text.length > 250 ? text.slice(0, 250) + "…" : text;
  const confirms = Number(c.confirms) || 0;
  const rejects = Number(c.rejects) || 0;
  const uncertains = Number(c.uncertains) || 0;
  const total = confirms + rejects + uncertains;

  const roleColor = c.role_fragment
    ? ROLE_COLORS[c.role_fragment] || "bg-slate-100 text-slate-700"
    : "bg-slate-100 text-slate-700";
  const statusBadge = c.expert_status ? STATUS_BADGE[c.expert_status] : null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-slate-400">{c.card_code}</span>
          {c.role_fragment && (
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${roleColor}`}>
              {c.role_fragment}
            </span>
          )}
          {c.requirement_type && (
            <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-full">
              {c.requirement_type}
            </span>
          )}
          {c.mandatory_level && (
            <span className="px-2 py-0.5 text-xs bg-purple-50 text-purple-700 rounded-full">
              {c.mandatory_level}
            </span>
          )}
          {c.authority_short && (
            <span
              className="px-2 py-0.5 text-xs bg-indigo-50 text-indigo-700 rounded-full"
              title={c.authority_name || c.authority_short}
            >
              {c.authority_short}
            </span>
          )}
          {statusBadge && (
            <span className={`px-2 py-0.5 text-xs rounded-full ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
          )}
        </div>
        {total > 0 && (
          <div className="flex items-center gap-1 text-xs shrink-0">
            <span className="text-green-600">{confirms}✓</span>
            <span className="text-red-600">{rejects}✗</span>
            {uncertains > 0 && <span className="text-amber-600">{uncertains}?</span>}
            <span className="text-slate-400">/{total}</span>
          </div>
        )}
      </div>

      {/* NPA reference */}
      {c.npa_link?.npa_title && (
        <div className="text-xs text-slate-400 mb-2">
          {c.npa_link.npa_url ? (
            <a
              href={c.npa_link.npa_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-blue-600"
            >
              {c.npa_link.npa_title}
              {c.npa_link.article_ref && ` — ${c.npa_link.article_ref}`}
            </a>
          ) : (
            <>
              {c.npa_link.npa_title}
              {c.npa_link.article_ref && ` — ${c.npa_link.article_ref}`}
            </>
          )}
        </div>
      )}

      {/* Sphere */}
      {c.sphere_name && (
        <div className="text-xs text-slate-500 mb-2">
          {c.sphere_name}
          {c.subsphere && ` · ${c.subsphere}`}
        </div>
      )}

      {/* Short title */}
      {c.short_title && (
        <div className="text-sm font-medium text-slate-800 mb-2">
          {c.short_title}
        </div>
      )}

      {/* Main text */}
      <div className={`text-sm text-slate-700 leading-relaxed mb-3 ${!expanded ? "" : ""}`}>
        {expanded ? text : preview}
      </div>
      {text.length > 250 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-600 hover:text-blue-800 mb-3"
        >
          {expanded ? "Свернуть" : "Показать полностью"}
        </button>
      )}

      {/* Subject / Action / Object */}
      {(c.subject || c.action || c.timing || c.evidence_form) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 mb-3 bg-slate-50 rounded-md p-2">
          {c.subject && (
            <div>
              <span className="font-semibold">Субъект:</span> {c.subject}
            </div>
          )}
          {c.action && (
            <div>
              <span className="font-semibold">Действие:</span> {c.action}
            </div>
          )}
          {c.timing && (
            <div>
              <span className="font-semibold">Срок:</span> {c.timing}
            </div>
          )}
          {c.evidence_form && (
            <div>
              <span className="font-semibold">Форма подтверждения:</span> {c.evidence_form}
            </div>
          )}
          {c.consequences && (
            <div className="sm:col-span-2">
              <span className="font-semibold">Последствия:</span> {c.consequences}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600 mb-2 bg-red-50 px-2 py-1 rounded">{error}</div>
      )}

      {/* Vote bar */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-3">
          <VoteButtons
            currentVote={c.my_vote}
            onVote={handleVote}
            disabled={voting || !canVote}
            size="sm"
          />
          {!canVote && (
            <span className="text-xs text-slate-400 italic">
              Сфера не назначена
            </span>
          )}
        </div>
        <button
          onClick={() => setShowComment(!showComment)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          {showComment ? "Скрыть" : c.my_comment ? "Комментарий ✎" : "Комментарий"}
        </button>
      </div>

      {showComment && (
        <div className="mt-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий к оценке…"
            className="w-full text-sm p-2 border border-slate-200 rounded-md resize-none focus:ring-1 focus:ring-blue-500 focus:border-transparent outline-none"
            rows={2}
          />
        </div>
      )}
    </div>
  );
}
