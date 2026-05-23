# Sentinel Infrastructure Stack

[![Kubernetes](https://img.shields.io/badge/kubernetes-v1.33+-326ce5.svg?style=flat&logo=kubernetes&logoColor=white)](https://kubernetes.io)
[![PostgreSQL](https://img.shields.io/badge/postgresql-17-4169e1.svg?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![TimescaleDB](https://img.shields.io/badge/timescaledb-3.5-f15a24.svg?style=flat&logo=timescaledb&logoColor=white)](https://www.timescale.com)
[![Vault](https://img.shields.io/badge/vault-1.15+-000000.svg?style=flat&logo=hashicorp&logoColor=white)](https://www.vaultproject.io)
[![Status](https://img.shields.io/badge/deployment-production--ready-success.svg?style=flat)]()

This repository contains declarative, GitOps-aligned Kubernetes manifests and bootstrapping scripts for provisioning the **Sentinel Infrastructure Stack**. The architecture provides highly available distributed storage, dynamic secrets management, automated database clusters, user SSO/identity verification, and telemetry analysis out-of-the-box.

---

## 🏗️ Architecture & Component Flow

The flow below details how user requests enter the cluster, how databases write to distributed block storage, and how credentials flow securely from HashiCorp Vault down into Kubernetes namespace secrets.

```mermaid
graph TD
    User([User Request]) --> Cloudflared[Cloudflared Ingress Tunnel]
    Cloudflared --> MetalLB{MetalLB LoadBalancer}
    
    subgraph Application & Gateway [sso / sentinel-infra]
        MetalLB --> ServiceAuthentik[Authentik Service]
        MetalLB --> ServiceGrafana[Grafana Service]
        MetalLB --> ServiceBridge[Bridge Service]
    end

    subgraph Database Layer
        ServiceAuthentik --> PGCluster[(CNPG PostgreSQL Cluster)]
        ServiceGrafana --> PGCluster
        ServiceBridge --> PGCluster
        PGCluster --> Longhorn[(Longhorn Distributed Storage)]
    end

    subgraph Security Layer
        Vault[(HashiCorp Vault)] --> ESO[External Secrets Operator]
        ESO --> SecretsReady[K8s Secrets synced dynamically]
    end
```

---

## 📂 Repository Structure

The `k8s/` directory is structured sequentially to resolve cross-dependencies cleanly (CRDs/Storage ➔ Services ➔ Databases ➔ Applications) when running a recursive apply.

```
.
├── README.md
├── k8s/
│   ├── 00-namespace.yaml                 # Core Namespaces (sentinel-infra, vault, sso)
│   ├── 01-longhorn/                      # Longhorn storage class & services
│   ├── 02-metal-lb/                      # LoadBalancer IP pool allocations
│   ├── 03-vault/                         # Vault configs, unsealer, and ESO secrets sync
│   ├── 04-postgres/                      # CNPG PostgreSQL cluster setup & DB bootstrapping
│   ├── 05-registry/                      # Local private container registry
│   ├── 06-authentik/                     # Authentik SSO Deployment & Worker nodes
│   ├── 07-grafana/                       # Grafana config maps and dashboards
│   ├── 08-bridge-service/                # Sentinel Bridge app service
│   └── 09-cloudflared/                   # Cloudflare Tunnel ingress configurations
└── developer-notes/
    └── deployment-reference.sh           # Bare-Metal cluster bootstrap script
```

---

## ⚙️ Bare-Metal Cluster Prerequisites

If you are setting up a control plane node or worker nodes from scratch (using `kubeadm` on Ubuntu/Debian), refer to the raw scripts in [deployment-reference.sh](file:///d:/WebstormProjects/sentinel-infra/developer-notes/deployment-reference.sh) for details. Key requirements are summarized below:

### 1. Kernel Tuning & Swap Configuration
Kubernetes requires swap to be disabled and network bridges to forward traffic. Run:
```bash
sudo swapoff -a
sudo sed -i '/ swap / s/^/#/' /etc/fstab
sudo modprobe overlay && sudo modprobe br_netfilter

sudo tee /etc/sysctl.d/kubernetes.conf <<EOF
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward = 1
EOF
sudo sysctl --system
```

### 2. Containerd & Insecure Local Registry
If pushing Docker builds directly to a local registry running inside the cluster (port `30500`), you must specify registry capabilities in `/etc/containerd/certs.d/localhost:30500/hosts.toml`:
```toml
server = "http://localhost:30500"

[host."http://localhost:30500"]
  capabilities = ["pull", "resolve", "push"]
  skip_verify = true
```

### 3. Longhorn Storage Multipath Conflicts
To prevent Longhorn block storage mounts from locking up under Ubuntu's default `multipathd` daemon, blacklist SCSI devices on all hosts:
```bash
sudo tee /etc/multipath.conf << 'EOF'
defaults {
    user_friendly_names yes
}
blacklist {
    devnode "^sd[a-z]"
}
EOF
sudo systemctl restart multipathd
sudo multipath -F
```

---

## 🚀 Bootstrap & Deployment Steps

Follow these steps to spin up the services sequentially:

### Step 1: Install Namespaces & CRD Operators
Apply the namespace configuration first:
```bash
kubectl apply -f k8s/00-namespace.yaml
```

Install the external operators using the helm/manifest commands inside [deployment-reference.sh](file:///d:/WebstormProjects/sentinel-infra/developer-notes/deployment-reference.sh):
* **External Secrets Operator (ESO)**: Synchronizes secrets from HashiCorp Vault.
* **Cert-Manager**: Manages internal/external TLS verification.
* **CloudNativePG (CNPG)**: Automates PostgreSQL clustering.

### Step 2: Recursive Deployment
Once the cluster operators are active, run the single-command recursive deployment. Because the folders are prefixed sequentially, Kubernetes applies them in the correct dependency order:

```bash
kubectl apply -f k8s/ -R
```

### Order of Application:
1. **Storage Setup (`01-longhorn`)**: Provisions `longhorn-retained` storage class.
2. **Network Setup (`02-metal-lb`)**: Sets up local LoadBalancer IP address blocks.
3. **Secrets Setup (`03-vault`)**: Launches unsealed Vault and registers the local `SecretStore` bindings.
4. **Database Setup (`04-postgres`)**: Boots the database cluster and initializes the `grafana` and `authentik` databases.
5. **App Deployment (`05-registry` to `09-cloudflared`)**: Runs the container registry, SSO gateway, dashboards, API bridge, and Cloudflared ingress.

---

## 🛠️ Troubleshooting & Commands

### Unlocking Longhorn Block Devices
If a pod is stuck in `ContainerCreating` with volume mount attachment errors, verify if `multipathd` is intercepting the device:
```bash
sudo fuser -v /dev/sdc   # Replace sdc with the locked disk letter
sudo multipath -ll       # List active device mapper mappings
sudo multipath -F        # Flush unused multipath maps
```

### Allow Control-Plane Scheduling
If deploying to a single-node bare-metal cluster, untaint the control plane node so pods can be scheduled:
```bash
kubectl taint nodes --all node-role.kubernetes.io/control-plane-
```

---

## 🔒 Security Policy
All passwords and certificates are decoupled from configuration manifests. Credentials are dynamically pulled from Vault using the `ExternalSecrets` custom resource definition. Do not commit plaintext credentials to this repository.
