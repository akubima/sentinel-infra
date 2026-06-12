import { getDbPool, getMockNodeDetails } from '../../utils/db';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  
  // App Security: Validate path parameter format (restrict to standard alphanumeric/hyphens/underscores)
  if (!id || typeof id !== 'string' || !/^[A-Za-z0-9\-_]{1,50}$/.test(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Node Identifier',
    });
  }
  
  const pool = getDbPool();
  if (!pool) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    });
  }
  
  try {
    // 1. Fetch node metadata and latest telemetry via parameterized query
    const nodeQuery = `
      SELECT 
        d.id, 
        d.name, 
        d.location, 
        d.latitude::float as latitude, 
        d.longitude::float as longitude, 
        (t.metrics->'telemetry'->>'tds')::float as tds,
        (t.metrics->'telemetry'->>'temperature')::float as temperature,
        (t.metrics->'sensor_status'->>'TDS')::boolean as tds_connected,
        (t.metrics->'sensor_status'->>'DS18B20')::boolean as temp_connected,
        t.time as telemetry_time
      FROM devices d
      LEFT JOIN LATERAL (
        SELECT sub.metrics, sub.time
        FROM device_telemetry sub
        WHERE sub.id = d.id AND sub.time >= NOW() - INTERVAL '7 days'
        ORDER BY sub.time DESC
        LIMIT 1
      ) t ON true
      WHERE d.id = $1 OR d.node_id = $1
    `;
    
    const nodeResult = await pool.query(nodeQuery, [id]);
    if (nodeResult.rows.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Node Not Found',
      });
    }
    
    const row = nodeResult.rows[0];
    const telemetryTime = row.telemetry_time ? new Date(row.telemetry_time) : null;
    const isOnline = telemetryTime && (new Date().getTime() - telemetryTime.getTime() < 300000); // 5 minutes threshold
    
    const nodeData = {
      id: row.id,
      name: row.name,
      location: row.location,
      latitude: row.latitude,
      longitude: row.longitude,
      telemetry: {
        tds: row.tds !== null ? parseFloat(row.tds.toFixed(1)) : null,
        temperature: row.temperature !== null ? parseFloat(row.temperature.toFixed(1)) : null,
        time: telemetryTime,
        status: isOnline ? 'online' : 'offline',
        sensorStatus: {
          tds: row.tds_connected,
          temp: row.temp_connected
        }
      }
    };
    
    // 2. Fetch history for the last 60 minutes using parameterized query for security
    const historyQuery = `
      SELECT 
        time,
        (metrics->'telemetry'->>'tds')::float as tds,
        (metrics->'telemetry'->>'temperature')::float as temperature
      FROM device_telemetry
      WHERE id = $1 AND time >= NOW() - INTERVAL '60 minutes'
      ORDER BY time DESC
      LIMIT 360
    `;
    
    const historyResult = await pool.query(historyQuery, [nodeData.id]);
    
    const history = historyResult.rows.map(hRow => ({
      time: new Date(hRow.time),
      tds: hRow.tds !== null ? parseFloat(hRow.tds.toFixed(1)) : null,
      temperature: hRow.temperature !== null ? parseFloat(hRow.temperature.toFixed(1)) : null
    }));
    
    return {
      node: nodeData,
      history
    };
  } catch (err: any) {
    if (err.statusCode) throw err;
    console.error(`Database error fetching details for node ${id}:`, err.message);
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    });
  }
});
