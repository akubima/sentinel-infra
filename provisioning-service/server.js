const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const fs = require('fs');
const https = require('https');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const VAULT_ADDR = process.env.VAULT_ADDR || 'http://vault-service.vault.svc.cluster.local:8200';

const bootstrapCa = process.env.BOOTSTRAP_CA_DATA ? process.env.BOOTSTRAP_CA_DATA.replace(/\\n/g, '\n') : null;
const sslCert = process.env.SSL_CERT ? process.env.SSL_CERT.replace(/\\n/g, '\n') : null;
const sslKey = process.env.SSL_KEY ? process.env.SSL_KEY.replace(/\\n/g, '\n') : null;

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: 5432,
});

async function getVaultTokenViaLogin() {
    try {
        const k8sTokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
        if (!fs.existsSync(k8sTokenPath)) throw new Error('K8s ServiceAccount token not found!');

        const k8sToken = fs.readFileSync(k8sTokenPath, 'utf8').trim();
        const loginRes = await axios.post(`${VAULT_ADDR}/v1/auth/kubernetes/login`, {
            jwt: k8sToken,
            role: 'provisioning-service-role'
        });
        return loginRes.data.auth.client_token;
    } catch (err) {
        console.error('Failed to log in to vault:', err.message);
        throw err;
    }
}

// mTLS Middleware
app.use('/provision', (req, res, next) => {
    if (!req.client.authorized) {
        console.warn('Unauthorized request: invalid bootstrap certificate');
        return res.status(401).json({ error: 'Unauthorized: invalid client certificate' });
    }
    next();
});

// Provisioning Endpoint
app.post('/provision', async (req, res) => {
    try {
        const { node_id } = req.body;
        if (!node_id) return res.status(400).json({ error: 'node_id is required' });

        const dbResult = await pool.query('SELECT id FROM devices WHERE node_id = $1', [node_id]);
        if (dbResult.rows.length === 0) {
            return res.status(403).json({ error: 'Unauthorized hardware: Node ID is not registered' });
        }

        const logicalId = dbResult.rows[0].id;
        const vaultToken = await getVaultTokenViaLogin();

        const vaultRes = await axios.post(
            `${VAULT_ADDR}/v1/sentinel-pki/issue/iot-node-prod`,
            { common_name: node_id, dns_sans: [logicalId], ttl: '8760h' },
            { headers: { 'X-Vault-Token': vaultToken } }
        );

        const certData = vaultRes.data.data;
        const intermediateCa = Array.isArray(certData.ca_chain) ? certData.ca_chain.join('\n') : certData.issuing_ca;

        res.json({
            certificate: certData.certificate,
            private_key: certData.private_key,
            ca_chain: `${intermediateCa}\n${bootstrapCa}`
        });
    } catch (error) {
        console.error('Provisioning failed:', error.response?.data || error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

if (!bootstrapCa || !sslCert || !sslKey) {
    console.error('Environment variables for pTSL certificate are incomplete!');
    process.exit(1);
}

const httpsOptions = {
    key: sslKey,
    cert: sslCert,
    ca: [bootstrapCa],
    requestCert: true,
    rejectUnauthorized: false
};

https.createServer(httpsOptions, app).listen(PORT, () => {
    console.log(`provisioning-service is listening on port ${PORT} `);
});