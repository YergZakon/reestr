"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import NotificationsBell from "./NotificationsBell";

interface User {
  id: number;
  username: string;
  role: "admin" | "moderator" | "expert";
}

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
        else router.push("/login");
      })
      .catch(() => router.push("/login"));
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (!user) return null;

  const homeUrl = "/registry";

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          <div className="flex items-center gap-6">
            <h1
              className="text-lg font-bold text-slate-800 cursor-pointer"
              onClick={() => router.push(homeUrl)}
            >
              Реестр обязательных требований
            </h1>
            <nav className="flex gap-1">
              <button
                onClick={() => router.push("/registry")}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
              >
                Реестр
              </button>
              {user.role === "admin" && (
                <button
                  onClick={() => router.push("/admin/moderators")}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Модераторы
                </button>
              )}
              {user.role === "moderator" && (
                <button
                  onClick={() => router.push("/moderator/analysts")}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Аналитики
                </button>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell />
            <span className="text-sm text-slate-500">
              {user.username}{" "}
              <span
                className={`inline-block px-1.5 py-0.5 text-xs rounded ${
                  user.role === "admin"
                    ? "bg-purple-100 text-purple-700"
                    : user.role === "moderator"
                    ? "bg-teal-100 text-teal-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {user.role === "admin" ? "Админ" : user.role === "moderator" ? "Модератор" : "Аналитик"}
              </span>
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-400 hover:text-red-600 transition-colors"
            >
              Выйти
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
