const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const fs = require('fs');
const https = require('https');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const VAULT_ADDR = process.env.VAULT_ADDR || 'http://vault-service.vault.svc.cluster.local:8200';
const MOUNT_PATH = '/etc/certs';

const getCertFile = (fileName) => {
    try {
        return fs.readFileSync(`${MOUNT_PATH}/${fileName}`, 'utf8');
    } catch (err) {
        console.error(`Failed to read [${fileName}]:`, err.message);
        return null;
    }
};

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: 5432,
});

let cachedToken = null;
let tokenExpiry = null;

async function getVaultTokenViaLogin() {
    try {
        if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
            return cachedToken;
        }
        const k8sTokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
        if (!fs.existsSync(k8sTokenPath)) throw new Error('K8s ServiceAccount token not found!');
        const k8sToken = fs.readFileSync(k8sTokenPath, 'utf8').trim();
        const loginRes = await axios.post(`${VAULT_ADDR}/v1/auth/kubernetes/login`, {
            jwt: k8sToken,
            role: 'provisioning-service-role'
        });
        cachedToken = loginRes.data.auth.client_token;
        const leaseDuration = loginRes.data.auth.lease_duration;
        tokenExpiry = Date.now() + (leaseDuration * 1000) - (60 * 1000);
        return cachedToken;
    } catch (err) {
        console.error('Failed to log in to vault:', err.message);
        throw err;
    }
}

app.use('/provision', (req, res, next) => {
    const cert = req.socket.getPeerCertificate(true);
    if (!cert || !cert.subject) {
        console.warn('Unauthorized request: no client certificate.');
        return res.status(401).json({ error: 'Unauthorized: no client certificate.' });
    }
    if (cert.subject.OU !== 'Sentinel') {
        console.warn(`Unauthorized cert OU: ${cert.subject.OU}`);
        return res.status(401).json({ error: 'Unauthorized: invalid client certificate.' });
    }
    next();
});

app.post('/provision', async (req, res) => {
    const caCert = getCertFile('ca.crt');
    if (!caCert) return res.status(500).json({ error: 'CA certificate not available.' });

    try {
        const { node_id } = req.body;
        if (!node_id) return res.status(400).json({ error: 'node_id is required' });

        const dbResult = await pool.query('SELECT id FROM devices WHERE node_id = $1', [node_id]);
        if (dbResult.rows.length === 0) {
            return res.status(403).json({ error: 'Unauthorized hardware: Node ID is not registered.' });
        }

        const logicalId = dbResult.rows[0].id;
        const vaultToken = await getVaultTokenViaLogin();

        const vaultRes = await axios.post(
            `${VAULT_ADDR}/v1/sentinel-pki/issue/iot-node-prod`,
            {
                common_name: node_id,
                dns_sans: [logicalId],
                ttl: '8760h'
            },
            { headers: { 'X-Vault-Token': vaultToken } }
        );

        const certData = vaultRes.data.data;
        const caChain = Array.isArray(certData.ca_chain)
            ? certData.ca_chain.join('\n')
            : certData.issuing_ca;

        res.json({
            certificate: certData.certificate,
            private_key: certData.private_key,
            ca_chain: caChain.trim()
        });
    } catch (error) {
        console.error('Provisioning failed:', error.response?.data || error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const loadHttpsOptions = () => {
    const sslKey = getCertFile('tls.key');
    const sslCert = getCertFile('tls.crt');
    const caCert = getCertFile('ca.crt');

    if (!caCert || !sslCert || !sslKey) {
        console.error('CRITICAL: Incomplete certificate files.');
        process.exit(1);
    }

    return {
        key: sslKey,
        cert: sslCert,
        ca: [caCert],
        requestCert: true,
        rejectUnauthorized: false  // ESP32 mbedTLS tidak kirim full chain, verify manual di middleware
    };
};

const httpsServer = https.createServer(loadHttpsOptions(), app);

fs.watch(MOUNT_PATH, (eventType, filename) => {
    if (filename) {
        console.log(`Detected certificate rotation: ${filename}. Updating TLS context...`);
        try {
            const newOptions = loadHttpsOptions();
            httpsServer.setSecureContext(newOptions);
            console.log('TLS context hot-reloaded successfully.');
        } catch (err) {
            console.error('Failed to hot-reload TLS context, fault:', err.message);
        }
    }
});

httpsServer.listen(PORT, () => {
    console.log(`Node provisioning service is listening on port ${PORT}`);
});