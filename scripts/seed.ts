/**
 * Загрузка данных в PostgreSQL:
 * - Создание таблиц
 * - 5 пользователей (admin + 4 эксперта)
 * - НПА документы
 * - 907 требований из requirements_approved.json
 *
 * Запуск: npx tsx scripts/seed.ts
 * Требуется: DATABASE_URL в .env
 */
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL не задан. Установите в .env");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes("railway") ? { rejectUnauthorized: false } : undefined });

async function run() {
  const client = await pool.connect();
  try {
    // 1. Создание таблиц
    console.log("📦 Создание таблиц...");
    const schemaSQL = fs.readFileSync(path.join(__dirname, "init-db.sql"), "utf-8");
    await client.query(schemaSQL);
    console.log("  ✓ Таблицы созданы");

    // 2. Пользователи
    console.log("👥 Создание пользователей...");
    const users = [
      { username: "admin", password: "admin_npa2026!", fullName: "Администратор", role: "admin" },
      { username: "expert_1", password: "expert1_npa2026!", fullName: "Эксперт 1", role: "expert" },
      { username: "expert_2", password: "expert2_npa2026!", fullName: "Эксперт 2", role: "expert" },
      { username: "expert_3", password: "expert3_npa2026!", fullName: "Эксперт 3", role: "expert" },
      { username: "expert_4", password: "expert4_npa2026!", fullName: "Эксперт 4", role: "expert" },
    ];

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await client.query(
        `INSERT INTO users (username, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING`,
        [u.username, hash, u.fullName, u.role]
      );
    }
    console.log("  ✓ 5 пользователей создано");

    // 3. Итерация
    console.log("🔄 Создание итерации 1...");
    const iterRes = await client.query(
      `INSERT INTO iterations (iteration_number, status, description)
       VALUES (1, 'active', 'Первичная экспертиза: 907 требований из 15 НПА')
       ON CONFLICT DO NOTHING RETURNING id`
    );
    let iterationId: number;
    if (iterRes.rows.length > 0) {
      iterationId = iterRes.rows[0].id;
    } else {
      const existing = await client.query("SELECT id FROM iterations WHERE iteration_number = 1");
      iterationId = existing.rows[0].id;
    }
    console.log(`  ✓ Итерация #1, id=${iterationId}`);

    // 4. Загрузка НПА и требований
    console.log("📄 Загрузка требований...");
    const dataPath = path.resolve(__dirname, "../../npa-pipeline/output/requirements_approved.json");

    if (!fs.existsSync(dataPath)) {
      console.error(`❌ Файл не найден: ${dataPath}`);
      console.log("   Ожидается: npa-pipeline/output/requirements_approved.json");
      process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
    const requirements = data.requirements;
    console.log(`  Найдено ${requirements.length} требований`);

    // Собираем уникальные НПА
    const npaMap = new Map<string, number>();
    const uniqueNpa = new Set<string>();
    for (const r of requirements) {
      const title = r.npa_title || "Неизвестный НПА";
      uniqueNpa.add(title);
    }

    for (const title of uniqueNpa) {
      const code = title.substring(0, 50).replace(/[^a-zA-Zа-яА-Я0-9_\-]/g, "_");
      const res = await client.query(
        `INSERT INTO npa_documents (code, title, category)
         VALUES ($1, $2, 'приказ')
         ON CONFLICT (code) DO UPDATE SET title = $2
         RETURNING id`,
        [code, title]
      );
      npaMap.set(title, res.rows[0].id);
    }
    console.log(`  ✓ ${npaMap.size} НПА загружено`);

    // Загружаем требования пачками
    let loaded = 0;
    for (const r of requirements) {
      const npaTitle = r.npa_title || "Неизвестный НПА";
      const npaId = npaMap.get(npaTitle) || 1;

      await client.query(
        `INSERT INTO requirements
          (iteration_id, npa_document_id, external_id, category, text_original,
           text_summary, article_ref, subject, expert_category, confidence,
           detection_method, admin_status, admin_reject_reason, gold_standard_id, gold_standard_title)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          iterationId,
          npaId,
          r.id || null,
          r.category || "OBL",
          r.text || r.gold_standard_text || "",
          r.gold_standard_title || null,
          r.article_ref || null,
          r.subject || null,
          r.expert_category || null,
          r.confidence || "medium",
          r.detection_method || "regex",
          r.admin_status || "active",
          r.admin_reject_reason || null,
          r.gold_standard_id || null,
          r.gold_standard_title || null,
        ]
      );
      loaded++;
      if (loaded % 100 === 0) console.log(`  ... ${loaded}/${requirements.length}`);
    }
    console.log(`  ✓ ${loaded} требований загружено`);

    // Итоговая статистика
    const stats = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM npa_documents) as npas,
        (SELECT COUNT(*) FROM requirements WHERE admin_status = 'active') as active_reqs,
        (SELECT COUNT(*) FROM iterations) as iterations
    `);
    console.log("\n✅ ГОТОВО:");
    console.log(`   Пользователи: ${stats.rows[0].users}`);
    console.log(`   НПА: ${stats.rows[0].npas}`);
    console.log(`   Требования: ${stats.rows[0].active_reqs}`);
    console.log(`   Итерации: ${stats.rows[0].iterations}`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("❌ Ошибка:", err);
  process.exit(1);
});
