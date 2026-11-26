const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** One page's source/adjustment writes never race one another. A rejection does not poison the queue. */
export function handsWriteQueue() {
  let tail = Promise.resolve();
  return operation => { const result = tail.then(operation); tail = result.catch(() => {}); return result; };
}

/** Rebase only the fields the person finished. Hashes are identities, never clocks. */
export async function commitHandsFields({ base, changes, load, save, read }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await load();
    const conflicts = Object.keys(changes).filter(field => !equal(read(current, field), read(base, field)) && !equal(read(current, field), changes[field]));
    if (conflicts.length) {
      const error = new Error('Changed elsewhere. Review the saved value before retrying.');
      error.current = current; error.fields = conflicts; throw error;
    }
    try { return { ...current, ...await save(current, changes) }; }
    catch (error) {
      // Busy writers, unsafe data, validation and transport errors require an explicit retry.
      if (error.status !== 409 || !/profile changed|providers changed/i.test(error.message) || attempt === 2) throw error;
    }
  }
}
