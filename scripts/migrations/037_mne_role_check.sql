-- 037: роль «Сотрудник МНЭ» (mne) в CHECK-констрейнте users.role.
-- Найдено смоуком после мержа PR #19: код принимает role='mne',
-- а users_role_check в БД — нет (создание учётки падало с CheckViolation).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'mne', 'moderator', 'expert'));
