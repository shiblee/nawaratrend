/* Permanent product codes (NT-01, NT-02, …). A product gets the next number once, the first time it's seen,
   and keeps it whatever happens to its category or position. Numbers are never reused, even after a delete. */
import { pool } from "../config/db.js";

export const productCode = (n) => (n ? `NT-${String(n).padStart(2, "0")}` : undefined);

/** Gives a code to every product that doesn't have one yet (oldest first), however it was added. */
export async function assignProductCodes() {
  const [rows] = await pool.query("SELECT id FROM products WHERE code_no IS NULL ORDER BY id");
  for (const { id } of rows) {
    // atomic: two requests at once can never get the same number
    const [r] = await pool.query("UPDATE counters SET value = LAST_INSERT_ID(value + 1) WHERE name = 'product_code'");
    await pool.query("UPDATE products SET code_no = ?, updated_at = updated_at WHERE id = ? AND code_no IS NULL", [r.insertId, id]);
  }
  return rows.length;
}
