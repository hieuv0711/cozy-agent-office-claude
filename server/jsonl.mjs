import fs from 'node:fs';

const CHUNK = 4 * 1024 * 1024;

// Record types we never need. Checked on the raw bytes, before JSON.parse,
// because some of them (api-request-blob) are megabytes per line.
const SKIP = [
  '{"type":"api-request',
  '{"type":"file-history',
  '{"type":"atis-latch"',
  '{"type":"mode"',
  '{"type":"permission-mode"',
  '{"type":"session-owner"',
  '{"type":"frame-link"',
  '{"type":"artifact-',
  '{"type":"tools-used"',
];

function wanted(buf, start, end) {
  const head = buf.toString('latin1', start, Math.min(end, start + 220));
  for (const p of SKIP) if (head.startsWith(p)) return false;
  // attachment records put "attachment" right after parentUuid/isSidechain
  if (head.startsWith('{"parentUuid"') && head.includes('"attachment":{')) return false;
  return true;
}

// Reads a JSONL file incrementally: each pull() parses only the bytes appended
// since the last call. Survives truncation and file replacement.
export class JsonlTail {
  constructor(file) {
    this.file = file;
    this.offset = 0;
    this.carry = null;
    this.ino = 0;
    this.size = 0;
    this.mtimeMs = 0;
    this.resets = 0;
  }

  // onRecord(obj) is called for each parsed line. onReset() when the file was
  // replaced or shrank (caller should drop derived state). Returns true if
  // anything new was read.
  async pull(onRecord, { final = false, onReset } = {}) {
    let st;
    try {
      st = await fs.promises.stat(this.file);
    } catch {
      return false;
    }
    if ((this.ino && st.ino !== this.ino) || st.size < this.offset) {
      this.offset = 0;
      this.carry = null;
      this.resets++;
      onReset?.();
    }
    this.ino = st.ino;
    if (st.size === this.offset) {
      if (final && this.carry) this.#flush(onRecord);
      this.mtimeMs = st.mtimeMs;
      return false;
    }
    const fh = await fs.promises.open(this.file, 'r');
    try {
      while (this.offset < st.size) {
        const len = Math.min(CHUNK, st.size - this.offset);
        const buf = Buffer.allocUnsafe(len);
        const { bytesRead } = await fh.read(buf, 0, len, this.offset);
        if (!bytesRead) break;
        this.offset += bytesRead;
        let data = buf.subarray(0, bytesRead);
        if (this.carry) {
          data = Buffer.concat([this.carry, data]);
          this.carry = null;
        }
        let start = 0;
        for (;;) {
          const nl = data.indexOf(10, start);
          if (nl === -1) {
            if (start < data.length) this.carry = Buffer.from(data.subarray(start));
            break;
          }
          if (nl > start && wanted(data, start, nl)) {
            let obj = null;
            try {
              obj = JSON.parse(data.toString('utf8', start, nl));
            } catch {
              obj = null;
            }
            if (obj) onRecord(obj);
          }
          start = nl + 1;
        }
        if (this.offset < st.size) await new Promise((r) => setImmediate(r));
      }
    } finally {
      await fh.close();
    }
    if (final && this.carry) this.#flush(onRecord);
    this.size = st.size;
    this.mtimeMs = st.mtimeMs;
    return true;
  }

  #flush(onRecord) {
    const data = this.carry;
    this.carry = null;
    if (!data || !wanted(data, 0, data.length)) return;
    try {
      onRecord(JSON.parse(data.toString('utf8')));
    } catch {
      // half-written last line: ignore
    }
  }
}

// Small helpers for the cheap history listing: read the first / last bytes of a
// file and parse whole lines only.
export async function readHeadLines(file, bytes) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return parseLines(buf.subarray(0, bytesRead), false);
  } finally {
    await fh.close();
  }
}

export async function readTailLines(file, bytes, size) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const start = Math.max(0, size - bytes);
    const len = size - start;
    const buf = Buffer.allocUnsafe(len);
    const { bytesRead } = await fh.read(buf, 0, len, start);
    return parseLines(buf.subarray(0, bytesRead), start > 0);
  } finally {
    await fh.close();
  }
}

function parseLines(data, dropFirst) {
  const out = [];
  let start = 0;
  if (dropFirst) {
    const nl = data.indexOf(10);
    start = nl === -1 ? data.length : nl + 1;
  }
  for (;;) {
    const nl = data.indexOf(10, start);
    if (nl === -1) break;
    if (nl > start && wanted(data, start, nl)) {
      try {
        out.push(JSON.parse(data.toString('utf8', start, nl)));
      } catch {
        // skip
      }
    }
    start = nl + 1;
  }
  return out;
}
