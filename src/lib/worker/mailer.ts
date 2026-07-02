// Почтовый канал уведомлений. Включается переменной SMTP_URL
// (например smtp://user:pass@smtp.host:587); MAIL_FROM — адрес отправителя.
// Без SMTP_URL канал молча выключен (уведомления остаются в кабинете).
import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;
let warned = false;

export function mailEnabled(): boolean {
  return Boolean(process.env.SMTP_URL);
}

function getTransport(): Transporter | null {
  if (!process.env.SMTP_URL) {
    if (!warned) { console.log("[mail] SMTP_URL не задан — email-канал выключен (кабинет работает)"); warned = true; }
    return null;
  }
  if (!transporter) transporter = nodemailer.createTransport(process.env.SMTP_URL);
  return transporter;
}

export async function sendMail(to: string[], subject: string, text: string): Promise<boolean> {
  const t = getTransport();
  if (!t || !to.length) return false;
  try {
    await t.sendMail({
      from: process.env.MAIL_FROM || "reestr@no-reply.local",
      to: to.join(", "),
      subject,
      text,
    });
    return true;
  } catch (e) {
    console.error("[mail] отправка не удалась:", (e as Error).message);
    return false;
  }
}
