-- 043: обратная связь бизнеса v2 — публичный реестр регуляторных проблем (Ф0, 2026-08-19).
-- План: требования/docs/ПЛАН_ОБРАТНАЯ_СВЯЗЬ_БИЗНЕСА.md. Цикл: проблема → проверка →
-- мотивированное решение («исполнить или объяснить») → изменение → контроль результата.
-- Модель: issue (агрегат) / submission (кейс) / support (поддержка, 1 субъект = 1 на issue)
-- / evidence (вложения) / decision (структурированная позиция) / action (мероприятие)
-- / status_history (append-only). MVP: только БИН юрлиц, ИИН не собираем.

-- ── Справочник A: условия ст. 81-1 Предпринимательского кодекса РК ──
CREATE TABLE IF NOT EXISTS biz_legal_ground (
    id        SMALLINT PRIMARY KEY,
    code      TEXT UNIQUE NOT NULL,
    title_ru  TEXT NOT NULL,
    title_kk  TEXT NOT NULL,
    sort      SMALLINT NOT NULL
);
INSERT INTO biz_legal_ground (id, code, title_ru, title_kk, sort) VALUES
 (1,'validity','Обоснованность','Негізділік',1),
 (2,'equality','Равенство','Теңдік',2),
 (3,'openness','Открытость','Ашықтық',3),
 (4,'feasibility','Исполнимость','Орындалу мүмкіндігі',4),
 (5,'certainty','Определённость','Айқындық',5),
 (6,'proportionality','Соразмерность и рациональность','Мөлшерлестік және ұтымдылық',6),
 (7,'consistency','Последовательность и предсказуемость','Дәйектілік және болжамдылық',7)
ON CONFLICT (id) DO NOTHING;

-- ── Справочник B: практическая проблема ──
CREATE TABLE IF NOT EXISTS biz_problem_type (
    id        SMALLINT PRIMARY KEY,
    code      TEXT UNIQUE NOT NULL,
    title_ru  TEXT NOT NULL,
    title_kk  TEXT NOT NULL,
    sort      SMALLINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO biz_problem_type (id, code, title_ru, title_kk, sort) VALUES
 (1,'duplicate','Дублирует другое требование','Басқа талапты қайталайды',1),
 (2,'expired','Основано на утратившем силу или изменённом НПА','Күшін жойған немесе өзгертілген НҚА-ға негізделген',2),
 (3,'excessive','Избыточно: затраты несоразмерны цели','Шамадан тыс: шығындар мақсатқа мөлшерлес емес',3),
 (4,'tech_outdated','Технологически устарело','Технологиялық тұрғыдан ескірген',4),
 (5,'contradicts','Противоречит другому требованию или НПА','Басқа талапқа немесе НҚА-ға қайшы',5),
 (6,'impossible','Невыполнимо на практике','Іс жүзінде орындалмайды',6),
 (7,'not_applicable','Не относится к моей деятельности','Менің қызметіме қатысы жоқ',7),
 (8,'unclear','Формулировка непонятна или двусмысленна','Тұжырым түсініксіз немесе екіұшты',8),
 (9,'redundant_data','Повторное представление данных, уже имеющихся у государства','Мемлекетте бар деректерді қайта ұсыну',9),
 (10,'regional_variance','Различная практика региональных органов','Өңірлік органдар практикасының әртүрлілігі',10),
 (11,'extra_documents','Требуют документы, не предусмотренные НПА','НҚА-да көзделмеген құжаттарды талап етеді',11),
 (12,'competence_conflict','Конфликт компетенции нескольких органов','Бірнеше органның құзырет қақтығысы',12),
 (13,'digital_process','Проблема в цифровой системе или административном процессе','Цифрлық жүйедегі немесе әкімшілік процестегі мәселе',13),
 (14,'no_risk_approach','Отсутствует риск-ориентированный подход','Тәуекелге бағдарланған тәсіл жоқ',14),
 (15,'innovation_barrier','Барьер для новой технологии или бизнес-модели','Жаңа технологияға немесе бизнес-модельге кедергі',15),
 (16,'reporting_frequency','Чрезмерная периодичность отчётности','Есептіліктің шамадан тыс мерзімділігі',16),
 (17,'goal_not_achieved','Цель регулирования фактически не достигается','Реттеу мақсатына іс жүзінде қол жеткізілмейді',17),
 (18,'inactive_oked','Применяется к неактивному вторичному ОКЭД','Пайдаланылмайтын қосалқы ЭҚЖЖ-ге қолданылады',18),
 (19,'other','Иное','Өзге',19)
ON CONFLICT (id) DO NOTHING;

-- ── Справочник C: желаемый результат ──
CREATE TABLE IF NOT EXISTS biz_outcome_type (
    id        SMALLINT PRIMARY KEY,
    code      TEXT UNIQUE NOT NULL,
    title_ru  TEXT NOT NULL,
    title_kk  TEXT NOT NULL,
    sort      SMALLINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO biz_outcome_type (id, code, title_ru, title_kk, sort) VALUES
 (1,'repeal','Отменить требование','Талапты алып тастау',1),
 (2,'amend','Изменить требование','Талапты өзгерту',2),
 (3,'clarify','Разъяснить применение','Қолданылуын түсіндіру',3),
 (4,'unify','Унифицировать практику','Практиканы біріздендіру',4),
 (5,'digitize','Перевести в цифровой формат','Цифрлық форматқа көшіру',5),
 (6,'gov_data','Получать сведения из государственного ресурса','Мәліметтерді мемлекеттік ресурстан алу',6),
 (7,'risk_based','Применять только к высокой категории риска','Тек жоғары тәуекел санатына қолдану',7),
 (8,'merge_procedures','Объединить процедуры нескольких органов','Бірнеше орган рәсімдерін біріктіру',8),
 (9,'pilot','Провести пилот или регуляторный эксперимент','Пилот немесе реттеушілік эксперимент өткізу',9),
 (10,'fix_addressing','Исправить адресацию требования','Талаптың бағытталуын түзету',10)
ON CONFLICT (id) DO NOTHING;

-- ── Справочник субъектов БИН→ОКЭД (файл заказчика; MVP только БИН ЮЛ) ──
CREATE TABLE IF NOT EXISTS biz_subject_oked (
    bin              TEXT PRIMARY KEY CHECK (bin ~ '^[0-9]{12}$'),
    name             TEXT,
    oked_main        TEXT,
    okeds_secondary  TEXT[] NOT NULL DEFAULT '{}',
    source           TEXT,
    loaded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Проблема (агрегат) ──
CREATE TABLE IF NOT EXISTS biz_issue (
    id              BIGSERIAL PRIMARY KEY,
    requirement_id  BIGINT REFERENCES requirement_registry(id),
    title           TEXT,
    issue_kind      TEXT CHECK (issue_kind IN ('norm','practice','digital')),
    lead_authority  TEXT,
    co_authorities  TEXT[] NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'registered'
                    CHECK (status IN ('registered','triaged','in_review','decided',
                                      'action_planned','implemented','verified','reopened','merged')),
    decision_kind   TEXT CHECK (decision_kind IN ('accepted','partial','rejected')),
    merged_into     BIGINT REFERENCES biz_issue(id),
    sla_due         DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_issue_status_idx ON biz_issue (status);
CREATE INDEX IF NOT EXISTS biz_issue_lead_idx ON biz_issue (lead_authority, status);
CREATE INDEX IF NOT EXISTS biz_issue_req_idx ON biz_issue (requirement_id);

-- ── Кейс (конкретный практический случай) ──
CREATE TABLE IF NOT EXISTS biz_submission (
    id                      BIGSERIAL PRIMARY KEY,
    issue_id                BIGINT NOT NULL REFERENCES biz_issue(id),
    requirement_id          BIGINT REFERENCES requirement_registry(id),
    bin                     TEXT NOT NULL CHECK (bin ~ '^[0-9]{12}$'),
    registry_matched        BOOLEAN NOT NULL DEFAULT false,
    representative_verified BOOLEAN NOT NULL DEFAULT false,
    legal_grounds           SMALLINT[] NOT NULL CHECK (cardinality(legal_grounds) >= 1),
    problem_types           SMALLINT[] NOT NULL CHECK (cardinality(problem_types) >= 1),
    outcome_id              SMALLINT REFERENCES biz_outcome_type(id),
    case_text               TEXT CHECK (char_length(case_text) <= 4000),
    contact_email           TEXT,
    track_code              TEXT UNIQUE NOT NULL,
    ip_hmac                 TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_submission_issue_idx ON biz_submission (issue_id);
CREATE INDEX IF NOT EXISTS biz_submission_ip_idx ON biz_submission (ip_hmac, created_at);

-- ── Поддержка (1 субъект = 1 на проблему; дубль публично не раскрывается) ──
CREATE TABLE IF NOT EXISTS biz_support (
    issue_id         BIGINT NOT NULL REFERENCES biz_issue(id),
    bin              TEXT NOT NULL CHECK (bin ~ '^[0-9]{12}$'),
    registry_matched BOOLEAN NOT NULL DEFAULT false,
    ip_hmac          TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (issue_id, bin)
);
CREATE INDEX IF NOT EXISTS biz_support_ip_idx ON biz_support (ip_hmac, created_at);

-- ── Доказательства (вложения; bytea вне списочных SELECT) ──
CREATE TABLE IF NOT EXISTS biz_evidence (
    id            BIGSERIAL PRIMARY KEY,
    submission_id BIGINT NOT NULL REFERENCES biz_submission(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    mime          TEXT NOT NULL,
    size_bytes    INT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    content       BYTEA NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_evidence_sub_idx ON biz_evidence (submission_id);

-- ── Мотивированная позиция органа («исполнить или объяснить») ──
CREATE TABLE IF NOT EXISTS biz_decision (
    id                   BIGSERIAL PRIMARY KEY,
    issue_id             BIGINT NOT NULL REFERENCES biz_issue(id),
    goal_public_interest TEXT,
    legal_basis          TEXT,
    facts_confirmed      BOOLEAN,
    ground_violated      SMALLINT REFERENCES biz_legal_ground(id),
    subjects_affected    INT,
    cost_estimate        TEXT,
    alternatives         TEXT,
    decision             TEXT NOT NULL CHECK (decision IN ('accepted','partial','rejected')),
    rejection_reason     TEXT,
    npa_draft_url        TEXT,
    next_review_date     DATE,
    decided_by           INT REFERENCES users(id),
    decided_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT biz_decision_reject_reason CHECK (decision <> 'rejected' OR rejection_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS biz_decision_issue_idx ON biz_decision (issue_id);

-- ── Мероприятие по изменению ──
CREATE TABLE IF NOT EXISTS biz_action (
    id              BIGSERIAL PRIMARY KEY,
    issue_id        BIGINT NOT NULL REFERENCES biz_issue(id),
    kind            TEXT NOT NULL CHECK (kind IN ('npa_change','practice','digital','org')),
    description     TEXT NOT NULL,
    responsible     TEXT,
    due_date        DATE,
    npa_draft_url   TEXT,
    done_at         DATE,
    result_note     TEXT,
    verified_effect TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_action_issue_idx ON biz_action (issue_id);

-- ── История движения (append-only: приложение не делает UPDATE/DELETE) ──
CREATE TABLE IF NOT EXISTS biz_status_history (
    id          BIGSERIAL PRIMARY KEY,
    issue_id    BIGINT NOT NULL REFERENCES biz_issue(id),
    from_status TEXT,
    to_status   TEXT NOT NULL,
    actor       INT REFERENCES users(id),
    note        TEXT,
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS biz_history_issue_idx ON biz_status_history (issue_id);

INSERT INTO schema_migrations (version, filename, checksum, note)
VALUES (43, '043_biz_feedback.sql', md5('043_biz_feedback_v2'),
        'реестр регуляторных проблем v2: issue/submission/support/evidence/decision/action/history + справочники ст.81-1')
ON CONFLICT (version) DO NOTHING;
