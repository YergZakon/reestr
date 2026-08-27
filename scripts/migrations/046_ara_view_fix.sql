-- 046: фикс v_npa_ara_status — достижимая группа «рассмотрено в срок».
-- В 045 on_time требовал approved-цикла с deadline_snapshot = текущему deadline,
-- но approve сразу проставляет НОВЫЙ срок (+3/+2) — условие не выполнялось никогда.
-- Новая семантика: overdue главнее; on_time = срок не просрочен И по акту есть
-- утверждённый цикл (работа выполнена); not_due = срок в будущем, циклов ещё не было.
CREATE OR REPLACE VIEW v_npa_ara_status AS
SELECT a.*,
  CASE
    WHEN a.deadline IS NULL THEN 'no_deadline'
    WHEN a.deadline < current_date THEN 'overdue'
    WHEN EXISTS (SELECT 1 FROM ara_review r WHERE r.ara_id = a.id AND r.status = 'approved')
      THEN 'on_time'
    ELSE 'not_due'
  END AS ara_group
FROM npa_ara a
WHERE COALESCE(a.portal_status, '') NOT ILIKE '%утратив%'
  AND COALESCE(a.portal_status, '') NOT ILIKE '%күшін жой%';

INSERT INTO schema_migrations (version, filename, checksum, note)
VALUES (46, '046_ara_view_fix.sql', md5('046_ara_view_fix_v1'),
        'v_npa_ara_status: on_time достижим (approved-цикл при непросроченном сроке)')
ON CONFLICT (version) DO NOTHING;
