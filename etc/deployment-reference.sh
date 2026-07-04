#!/bin/bash

sudo apt update && sudo apt upgrade -y
sudo swapoff -a
sudo sed -i '/ swap / s/^/#/' /etc/fstab
sudo systemctl mask swap.target
sudo modprobe overlay
sudo modprobe br_netfilter
sudo tee /etc/sysctl.d/kubernetes.conf <<EOF
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward = 1
EOF
sudo sysctl --system

# K3s manages containerd internally. Configure the local registry mirror through K3s.
sudo mkdir -p /etc/rancher/k3s
sudo tee /etc/rancher/k3s/registries.yaml <<EOF
mirrors:
  "localhost:30500":
    endpoint:
      - "http://localhost:30500"
configs:
  "localhost:30500":
    tls:
      insecure_skip_verify: true
EOF

curl -sfL https://get.k3s.io | sh -s - server \
  --disable traefik \
  --disable servicelb \
  --disable metrics-server
mkdir -p "$HOME/.kube"
sudo k3s kubectl config view --raw > "$HOME/.kube/config"
chmod 600 "$HOME/.kube/config"
kubectl get nodes

# Local runner example
sudo apt install docker.io -y
# Build
sudo docker build -t bridge-service:1.0.0  bridge-service/
# Tag ke local registry
sudo docker tag bridge-service:1.0.0 localhost:30500/bridge-service:1.0.0
# Push
sudo docker push localhost:30500/bridge-service:1.0.0
# If docker client HTTPS error is happening
mkdir -p ~/.docker
echo -n 'sentinel:<password>' | base64
cat > ~/.docker/config.json << 'EOF'
{
  "auths": {
    "localhost:30500": {
      "auth": "<hasil_base64_tadi>"
    }
  }
}
EOF
sudo mkdir -p /root/.docker
sudo cp ~/.docker/config.json /root/.docker/config.json
# ========================

curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
# K3s includes Flannel by default. No separate Flannel manifest is required.

# Longhorn if using multi-node cluster
sudo apt install open-iscsi nfs-common -y
sudo systemctl enable iscsid --now
kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.11.2/deploy/longhorn.yaml
# Unset default of using local-path if have been used previously
kubectl patch storageclass local-path -p \
  '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'

#Blacklist sd devices di semua node Longhorn — ini known issue Longhorn + multipathd dan solusi permanennya memang di sini.
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

# MetalLB
kubectl get configmap kube-proxy -n kube-system -o yaml | sed -e "s/strictARP: false/strictARP: true/" | kubectl apply -f - -n kube-system
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.15.3/config/manifests/metallb-native.yaml
kubectl wait --namespace metallb-system --for=condition=ready pod --selector=component=controller --timeout=120s

# ESO
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace

# Cert manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.20.2/cert-manager.yaml

# CloudNative PostgreSQL (CNPG)
kubectl apply --server-side -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.29/releases/cnpg-1.29.1.yaml
curl -sSfL https://github.com/cloudnative-pg/cloudnative-pg/raw/main/hack/install-cnpg-plugin.sh | sudo sh -s -- -b /usr/local/bin

# Stakater Reloader (for automatic secret/configmap rotation reload)
kubectl apply -f https://raw.githubusercontent.com/stakater/Reloader/master/deployments/kubernetes/reloader.yaml

# Metrics server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
## If using self hosted add
kubectl patch deployment metrics-server -n kube-system --type='json' -p='[
  {
    "op": "add",
    "path": "/spec/template/spec/containers/0/args/-",
    "value": "--kubelet-insecure-tls"
  }
]'

# K3s server nodes are schedulable by default. If a node was manually tainted, remove it.
kubectl taint nodes --all node-role.kubernetes.io/control-plane-

# Show token for joining K3s worker nodes.
sudo cat /var/lib/rancher/k3s/server/node-token

#Longhorn volume mount error ============================
# Cek apakah multipathd yang menahan
sudo fuser -v /dev/sdc  # atau device yang relevan
sudo multipath -ll
#Kalau ada mpath entry, langsung:
bashsudo multipath -F
kubectl delete pod -n sentinel-infra -l app=<nama-app>
