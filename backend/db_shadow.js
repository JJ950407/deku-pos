// backend/db_shadow.js
const mysql = require('mysql2/promise');

let pool = null;

function isEnabled() {
  return String(process.env.SHADOW_WRITE_ENABLED || '0') === '1';
}

async function getPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'deku_pos',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  return pool;
}

function toDate(val) {
  if (!val) return null;
  const d = (val instanceof Date) ? val : new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toCents(n) {
  if (n === null || n === undefined || n === '') return null;
  const x = Number(n);
  if (Number.isNaN(x)) return null;
  return Math.round(x * 100);
}

async function shadowWriteOrder(order, itemsRows) {
  if (!isEnabled()) return { ok: false, skipped: true };

  try {
    const p = await getPool();

    const orderId = String(order.id || order.orderId || '');
    if (!orderId) return { ok: false, skipped: true, reason: 'missing orderId' };

    const createdAt = toDate(order.createdAt);
    const paidAt = toDate(order.paidAt);
    const tableName = order.table || order.tableName || null;

    const tableNumber = (order.table !== undefined && order.table !== null && order.table !== '') ? Number(order.table) : null;
    const total =
      order &&
      order.totals &&
      typeof order.totals.total === "number"
        ? Number(order.totals.total)
        : null;
    const totalDecimal = Number.isNaN(total) ? null : total;

    await p.execute(
      `INSERT INTO orders (external_id, is_test, table_number, total, status, created_at, updated_at)
       VALUES (?, 0, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
       ON DUPLICATE KEY UPDATE
         table_number=VALUES(table_number),
         total=VALUES(total),
         status=VALUES(status),
         updated_at=COALESCE(VALUES(updated_at), CURRENT_TIMESTAMP)`,
      [
        orderId,
        Number.isNaN(tableNumber) ? null : tableNumber,
        totalDecimal,
        String(order.status || 'paid'),
        createdAt ? createdAt : null,
        paidAt ? paidAt : null
      ]
    );

    if (Array.isArray(itemsRows) && itemsRows.length) {
      await p.execute(`DELETE FROM order_items WHERE orderId=?`, [orderId]);

      const placeholders = itemsRows.map(() => `(?,?,?,?,?,?,?,?,?,?,?,?,?)`).join(',');
      const values = [];

      for (const r of itemsRows) {
        values.push(
          orderId,
          r.lineType || 'item',
          r.productId || null,
          r.parentProductId || null,
          r.name || '',
          Number(r.qty || 1),
          toCents(r.unitPrice),
          toCents(r.lineTotal),
          r.size || null,
          r.spicy || null,
          createdAt,
          paidAt,
          tableName
        );
      }

      await p.execute(
        `INSERT INTO order_items
         (orderId, lineType, productId, parentProductId, name, qty, unitPriceCents, lineTotalCents, size, spicy, createdAt, paidAt, tableName)
         VALUES ${placeholders}`,
        values
      );
    }

    return { ok: true };
  } catch (err) {
    console.error('[shadow-write] failed:', err && err.message ? err.message : err);
    return { ok: false, error: true };
  }
}

module.exports = { shadowWriteOrder };
