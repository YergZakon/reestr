import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

// Админ: отклонить требование
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const { requirementIds, reason } = await req.json();

  if (!Array.isArray(requirementIds) || requirementIds.length === 0) {
    return NextResponse.json({ error: "requirementIds обязателен" }, { status: 400 });
  }

  const placeholders = requirementIds.map((_: number, i: number) => `$${i + 1}`).join(",");
  await query(
    `UPDATE requirements SET admin_status = 'rejected', admin_reject_reason = $${requirementIds.length + 1}
     WHERE id IN (${placeholders})`,
    [...requirementIds, reason || "admin_reject"]
  );

  await query(
    "INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)",
    [user.id, "admin_reject", JSON.stringify({ requirementIds, reason })]
  );

  return NextResponse.json({ ok: true, count: requirementIds.length });
}

// Админ: восстановить требование
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const { requirementIds } = await req.json();
  const placeholders = requirementIds.map((_: number, i: number) => `$${i + 1}`).join(",");

  await query(
    `UPDATE requirements SET admin_status = 'active', admin_reject_reason = NULL
     WHERE id IN (${placeholders})`,
    requirementIds
  );

  return NextResponse.json({ ok: true });
}
