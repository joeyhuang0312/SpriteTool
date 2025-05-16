import fs from "fs";
import path from "path";
import plist from "plist";
import sharp from "sharp";

import rawConfig from "./config.json";
// 为了避免 rawConfig.extract 为 undefined 的情况，添加默认值
const { plistPath = "", imagePath = "", outputDir = "" } = rawConfig.extract || {};

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

const content = fs.readFileSync(plistPath, "utf8");
const parsed = plist.parse(content) as any;

const frames = parsed.frames;
const meta = parsed.metadata;

const entries = Object.entries(frames) as [string, FrameInfo][];

interface FrameInfo {
    frame: string;
    rotated: boolean;
    sourceSize: { width: number; height: number };
    offset: { x: number; y: number };
}

function parseRect(str: string) {
    // 格式: {{x,y},{w,h}}
    const match = str.match(/{{(\d+),(\d+)},{(\d+),(\d+)}}/);
    if (!match) throw new Error("Invalid rect: " + str);
    return {
        x: parseInt(match[1]),
        y: parseInt(match[2]),
        width: parseInt(match[3]),
        height: parseInt(match[4]),
    };
}

async function extractFrames() {
    for (const [name, frameData] of entries) {
        // if (!entries.hasOwnProperty(name)){
        //   console.log(`Skipped: ${name}`);
        //   continue;
        // }

        // const frameData = entries[name] as FrameInfo;
        console.log(`Processing: ${name}, frameData:${JSON.stringify(frameData)}`);
        const rect = parseRect(frameData.frame);
        console.log(`Processing: ${name}, rect:${JSON.stringify(rect)}`);
        const rotated = frameData.rotated;

        const outputFilePath = path.join(outputDir, name);

        let image = sharp(imagePath).extract({
            left: rect.x,
            top: rect.y,
            width: rotated ? rect.height : rect.width,
            height: rotated ? rect.width : rect.height,
        });

        // 如果图片是旋转的（TexturePacker的rotated字段）
        if (rotated) {
            image = image.rotate(-90); //.resize(rect.height, rect.width);
        }

        await image.toFile(outputFilePath);
        console.log(`Saved: ${name}`);
    }
}

extractFrames().catch(console.error);
