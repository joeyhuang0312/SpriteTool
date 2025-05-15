import fs from 'fs';
import path from 'path';
import plist from 'plist';
import sharp from 'sharp';

const plistPath = './big.plist';
const imagePath = './big.png';
const outputDir = './output';

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const content = fs.readFileSync(plistPath, 'utf8');
const parsed = plist.parse(content) as any;

const frames = parsed.frames;
const meta = parsed.metadata;

interface FrameInfo {
  frame: string;
  rotated: boolean;
  sourceSize: string;
  offset: string;
}

function parseRect(str: string) {
  // 格式: {{x,y},{w,h}}
  const match = str.match(/{{(\d+),(\d+)},{(\d+),(\d+)}}/);
  if (!match) throw new Error('Invalid rect: ' + str);
  return {
    x: parseInt(match[1]),
    y: parseInt(match[2]),
    width: parseInt(match[3]),
    height: parseInt(match[4])
  };
}

async function extractFrames() {
  for (const name in frames) {
    const frameData = frames[name] as FrameInfo;
    const rect = parseRect(frameData.frame);
    const rotated = frameData.rotated;

    const outputFilePath = path.join(outputDir, name);

    let image = sharp(imagePath).extract({
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
    });

    // 如果图片是旋转的（TexturePacker的rotated字段）
    if (rotated) {
      image = image.rotate(-90).resize(rect.height, rect.width);
    }

    await image.toFile(outputFilePath);
    console.log(`Saved: ${name}`);
  }
}

extractFrames().catch(console.error);
