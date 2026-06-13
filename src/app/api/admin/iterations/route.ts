import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query, initDB } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initDB();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const result = await query(`
      SELECT i.*,
        (SELECT COUNT(*) FROM requirements WHERE iteration_id = i.id) as req_count,
        (SELECT COUNT(*) FROM expert_votes WHERE iteration_id = i.id) as vote_count
      FROM iterations i
      ORDER BY i.iteration_number DESC
    `);

    return NextResponse.json({ iterations: result.rows });
  } catch (error) {
    console.error("Iterations error:", error);
    return NextResponse.json({ error: "Ошибка сервера", details: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initDB();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const body = await req.json();
    const { description } = body;

    if (!description) {
      return NextResponse.json({ error: "Описание обязательно" }, { status: 400 });
    }

    // Get next iteration number
    const maxResult = await query("SELECT COALESCE(MAX(iteration_number), 0) + 1 as next_num FROM iterations");
    const nextNum = maxResult.rows[0].next_num;

    const result = await query(
      `INSERT INTO iterations (iteration_number, status, description)
       VALUES ($1, 'active', $2)
       RETURNING *`,
      [nextNum, description]
    );

    // Log activity
    await query(
      "INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)",
      [user.id, "create_iteration", JSON.stringify({ iteration_id: result.rows[0].id, description })]
    );

    return NextResponse.json({ iteration: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error("Create iteration error:", error);
    return NextResponse.json({ error: "Ошибка сервера", details: String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await initDB();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const body = await req.json();
    const { iterationId, action } = body; // action: 'complete' | 'archive'

    if (!iterationId || !action) {
      return NextResponse.json({ error: "iterationId и action обязательны" }, { status: 400 });
    }

    if (action === "complete") {
      await query(
        "UPDATE iterations SET status = 'completed', completed_at = NOW() WHERE id = $1",
        [iterationId]
      );
    } else if (action === "archive") {
      await query(
        "UPDATE iterations SET status = 'archived' WHERE id = $1",
        [iterationId]
      );
    } else {
      return NextResponse.json({ error: "action должен быть complete или archive" }, { status: 400 });
    }

    // Log activity
    await query(
      "INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)",
      [user.id, "update_iteration", JSON.stringify({ iteration_id: iterationId, action })]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update iteration error:", error);
    return NextResponse.json({ error: "Ошибка сервера", details: String(error) }, { status: 500 });
  }
}
