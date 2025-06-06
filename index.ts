import fs from "fs";
import path from "path";
import sharp from "sharp";
import { execSync } from "child_process";

import config from "./config.json";

/**
 * 处理单张图片的缩放操作
 * @param inputPath 输入图片的路径
 * @param outputPath 缩放后图片的输出路径
 */
async function processImage(inputPath: string, outputPath: string): Promise<void> {
    try {
        const image = sharp(inputPath);
        const metadata = await image.metadata();

        const newWidth = Math.round(metadata.width! * (720/1080));
        const newHeight = Math.round(metadata.height! * (720/1080));

        await image.resize(newWidth, newHeight).toFile(outputPath);

        console.log(`Processed: ${inputPath} → ${outputPath}`);
    } catch (err: any) {
        console.error(`Error processing ${inputPath}:`, err.message);
    }
}

/**
 * 处理单个图集文件的打包操作（需启用Texture Packer）
 * @param spriteSheetPath 图集文件路径（.spritesheet）
 */
async function processSpriteSheet(spriteSheetPath: string): Promise<void> {
    if (!config.texturePacker?.enable) return;

    try {
        const escapedPath = path.dirname(spriteSheetPath).replace(/[\u0080-\uFFFF]/g, (match) => encodeURI(match));
        const cmd = `"${config.texturePacker.cliPath}" ${config.texturePacker.params.trim()} \
  --sheet "${spriteSheetPath.replace(".spritesheet", `.${config.texturePacker.textureFormat}`)}" \
  --data "${spriteSheetPath.replace(".spritesheet", ".json")}" \
  "${escapedPath}"`;

        execSync(cmd, { stdio: "inherit" });
        console.log(`Packaged: ${spriteSheetPath}`);
    } catch (err: any) {
        console.error(`Error packaging ${spriteSheetPath}:`, err.message);
    }
}

/**
 * 递归遍历目录并对每个文件执行处理函数
 * @param dir 要遍历的根目录
 * @param fileHandler 处理单个文件的回调函数
 */
function processFiles(dir: string, fileHandler: (filePath: string) => void): void {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            processFiles(filePath, fileHandler);
        } else {
            fileHandler(filePath);
        }
    });
}

/**
 * 递归处理目标目录，为包含图片的子目录生成图集
 * @param dir 要处理的根目录（通常为输出目录）
 */
function processSpriteSheets(dir: string): void {
    function processFolder(currentDir: string, baseDir: string = dir) {
        const hasImages = fs.readdirSync(currentDir).some((file) => /.(jpg|jpeg|png|webp|gif)$/i.test(file));

        if (hasImages) {
            const relativePath = path.relative(baseDir, currentDir);
            console.log("path:", baseDir, currentDir, relativePath);
            const atlasName = relativePath.split(path.sep).join("_");
            // 检查 config.texturePacker 是否存在，避免未定义错误
            if (!config.texturePacker) {
                console.error("config.texturePacker 未定义，无法生成命令。");
                return;
            }
            const cmd = `"${config.texturePacker.cliPath}" ${config.texturePacker.params.trim()} \
        --sheet "${path.join(
            config.texturePacker?.plistOutputDir || dir,
            `${atlasName}.${config.texturePacker.textureFormat}`
        )}" \
        --data "${path.join(config.texturePacker?.plistOutputDir || dir, `${atlasName}.plist`)}" \
        "${currentDir}"`;

            try {
                execSync(cmd, { stdio: "inherit" });
                // console.log(`Packaged folder: ${relativePath}`);
            } catch (err: any) {
                console.error(`Error packaging ${relativePath}:`, err.message);
            }
        }

        fs.readdirSync(currentDir, { withFileTypes: true }).forEach((dirent) => {
            if (dirent.isDirectory()) {
                processFolder(path.join(currentDir, dirent.name), baseDir);
            }
        });
    }

    processFolder(dir);
}

/**
 * 主处理流程：先缩放图片，再打包图集
 * @param dir 待处理的原始目录（配置中的inputDir）
 */
async function processDirectory(dir: string) {
    // 第一阶段：处理图片缩放
    processFiles(dir, (filePath) => {
        const relativePath = path.relative(config.inputDir, filePath);
        const outputPath = path
            .normalize(path.join(config.outputDir, relativePath))
            .replace(/[\u0080-\uFFFF]/g, (match) => encodeURI(match));
        // return;
        if (/.(jpg|jpeg|png|webp|gif)$/i.test(filePath)) {
            fs.mkdirSync(decodeURIComponent(path.dirname(outputPath)), {
                recursive: true,
            });
            processImage(filePath, outputPath);
        }
    });
    // return;
    await new Promise((resolve) => setTimeout(resolve, 2000)); // 等待2秒，确保所有图片处理完成，然后再开始处理spriteSheetDat
    console.log("All images processed.");
    if (!config.texturePacker?.enable) return;
    console.log("Starting sprite sheet processing...");
    // 第二阶段：处理图集打包
    processSpriteSheets(config.outputDir);
}

// 启动处理
console.log("Starting image processing...");
try {
    // 先处理原始目录中的图片
    // 取消注释图片处理流程
    processDirectory(config.inputDir);

    // processSpriteSheets(config.outputDir);

    // 最后处理输出目录中的图集
    console.log("Processing completed!");
} catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
}
