// 生成测试用 PNG（渐变 + 色块），不依赖外部库
import fs from "node:fs";
import zlib from "node:zlib";

const W = 800;
const H = 450;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
};

const raw = Buffer.alloc((W * 3 + 1) * H);
let offset = 0;
for (let y = 0; y < H; y += 1) {
  raw[offset] = 0;
  offset += 1;
  for (let x = 0; x < W; x += 1) {
    const inBlock = x > 60 && x < 260 && y > 60 && y < 200;
    const inCircle = Math.hypot(x - 600, y - 300) < 90;
    raw[offset] = inBlock ? 255 : Math.round((x / W) * 120 + 40);
    raw[offset + 1] = inBlock ? 90 : Math.round((y / H) * 140 + 60);
    raw[offset + 2] = inCircle ? 240 : 150;
    offset += 3;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

fs.writeFileSync("test-layer.png", png);
console.log("png bytes", png.length, `${W}x${H}`);