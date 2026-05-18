# Sentinel Infrastructure

This repository contains the Kubernetes deployment configurations for the Sentinel Stack (Grafana, PostgreSQL with TimescaleDB enabled, EMQX).

## Systematic Deployment Steps

Follow these systematic steps to deploy the infrastructure to your Kubernetes cluster. It is assumed you are deploying to the `sentinel-stack` namespace.

### Prerequisites

Create the `sentinel-stack` namespace if it doesn't already exist:
```sh
kubectl apply -f k8s/00-namespace.yaml
```
*(Alternatively, you can run `kubectl create namespace sentinel-stack`)*

### Storage Provisioner (Bare-Metal / kubeadm only)

If you are deploying this to a bare-metal `kubeadm` cluster (as opposed to a managed service or Minikube), you need a dynamic storage provisioner installed so that `PersistentVolumeClaims` can automatically create `PersistentVolumes`.

Install Rancher's **Local Path Provisioner** to provide dynamic provisioning using the node's local disk:

```sh
# Install Local Path Provisioner
kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.28/deploy/local-path-storage.yaml

# Set it as the default storage class
kubectl patch storageclass local-path -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

### 1. Configure Certificates and Secrets

Before deploying EMQX and PostgreSQL, you must generate the necessary TLS certificates and create Kubernetes secrets for them.

#### EMQX Certificate Generation Requirements

Generate the certificates and place them in the `./emqx/certs/` directory. Ensure the file names match exactly what the configurations expect (`ca.pem`, `emqx.pem`, `emqx.key`).

- **EMQX Certificate Details:**
  - **CN (Common Name):** `emqx-service.sentinel-stack.svc.cluster.local`
  - **SANs (Subject Alternative Names):** `emqx-service`, `127.0.0.1`, `<domains used or external ips>`

#### Create Kubernetes Secrets

Run the following commands to create the secrets for both PostgreSQL and EMQX. These commands are formatted on a single line so that they can be run smoothly in any terminal (Bash, PowerShell, Cmd, etc.) without line-continuation errors:

```sh
# Create PostgreSQL secret
kubectl create secret generic postgres-secret --from-literal=password='<change_this_password>' -n sentinel-stack

# Create EMQX certificates secret
kubectl create secret generic emqx-certs-secret --from-file=ca.pem=./emqx/certs/ca.pem --from-file=emqx.pem=./emqx/certs/emqx.pem --from-file=emqx.key=./emqx/certs/emqx.key -n sentinel-stack
```

### 2. Deploy the Components

After the secrets are created, apply the Kubernetes manifests for each component. Navigate to the root of the repository and apply them in a logical order (Database first, then message broker, and dashboard):

```sh
# Deploy PostgreSQL
kubectl apply -f k8s/postgres/

# Deploy EMQX
kubectl apply -f k8s/emxq/

# Deploy Grafana
kubectl apply -f k8s/grafana/
```
