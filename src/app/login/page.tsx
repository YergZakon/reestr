"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./login.css";

/** Вход в систему. Государственное оформление: герб РК, двуязычие (ҚАЗ/РУС),
 *  правовая сноска о журналировании действий. Язык запоминается в localStorage
 *  тем же ключом, что и реестр (reg_lang) — вход и приложение согласованы. */

const L = {
  ru: {
    state: "Республика Казахстан",
    title: "Реестр обязательных требований",
    org: "Министерство национальной экономики Республики Казахстан",
    cardH: "Вход в систему",
    login: "Логин",
    password: "Пароль",
    enter: "Войти",
    entering: "Вход…",
    err: "Ошибка авторизации",
    netErr: "Сервис недоступен, повторите попытку",
    note: "Доступ предоставляется уполномоченным сотрудникам государственных органов. Действия пользователей в системе журналируются.",
    footSys: "Государственная информационная система",
  },
  kz: {
    state: "Қазақстан Республикасы",
    title: "Міндетті талаптар тізілімі",
    org: "Қазақстан Республикасының Ұлттық экономика министрлігі",
    cardH: "Жүйеге кіру",
    login: "Логин",
    password: "Құпиясөз",
    enter: "Кіру",
    entering: "Кіру…",
    err: "Авторизация қатесі",
    netErr: "Қызмет қолжетімсіз, әрекетті қайталаңыз",
    note: "Қолжетімділік мемлекеттік органдардың уәкілетті қызметкерлеріне беріледі. Пайдаланушылардың жүйедегі әрекеттері журналға тіркеледі.",
    footSys: "Мемлекеттік ақпараттық жүйе",
  },
};

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<"ru" | "kz">("ru");
  const router = useRouter();
  const t = L[lang];

  useEffect(() => {
    const saved = localStorage.getItem("reg_lang");
    if (saved === "kz" || saved === "ru") setLang(saved);
  }, []);
  const switchLang = (l: "ru" | "kz") => { setLang(l); localStorage.setItem("reg_lang", l); };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { router.push("/registry"); return; }
      setError(data.error || t.err);
    } catch {
      setError(t.netErr);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lg">
      <div className="lg-top" />
      <div className="lg-lang">
        <button className={lang === "kz" ? "on" : ""} onClick={() => switchLang("kz")}>ҚАЗ</button>
        <button className={lang === "ru" ? "on" : ""} onClick={() => switchLang("ru")}>РУС</button>
      </div>

      <main className="lg-main">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lg-gerb" src="/gerb.png" alt={t.state} width={104} height={107} />
        <div className="lg-state">{t.state}</div>
        <h1 className="lg-h1">{t.title}</h1>
        <div className="lg-org">{t.org}</div>
        <div className="lg-rule" />

        <form className="lg-card" onSubmit={handleSubmit}>
          <div className="lg-card-h">{t.cardH}</div>
          {error && <div className="lg-err">{error}</div>}
          <div className="lg-field">
            <label htmlFor="lg-user">{t.login}</label>
            <input id="lg-user" type="text" value={username} autoComplete="username"
              onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </div>
          <div className="lg-field">
            <label htmlFor="lg-pass">{t.password}</label>
            <input id="lg-pass" type="password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="lg-btn" type="submit" disabled={loading}>
            {loading ? t.entering : t.enter}
          </button>
        </form>

        <div className="lg-note">{t.note}</div>
        <div className="lg-foot">
          <b>{t.footSys}</b><br />
          © {new Date().getFullYear()} · {t.org}
        </div>
      </main>
    </div>
  );
}
