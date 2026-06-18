const express = require('express');
const { Pool } = require('pg');
const mqtt = require('mqtt');
const crypto = require('crypto')

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.BRIDGE_API_KEY;
const AWS_IOT_ENDPOINT = process.env.AWS_IOT_ENDPOINT;
const AWS_IOT_TOPIC = process.env.AWS_IOT_TOPIC || 'sentinel/device/#';

const pool = new Pool({
    host: process.env.PGHOST,
    port: 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

// ==== Middleware
const apiKeyAuth = (req, res, next) => {
    if (req.headers['x-api-key'] !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// ==== Routes
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/verify/:node_id', apiKeyAuth, async (req, res) => {
    const { node_id } = req.params;
    try {
        const result = await pool.query(
            'SELECT id FROM devices WHERE node_id = $1',
            [node_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }
        res.json({ valid: true, id: result.rows[0].id });
    } catch (err) {
        console.error('DB error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==== MQTT Bridge
// Generate a random ID for this specific replica instance
const instanceId = crypto.randomBytes(4).toString('hex');

const mqttClient = mqtt.connect(`mqtts://${AWS_IOT_ENDPOINT}:8883`, {
    cert: Buffer.from(process.env.BRIDGE_CERT.replace(/\\n/g, '\n')),
    key: Buffer.from(process.env.BRIDGE_KEY.replace(/\\n/g, '\n')),
    ca: Buffer.from(process.env.BRIDGE_CA.replace(/\\n/g, '\n')),
    clientId: `sentinel-bridge-${instanceId}`,
    connectTimeout: 10000,
    reconnectPeriod: 5000,
});

mqttClient.on('connect', () => {
    console.log(`Bridge (ID: ${instanceId}) connected to AWS IoT Core`);
    mqttClient.subscribe(AWS_IOT_TOPIC, (err) => {
        if (err) console.error('Subscribe error:', err.message);
        else console.log(`Subscribed to ${AWS_IOT_TOPIC}`);
    });
});

mqttClient.on('message', async (topic, payload) => {
    try {
        if (payload.length > 5120) {
            console.warn(`[Instance: ${instanceId}] Dropped payload: exceeds 5KB limit (${payload.length} bytes)`);
            return;
        }

        const data = JSON.parse(payload.toString());
        const nodeId = data.node_id;

        if (!nodeId) return;

        const deviceResult = await pool.query(
            'SELECT id FROM devices WHERE node_id = $1',
            [nodeId]
        );
        if (deviceResult.rows.length === 0) {
            console.warn(`Unknown device: ${nodeId}`);
            return;
        }

        const deviceId = deviceResult.rows[0].id;

        let telemetryTime = null;
        if (data.timestamp !== undefined && data.timestamp !== null) {
            const parsed = Number(data.timestamp);
            if (!isNaN(parsed) && typeof data.timestamp !== 'boolean') {
                telemetryTime = new Date(parsed < 99999999999 ? parsed * 1000 : parsed);
            } else {
                telemetryTime = new Date(data.timestamp);
            }
            if (isNaN(telemetryTime.getTime())) {
                telemetryTime = null;
            }
        }

        await pool.query(
            `INSERT INTO device_telemetry (time, id, metrics)
             VALUES ($1, $2, $3)
             ON CONFLICT (id, time) DO NOTHING`,
            [telemetryTime ?? new Date(), deviceId, data]
        );

        console.log(`Telemetry saved for ${nodeId} by instance ${instanceId}`);
    } catch (err) {
        console.error('Message handling error:', err.message);
    }
});

mqttClient.on('error', (err) => {
    console.error(`MQTT error [${instanceId}]:`, err.message, err.code);
});

mqttClient.on('reconnect', () => {
    console.log(`[Instance: ${instanceId}] Trying to reconnect to AWS IoT...`);
});

mqttClient.on('offline', () => {
    console.log(`[Instance: ${instanceId}] MQTT Client is offline/network dropped`);
});

app.listen(PORT, () => {
    console.log(`Bridge service listening on port ${PORT}`);
});