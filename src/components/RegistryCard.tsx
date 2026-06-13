"use client";
import { useState } from "react";

export interface RegistryItem {
  id: number;
  ngr: string | null;
  npa_title: string | null;
  article: string | null;
  ministry: string | null;
  sphere_code: string | null;
  sphere_name: string | null;
  okeds: string[] | null;
  title: string | null;
  legal_text: string | null;
  canon_text: string | null;
  subject: string | null;
  action: string | null;
  object: string | null;
  condition: string | null;
  stages: string[] | null;
}

const STAGE_LABEL: Record<string, string> = {
  planning: "планирование", registration: "регистрация", pre_launch: "до запуска",
  launch: "запуск", operation: "деятельность", reporting: "отчётность",
  inspection: "проверки", expansion: "расширение", suspension: "приостановка",
  closure: "закрытие",
};

export default function RegistryCard({
  item, onChanged,
}: { item: RegistryItem; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.canon_text || item.legal_text || "");

  const heading = item.title || `${item.subject || ""} ${item.action ? "→ " + item.action : ""}`.trim();
  const body = item.canon_text || item.legal_text || "";
  const adiletUrl = item.ngr ? `https://adilet.zan.kz/rus/docs/${item.ngr}` : null;

  async function save() {
    setBusy(true);
    try {
      await fetch("/api/registry/review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, action: "edit", fields: { canon_text: text } }),
      });
      onChanged?.();
      setEditing(false);
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow">
      <h3 className="font-medium text-slate-800 text-sm">{heading}</h3>

      {editing ? (
        <textarea
          value={text} onChange={(e) => setText(e.target.value)}
          className="w-full mt-2 p-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-blue-500"
          rows={3}
        />
      ) : (
        body && <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{body}</p>
      )}

      {/* привязки */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs text-slate-500">
        {item.ministry && <span>🏛 {item.ministry}</span>}
        {item.sphere_name && <span>📂 {item.sphere_name}</span>}
        {item.subject && <span>👤 {item.subject}</span>}
        {item.ngr && (
          <span>
            📄{" "}
            {adiletUrl ? (
              <a href={adiletUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {item.npa_title ? item.npa_title.slice(0, 60) : item.ngr}{item.article ? `, ${item.article}` : ""}
              </a>
            ) : (
              <>{item.ngr}{item.article ? `, ${item.article}` : ""}</>
            )}
          </span>
        )}
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

      {item.okeds && item.okeds.length > 0 && (
        <div className="mt-1.5 text-xs text-slate-400">
          ОКЭД: {item.okeds.slice(0, 8).join(", ")}{item.okeds.length > 8 ? "…" : ""}
        </div>
      )}

      {/* редактирование формулировки */}
      <div className="flex items-center gap-2 mt-3">
        {editing ? (
          <>
            <button disabled={busy} onClick={save}
              className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
              Сохранить
            </button>
            <button onClick={() => { setEditing(false); setText(body); }}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-50">
              Отмена
            </button>
          </>
        ) : (
          <button onClick={() => setEditing(true)}
            className="px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-50 text-slate-600">
            ✎ Редактировать
          </button>
        )}
      </div>
    </div>
  );
}
