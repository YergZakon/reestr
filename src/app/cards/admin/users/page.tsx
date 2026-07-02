"use client";
/* Легаси-адрес общей админки пользователей. Управление разнесено по ролям:
   admin → /admin/moderators (модераторы госорганов),
   moderator → /moderator/analysts (аналитики органа). */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyUsersRedirect() {
  const router = useRouter();
  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const role = d?.user?.role;
      router.replace(role === "admin" ? "/admin/moderators" : role === "moderator" ? "/moderator/analysts" : "/registry");
    }).catch(() => router.replace("/login"));
  }, [router]);
  return null;
}
