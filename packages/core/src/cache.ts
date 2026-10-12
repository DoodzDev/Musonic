/**
 * @file cache.ts
 * @description Small in-memory cache with expiry and in-flight request sharing.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

interface Entry<T> {
  promise: Promise<T>;
  expires: number;
  /** Set once the request succeeded, so callers can render without waiting. */
  value?: { data: T };
}

/**
 * Keeps results for a short time so navigating back and forth is instant, and
 * shares one request between callers asking for the same key at once.
 * Failed requests are not kept.
 */
export class MemoryCache {
  private readonly entries = new Map<string, Entry<unknown>>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key) as Entry<T> | undefined;
    if (hit && hit.expires > this.now()) return hit.promise;
    const promise = load();
    const entry: Entry<T> = { promise, expires: this.now() + ttlMs };
    this.entries.set(key, entry);
    promise.then(
      (data) => {
        entry.value = { data };
      },
      () => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
      },
    );
    return promise;
  }

  /** Result already received and still fresh, without waiting for a promise. */
  peek<T>(key: string): T | undefined {
    const hit = this.entries.get(key) as Entry<T> | undefined;
    return hit && hit.expires > this.now() ? hit.value?.data : undefined;
  }

  /** Drops every key starting with `prefix` (all keys when omitted), e.g. after an edit. */
  invalidate(prefix = ''): void {
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }
}
