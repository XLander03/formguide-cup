/**
 * Map `items` through `run` with at most `limit` calls in flight.
 * Results come back in input order, whatever order the calls finish in.
 * The first rejection rejects the whole map (like Promise.all); calls already
 * running are left to settle, and no new ones start.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  async function worker(): Promise<void> {
    while (!failed && next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await run(items[index], index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  }
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  await Promise.all(Array.from({ length: width }, worker));
  return results;
}
