import fs from "fs";
import path from "path";
import plist from "plist";
import sharp from "sharp";

import rawConfig from "./config.json";
// 为了避免 rawConfig.extract 为 undefined 的情况，添加默认值
const { batchInputDir = "./input/batch", batchOutputRootDir = "./output/batch" } = rawConfig.extract || {};

// 递归遍历输入目录中的所有plist文件
function walkDir(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of list) {
        if (entry.isDirectory()) {
            results = results.concat(walkDir(path.join(dir, entry.name)));
        } else if (entry.isFile() && path.extname(entry.name) === '.plist') {
            results.push(path.join(dir, entry.name));
        }
    }
    return results;
}

const plistFiles = walkDir(batchInputDir);

for (const plistFile of plistFiles) {
    const relativePath = path.relative(batchInputDir, plistFile);
    const plistName = path.basename(relativePath, ".plist");
    const dirPath = path.dirname(relativePath);
    const currentPlistPath = plistFile;
    const currentImagePath = path.join(path.dirname(plistFile), `${plistName}.png`);
    const currentOutputDir = path.join(batchOutputRootDir, dirPath, plistName);

    // 检查对应png是否存在
    if (!fs.existsSync(currentImagePath)) {
        console.log(`跳过 ${plistFile}，未找到匹配的png文件 ${currentImagePath}`);
        continue;
    }

    // 创建输出子目录
    if (!fs.existsSync(currentOutputDir)) {
        fs.mkdirSync(currentOutputDir, { recursive: true });
    }

    // 读取当前plist内容
    const content = fs.readFileSync(currentPlistPath, "utf8");
    const parsed = plist.parse(content) as any;
    const frames = parsed.frames;
    const entries = Object.entries(frames) as [string, FrameInfo][];

    // 处理当前plist的拆图逻辑
    async function processPlist() {
        for (const [name, frameData] of entries) {
            const rect = parseRect(frameData.frame);
            const rotated = frameData.rotated;

            const outputFilePath = path.join(currentOutputDir, name);

            let image = sharp(currentImagePath).extract({
                left: rect.x,
                top: rect.y,
                width: rotated ? rect.height : rect.width,
                height: rotated ? rect.width : rect.height,
            });

            if (rotated) {
                image = image.rotate(-90);
            }

            await image.toFile(outputFilePath);
            console.log(`保存: ${name} 到 ${outputFilePath}`);
        }
    }

    processPlist().catch(console.error);
}

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
