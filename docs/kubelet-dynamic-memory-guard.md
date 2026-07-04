# Kubelet Dynamic-Memory Startup Guard

Use this guard when the Kubernetes control plane runs inside a VM with dynamic memory allocation and the hypervisor is not directly manageable. It prevents kubelet from registering the node while the guest still exposes a low initial memory value.

The guest-only brute-force flow is:

1. Start a temporary resident memory-pressure holder before kubelet.
2. Enable temporary warm-up swap as a safety cushion for the guest.
3. Wait until `/proc/meminfo` exposes at least 10 GiB.
4. Start kubelet while the VM is still expanded.
5. Stop the holder and disable swap after kubelet has registered node capacity.

The target remains 10 GiB. Do not lower the target to hide the issue. This can only work when Hyper-V Dynamic Memory is enabled for the VM and the VM maximum is above 10 GiB; from inside the guest, the only available control is sustained memory pressure.

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
import ctypes
import errno
import resource
import signal
import time

TARGET_KB = 10 * 1024 * 1024
MAX_LOCKED_MB = 15 * 1024
MIN_AVAILABLE_KB = 96 * 1024
CHUNK_MB = 64
LOG_INTERVAL_SECONDS = 2

running = True
libc = ctypes.CDLL('libc.so.6', use_errno=True)


def meminfo():
    data = {}
    with open('/proc/meminfo') as f:
        for line in f:
            key, value = line.split(':', 1)
            data[key] = int(value.strip().split()[0])
    return data


def log(message):
    print(message, flush=True)


def stop(_signum, _frame):
    global running
    running = False


def set_memlock_limit():
    try:
        resource.setrlimit(
            resource.RLIMIT_MEMLOCK,
            (resource.RLIM_INFINITY, resource.RLIM_INFINITY),
        )
    except Exception as exc:
        log(f'holder: could not raise RLIMIT_MEMLOCK: {exc}')


def choose_chunk_mb(available_kb):
    if available_kb >= 512 * 1024:
        return CHUNK_MB
    if available_kb >= 256 * 1024:
        return 32
    if available_kb >= MIN_AVAILABLE_KB:
        return 16
    return 8


def mlock_block(block):
    view = (ctypes.c_char * len(block)).from_buffer(block)
    address = ctypes.addressof(view)
    result = libc.mlock(ctypes.c_void_p(address), ctypes.c_size_t(len(block)))
    if result == 0:
        return True, 0
    return False, ctypes.get_errno()


try:
    with open('/proc/self/oom_score_adj', 'w') as f:
        f.write('1000')
except Exception:
    pass

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
set_memlock_limit()

log('memory-pressure-holder: starting resident Hyper-V dynamic-memory warm-up')

chunks = []
locked_mb = 0
last_log = 0
mlock_failures = 0

while running and locked_mb < MAX_LOCKED_MB:
    info = meminfo()
    total = info['MemTotal']
    available = info['MemAvailable']
    now = time.monotonic()

    if now - last_log >= LOG_INTERVAL_SECONDS:
        log(
            f"holder: MemTotal={total} kB, "
            f"MemAvailable={available} kB, "
            f"SwapFree={info.get('SwapFree', 0)} kB, "
            f"locked={locked_mb} MiB, "
            f"mlockFailures={mlock_failures}"
        )
        last_log = now

    if total >= TARGET_KB:
        log('holder: target reached; holding memory until kubelet starts')
        break

    chunk_mb = choose_chunk_mb(available)

    try:
        block = bytearray(chunk_mb * 1024 * 1024)

        for i in range(0, len(block), 4096):
            block[i] = 1

        locked, err = mlock_block(block)

        if locked:
            chunks.append(block)
            locked_mb += chunk_mb
            mlock_failures = 0
        else:
            mlock_failures += 1
            if err not in (errno.ENOMEM, errno.EAGAIN):
                log(f'holder: mlock failed with errno={err}; continuing pressure loop')
            del block
            time.sleep(1)

    except MemoryError:
        log('holder: MemoryError; holding resident pressure and waiting')
        time.sleep(1)

    time.sleep(0.1)

log('holder: holding memory until kubelet starts')

while running:
    info = meminfo()
    log(
        f"holder: holding; MemTotal={info['MemTotal']} kB, "
        f"MemAvailable={info['MemAvailable']} kB, "
        f"SwapFree={info.get('SwapFree', 0)} kB, "
        f"locked={locked_mb} MiB"
    )
    time.sleep(5)

log('holder: stopping; releasing warm-up allocation')
PY

sudo chmod +x /usr/local/sbin/memory-pressure-holder.py

sudo tee /usr/local/sbin/kubelet-wait-memory.sh >/dev/null <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_KB=$((10 * 1024 * 1024))
SWAPFILE='/swap.img'
MAX_SECONDS=1800

memtotal_kb() {
  awk '/^MemTotal:/ {print $2}' /proc/meminfo
}

memavailable_kb() {
  awk '/^MemAvailable:/ {print $2}' /proc/meminfo
}

swap_enabled() {
  swapon --show=NAME --noheadings | grep -qx "$SWAPFILE"
}

hyperv_balloon_loaded() {
  [ -d /sys/module/hv_balloon ] || grep -qw hv_balloon /proc/modules
}

echo 'Waiting for VM memory to reach at least 10 GiB before starting kubelet...'

if ! hyperv_balloon_loaded; then
  echo 'Warning: hv_balloon is not visible in /proc/modules. Continuing because this is a guest-only brute-force warm-up.'
fi

if [ -f "$SWAPFILE" ] && ! swap_enabled; then
  echo 'Enabling temporary warm-up swap...'
  swapon "$SWAPFILE" || true
fi

started="$(date +%s)"

while true; do
  total="$(memtotal_kb)"
  available="$(memavailable_kb)"
  now="$(date +%s)"

  echo "guard: MemTotal=${total} kB, MemAvailable=${available} kB"

  if [ "$total" -ge "$TARGET_KB" ]; then
    echo 'Target memory reached. Starting kubelet.'
    exit 0
  fi

  if [ $((now - started)) -ge "$MAX_SECONDS" ]; then
    echo 'Timed out waiting for Hyper-V to expose 10 GiB. Stopping pressure holder.'
    systemctl stop kubelet-memory-pressure.service || true
    swapoff "$SWAPFILE" || true
    exit 1
  fi

  sleep 1
done
SH

sudo chmod +x /usr/local/sbin/kubelet-wait-memory.sh

sudo tee /etc/systemd/system/kubelet-memory-pressure.service >/dev/null <<'EOF'
[Unit]
Description=Temporary memory pressure holder for kubelet dynamic RAM warm-up
Before=kubelet.service
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=/usr/local/sbin/memory-pressure-holder.py
Restart=on-failure
RestartSec=2
OOMScoreAdjust=1000
OOMPolicy=continue
LimitMEMLOCK=infinity
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/kubelet.service.d/20-wait-memory.conf >/dev/null <<'EOF'
[Service]
OOMPolicy=continue
TimeoutStartSec=1900
ExecStartPre=/bin/systemctl start kubelet-memory-pressure.service
ExecStartPre=/usr/local/sbin/kubelet-wait-memory.sh
ExecStartPost=/bin/sleep 15
ExecStartPost=/bin/systemctl stop kubelet-memory-pressure.service
ExecStartPost=/sbin/swapoff -a
EOF

sudo systemctl daemon-reload
sudo systemctl disable kubelet-memory-pressure.service || true
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

## Guest-Only Diagnostics

Use these checks when host-level Hyper-V access is unavailable:

```bash
uname -r
modinfo hv_balloon
cat /sys/module/hv_balloon/parameters/hot_add 2>/dev/null || true
cat /sys/devices/system/memory/auto_online_blocks 2>/dev/null || true
ls /sys/bus/vmbus/devices
grep -R . /sys/bus/vmbus/devices/*/class_id 2>/dev/null | grep -i balloon || true
grep -R . /sys/bus/vmbus/devices/*/device_id 2>/dev/null | grep -i balloon || true
dmesg | grep -iE 'hv_balloon|balloon|dynamic|hot add|hot-add|vmbus'
```

Known result from `sentinel-0`: `hv_balloon` can be built into the kernel and `hot_add` can be `Y`, while `MemTotal` still remains pinned near the startup RAM. If the VMBus dynamic-memory device is not exposed to the guest, resident pressure and `stress-ng` cannot make Hyper-V add memory.

If the logs show `MemTotal` pinned around the startup RAM while `locked` rises and `mlockFailures` keeps increasing, the guest is applying resident pressure but Hyper-V is not granting memory. If host access is available, check the VM from the Hyper-V host:

```powershell
Get-VMMemory -VMName sentinel-0
Set-VMMemory -VMName sentinel-0 -DynamicMemoryEnabled $true -StartupBytes 2GB -MinimumBytes 2GB -MaximumBytes 12GB -Buffer 80
```

Then check the guest driver:

```bash
lsmod | grep hv_balloon
dmesg | grep -i balloon
```

Without Hyper-V host access, leave the guard running until its 30 minute timeout and collect the `journalctl` output. If `MemTotal` never grows, the guest has no stronger API to request memory than this resident-pressure loop.

## Disable Without Removing Documentation

If the VM does not expose a working Hyper-V dynamic-memory path, disable the guard on that node but keep this document in the repository:

```bash
sudo systemctl stop kubelet kubelet-memory-pressure
sudo systemctl disable kubelet-memory-pressure
sudo rm -f /etc/systemd/system/kubelet.service.d/20-wait-memory.conf
sudo systemctl daemon-reload
sudo swapoff -a || true
sudo systemctl start kubelet
```

This does not remove the documented brute-force method. It only prevents the current node from blocking kubelet startup when Hyper-V cannot honor guest-side memory pressure.

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
- Hyper-V must allow the VM to grow past 10 GiB. If the VM's Dynamic Memory maximum is lower than 10 GiB, or the Linux Hyper-V balloon path is unavailable, the guard will time out, fail kubelet startup, and release the temporary pressure.
