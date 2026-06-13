"use client";

interface VoteButtonsProps {
  currentVote: string | null;
  onVote: (vote: "confirm" | "reject" | "uncertain") => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

const VOTES = [
  {
    value: "confirm" as const,
    label: "Подтвердить",
    shortLabel: "Да",
    color: "bg-green-50 text-green-700 border-green-300 hover:bg-green-100",
    activeColor: "bg-green-600 text-white border-green-600",
    icon: "✓",
  },
  {
    value: "reject" as const,
    label: "Отклонить",
    shortLabel: "Нет",
    color: "bg-red-50 text-red-700 border-red-300 hover:bg-red-100",
    activeColor: "bg-red-600 text-white border-red-600",
    icon: "✗",
  },
  {
    value: "uncertain" as const,
    label: "Не уверен",
    shortLabel: "?",
    color: "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100",
    activeColor: "bg-amber-500 text-white border-amber-500",
    icon: "?",
  },
];

export default function VoteButtons({
  currentVote,
  onVote,
  disabled = false,
  size = "md",
}: VoteButtonsProps) {
  return (
    <div className={`flex gap-2 ${size === "sm" ? "gap-1" : ""}`}>
      {VOTES.map((v) => {
        const isActive = currentVote === v.value;
        return (
          <button
            key={v.value}
            onClick={() => onVote(v.value)}
            disabled={disabled}
            className={`
              border rounded-lg font-medium transition-all disabled:opacity-50
              ${size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"}
              ${isActive ? v.activeColor : v.color}
            `}
          >
            <span className="mr-1">{v.icon}</span>
            {size === "sm" ? v.shortLabel : v.label}
          </button>
        );
      })}
    </div>
  );
}
