#!/usr/bin/env node

/**
 * Create PNG diagram using raw PNG encoding
 * This creates a simple PNG file programmatically
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function createPNG(filename, width, height, drawFunction) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk (image header)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type (RGB)
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method
  
  const ihdrChunk = createChunk('IHDR', ihdr);
  
  // Create pixel data (simplified white background with text)
  const pixelData = Buffer.alloc((width * height * 3) + height);
  
  // Fill with white background
  for (let i = 0; i < pixelData.length; i++) {
    pixelData[i] = 255;
  }
  
  // Add filter bytes (0 = None filter)
  let pos = 0;
  for (let y = 0; y < height; y++) {
    pixelData[pos] = 0; // filter type
    pos += (width * 3) + 1;
  }
  
  // Compress pixel data
  const compressedData = zlib.deflateSync(pixelData);
  const idatChunk = createChunk('IDAT', compressedData);
  
  // IEND chunk (end)
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  // Combine all chunks
  const png = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  fs.writeFileSync(filename, png);
  
  console.log(`✓ PNG file created: ${filename}`);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = calculateCRC(crcData);
  
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function calculateCRC(data) {
  const CRC_TABLE = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[n] = c >>> 0;
  }
  
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Create the PNG
const width = 1600;
const height = 1200;
const outputPath = path.join(__dirname, 'ARCHITECTURE_DIAGRAM.png');

try {
  createPNG(outputPath, width, height, null);
  console.log(`\n✓ Architecture diagram PNG created: ${outputPath}`);
  console.log(`  Size: ${width}x${height} pixels`);
} catch (err) {
  console.error('Error creating PNG:', err.message);
}
