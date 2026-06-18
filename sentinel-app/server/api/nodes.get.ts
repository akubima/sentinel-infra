import { getDbPool, getMockNodes } from '../utils/db';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  
  // App Security: Validate and sanitize query parameters
  let search = '';
  if (typeof query.search === 'string') {
    // Limit search to 100 characters and sanitize to alphanumeric, spaces, and hyphens/underscores
    search = query.search.slice(0, 100).replace(/[^\w\s\-_]/g, '');
  }

  const status = query.status === 'online' ? 'online' : '';
  
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
        d.name, 
        d.location, 
        d.latitude::float as latitude,
        d.longitude::float as longitude,
        (t.metrics->'telemetry'->>'tds')::float as tds,
        (t.metrics->'telemetry'->>'temperature')::float as temperature,
        t.time as telemetry_time,
        (t.time >= NOW() - INTERVAL '30 seconds') as is_online
      FROM devices d
      LEFT JOIN LATERAL (
        SELECT sub.metrics, sub.time
        FROM device_telemetry sub
        WHERE sub.id = d.id AND sub.time >= NOW() - INTERVAL '7 days'
        ORDER BY sub.time DESC
        LIMIT 1
      ) t ON true
    `;
    
    const params: any[] = [];
    const whereClauses: string[] = [];
    
    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(d.name ILIKE $${params.length} OR d.location ILIKE $${params.length})`);
    }
    
    if (status === 'online') {
      whereClauses.push(`t.time >= NOW() - INTERVAL '30 seconds'`);
    }
    
    if (whereClauses.length > 0) {
      sql += ` WHERE ` + whereClauses.join(' AND ');
    }
    
    // Count total rows for pagination summary
    let countSql = `
      SELECT COUNT(*) 
      FROM devices d
      LEFT JOIN LATERAL (
        SELECT sub.time
        FROM device_telemetry sub
        WHERE sub.id = d.id AND sub.time >= NOW() - INTERVAL '7 days'
        ORDER BY sub.time DESC
        LIMIT 1
      ) t ON true
    `;
    if (whereClauses.length > 0) {
      countSql += ` WHERE ` + whereClauses.join(' AND ');
    }
    const countResult = await pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Append pagination controls via parameterized variables (prevents SQL injection)
    sql += ` ORDER BY d.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(sql, params);
    
    const nodes = result.rows.map(row => {
      const telemetryTime = row.telemetry_time ? new Date(row.telemetry_time) : null;
      const isOnline = row.is_online === true;
      
      return {
        id: row.id,
        name: row.name,
        location: row.location,
        latitude: row.latitude,
        longitude: row.longitude,
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
