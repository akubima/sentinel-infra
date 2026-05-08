# Sentinel Infrastructure

This repository contains the Kubernetes deployment configurations for the Sentinel Stack (Grafana, InfluxDB, Mosquitto, Telegraf).

## Systematic Deployment Steps

Follow these systematic steps to deploy the infrastructure to your Kubernetes cluster. It is assumed you are deploying to the `sentinel-stack` namespace.

### Prerequisites

Create the `sentinel-stack` namespace if it doesn't already exist:
```sh
kubectl create namespace sentinel-stack
```

### 1. Configure Certificates

Before deploying Mosquitto and Telegraf, you must generate the necessary TLS certificates and create Kubernetes secrets for them.

#### Certificate Generation Requirements

Generate the certificates and place them in their respective `certs` directories. Ensure the file names match exactly what the configurations expect (`ca.crt`, `server.crt`, `server.key` for mosquitto, and `ca.crt`, `telegraf.crt`, `telegraf.key` for telegraf).

- **Mosquitto Certificate Details:**
  - **CN (Common Name):** `mosquitto-service.sentinel-stack.svc.cluster.local`
  - **SANs (Subject Alternative Names):** `mosquitto-service`, `127.0.0.1`, `<domains used or external ips>`

- **Telegraf Certificate Details:**
  - **CN (Common Name):** `telegraf` and `telegraf.sentinel-stack.svc.cluster.local`

#### Create Kubernetes Secrets from Certificates

Once the certificates are generated and placed in `mosquitto/certs` and `telegraf/certs`, create the secrets using the following commands:

```sh
kubectl create secret generic mosquitto-certs --from-file=mosquitto/certs -n sentinel-stack
kubectl create secret generic telegraf-certs --from-file=telegraf/certs -n sentinel-stack 
```

### 2. Configure InfluxDB Secrets

The InfluxDB secret configuration (`01-secret.yaml`) is ignored by git for security reasons to prevent leaking sensitive credentials. You must create this file manually before deploying InfluxDB.

1. Navigate to the InfluxDB Kubernetes directory:
   ```sh
   cd influxdb/k8s
   ```
2. Create a file named `01-secret.yaml` with your secure credentials matching this exact format:
   ```yaml
   apiVersion: v1
   kind: Secret
   metadata:
     name: influxdb-secret
     namespace: sentinel-stack
   type: Opaque
   stringData:
     admin-password: "super-secure-password"
     admin-token: "base64wouldbenice="
     admin-user: "admin"
     influx-org: "sentinel-org"
     influx-bucket: "device-telemetry"
   ```

### 3. Deploy the Components

After the secrets are created, apply the Kubernetes manifests for each component. Navigate to the root of the repository and apply them in a logical order (e.g., Database first, then message broker, collector, and dashboard):

```sh
# Deploy InfluxDB
kubectl apply -f influxdb/k8s/

# Deploy Mosquitto
kubectl apply -f mosquitto/k8s/

# Deploy Telegraf
kubectl apply -f telegraf/k8s/

# Deploy Grafana
kubectl apply -f grafana/k8s/
```
