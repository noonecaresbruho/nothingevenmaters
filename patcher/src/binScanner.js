export function scanAll(buffer, needle) {
  if (!Buffer.isBuffer(buffer)) throw new Error("buffer must be Buffer");
  if (!Buffer.isBuffer(needle)) throw new Error("needle must be Buffer");
  if (needle.length === 0) return [];

  const offsets = [];
  let idx = 0;
  while (idx <= buffer.length - needle.length) {
    const found = buffer.indexOf(needle, idx);
    if (found === -1) break;
    offsets.push(found);
    idx = found + 1;
  }
  return offsets;
}

