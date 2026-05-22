const express = require('express');
const { Pool } = require('pg');
const mqtt = require('mqtt');

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
const mqttClient = mqtt.connect(`mqtts://${AWS_IOT_ENDPOINT}:8883`, {
    cert: process.env.BRIDGE_CERT,
    key: process.env.BRIDGE_KEY,
    ca: process.env.BRIDGE_CA,
    clientId: 'sentinel-bridge',
    clean: true,
});

mqttClient.on('connect', () => {
    console.log('Bridge connected to AWS IoT Core');
    mqttClient.subscribe(AWS_IOT_TOPIC, (err) => {
        if (err) console.error('Subscribe error:', err.message);
        else console.log(`Subscribed to ${AWS_IOT_TOPIC}`);
    });
});

mqttClient.on('message', async (topic, payload) => {
    try {
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
        await pool.query(
            'INSERT INTO device_telemetry (time, id, metrics) VALUES (NOW(), $1, $2)',
            [deviceId, JSON.stringify(data)]
        );

        console.log(`Telemetry saved for ${nodeId}`);
    } catch (err) {
        console.error('Message handling error:', err.message);
    }
});

mqttClient.on('error', (err) => {
    console.error('MQTT error:', err.message);
});

app.listen(PORT, () => {
    console.log(`Bridge service listening on port ${PORT}`);
});