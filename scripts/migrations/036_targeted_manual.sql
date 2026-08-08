-- 036: направленная доподача + ручное добавление требований
-- (механизмы для случаев «парсер не справился», решение 2026-08-08)

-- 1) Направленная доподача: подача НПА с ограничением по статьям.
--    Воркер извлекает только перечисленные статьи (номера через запятую,
--    например «20,27-1»); NULL = весь акт, как раньше.
ALTER TABLE npa_submission ADD COLUMN IF NOT EXISTS articles TEXT;

COMMENT ON COLUMN npa_submission.articles IS
  'Направленная доподача: только эти статьи (через запятую). NULL = весь НПА';

-- 2) Ручное добавление: source=''manual'' в requirement_registry — новых колонок
--    не требует (source TEXT без CHECK); фиксируем допустимое значение комментарием.
COMMENT ON COLUMN requirement_registry.source IS
  'npa | ersop | license | submission | refill | manual (ручной ввод модератором)';
