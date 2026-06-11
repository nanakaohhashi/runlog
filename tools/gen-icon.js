// アプリのアイコン(コーラル地＋白い心拍ライン)を、外部ライブラリなしで生成するスクリプト。
// 使い方:  node tools/gen-icon.js
// 出力(リポジトリ直下):
//   apple-touch-icon.png (180px, RGBA) … ホーム画面/PWA用
//   icon-512.png        (512px, RGBA) … PWAマニフェスト用
//   icon-1024.png      (1024px, RGB)  … App Store掲載用(透過なし)
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..');   // リポジトリ直下に出力

// --- CRC32(PNGのチェックサム計算用)---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// 点と線分の距離(アンチエイリアス用)
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = x1 + t * dx - px, ey = y1 + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}

// 心電図風の折れ線(0..1 の正規化座標)
const LINE = [
  [0.07, 0.52], [0.30, 0.52], [0.38, 0.30], [0.50, 0.74],
  [0.58, 0.40], [0.64, 0.52], [0.93, 0.52],
];

// size: 画素数 / alpha: trueならRGBA(透過対応)、falseならRGB(App Store用)
function makePng(size, alpha) {
  const ch = alpha ? 4 : 3;
  const lw = size * 0.055;            // 線の太さ(半幅)
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * ch);
    row[0] = 0; // フィルタ: なし
    for (let x = 0; x < size; x++) {
      // 背景: コーラルの縦グラデーション (#ff8a80 → #f0584c)
      const g = y / size;
      let r = Math.round(0xff + (0xf0 - 0xff) * g);
      let gg = Math.round(0x8a + (0x58 - 0x8a) * g);
      let b = Math.round(0x80 + (0x4c - 0x80) * g);
      // 心拍ライン(白)を距離ベースのアンチエイリアスで描画
      let d = Infinity;
      for (let i = 0; i < LINE.length - 1; i++) {
        d = Math.min(d, segDist(x, y,
          LINE[i][0] * size, LINE[i][1] * size,
          LINE[i + 1][0] * size, LINE[i + 1][1] * size));
      }
      const a = Math.max(0, Math.min(1, lw / 2 + 1 - d));
      if (a > 0) {
        r = Math.round(r + (255 - r) * a);
        gg = Math.round(gg + (255 - gg) * a);
        b = Math.round(b + (252 - b) * a);
      }
      const o = 1 + x * ch;
      row[o] = r; row[o + 1] = gg; row[o + 2] = b;
      if (alpha) row[o + 3] = 255;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;            // ビット深度
  ihdr[9] = alpha ? 6 : 2; // 6=RGBA, 2=RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), makePng(180, true));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), makePng(512, true));
fs.writeFileSync(path.join(OUT, 'icon-1024.png'), makePng(1024, false)); // App Store用(透過なし)
console.log('アイコンを生成しました: apple-touch-icon.png(180), icon-512.png(512), icon-1024.png(1024, App Store用)');
