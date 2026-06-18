#!/usr/bin/env python3
import asyncio
import aiohttp
import time
import sys
import argparse
import random
from collections import Counter

class StressTester:
    def __init__(self, urls, concurrency, duration):
        self.urls = urls
        self.concurrency = concurrency
        self.duration = duration
        
        # Statistics counters
        self.total_requests = 0
        self.success_count = 0
        self.error_count = 0
        self.status_codes = Counter()
        self.response_times = []
        self.start_time = 0
        self.is_running = True

    async def fetch(self, session):
        while self.is_running:
            url = random.choice(self.urls)
            # Add a cache buster query parameter to simulate unique visits and bypass CDN caching if desired
            cache_buster = f"t={random.randint(100000, 999999)}"
            target_url = f"{url}?{cache_buster}" if "?" not in url else f"{url}&{cache_buster}"
            
            start = time.perf_counter()
            try:
                # Set a reasonable timeout (e.g., 5 seconds) to avoid hanging workers
                timeout = aiohttp.ClientTimeout(total=5)
                async with session.get(target_url, timeout=timeout, ssl=False) as response:
                    status = response.status
                    # Read response body to ensure complete transfer
                    await response.read()
                    
                    elapsed = time.perf_counter() - start
                    self.response_times.append(elapsed)
                    self.total_requests += 1
                    self.status_codes[status] += 1
                    
                    if 200 <= status < 400:
                        self.success_count += 1
                    else:
                        self.error_count += 1
            except aiohttp.ClientError as e:
                self.total_requests += 1
                self.error_count += 1
                self.status_codes["ConnectionError"] += 1
            except asyncio.TimeoutError:
                self.total_requests += 1
                self.error_count += 1
                self.status_codes["Timeout"] += 1
            except Exception as e:
                self.total_requests += 1
                self.error_count += 1
                self.status_codes[type(e).__name__] += 1

            # Yield control to allow event loop to process other tasks
            await asyncio.sleep(0)

    async def report_progress(self):
        self.start_time = time.perf_counter()
        while self.is_running:
            await asyncio.sleep(1)
            elapsed = time.perf_counter() - self.start_time
            if elapsed > 0:
                rps = self.total_requests / elapsed
                avg_time = (sum(self.response_times[-100:]) / len(self.response_times[-100:])) * 1000 if self.response_times else 0
                print(f"[+] Elapsed: {elapsed:.1f}s | Req: {self.total_requests} | Success: {self.success_count} | Errors: {self.error_count} | Throughput: {rps:.1f} req/s | Avg Latency (last 100): {avg_time:.1f}ms", flush=True)

    async def run(self):
        print(f"[*] Starting stress test against: {', '.join(self.urls)}")
        print(f"[*] Concurrency limit: {self.concurrency} concurrent requests")
        print(f"[*] Duration: {self.duration} seconds")
        print("=" * 80)
        
        # Configure connection pool limits for maximum throughput
        connector = aiohttp.TCPConnector(
            limit=self.concurrency,
            ttl_dns_cache=300,
            use_dns_cache=True,
            ssl=False
        )
        
        async with aiohttp.ClientSession(connector=connector) as session:
            # Spawn worker tasks
            tasks = [asyncio.create_task(self.fetch(session)) for _ in range(self.concurrency)]
            # Spawn progress reporter
            reporter = asyncio.create_task(self.report_progress())
            
            # Run for the specified duration
            await asyncio.sleep(self.duration)
            
            # Stop workers
            self.is_running = False
            reporter.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            
        self.print_summary()

    def print_summary(self):
        actual_duration = time.perf_counter() - self.start_time
        print("\n" + "=" * 80)
        print(" STRESS TEST SUMMARY")
        print("=" * 80)
        print(f"Total Duration:      {actual_duration:.2f} seconds")
        print(f"Total Requests:      {self.total_requests}")
        print(f"Successful Requests: {self.success_count}")
        print(f"Failed Requests:     {self.error_count}")
        
        if actual_duration > 0:
            print(f"Average Throughput:  {self.total_requests / actual_duration:.2f} req/s")
            
        if self.response_times:
            sorted_times = sorted(self.response_times)
            p50 = sorted_times[int(len(sorted_times) * 0.5)] * 1000
            p90 = sorted_times[int(len(sorted_times) * 0.9)] * 1000
            p99 = sorted_times[int(len(sorted_times) * 0.99)] * 1000
            avg = (sum(sorted_times) / len(sorted_times)) * 1000
            print(f"Latency Min:         {sorted_times[0]*1000:.1f}ms")
            print(f"Latency Avg:         {avg:.1f}ms")
            print(f"Latency P50 (median):{p50:.1f}ms")
            print(f"Latency P90:         {p90:.1f}ms")
            print(f"Latency P99:         {p99:.1f}ms")
            print(f"Latency Max:         {sorted_times[-1]*1000:.1f}ms")
            
        print("\nStatus Codes / Exceptions:")
        for code, count in self.status_codes.items():
            print(f"  {code}: {count}")
        print("=" * 80)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="High-performance asyncio HTTP stress tester.")
    parser.add_argument("--concurrency", type=int, default=500, help="Number of concurrent requests (default: 500)")
    parser.add_argument("--duration", type=int, default=30, help="Duration of the test in seconds (default: 30)")
    args = parser.parse_args()
    
    # Target URLs
    targets = [
        "https://grafana-sentinel-tedi.bima.dev/",
        "https://sentinel.bima.dev/"
    ]
    
    tester = StressTester(targets, args.concurrency, args.duration)
    try:
        asyncio.run(tester.run())
    except KeyboardInterrupt:
        print("\n[-] Test interrupted by user.")
        tester.print_summary()
