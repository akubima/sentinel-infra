import pg from 'pg';

let pool: pg.Pool | null = null;

export function getDbPool() {
  if (pool) return pool;
  
  const host = process.env.PGHOST;
  const database = process.env.PGDATABASE || 'sentinel';
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  
  if (!host || !user) {
    return null;
  }
  
  pool = new pg.Pool({
    host,
    port: 5432,
    database,
    user,
    password,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  
  return pool;
}

// ==== MOCK DATA SERVICE ====

export interface NodeTelemetry {
  tds: number;
  temperature: number;
  time: Date;
  status: 'online' | 'offline';
}

export interface NodeDevice {
  id: string;
  node_id: string;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  created_at: Date;
  updated_at: Date | null;
  telemetry: NodeTelemetry;
}

// Base mock nodes
const MOCK_DEVICES = [
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4A', node_id: 'CE2BF215788', name: 'Prototype Node TEDI', location: 'Department TEDI UGM', latitude: -7.775418, longitude: 110.374250 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4B', node_id: 'CE2BF215789', name: 'Sleman Reservoir', location: 'Sleman Water Control', latitude: -7.721415, longitude: 110.368140 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4C', node_id: 'CE2BF215790', name: 'Bantul Spring', location: 'Bantul Forest Area', latitude: -7.892400, longitude: 110.325600 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4D', node_id: 'CE2BF215791', name: 'Mount Merapi Station', location: 'Merapi Disaster Observation Post', latitude: -7.540100, longitude: 110.445200 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4E', node_id: 'CE2BF215792', name: 'Code River Basin', location: 'Code River Bend 2', latitude: -7.798300, longitude: 110.372500 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4F', node_id: 'CE2BF215793', name: 'Gadjah Mada Campus', location: 'Faculty of Engineering UGM', latitude: -7.771200, longitude: 110.377500 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4G', node_id: 'CE2BF215794', name: 'Yogyakarta Center', location: 'Tugu Monument Area', latitude: -7.801400, longitude: 110.373800 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4H', node_id: 'CE2BF215795', name: 'Prambanan Water Node', location: 'Prambanan Temple Complex', latitude: -7.752000, longitude: 110.491400 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4I', node_id: 'CE2BF215796', name: 'Parangtritis Coast', location: 'Coastal Well Monitor', latitude: -8.024500, longitude: 110.329800 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4J', node_id: 'CE2BF215797', name: 'Kulon Progo Aquifer', location: 'Nanggulan Farming Intake', latitude: -7.821000, longitude: 110.154000 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4K', node_id: 'CE2BF215798', name: 'Gunung Kidul Well', location: 'Karakst Cave Aquifer', latitude: -7.962000, longitude: 110.602000 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4L', node_id: 'CE2BF215799', name: 'Janti Flow Sensor', location: 'Janti Aquaponics Site', latitude: -7.785000, longitude: 110.412000 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4M', node_id: 'CE2BF215800', name: 'Condongcatur Station', location: 'Condongcatur Drainage Outlet', latitude: -7.758000, longitude: 110.399000 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4N', node_id: 'CE2BF215801', name: 'Gejayan Water Monitor', location: 'Gejayan Sewerage Junction', latitude: -7.778000, longitude: 110.389000 },
  { id: '01HRX26YV8X3YZ4P5J1W2K3L4O', node_id: 'CE2BF215802', name: 'Malioboro Hydrant', location: 'Malioboro Pedestrian Walk', latitude: -7.792500, longitude: 110.366000 }
];

export function getMockNodes(search?: string, limit: number = 6, offset: number = 0): { nodes: NodeDevice[], total: number } {
  const now = new Date();
  
  // Build stateful telemetry simulation
  const processedNodes: NodeDevice[] = MOCK_DEVICES.map((dev, index) => {
    const isOffline = index === 2 || index === 3 || index === 9; // Bantul, Merapi, Kulon Progo
    const lastSeen = isOffline 
      ? new Date(now.getTime() - (index * 7200000 + 4500000))
      : new Date(now.getTime() - (index * 15000));
      
    const timestampSeed = now.getTime();
    
    let baseTds = 80;
    if (index % 3 === 0) baseTds = 240;
    if (index % 5 === 0) baseTds = 480;
    if (index === 13) baseTds = 620;
    
    const tdsFluctuation = Math.sin((timestampSeed + index * 50000) / 120000) * 15;
    const tds = parseFloat((baseTds + tdsFluctuation).toFixed(1));
    
    const baseTemp = 25.5 + (index % 4) * 1.5;
    const tempFluctuation = Math.cos((timestampSeed + index * 30000) / 180000) * 1.2;
    const temp = parseFloat((baseTemp + tempFluctuation).toFixed(1));
    
    return {
      id: dev.id,
      node_id: dev.node_id,
      name: dev.name,
      location: dev.location,
      latitude: dev.latitude,
      longitude: dev.longitude,
      created_at: new Date(2025, 0, 1),
      updated_at: isOffline ? lastSeen : now,
      telemetry: {
        tds,
        temperature: temp,
        time: lastSeen,
        status: isOffline ? 'offline' : 'online'
      }
    };
  });
  
  let filteredNodes = processedNodes;
  if (search) {
    const term = search.toLowerCase().trim();
    filteredNodes = processedNodes.filter(node => 
      node.name.toLowerCase().includes(term) || 
      node.location.toLowerCase().includes(term)
    );
  }
  
  const total = filteredNodes.length;
  const paginatedNodes = filteredNodes.slice(offset, offset + limit);
  
  return {
    nodes: paginatedNodes,
    total
  };
}

export function getMockNodeDetails(id: string): NodeDevice | null {
  const all = getMockNodes('', 100, 0).nodes;
  const node = all.find(n => n.id === id || n.node_id === id);
  if (!node) return null;
  
  return node;
}
