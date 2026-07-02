"use client";
// Колокольчик уведомлений органа (new_pending / ara_soon). Данные — /api/notifications
// (генерирует облачный воркер; email-канал дублирует при заданном SMTP_URL).
import { useCallback, useEffect, useRef, useState } from "react";

interface Notif {
  id: number; authority_code: string; type: string; title: string;
  created_at: string; is_read: boolean;
}

export default function NotificationsBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setItems(d.items || []); setUnread(d.unread || 0); } })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (open && boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const markRead = () => {
    const ids = items.filter((n) => !n.is_read).map((n) => n.id).slice(0, 100);
    if (!ids.length) return;
    fetch("/api/notifications", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).then(load).catch(() => {});
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Уведомления"
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 6, lineHeight: 0 }}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 0, right: 0, minWidth: 15, height: 15, padding: "0 3px",
            borderRadius: 8, background: "#C43D3D", color: "#fff", fontSize: 10, fontWeight: 700,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 8px)", width: 340, maxHeight: 380,
          overflowY: "auto", background: "#fff", border: "1px solid #E3E1DA", borderRadius: 10,
          boxShadow: "0 8px 28px rgba(30,30,25,.14)", zIndex: 120, padding: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", padding: "4px 8px 8px" }}>
            <b style={{ fontSize: 13.5, flex: 1 }}>Уведомления</b>
            {unread > 0 && (
              <button onClick={markRead} style={{ fontSize: 11.5, color: "#2E6B4F", background: "none", border: "none", cursor: "pointer" }}>
                отметить прочитанными
              </button>
            )}
          </div>
          {items.length === 0 && <div style={{ padding: 14, fontSize: 12.5, color: "#8A877E" }}>Пока пусто.</div>}
          {items.map((n) => (
            <div key={n.id} style={{
              padding: "8px 10px", borderRadius: 8, marginBottom: 3,
              background: n.is_read ? "transparent" : "#F3F7F4",
            }}>
              <div style={{ fontSize: 12.5, fontWeight: n.is_read ? 450 : 650, lineHeight: 1.35 }}>{n.title}</div>
              <div style={{ fontSize: 11, color: "#8A877E", marginTop: 2 }}>
                {n.authority_code} · {n.type === "ara_soon" ? "срок АРА" : "новые в очереди"} · {String(n.created_at).slice(0, 10)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
