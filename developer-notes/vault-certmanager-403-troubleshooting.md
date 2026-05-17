# Vault + cert-manager 403 Troubleshooting Guide

## The 3 Root Causes (Always Check in This Order)

### 1. Missing `system:auth-delegator` for Vault's actual Service Account
Vault needs permission to call Kubernetes TokenReview API to validate JWTs from other namespaces.
The SA used by Vault pods is often `default`, not `vault`.

**Check which SA vault pod actually uses:**
```bash
kubectl get pod vault-0 -n vault -o jsonpath='{.spec.serviceAccountName}'
```

**Check if it has TokenReview permission:**
```bash
kubectl auth can-i create tokenreviews --as=system:serviceaccount:vault:<SA_NAME>
```

**Fix — create ClusterRoleBinding:**
```bash
kubectl create clusterrolebinding vault-token-reviewer \
  --clusterrole=system:auth-delegator \
  --serviceaccount=vault:<SA_NAME>
```

**Make it permanent — add to your manifests:**
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: vault-token-reviewer
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:auth-delegator
subjects:
- kind: ServiceAccount
  name: <SA_NAME>   # check with jsonpath above
  namespace: vault
```

---

### 2. Kubernetes Auth Config Not Written to Vault (or Written to Wrong Place)
The `vault write auth/kubernetes/config` command **must be run inside vault-0 via `kubectl exec`**, not on the host or watcher pod.

**Correct command:**
```bash
kubectl exec -n vault vault-0 -- env VAULT_TOKEN=$ROOT_TOKEN sh -c '
  vault write auth/kubernetes/config \
    kubernetes_host="https://kubernetes.default.svc:443" \
    kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
    token_reviewer_jwt=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token) \
    disable_iss_validation=true \
    disable_local_ca_jwt=true
'
```

**Verify config is properly set:**
```bash
kubectl exec -n vault vault-0 -- env VAULT_TOKEN=$ROOT_TOKEN vault read auth/kubernetes/config
```

Expected output must show:
- `kubernetes_ca_cert` → contains a certificate (not `n/a`)
- `token_reviewer_jwt_set` → `true`
- `kubernetes_host` → `https://kubernetes.default.svc:443`

---

### 3. Kubernetes Auth Role Missing or Misconfigured
The role must match the exact service account name and namespace used by the issuer.

**List existing roles:**
```bash
kubectl exec -n vault vault-0 -- env VAULT_TOKEN=$ROOT_TOKEN vault list auth/kubernetes/roles
```

**Read a specific role:**
```bash
kubectl exec -n vault vault-0 -- env VAULT_TOKEN=$ROOT_TOKEN vault read auth/kubernetes/roles/<ROLE_NAME>
```

Check that `bound_service_account_names` and `bound_service_account_namespaces` match what's in the Issuer YAML.

**Check what role the Issuer is using:**
```bash
kubectl get issuer -A -o yaml | grep role
```

---

## Systematic Diagnosis Flow

```
cert-manager Issuer is False (403)
        │
        ▼
1. Check Vault SA has TokenReview permission
   kubectl auth can-i create tokenreviews --as=system:serviceaccount:vault:<SA>
        │
        ├── no  → Add ClusterRoleBinding (fix #1 above)
        │
        └── yes ▼
2. Check kubernetes auth config inside Vault
   vault read auth/kubernetes/config
        │
        ├── ca_cert=n/a or jwt_set=false → Re-run vault write config (fix #2 above)
        │
        └── looks good ▼
3. Simulate login manually
   JWT=$(kubectl create token <SA> -n <NAMESPACE>)
   kubectl exec -n vault vault-0 -- env VAULT_ADDR=... MY_JWT="$JWT" \
     sh -c 'vault write auth/kubernetes/login jwt=$MY_JWT role=<ROLE>'
        │
        ├── "service account name not authorized" → Role bound_service_account wrong
        ├── "permission denied" → TokenReview RBAC missing or config wrong
        └── success → Force cert-manager retry (annotate issuer)
```

---

## Force cert-manager to Retry

After fixing Vault, cert-manager won't retry immediately. Force it:

```bash
kubectl annotate issuer <ISSUER_NAME> -n <NAMESPACE> \
  cert-manager.io/issue-temporary-certificate="true" --overwrite
```

Or delete and recreate the issuer.

---

## Quick Health Check (Run These First Every Time)

```bash
# 1. Issuer status
kubectl get issuer -A

# 2. Vault pod SA
kubectl get pod vault-0 -n vault -o jsonpath='{.spec.serviceAccountName}'

# 3. TokenReview permission
kubectl auth can-i create tokenreviews --as=system:serviceaccount:vault:<SA>

# 4. Vault kubernetes auth config
kubectl exec -n vault vault-0 -- env VAULT_TOKEN=$ROOT_TOKEN vault read auth/kubernetes/config

# 5. List roles
kubectl exec -n vault vault-0 -- env VAULT_TOKEN=$ROOT_TOKEN vault list auth/kubernetes/roles
```

---

## Common Mistakes to Avoid

- **Never run `vault write` directly on host or watcher pod** — always wrap with `kubectl exec -n vault vault-0 --`
- **Never assume Vault SA name is `vault`** — always verify with `jsonpath`
- **On Windows/Git Bash**, never pass paths starting with `/` as CLI args — Git Bash converts them to Windows paths. Wrap commands inside `sh -c '...'` instead
- **After Vault pod restart**, audit log files are wiped — re-enable if needed
- **ClusterRoleBinding must be in your manifests** — it does not persist if you only apply it manually and later nuke the cluster
