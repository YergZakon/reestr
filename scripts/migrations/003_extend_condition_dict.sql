-- ─────────────────────────────────────────────────────────────────────
-- Migration 003: Расширение справочников применимости + subsphere_dict
-- Date: 2026-04-30
--
-- Что добавляем:
--  1. condition_dict — 3 новые оси:
--      transport_subtype  — морской/речной/авто/жд/авиа/городской
--      object_category    — медицина/образование/общепит/детсад/ОПО и т.п.
--      regulatory_trigger — рутина/проверка/предписание/авария/жалоба
--  2. subsphere_dict — каноничные подсферы для 3 MVP-сфер
--      (сейчас subsphere свободный VARCHAR; справочник нужен для
--       унификации, фильтров на дашборде и для исключения "санитарии"
--       из портала экологии).
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Новые оси в condition_dict ──────────────────────────────────
INSERT INTO condition_dict (axis, value, description) VALUES
    -- transport_subtype: для разделения видов транспорта
    ('transport_subtype', 'maritime',         'Морской транспорт (торговое мореплавание)'),
    ('transport_subtype', 'inland_waterway',  'Внутренний водный транспорт'),
    ('transport_subtype', 'automobile',       'Автомобильный транспорт'),
    ('transport_subtype', 'railway',          'Железнодорожный транспорт'),
    ('transport_subtype', 'aviation',         'Авиационный транспорт'),
    ('transport_subtype', 'urban_rail',       'Городской рельсовый транспорт'),
    ('transport_subtype', 'pipeline',         'Магистральный трубопровод'),

    -- object_category: для узкой применимости санитарных и отраслевых норм
    ('object_category', 'medical',           'Медицинская организация'),
    ('object_category', 'education_school',  'Школа / средняя организация образования'),
    ('object_category', 'education_kinder',  'Дошкольная организация (детский сад)'),
    ('object_category', 'food_service',      'Общепит (кафе, ресторан, столовая)'),
    ('object_category', 'food_production',   'Производство пищевой продукции'),
    ('object_category', 'meat_processing',   'Мясопереработка'),
    ('object_category', 'dairy_processing',  'Молокопереработка'),
    ('object_category', 'industrial_general','Промышленный объект общего назначения'),
    ('object_category', 'hazardous_facility','Опасный производственный объект (ОПО)'),
    ('object_category', 'oil_gas_facility',  'Объект нефтегазовой деятельности'),
    ('object_category', 'agricultural',      'Сельхозобъект (поле, ферма, теплица)'),
    ('object_category', 'pasture',           'Пастбище'),
    ('object_category', 'protected_area',    'Особо охраняемая природная территория'),
    ('object_category', 'waste_landfill',    'Полигон отходов'),
    ('object_category', 'water_body',        'Водный объект / прибрежная зона'),
    ('object_category', 'residential',       'Жилой / административный объект'),

    -- regulatory_trigger: что запускает применимость
    ('regulatory_trigger', 'routine_operation',     'Рутинная эксплуатация (по умолчанию)'),
    ('regulatory_trigger', 'planned_inspection',    'Плановая проверка'),
    ('regulatory_trigger', 'unplanned_inspection',  'Внеплановая проверка'),
    ('regulatory_trigger', 'prescription_received', 'Получено предписание об устранении'),
    ('regulatory_trigger', 'accident',              'Авария / инцидент'),
    ('regulatory_trigger', 'complaint',             'Жалоба третьих лиц'),
    ('regulatory_trigger', 'self_disclosure',       'Самостоятельное уведомление о нарушении'),
    ('regulatory_trigger', 'license_renewal',       'Продление/переоформление лицензии'),
    ('regulatory_trigger', 'temperature_above_25',  'Температура воздуха выше 25°С (для отдельных методик)')
ON CONFLICT (axis, value) DO NOTHING;

-- ─── 2. subsphere_dict — каноничные подсферы ────────────────────────
CREATE TABLE IF NOT EXISTS subsphere_dict (
    id           SERIAL PRIMARY KEY,
    sphere_code  VARCHAR(20) REFERENCES spheres(code),
    code         VARCHAR(50) NOT NULL,
    name_ru      TEXT NOT NULL,
    description  TEXT,
    -- порядок в UI; меньше = выше
    display_order INT DEFAULT 100,
    -- если TRUE — подсфера показывается на портале предпринимателя.
    -- Например, "санитария" в экологии — НЕ показывается в маршруте бизнеса.
    is_business_facing BOOLEAN DEFAULT TRUE,
    UNIQUE (sphere_code, code)
);

INSERT INTO subsphere_dict (sphere_code, code, name_ru, display_order, is_business_facing) VALUES
    -- ECOLOGY
    ('ecology', 'env_protection_general', 'Охрана окружающей среды (общие требования)',           10, TRUE),
    ('ecology', 'emissions',              'Выбросы в атмосферу',                                   20, TRUE),
    ('ecology', 'discharges',             'Сбросы в водные объекты',                               30, TRUE),
    ('ecology', 'waste_management',       'Обращение с отходами производства и потребления',       40, TRUE),
    ('ecology', 'medical_waste',          'Обращение с медицинскими отходами',                     50, TRUE),
    ('ecology', 'hazardous_substances',   'Опасные вещества (озоноразрушающие и т.п.)',            60, TRUE),
    ('ecology', 'protected_areas',        'Особо охраняемые природные территории',                 70, TRUE),
    ('ecology', 'wildlife',               'Охрана и использование животного мира',                 80, TRUE),
    ('ecology', 'forestry',               'Лесное хозяйство',                                      90, TRUE),
    ('ecology', 'water_use',              'Использование и охрана водного фонда',                 100, TRUE),
    ('ecology', 'subsoil_use',            'Недропользование и связанные требования',              110, TRUE),
    ('ecology', 'oil_spill_response',     'Реагирование на разливы нефти',                        120, TRUE),
    -- "Санитария" исторически попадает в ecology в исходных данных.
    -- На бизнес-портале её скрываем (это тема здравоохранения).
    ('ecology', 'sanitary_general',       'Санитарные правила (общие)',                           500, FALSE),
    ('ecology', 'sanitary_medical',       'Санитарные правила медучреждений',                     510, FALSE),
    ('ecology', 'sanitary_education',     'Санитарные правила образовательных организаций',       520, FALSE),
    ('ecology', 'sanitary_food',          'Санитарные правила пищевой промышленности и общепита', 530, FALSE),

    -- TRANSPORT
    ('transport', 'maritime',           'Торговое мореплавание',                                  10, TRUE),
    ('transport', 'inland_waterway',    'Внутренний водный транспорт',                            20, TRUE),
    ('transport', 'automobile',         'Автомобильный транспорт',                                30, TRUE),
    ('transport', 'railway',            'Железнодорожный транспорт',                              40, TRUE),
    ('transport', 'aviation',           'Гражданская авиация',                                    50, TRUE),
    ('transport', 'urban_rail',         'Городской рельсовый транспорт',                          60, TRUE),
    ('transport', 'pipeline',           'Магистральный трубопровод',                              70, TRUE),
    ('transport', 'cross_border',       'Международные перевозки',                                80, TRUE),
    ('transport', 'dangerous_goods',    'Перевозка опасных грузов',                               90, TRUE),
    ('transport', 'driver_training',    'Подготовка специалистов транспорта',                    100, TRUE),

    -- LAND
    ('land', 'land_use_general',        'Земельные отношения (общие)',                            10, TRUE),
    ('land', 'agricultural_land',       'Земли сельскохозяйственного назначения',                 20, TRUE),
    ('land', 'pastures',                'Пастбища',                                                30, TRUE),
    ('land', 'land_reclamation',        'Рекультивация и охрана земель',                          40, TRUE),
    ('land', 'change_of_purpose',       'Изменение целевого назначения участка',                  50, TRUE),
    ('land', 'geodesy_cartography',     'Геодезия и картография',                                 60, TRUE),
    ('land', 'land_lease',              'Аренда земельных участков',                              70, TRUE),
    ('land', 'land_acquisition',        'Приобретение прав на земельные участки',                 80, TRUE)
ON CONFLICT (sphere_code, code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_subsphere_sphere   ON subsphere_dict(sphere_code);
CREATE INDEX IF NOT EXISTS idx_subsphere_business ON subsphere_dict(is_business_facing);

-- ─── 3. Удобное представление: подсфера + сколько карточек ──────────
CREATE OR REPLACE VIEW v_subsphere_card_count AS
SELECT
    sd.sphere_code,
    sd.code           AS subsphere_code,
    sd.name_ru        AS subsphere_name,
    sd.is_business_facing,
    sd.display_order,
    COUNT(rc.id)      AS cards_count,
    SUM(CASE WHEN rc.role_fragment IN
        ('обязанность бизнеса','запрет','условие допуска','документ для заявления','доказательство исполнения')
        THEN 1 ELSE 0 END) AS business_facing_cards
FROM subsphere_dict sd
LEFT JOIN requirement_cards rc
    ON rc.sphere_code = sd.sphere_code
   AND rc.subsphere ILIKE '%' || sd.name_ru || '%'   -- мягкое сопоставление по имени
GROUP BY sd.sphere_code, sd.code, sd.name_ru, sd.is_business_facing, sd.display_order
ORDER BY sd.sphere_code, sd.display_order;

COMMIT;
