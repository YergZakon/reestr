-- 018_full_audit.sql — полный LLM-аудит реестра (адресат + тип требования)
-- Применяется скриптами requirements-pipeline:
--   scripts/registry/audit_npa_sources.py   (Этап 1 — классификация НПА-источников)
--   scripts/registry/audit_requirements.py --apply  (Этап 2 — классификация каждого требования)
--
-- Контекст: пайплайн извлечения подавал на вход ВСЕ НПА без фильтра источника, а
-- валидатор работал на отдельной норме и переписывал диспозиции (санкции) в позитив.
-- Полный аудит DeepSeek по каждому требованию проставил:
--   audit_addr — адресат: business | government | court | other
--   audit_type — тип: requirement | sanction | power | definition
-- Оставлены только (business + requirement); остальное excluded + is_canonical=false.

ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS audit_addr TEXT;
ALTER TABLE requirement_registry ADD COLUMN IF NOT EXISTS audit_type TEXT;

UPDATE requirement_registry
SET excluded = true,
    excluded_reason = 'аудит: адресат не бизнес либо запись не является требованием',
    is_canonical = false
WHERE is_canonical
  AND NOT (audit_addr = 'business' AND audit_type = 'requirement');

-- Результат: исключено 3 241 (адресат госорган/иное, либо санкция/полномочие/определение).
-- Итог реестра: 71 989 действующих требований (76 200 − 970 карательных − 3 241 аудит). npa_registry перестроен.
