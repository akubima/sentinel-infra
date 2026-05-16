const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const fs = require('fs');
const https = require('https');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const VAULT_ADDR = process.env.VAULT_ADDR || 'http://localhost:8200';

// Paths to secrets injected by Vault Agent
const CERTS_JSON_PATH = '/vault/secrets/certs.json';
const BOOTSTRAP_CA = '/vault/secrets/ca.crt';
const VAULT_TOKEN_PATH = '/vault/secrets/token';
const DB_PASSWORD_PATH = '/vault/secrets/db-password';

function getVaultToken() {
    return fs.readFileSync(VAULT_TOKEN_PATH, 'utf8').trim();
}

function getDbPassword() {
    return fs.readFileSync(DB_PASSWORD_PATH, 'utf8').trim();
}

const pool = new Pool({
    user: process.env.PGUSER || 'sentinel',
    host: process.env.PGHOST || 'timescaledb-service.sentinel-stack.svc.cluster.local',
    database: process.env.PGDATABASE || 'sentinel',
    password: getDbPassword(),
    port: process.env.PGPORT || 5432,
});

// Middleware to enforce mTLS on /provision
app.use('/provision', (req, res, next) => {
    // req.client.authorized is true if the client cert was verified against the CA
    if (!req.client.authorized) {
        console.warn('[WARNING] Rejected unauthorized request (Missing or invalid Bootstrap Cert)');
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing Bootstrap Client Certificate' });
    }
    next();
});

app.post('/provision', async (req, res) => {
    try {
        const { node_id } = req.body;
        if (!node_id) {
            return res.status(400).json({ error: 'node_id is required' });
        }

        // 1. Verify NODE_ID in TimescaleDB
        const dbResult = await pool.query('SELECT id FROM devices WHERE node_id = $1', [node_id]);
        if (dbResult.rows.length === 0) {
            console.warn(`[WARNING] Provisioning rejected for unknown NODE_ID: ${node_id}`);
            return res.status(403).json({ error: 'Unauthorized hardware' });
        }

        const logicalId = dbResult.rows[0].id;
        console.log(`[INFO] Provisioning authorized for NODE_ID: ${node_id} -> Logical ID: ${logicalId}`);

        // 2. Request Certificate from Vault
        const vaultRes = await axios.post(
            `${VAULT_ADDR}/v1/sentinel/issue/iot-node`,
            { common_name: logicalId, ttl: '365d' }
        );

        const certData = vaultRes.data.data;

        // 3. Return Certs to ESP32
        res.json({
            certificate: certData.certificate,
            private_key: certData.private_key,
            ca_chain: certData.ca_chain.join('\n')
        });

    } catch (error) {
        console.error('[ERROR] Provisioning failed:', error.response?.data || error.message);
        res.status(500).json({ error: 'Internal server error during provisioning' });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start HTTPS Server
const httpsOptions = {
    key: certs.private_key,
    cert: certs.certificate,
    ca: [fs.readFileSync(BOOTSTRAP_CA)], // Trust the Bootstrap CA for client certs
    requestCert: true,
    rejectUnauthorized: false // We manually check req.client.authorized in middleware
};

https.createServer(httpsOptions, app).listen(PORT, () => {
    console.log(`Secure Provisioning microservice listening on port ${PORT}`);
});
