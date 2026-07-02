// TS-порт чанкера НПА (adilet/zan) для мгновенного Node-превью подачи.
// Зеркалит каскад Python-конвейера (scripts/registry/process_submissions.py):
//   якоря <a name="zN"> → сегмент «ст.N» (если после якоря «Статья N») или «п.zN» (приказы/правила);
//   якорей нет → окна по чистому тексту («фрагмент/k»).
// Авторитетное извлечение — Python-пайплайн; контракт закреплён tests/chunker (fixtures общие).

export interface NpaArticle {
  /** Номер статьи для законов; "" для пунктов/фрагментов. */
  num: string;
  /** Якорь adilet (zN) — годится для deep-link #zN; "" для фрагментов. */
  anchor: string;
  /** Человекочитаемая метка сегмента: «ст.5» | «п.z16» | «фрагмент/2». */
  label: string;
  title: string;
  text: string;
}

const ANCHOR_RE = /<a\s+name="(z\d+)"><\/a>/g;                 // структурный якорь (статья ИЛИ пункт)
const STAT_RE = /^\s*(?:<[^>]+>\s*)*Стат[ьъ]я\s+(\d+(?:-\d+)?)/; // «Статья N» сразу после якоря

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

/** Большой блок → окна ~4800 символов; малый → как есть. */
function windows(text: string, labelBase: string): NpaArticle[] {
  if (text.length < 60) return [];
  if (text.length <= 5500) {
    return [{ num: "", anchor: "", label: labelBase, title: text.slice(0, 130), text }];
  }
  const out: NpaArticle[] = [];
  for (let k = 0, p = 0; p < Math.min(text.length, 45000); k++, p += 4800) {
    const chunk = text.slice(p, p + 4800);
    if (chunk.length >= 200) {
      out.push({ num: "", anchor: "", label: `${labelBase}/${k + 1}`, title: chunk.slice(0, 130), text: chunk });
    }
  }
  return out;
}

/** Сегменты НПА: статьи законов и пункт-блоки приказов; без якорей — окна по тексту. */
export function parseArticles(html: string): NpaArticle[] {
  const marks: { idx: number; end: number; anchor: string }[] = [];
  let m: RegExpExecArray | null;
  ANCHOR_RE.lastIndex = 0;
  while ((m = ANCHOR_RE.exec(html)) !== null) {
    marks.push({ idx: m.index, end: m.index + m[0].length, anchor: m[1] });
  }

  if (marks.length < 2) {
    // приказ без якорной разметки / нестандартный документ → окна по всему тексту
    return windows(strip(html), "фрагмент");
  }

  const arts: NpaArticle[] = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].idx;
    const end = i + 1 < marks.length ? marks[i + 1].idx : Math.min(html.length, start + 8000);
    const sm = html.slice(marks[i].end, end).match(STAT_RE);
    const num = sm ? sm[1] : "";
    const label = sm ? `ст.${sm[1]}` : `п.${marks[i].anchor}`;
    const text = strip(html.slice(start, end)).slice(0, 6000);
    if (text.length >= 60) {
      arts.push({ num, anchor: marks[i].anchor, label, title: text.slice(0, 130), text });
    }
  }
  return arts;
}
