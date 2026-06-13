import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("railway") ? { rejectUnauthorized: false } : undefined,
});

async function run() {
  const client = await pool.connect();
  try {
    // Ensure sphere column exists on requirements
    await client.query(
      "ALTER TABLE requirements ADD COLUMN IF NOT EXISTS sphere VARCHAR(30) DEFAULT 'land'"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_requirements_sphere ON requirements(sphere)"
    );
    // Also keep sphere on npa_documents for reference
    await client.query(
      "ALTER TABLE npa_documents ADD COLUMN IF NOT EXISTS sphere VARCHAR(30) DEFAULT 'land'"
    );

    // Get or create iteration
    const iterRes = await client.query("SELECT id FROM iterations WHERE iteration_number = 1");
    let iterationId;
    if (iterRes.rows.length > 0) {
      iterationId = iterRes.rows[0].id;
    } else {
      const newIter = await client.query(
        "INSERT INTO iterations (iteration_number, status, description) VALUES (1, 'active', 'Первичная экспертиза') RETURNING id"
      );
      iterationId = newIter.rows[0].id;
    }
    console.log(`Using iteration id=${iterationId}`);

    // Clear previously loaded ecology/transport requirements for clean re-seed
    const deleted = await client.query(
      "DELETE FROM requirements WHERE sphere IN ('ecology', 'transport')"
    );
    if (deleted.rowCount > 0) {
      console.log(`Cleared ${deleted.rowCount} existing ecology/transport requirements`);
    }

    // Files to load
    const files = [
      path.resolve(__dirname, "../requirements_transport.json"),
      path.resolve(__dirname, "../requirements_ecology.json"),
    ];

    let totalLoaded = 0;

    for (const filePath of files) {
      if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}, skipping`);
        continue;
      }

      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const sphere = data.metadata?.sphere || "unknown";
      const requirements = data.requirements || [];
      console.log(`\nLoading ${requirements.length} requirements from sphere "${sphere}"...`);

      // Collect unique NPAs
      const npaMap = new Map();
      const uniqueNpas = new Set();
      for (const r of requirements) {
        if (r.npa_title) uniqueNpas.add(r.npa_title);
      }

      for (const title of uniqueNpas) {
        const code = title.substring(0, 50).replace(/[^a-zA-Zа-яА-Я0-9_\-]/g, "_");
        const res = await client.query(
          `INSERT INTO npa_documents (code, title, category)
           VALUES ($1, $2, 'закон')
           ON CONFLICT (code) DO UPDATE SET title = $2
           RETURNING id`,
          [code, title]
        );
        npaMap.set(title, res.rows[0].id);
      }
      console.log(`  ${npaMap.size} NPA documents created/updated`);

      // Insert requirements with sphere set on the requirement itself
      let loaded = 0;
      for (const r of requirements) {
        const npaTitle = r.npa_title;
        const npaId = npaMap.get(npaTitle) || null;

        await client.query(
          `INSERT INTO requirements
            (iteration_id, npa_document_id, external_id, category, text_original,
             text_summary, article_ref, subject, confidence, detection_method, admin_status, sphere)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            iterationId,
            npaId,
            r.id || null,
            r.category || "OBL",
            r.text || "",
            r.summary || null,
            r.article_ref || null,
            r.subject || "ВСЕ",
            "high",
            "claude_analysis",
            "active",
            sphere,
          ]
        );
        loaded++;
      }
      console.log(`  ${loaded} requirements loaded`);
      totalLoaded += loaded;
    }

    // Stats
    const bySphere = await client.query(`
      SELECT sphere, COUNT(*) as count
      FROM requirements
      WHERE admin_status = 'active'
      GROUP BY sphere
      ORDER BY count DESC
    `);

    console.log(`\nDONE: ${totalLoaded} new requirements loaded`);
    console.log("By sphere:");
    for (const row of bySphere.rows) {
      console.log(`  ${row.sphere}: ${row.count}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
