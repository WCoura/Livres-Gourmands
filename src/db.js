import mysql from 'mysql2/promise';
import { getConfig } from './config.js';

let pool;

export function getPool() {
  if (!pool) {
    const { db } = getConfig();
    pool = mysql.createPool({
      ...db,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: false,
      decimalNumbers: false,
      dateStrings: true,
      timezone: 'Z',
    });
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}

export async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
