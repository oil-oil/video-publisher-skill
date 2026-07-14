export async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Math.min(Math.max(1, concurrency), Math.max(1, items.length));
  await Promise.all(Array.from({ length: workers }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

export class SerialQueue {
  #tail = Promise.resolve();

  enqueue(work) {
    const run = this.#tail.then(work);
    this.#tail = run.catch(() => {});
    return run;
  }

  async idle() {
    await this.#tail;
  }
}
