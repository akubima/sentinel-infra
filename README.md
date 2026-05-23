# Sentinel Infrastructure

This repository contains the Kubernetes deployment configurations for the Sentinel Stack (Grafana, PostgreSQL with TimescaleDB enabled, EMQX).

## Systematic Deployment Steps

Follow these systematic steps to deploy the infrastructure to your Kubernetes cluster.

### Prerequisites

Apply the namespaces manifest:
```sh
kubectl apply -f k8s/00-namespace.yaml
```

This creates the namespaces `sentinel-infra`, `vault`, and `sso`.

### Dynamic Storage Provisioner (e.g. Local Path or Longhorn)

The services require persistent storage classes to provision volumes (such as `longhorn-retained` referenced by Postgres, Authentik, etc.). If you are running on bare-metal, ensure a dynamic volume provisioner (like Longhorn or Rancher's Local Path Provisioner) is installed.

### Deploying the Components

The repository directories under `k8s/` are sequentially named to enforce the correct order of dependencies (storage class -> networking -> secrets/vault -> databases -> core apps -> ingress) when applied recursively:

```sh
# Deploy all infrastructure components in the correct sequence
kubectl apply -f k8s/ -R
```

This command will recursively scan the `k8s/` directory and apply the manifests in the following order:
1. **`01-longhorn`**: Sets up storage classes.
2. **`02-metal-lb`**: Configures load-balancing pools.
3. **`03-vault`**: Boots Vault configuration, RBAC, and ExternalSecrets store.
4. **`04-postgres`**: Deploys the PostgreSQL cluster and initial databases (`grafana`, `authentik`, etc.).
5. **`05-registry`**: Launches the local container registry.
6. **`06-authentik`**: Deploys Authentik SSO server and workers.
7. **`07-grafana`**: Deploys Grafana dashboards.
8. **`08-bridge-service`**: Boots the application bridge service.
9. **`09-cloudflared`**: Sets up the Cloudflare Tunnel egress.
