-- ─────────────────────────────────────────────────────────────────────
-- Migration 010: authorities (вторая ось ограничения после сфер)
-- Date: 2026-05-08
--
-- Цель: эксперт «Минздрав по торговле» не должен голосовать за норму
-- «МИИР по торговле». Внутри одной сферы регулируют разные ведомства.
-- Доступ = (sphere ∈ user_spheres) AND (authority ∈ user_authorities).
--
-- Создаются:
--   authorities — справочник 15 министерств
--   npa_authorities — сырая привязка NGR → authority_code
--   user_authorities — bridge user ↔ authority
-- + колонка requirement_cards.controller_authority + индексы
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Канонический справочник ведомств ────────────────────────────
CREATE TABLE IF NOT EXISTS authorities (
    code       VARCHAR(20) PRIMARY KEY,
    name_ru    TEXT NOT NULL,
    short_name VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO authorities (code, name_ru, short_name) VALUES
  ('mz',       'Министерство здравоохранения',                                                    'МЗ'),
  ('miir',     'Министерство индустрии и инфраструктурного развития',                             'МИИР'),
  ('mchs',     'Министерство по чрезвычайным ситуациям',                                          'МЧС'),
  ('msx',      'Министерство сельского хозяйства',                                                'МСХ'),
  ('me',       'Министерство энергетики',                                                         'МЭ'),
  ('me_eko',   'Министерство экологии, геологии и природных ресурсов',                            'МЭГПР'),
  ('mtsriap',  'Министерство цифрового развития, инноваций и аэрокосмической промышленности',     'МЦРИАП'),
  ('mti',      'Министерство торговли и интеграции',                                              'МТИ'),
  ('mtszn',    'Министерство труда и социальной защиты населения',                                'МТСЗН'),
  ('mnvo',     'Министерство науки и высшего образования',                                        'МНВО'),
  ('mfin',     'Министерство финансов',                                                           'МФ'),
  ('mobr',     'Министерство образования и науки',                                                'МОН'),
  ('mo',       'Министерство обороны',                                                            'МО'),
  ('knb',      'Комитет национальной безопасности',                                               'КНБ'),
  ('mne',      'Министерство национальной экономики',                                             'МНЭ')
ON CONFLICT (code) DO NOTHING;

-- ─── 2. Сырая привязка NGR → authority ──────────────────────────────
CREATE TABLE IF NOT EXISTS npa_authorities (
    ngr            VARCHAR(20) PRIMARY KEY,
    authority_code VARCHAR(20) REFERENCES authorities(code),
    raw_value      TEXT,
    created_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_npa_authorities_authority ON npa_authorities (authority_code);

-- ─── 3. Колонка в требованиях ───────────────────────────────────────
ALTER TABLE requirement_cards
    ADD COLUMN IF NOT EXISTS controller_authority VARCHAR(20)
    REFERENCES authorities(code);

CREATE INDEX IF NOT EXISTS idx_rc_authority         ON requirement_cards (controller_authority);
CREATE INDEX IF NOT EXISTS idx_rc_sphere_authority  ON requirement_cards (sphere_code, controller_authority);

-- ─── 4. Bridge user ↔ authority ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_authorities (
    user_id        INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    authority_code VARCHAR(20) NOT NULL REFERENCES authorities(code),
    assigned_at    TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, authority_code)
);

CREATE INDEX IF NOT EXISTS idx_user_authorities_authority ON user_authorities (authority_code);
CREATE INDEX IF NOT EXISTS idx_user_authorities_user      ON user_authorities (user_id);

COMMIT;
