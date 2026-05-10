# Sentinel Infrastructure

This repository contains the Kubernetes deployment configurations for the Sentinel Stack (Grafana, TimescaleDB, EMQX).

## Systematic Deployment Steps

Follow these systematic steps to deploy the infrastructure to your Kubernetes cluster. It is assumed you are deploying to the `sentinel-stack` namespace.

### Prerequisites

Create the `sentinel-stack` namespace if it doesn't already exist:
```sh
kubectl apply -f k8s/00-namespace.yaml
```
*(Alternatively, you can run `kubectl create namespace sentinel-stack`)*

### 1. Configure Certificates and Secrets

Before deploying EMQX and TimescaleDB, you must generate the necessary TLS certificates and create Kubernetes secrets for them.

#### EMQX Certificate Generation Requirements

Generate the certificates and place them in the `./emqx/certs/` directory. Ensure the file names match exactly what the configurations expect (`ca.crt`, `emqx.crt`, `emqx.key`).

- **EMQX Certificate Details:**
  - **CN (Common Name):** `emqx-service.sentinel-stack.svc.cluster.local`
  - **SANs (Subject Alternative Names):** `emqx-service`, `127.0.0.1`, `<domains used or external ips>`

#### Create Kubernetes Secrets

Run the following commands to create the secrets for both TimescaleDB and EMQX. These commands are formatted on a single line so that they can be run smoothly in any terminal (Bash, PowerShell, Cmd, etc.) without line-continuation errors:

```sh
# Create TimescaleDB secret
kubectl create secret generic timescaledb-secret --from-literal=password='<change_this_password>' -n sentinel-stack

# Create EMQX certificates secret
kubectl create secret generic emqx-certs-secret --from-file=ca.crt=./emqx/certs/ca.crt --from-file=emqx.crt=./emqx/certs/emqx.crt --from-file=emqx.key=./emqx/certs/emqx.key -n sentinel-stack
```

### 2. Deploy the Components

After the secrets are created, apply the Kubernetes manifests for each component. Navigate to the root of the repository and apply them in a logical order (Database first, then message broker, and dashboard):

```sh
# Deploy TimescaleDB
kubectl apply -f k8s/timescaledb/

# Deploy EMQX
kubectl apply -f k8s/emxq/

# Deploy Grafana
kubectl apply -f k8s/grafana/
```
