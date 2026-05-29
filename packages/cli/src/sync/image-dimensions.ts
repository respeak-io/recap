/**
 * Read width/height from a PNG or JPEG buffer by parsing the file header.
 * Returns null for formats we don't measure (GIF, WebP, SVG) — matching the
 * reference client, which only sets dimensions for PNG/JPEG.
 */
export function imageDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG: 8-byte signature + IHDR length(4) + "IHDR"(4) + width(4) + height(4).
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG: scan segments for SOF0 (0xC0) or SOF2 (0xC2).
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 1 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      // Padding byte.
      if (marker === 0xff) {
        offset++;
        continue;
      }
      // Standalone markers (no length payload): TEM, RSTn, SOI, EOI.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      if (offset + 4 > buf.length) break;
      const segLen = buf.readUInt16BE(offset + 2);
      if (marker === 0xc0 || marker === 0xc2) {
        // length(2) + precision(1) + height(2) + width(2)
        if (offset + 9 > buf.length) break;
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        return { width, height };
      }
      offset += 2 + segLen;
    }
  }

  return null;
}
