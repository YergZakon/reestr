import { NextResponse } from "next/server";
import { getCurrentUserWithAccess } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUserWithAccess();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user });
}
