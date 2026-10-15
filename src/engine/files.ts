// What the engine sees of a working folder: the text files Claude wrote in out/, handed over by the
// app as one snapshot, so the checks need no file system (they run inside the WebView).

/** out/ files by their path inside out/, "/"-separated: { "meta.json": "…", "articles/01.html": "…" }. */
export type Files = Record<string, string>;

/** The names of the files directly inside `dir` (like readdirSync(…).sort()). */
export function listDir(out: Files, dir: string): string[] {
  const pre = dir + "/";
  return Object.keys(out).filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes("/")).map((k) => k.slice(pre.length)).sort();
}

/** SHA-1 of a string's UTF-8 bytes, as hex (synchronous; crypto.subtle is async only). */
export function sha1Hex(s: string): string {
  const msg = new TextEncoder().encode(s);
  const len = msg.length;
  const words = new Uint32Array((((len + 8) >> 6) + 1) * 16);
  for (let i = 0; i < len; i++) words[i >> 2] |= msg[i] << (24 - (i % 4) * 8);
  words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  words[words.length - 1] = len * 8;
  words[words.length - 2] = Math.floor((len * 8) / 0x100000000);
  let [a, b, c, d, e] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  const rol = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  for (let off = 0; off < words.length; off += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[off + i];
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [A, B, C, D, E] = [a, b, c, d, e];
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (B & C) | (~B & D) : i < 40 ? B ^ C ^ D : i < 60 ? (B & C) | (B & D) | (C & D) : B ^ C ^ D;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const tmp = (rol(A, 5) + f + E + k + w[i]) >>> 0;
      [E, D, C, B, A] = [D, C, rol(B, 30) >>> 0, A, tmp];
    }
    [a, b, c, d, e] = [(a + A) >>> 0, (b + B) >>> 0, (c + C) >>> 0, (d + D) >>> 0, (e + E) >>> 0];
  }
  return [a, b, c, d, e].map((x) => x.toString(16).padStart(8, "0")).join("");
}
