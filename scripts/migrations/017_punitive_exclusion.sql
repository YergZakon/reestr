-- 017_punitive_exclusion.sql — исключение «требований» из карательных НПА
-- Применяется скриптом requirements-pipeline: scripts/registry/exclude_punitive.py --apply
-- (DDL продублирован там; здесь — для истории схемы).
--
-- Контекст: в реестр ошибочно попали нормы из Уголовного кодекса, КоАП,
-- Уголовно-исполнительного и Уголовно-процессуального кодексов, а также
-- пенитенциарных правил. Это НАКАЗАНИЯ/санкции/режим учреждений, а НЕ требования
-- к бизнесу. Само требование (напр. иметь лицензию) следует из профильного закона,
-- а УК/КоАП лишь устанавливают ответственность за нарушение.

ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS excluded BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS excluded_reason TEXT;

-- Исключение (excluded=true + is_canonical=false → исчезают из всех выдач продукта,
-- т.к. все API фильтруют is_canonical). Обратимо: вернуть = is_canonical=true.
UPDATE requirement_registry
SET excluded = true,
    excluded_reason = 'карательный/процессуальный кодекс или пенитенциарные правила — наказание/режим, не требование к бизнесу',
    is_canonical = false
WHERE is_canonical AND (
     npa_title ILIKE '%уголовн%'
  OR npa_title ILIKE '%административных правонаруш%'
  OR npa_title ILIKE '%лицам, содержащимся%'
  OR subject ILIKE '%осужденн%'
  OR subject ILIKE '%администрация учреждения%'
  OR ngr IN ('V2200028669','V2100024069','V2200028668')
);
-- Результат: исключено 970, осталось 75 230 действующих канонических. npa_registry перестроен.
