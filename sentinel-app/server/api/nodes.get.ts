import { getDbPool, getMockNodes } from '../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  
  // App Security: Validate and sanitize query parameters
  let search = '';
  if (typeof query.search === 'string') {
    // Limit search to 100 characters and sanitize to alphanumeric, spaces, and hyphens/underscores
    search = query.search.slice(0, 100).replace(/[^\w\s\-_]/g, '');
  }
  
  let page = parseInt(query.page as string) || 1;
  if (page < 1) page = 1;
  
  let limit = parseInt(query.limit as string) || 6;
  if (limit < 1) limit = 6;
  if (limit > 50) limit = 50; // Prevent Denials of Service (DoS) from requesting huge limits
  
  const offset = (page - 1) * limit;
  
  const pool = getDbPool();
  if (!pool) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    });
  }
  
  try {
    let sql = `
      SELECT 
        d.id, 
        d.node_id, 
        d.name, 
        d.location, 
        d.latitude::float as latitude, 
        d.longitude::float as longitude, 
        d.created_at, 
        d.updated_at,
        (t.metrics->'telemetry'->>'tds')::float as tds,
        (t.metrics->'telemetry'->>'temperature')::float as temperature,
        t.time as telemetry_time
      FROM devices d
      LEFT JOIN LATERAL (
        SELECT sub.metrics, sub.time
        FROM device_telemetry sub
        WHERE sub.id = d.id
        ORDER BY sub.time DESC
        LIMIT 1
      ) t ON true
    `;
    
    const params: any[] = [];
    if (search) {
      sql += ` WHERE d.name ILIKE $1 OR d.location ILIKE $1`;
      params.push(`%${search}%`);
    }
    
    // Count total rows for pagination summary
    let countSql = `SELECT COUNT(*) FROM devices d`;
    if (search) {
      countSql += ` WHERE d.name ILIKE $1 OR d.location ILIKE $1`;
    }
    const countResult = await pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Append pagination controls via parameterized variables (prevents SQL injection)
    sql += ` ORDER BY d.name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(sql, params);
    
    const nodes = result.rows.map(row => {
      const telemetryTime = row.telemetry_time ? new Date(row.telemetry_time) : null;
      // Define active status: within the last 5 minutes (300000ms)
      const isOnline = telemetryTime && (new Date().getTime() - telemetryTime.getTime() < 300000);
      
      return {
        id: row.id,
        node_id: row.node_id,
        name: row.name,
        location: row.location,
        latitude: row.latitude,
        longitude: row.longitude,
        created_at: row.created_at,
        updated_at: row.updated_at,
        telemetry: {
          tds: row.tds !== null ? parseFloat(row.tds.toFixed(1)) : null,
          temperature: row.temperature !== null ? parseFloat(row.temperature.toFixed(1)) : null,
          time: telemetryTime,
          status: isOnline ? 'online' : 'offline'
        }
      };
    });
    
    return {
      nodes,
      total
    };
  } catch (err: any) {
    console.error('Database query error:', err.message);
    // App Security: Hide database exceptions from the user to prevent leak of schema metadata
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Database Error',
    });
  }
});
