import mysql from "mysql2/promise";

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 8889,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "root",
  database: process.env.DB_NAME || "nawaratrend",
  waitForConnections: true,
  connectionLimit: 10,
});

export const testConnection = async () => {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
};
