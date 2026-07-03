# Kubelet Dynamic-Memory Startup Guard

Use this guard when the Kubernetes control plane runs inside a VM with dynamic memory allocation and the hypervisor is not directly manageable. It prevents kubelet from registering the node while the guest still exposes a low initial memory value.

The validated flow is:

1. Start a temporary memory-pressure holder before kubelet.
2. Enable temporary warm-up swap so the holder can push dynamic RAM without dying too early.
3. Wait until `/proc/meminfo` exposes at least 10 GiB.
4. Start kubelet while the VM is still expanded.
5. Stop the holder and disable swap after kubelet has registered node capacity.

The target remains 10 GiB. Do not lower the target to hide the issue.

## Install

Run this after `kubelet`, `kubeadm`, and `kubectl` are installed, but before `kubeadm init` on a fresh node.

```bash
sudo mkdir -p /usr/local/sbin /etc/systemd/system/kubelet.service.d

if [ ! -f /swap.img ]; then
  sudo fallocate -l 8G /swap.img
  sudo chmod 600 /swap.img
  sudo mkswap /swap.img
fi

sudo tee /usr/local/sbin/memory-pressure-holder.py >/dev/null <<'PY'
#!/usr/bin/env python3
import time

TARGET_KB = 10 * 1024 * 1024
MAX_ALLOC_MB = 14 * 1024
MIN_AVAILABLE_KB = 64 * 1024


def meminfo():
    data = {}
    with open('/proc/meminfo') as f:
        for line in f:
            key, value = line.split(':', 1)
            data[key] = int(value.strip().split()[0])
    return data


def log(message):
    print(message, flush=True)


def max_chunk_mb(total_kb):
    if total_kb < 4 * 1024 * 1024:
        return 512
    if total_kb < 8 * 1024 * 1024:
        return 768
    return 1024


def next_chunk_mb(total_kb, available_kb):
    headroom_mb = (available_kb - MIN_AVAILABLE_KB) // 1024

    if headroom_mb >= 128:
        return min(max_chunk_mb(total_kb), headroom_mb)

    if headroom_mb >= 32:
        return 32

    return 0


try:
    with open('/proc/self/oom_score_adj', 'w') as f:
        f.write('1000')
except Exception:
    pass

log('memory-pressure-holder: starting micro-push adaptive warm-up')

chunks = []
allocated_mb = 0

while allocated_mb < MAX_ALLOC_MB:
    info = meminfo()
    total = info['MemTotal']
    available = info['MemAvailable']

    log(
        f"holder: MemTotal={total} kB, "
        f"MemAvailable={available} kB, "
        f"allocated={allocated_mb} MiB"
    )

    if total >= TARGET_KB:
        log('holder: target reached; holding memory until kubelet starts')
        break

    chunk_mb = next_chunk_mb(total, available)

    if chunk_mb <= 0:
        log('holder: critically low available memory; waiting')
        time.sleep(0.2)
        continue

    try:
        block = bytearray(chunk_mb * 1024 * 1024)

        for i in range(0, len(block), 4096):
            block[i] = 1

        chunks.append(block)
        allocated_mb += chunk_mb

    except MemoryError:
        log('holder: MemoryError; holding existing pressure and waiting')
        time.sleep(0.5)

    time.sleep(0.05)

log('holder: holding memory until kubelet starts')

while True:
    info = meminfo()
    log(
        f"holder: holding; MemTotal={info['MemTotal']} kB, "
        f"MemAvailable={info['MemAvailable']} kB, "
        f"allocated={allocated_mb} MiB"
    )
    time.sleep(5)
PY

sudo chmod +x /usr/local/sbin/memory-pressure-holder.py

sudo tee /usr/local/sbin/kubelet-wait-memory.sh >/dev/null <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_KB=$((10 * 1024 * 1024))
SWAPFILE='/swap.img'

memtotal_kb() {
  awk '/^MemTotal:/ {print $2}' /proc/meminfo
}

memavailable_kb() {
  awk '/^MemAvailable:/ {print $2}' /proc/meminfo
}

swap_enabled() {
  swapon --show=NAME --noheadings | grep -qx "$SWAPFILE"
}

echo 'Waiting for VM memory to reach at least 10 GiB before starting kubelet...'

if [ -f "$SWAPFILE" ] && ! swap_enabled; then
  echo 'Enabling temporary warm-up swap...'
  swapon "$SWAPFILE" || true
fi

while true; do
  total="$(memtotal_kb)"
  available="$(memavailable_kb)"

  echo "guard: MemTotal=${total} kB, MemAvailable=${available} kB"

  if [ "$total" -ge "$TARGET_KB" ]; then
    echo 'Target memory reached. Starting kubelet.'
    exit 0
  fi

  sleep 1
done
SH

sudo chmod +x /usr/local/sbin/kubelet-wait-memory.sh

sudo tee /etc/systemd/system/kubelet-memory-pressure.service >/dev/null <<'EOF'
[Unit]
Description=Temporary memory pressure holder for kubelet dynamic RAM warm-up
Before=kubelet.service

[Service]
Type=simple
ExecStart=/usr/local/sbin/memory-pressure-holder.py
Restart=on-failure
RestartSec=1
OOMScoreAdjust=1000
OOMPolicy=continue
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/kubelet.service.d/20-wait-memory.conf >/dev/null <<'EOF'
[Service]
OOMPolicy=continue
TimeoutStartSec=300
ExecStartPre=/bin/systemctl start kubelet-memory-pressure.service
ExecStartPre=/usr/local/sbin/kubelet-wait-memory.sh
ExecStartPost=/bin/sleep 15
ExecStartPost=/bin/systemctl stop kubelet-memory-pressure.service
ExecStartPost=/sbin/swapoff -a
EOF

sudo systemctl daemon-reload
sudo systemctl reset-failed kubelet kubelet-memory-pressure.service || true
```

## Verify

After restarting or rebooting the node, the final state should be:

```bash
free -m
systemctl is-active kubelet
systemctl is-active kubelet-memory-pressure.service
kubectl get node sentinel-0 -o custom-columns=NAME:.metadata.name,CAPACITY:.status.capacity.memory,ALLOCATABLE:.status.allocatable.memory
```

Expected result:

```text
Swap: 0 0 0
kubelet: active
kubelet-memory-pressure.service: inactive
CAPACITY around 10-12 GiB
ALLOCATABLE around 10-12 GiB minus kube/system reserve
```

Inspect the boot-time guard logs:

```bash
sudo journalctl -u kubelet -u kubelet-memory-pressure -b --no-pager \
  | grep -E 'Waiting for VM memory|Enabling temporary warm-up swap|holder:|guard:|Target memory reached|Starting kubelet'
```

## Operational notes

- The swap file is temporary warm-up support only. It is disabled after kubelet starts.
- `OOMScoreAdjust=1000` makes the memory-pressure holder the preferred OOM victim if the guest runs out of memory.
- Do not run the pressure holder as a normal background service. It is started by kubelet `ExecStartPre` and stopped by kubelet `ExecStartPost`.
- Do not use a separate aggressive kicker process during cold boot. It can kill the holder and force the warm-up loop to restart from zero.
