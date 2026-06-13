"use client";
import { useState } from "react";

export interface RegistryItem {
  id: number;
  source: string;
  trust: string;
  ngr: string | null;
  npa_title: string | null;
  article: string | null;
  npa_status: string | null;
  replacement_ngr: string | null;
  ministry: string | null;
  sphere_code: string | null;
  sphere_name: string | null;
  ersop_area: string | null;
  okeds: string[] | null;
  stages: string[] | null;
  title: string | null;
  legal_text: string | null;
  canon_text: string | null;
  subject: string | null;
  action: string | null;
  object: string | null;
  condition: string | null;
  evidence: string | null;
  ersop_confirmed: boolean;
  dup_group_id: number | null;
  group_size: number;
  review_status: string;
  review_comment: string | null;
}

const TRUST_LABEL: Record<string, string> = {
  ersop_auto: "ЕРСОП · точный матч",
  ersop_dedup: "ЕРСОП · дедуп",
  ersop_extracted: "Из ЕРСОП",
  npa_extracted: "Из НПА (новое)",
  ds_confirm: "Подтверждено LLM",
  npa_only_weak: "Только НПА",
  weak_unprocessed: "Слабая связь",
  npa_only_unprocessed: "НПА (не обработано)",
};

const STAGE_LABEL: Record<string, string> = {
  planning: "планирование", registration: "регистрация", pre_launch: "до запуска",
  launch: "запуск", operation: "деятельность", reporting: "отчётность",
  inspection: "проверки", expansion: "расширение", suspension: "приостановка",
  closure: "закрытие",
};

const REVIEW_BADGE: Record<string, { t: string; c: string }> = {
  pending: { t: "не проверено", c: "bg-slate-100 text-slate-500" },
  confirmed: { t: "подтверждено", c: "bg-green-100 text-green-700" },
  rejected: { t: "отклонено", c: "bg-red-100 text-red-700" },
  edited: { t: "отредактировано", c: "bg-amber-100 text-amber-700" },
};

export default function RegistryCard({
  item, onChanged,
}: { item: RegistryItem; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.canon_text || item.legal_text || "");
  const [dups, setDups] = useState<RegistryItem[] | null>(null);
  const [showDups, setShowDups] = useState(false);

  const heading = item.title || `${item.subject || ""} ${item.action ? "→ " + item.action : ""}`.trim();
  const body = item.canon_text || item.legal_text || "";
  const stale = item.npa_status === "утратил силу";

  async function review(action: string, fields?: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch("/api/registry/review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, action, fields }),
      });
      onChanged?.();
    } finally { setBusy(false); }
  }

  async function loadDups() {
    if (dups) { setShowDups(!showDups); return; }
    const r = await fetch(`/api/registry/${item.id}/duplicates`);
    const d = await r.json();
    setDups(d.items || []); setShowDups(true);
  }

  const rb = REVIEW_BADGE[item.review_status] || REVIEW_BADGE.pending;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-1.5 py-0.5 rounded ${rb.c}`}>{rb.t}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
              {TRUST_LABEL[item.trust] || item.trust}
            </span>
            {item.ersop_confirmed && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">✓ проверяется (ЕРСОП)</span>
            )}
            {stale && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                НПА утратил силу{item.replacement_ngr ? ` → ${item.replacement_ngr}` : ""}
              </span>
            )}
          </div>
          <h3 className="font-medium text-slate-800 text-sm">{heading}</h3>
        </div>
      </div>

      {editing ? (
        <textarea
          value={text} onChange={(e) => setText(e.target.value)}
          className="w-full mt-2 p-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-blue-500"
          rows={3}
        />
      ) : (
        body && <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{body}</p>
      )}

      {/* метаданные */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
        {item.ministry && <span>🏛 {item.ministry}</span>}
        {item.sphere_name && <span>📂 {item.sphere_name}</span>}
        {item.ngr && <span>📄 {item.ngr}{item.article ? `, ${item.article}` : ""}</span>}
        {item.subject && <span>👤 {item.subject}</span>}
      </div>

      {item.stages && item.stages.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {item.stages.map((s) => (
            <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
              {STAGE_LABEL[s] || s}
            </span>
          ))}
        </div>
      )}

      {/* действия */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {editing ? (
          <>
            <button disabled={busy} onClick={() => { review("edit", { canon_text: text }).then(() => setEditing(false)); }}
              className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
              Сохранить
            </button>
            <button onClick={() => { setEditing(false); setText(body); }}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-50">
              Отмена
            </button>
          </>
        ) : (
          <>
            <button disabled={busy} onClick={() => review("confirm")}
              className="px-2.5 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100 disabled:opacity-50">
              ✓ Подтвердить
            </button>
            <button disabled={busy} onClick={() => review("reject")}
              className="px-2.5 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-50">
              ✕ Отклонить
            </button>
            <button onClick={() => setEditing(true)}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-50">
              ✎ Редактировать
            </button>
          </>
        )}
        {item.group_size > 1 && (
          <button onClick={loadDups}
            className="px-2.5 py-1 text-xs text-blue-600 hover:underline ml-auto">
            {showDups ? "Скрыть" : `ещё ${item.group_size - 1} формулировок`}
          </button>
        )}
      </div>

      {showDups && dups && (
        <div className="mt-2 pl-3 border-l-2 border-slate-200 space-y-1.5">
          {dups.filter((d) => d.id !== item.id).map((d) => (
            <div key={d.id} className="text-xs text-slate-500">
              <span className="px-1 py-0.5 rounded bg-slate-100 mr-1">{TRUST_LABEL[d.trust] || d.trust}</span>
              {(d as unknown as { text: string }).text}
              {d.ngr && <span className="text-slate-400"> · {d.ngr}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
