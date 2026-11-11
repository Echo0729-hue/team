import fs from "node:fs";

/** 极简 MP4 盒子解析：读取总时长与各轨道编码类型，用于校验合并成片。 */
const containerTypes = new Set(["moov", "trak", "mdia", "minf", "stbl", "udta", "dinf"]);

function parseBoxes(buffer, start, end, depth = 0) {
  const boxes = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      size = Number(buffer.readBigUInt64BE(offset + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize) break;
    const box = { type, start: offset, bodyStart: offset + headerSize, end: offset + size, depth };
    if (containerTypes.has(type)) {
      box.children = parseBoxes(buffer, box.bodyStart, box.end, depth + 1);
    }
    boxes.push(box);
    offset += size;
  }
  return boxes;
}

function find(boxes, type) {
  for (const box of boxes) {
    if (box.type === type) return box;
    if (box.children) {
      const nested = find(box.children, type);
      if (nested) return nested;
    }
  }
  return null;
}

function all(boxes, type, acc = []) {
  for (const box of boxes) {
    if (box.type === type) acc.push(box);
    if (box.children) all(box.children, type, acc);
  }
  return acc;
}

const file = process.argv[2];
const buffer = fs.readFileSync(file);
const top = parseBoxes(buffer, 0, buffer.length);
const moov = find(top, "moov");

const mvhd = find([moov], "mvhd");
const version = buffer.readUInt8(mvhd.bodyStart);
let timescale;
let duration;
if (version === 0) {
  timescale = buffer.readUInt32BE(mvhd.bodyStart + 12);
  duration = buffer.readUInt32BE(mvhd.bodyStart + 16);
} else {
  timescale = buffer.readUInt32BE(mvhd.bodyStart + 20);
  duration = Number(buffer.readBigUInt64BE(mvhd.bodyStart + 24));
}

const tracks = all([moov], "trak").map((trak) => {
  const hdlr = find([trak], "hdlr");
  const handler = buffer.toString("ascii", hdlr.bodyStart + 8, hdlr.bodyStart + 12);
  const mdhd = find([trak], "mdhd");
  const mdVersion = buffer.readUInt8(mdhd.bodyStart);
  const mdTimescale = mdVersion === 0
    ? buffer.readUInt32BE(mdhd.bodyStart + 12)
    : buffer.readUInt32BE(mdhd.bodyStart + 20);
  const mdDuration = mdVersion === 0
    ? buffer.readUInt32BE(mdhd.bodyStart + 16)
    : Number(buffer.readBigUInt64BE(mdhd.bodyStart + 24));
  const stsd = find([trak], "stsd");
  const codec = stsd ? buffer.toString("ascii", stsd.bodyStart + 12, stsd.bodyStart + 16) : "?";
  return {
    handler,
    codec,
    seconds: Number((mdDuration / mdTimescale).toFixed(3)),
  };
});

console.log(
  JSON.stringify(
    {
      file,
      size: buffer.length,
      durationSeconds: Number((duration / timescale).toFixed(3)),
      tracks,
    },
    null,
    2,
  ),
);