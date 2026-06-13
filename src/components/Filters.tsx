"use client";

interface FiltersProps {
  sphere?: string;
  onSphereChange?: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  voteStatus: string;
  onVoteStatusChange: (v: string) => void;
  npaList?: { id: number; title: string }[];
  npaId: string;
  onNpaChange: (v: string) => void;
}

const SPHERES = [
  { value: "", label: "Все сферы" },
  { value: "land", label: "Земельные" },
  { value: "ecology", label: "Экология" },
  { value: "transport", label: "Транспорт" },
];

const CATEGORIES = [
  { value: "", label: "Все категории" },
  { value: "OBL", label: "Обязанность" },
  { value: "ZAP", label: "Запрет" },
  { value: "USL", label: "Условие" },
  { value: "SRK", label: "Срок" },
  { value: "DOC", label: "Документ" },
  { value: "FIN", label: "Финансы" },
  { value: "OTV", label: "Ответственность" },
  { value: "PRO", label: "Процедура" },
  { value: "STD", label: "Стандарт" },
];

const VOTE_STATUSES = [
  { value: "all", label: "Все" },
  { value: "unvoted", label: "Не оценённые" },
  { value: "voted", label: "Оценённые" },
];

const selectClass =
  "text-sm text-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none";

export default function Filters({
  sphere,
  onSphereChange,
  category,
  onCategoryChange,
  voteStatus,
  onVoteStatusChange,
  npaId,
  onNpaChange,
  npaList,
}: FiltersProps) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      {onSphereChange && (
        <select
          value={sphere || ""}
          onChange={(e) => onSphereChange(e.target.value)}
          className={selectClass}
        >
          {SPHERES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      )}

      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        className={selectClass}
      >
        {CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      <select
        value={voteStatus}
        onChange={(e) => onVoteStatusChange(e.target.value)}
        className={selectClass}
      >
        {VOTE_STATUSES.map((v) => (
          <option key={v.value} value={v.value}>
            {v.label}
          </option>
        ))}
      </select>

      {npaList && npaList.length > 0 && (
        <select
          value={npaId}
          onChange={(e) => onNpaChange(e.target.value)}
          className={`${selectClass} max-w-xs`}
        >
          <option value="">Все НПА</option>
          {npaList.map((n) => (
            <option key={n.id} value={n.id.toString()}>
              {n.title.length > 50 ? n.title.slice(0, 50) + "..." : n.title}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
