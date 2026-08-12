import assert from "node:assert/strict";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error("SUPABASE_DB_URL wajib diisi untuk verifikasi Gudang.");

const sql = postgres(databaseUrl, { max: 1 });
const payload = {
  inventory: {
    "Sensor Suhu Udara": [{
      id: "item-1",
      brand: "Vaisala",
      model: "HMP155",
      quantity: 1,
      functionCategories: ["Sensor Suhu Udara", "Sensor Kelembaban Udara"],
      units: [{ id: "physical-unit-1" }],
    }],
  },
};

try {
  const [summary] = await sql`
    select * from public.submission_warehouse_summary(${sql.json(payload)}::jsonb)
  `;
  const [temperature] = await sql`
    select public.submission_item_is_filled(
      ${sql.json(payload)}::jsonb,
      'Sensor Suhu Udara'
    ) as filled
  `;
  const [humidity] = await sql`
    select public.submission_item_is_filled(
      ${sql.json(payload)}::jsonb,
      'Sensor Kelembaban Udara'
    ) as filled
  `;
  assert.deepEqual(
    { categoryCount: summary.category_count, unitCount: summary.unit_count },
    { categoryCount: 2, unitCount: 1 },
  );
  assert.equal(temperature.filled, true);
  assert.equal(humidity.filled, true);
  console.log("Verifikasi SQL Gudang lulus: 1 unit fisik, 2 kategori fungsi.");
} finally {
  await sql.end();
}
