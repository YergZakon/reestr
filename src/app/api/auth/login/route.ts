import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, signToken } from "@/lib/auth";
import { initDB } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    await initDB();
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Введите логин и пароль" }, { status: 400 });
    }

    const user = await authenticateUser(username, password);
    if (!user) {
      return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
    }

    const token = signToken(user);
    const response = NextResponse.json({ user });
    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
