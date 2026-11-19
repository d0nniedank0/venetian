/* Minimal store-only ZIP writer — no compression, no dependencies.
   Emits entries in order with correct local headers, central directory,
   and EOCD. PNG strips are already compressed, so "store" costs nothing.2*/

(function () {
  "use strict";

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // files: [{ name: "a.png", data: Uint8Array }]
  function buildZip(files) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("zip needs at least one file");
    }
    files.forEach(function (f) {
      if (!f || typeof f.name !== "string" || !f.name) {
        throw new Error("every zip entry needs a name");
      }
      if (!f.data || !f.data.length) throw new Error("every zip entry needs data");
    });

    var chunks = [];      // body bytes (local headers + data)
    var central = [];    // central directory records
    var offset = 0;
    var DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 18; // 2026-11-18
    var DOS_TIME = (12 << 11);                            // 00:12... eh, fine

    files.forEach(function (f) {
      var nameBytes = new Uint8Array(f.name.length);
      for (var i = 0; i < f.name.length; i++) nameBytes[i] = f.name.charCodeAt(i) & 0xff;
      var crc = crc32(f.data);
      var size = f.data.length;

      // local file header (30 bytes) + name + data
      var lh = new Uint8Array(30 + nameBytes.length);
      put32(lh, 0, 0x04034b50);
      put16(lh, 4, 20);            // version needed
      put16(lh, 6, 0x0800);        // flags: UTF-8 names
      put16(lh, 8, 0);             // method: store
      put16(lh, 10, DOS_TIME);
      put16(lh, 12, DOS_DATE);
      put32(lh, 14, crc);
      put32(lh, 18, size);
      put32(lh, 22, size);
      put16(lh, 26, nameBytes.length);
      put16(lh, 28, 0);            // extra length
      lh.set(nameBytes, 30);
      chunks.push(lh, f.data);

      // central directory record (46 bytes) + name
      var cd = new Uint8Array(46 + nameBytes.length);
      put32(cd, 0, 0x02014b50);
      put16(cd, 4, 20);            // version made by
      put16(cd, 6, 20);            // version needed
      put16(cd, 8, 0x0800);        // flags
      put16(cd, 10, 0);            // method: store
      put16(cd, 12, DOS_TIME);
      put16(cd, 14, DOS_DATE);
      put32(cd, 16, crc);
      put32(cd, 20, size);
      put32(cd, 24, size);
      put16(cd, 28, nameBytes.length);
      put16(cd, 30, 0);            // extra
      put16(cd, 32, 0);            // comment
      put16(cd, 34, 0);            // disk number
      put16(cd, 36, 0);            // internal attrs
      put32(cd, 38, 0);            // external attrs
      put32(cd, 42, offset);       // local header offset
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += lh.length + size;
    });

    var cdSize = central.reduce(function (s, c) { return s + c.length; }, 0);

    // EOCD (22 bytes)
    var eocd = new Uint8Array(22);
    put32(eocd, 0, 0x06054b50);
    put16(eocd, 4, 0);
    put16(eocd, 6, 0);
    put16(eocd, 8, files.length);
    put16(eocd, 10, files.length);
    put32(eocd, 12, cdSize);
    put32(eocd, 16, offset);
    put16(eocd, 20, 0);

    var total = offset + cdSize + 22;
    var out = new Uint8Array(total);
    var o = 0;
    [chunks, central].forEach(function (list) {
      list.forEach(function (b) { out.set(b, o); o += b.length; });
    });
    out.set(eocd, o);

    return out;
  }

  function put16(a, o, v) { a[o] = v & 0xff; a[o + 1] = (v >>> 8) & 0xff; }
  function put32(a, o, v) {
    a[o] = v & 0xff; a[o + 1] = (v >>> 8) & 0xff;
    a[o + 2] = (v >>> 16) & 0xff; a[o + 3] = (v >>> 24) & 0xff;
  }

  var api = { buildZip: buildZip, crc32: crc32 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.VenetianZip = api;
})();
