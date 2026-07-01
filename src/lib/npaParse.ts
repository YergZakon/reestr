// TS-порт html_to_articles: режет HTML НПА (adilet/zan) на статьи по якорям `<a name="zN"></a>Статья N`.
// Используется для мгновенного Node-превью подачи. Авторитетное извлечение — Python-пайплайн.

export interface NpaArticle {
  num: string;
  anchor: string;
  title: string;
  text: string;
}

const ART_RE = /<a\s+name="(z\d+)"><\/a>\s*(?:<[^>]+>\s*)*Стат[ьъ]я\s+(\d+(?:-\d+)?)/g;

function strip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Заголовок НПА из <title> (adilet: «… — Adilet»). */
export function parseTitle(html: string): string {
  const t = html.match(/<title>([^<]+)<\/title>/i);
  if (!t) return "";
  return t[1].replace(/\s*[-—|]\s*Әділет.*$/i, "").replace(/\s*[-—|]\s*Adilet.*$/i, "").trim().slice(0, 250);
}

/** Список статей с текстом (по якорям). Пустые/сноски отбрасываются. */
export function parseArticles(html: string): NpaArticle[] {
  const marks: { idx: number; anchor: string; num: string }[] = [];
  let m: RegExpExecArray | null;
  ART_RE.lastIndex = 0;
  while ((m = ART_RE.exec(html)) !== null) marks.push({ idx: m.index, anchor: m[1], num: m[2] });

  const arts: NpaArticle[] = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].idx;
    const end = i + 1 < marks.length ? marks[i + 1].idx : Math.min(html.length, start + 8000);
    const text = strip(html.slice(start, end)).slice(0, 6000);
    if (text.length >= 40) arts.push({ num: marks[i].num, anchor: marks[i].anchor, title: text.slice(0, 130), text });
  }
  return arts;
}
