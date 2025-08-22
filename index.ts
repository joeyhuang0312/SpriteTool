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

    const newWidth = Math.round(metadata.width! * config.scaleFactor);
    const newHeight = Math.round(metadata.height! * config.scaleFactor);

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
      // processImage(filePath, outputPath);
      ProcessImageWithCropOptimized(filePath,outputPath);
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

/**
 * 裁剪单张图片
 * @param inputPath 输入图片的路径
 * @param outputPath 裁剪后图片的输出路径
 * @param x 裁剪起始X坐标
 * @param y 裁剪起始Y坐标
 * @param width 裁剪宽度
 * @param height 裁剪高度
 */
async function CropImage(inputPath: string, outputPath: string, x: number, y: number, width: number, height: number): Promise<void> {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    // 验证裁剪参数是否在图片范围内
    if (x < 0 || y < 0 || x + width > metadata.width! || y + height > metadata.height!) {
      throw new Error(`裁剪参数超出图片范围。图片尺寸: ${metadata.width}x${metadata.height}, 裁剪区域: ${x},${y},${width}x${height}`);
    }
    
    // 执行裁剪操作
    await image
      .extract({ left: x, top: y, width: width, height: height })
      .toFile(outputPath);
    
    console.log(`Cropped: ${inputPath} → ${outputPath} (${x},${y},${width}x${height})`);
  } catch (err: any) {
    console.error(`Error cropping ${inputPath}:`, err.message);
  }
}

/**
 * 批量裁剪图片（根据配置文件中的裁剪参数）
 * @param inputPath 输入图片的路径
 * @param outputPath 裁剪后图片的输出路径
 */
/**
 * 优化版本的图片裁剪和压缩函数
 * @param inputPath 输入图片的路径
 * @param outputPath 输出图片的路径
 */
async function ProcessImageWithCropOptimized(inputPath: string, outputPath: string): Promise<void> {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    let processedImage = image;
    
    // 如果配置文件中有裁剪参数，则进行裁剪
    if (config.crop && config.crop.enable) {
      const { x, y, width, height } = config.crop;
      
      // 验证裁剪参数
      if (x < 0 || y < 0 || x + width > metadata.width! || y + height > metadata.height!) {
        console.warn(`跳过 ${inputPath}: 裁剪参数超出图片范围`);
        return;
      }
      
      // 先裁剪再缩放
      processedImage = processedImage
        .extract({ left: x, top: y, width: width, height: height })
        .resize(
          Math.round(width * config.scaleFactor),
          Math.round(height * config.scaleFactor)
        );
    } else {
      // 只进行缩放
      const newWidth = Math.round(metadata.width! * config.scaleFactor);
      const newHeight = Math.round(metadata.height! * config.scaleFactor);
      processedImage = processedImage.resize(newWidth, newHeight);
    }
    
    // 应用图片优化设置
    if (config.imageOptimization && config.imageOptimization.enable) {
      const opt = config.imageOptimization;
      
      switch (opt.format.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
          processedImage = processedImage.jpeg({
            quality: opt.quality || 90,
            progressive: opt.progressive || true,
            optimizeScans: opt.optimizeScans || true,
            mozjpeg: opt.mozjpeg || true
          });
          break;
          
        case 'png':
          processedImage = processedImage.png({
            compressionLevel: opt.compressionLevel || 9,
            progressive: opt.progressive || false,
            palette: true  // 使用调色板模式减少文件大小
          });
          break;
          
        case 'webp':
          processedImage = processedImage.webp({
            quality: opt.quality || 90,
            effort: 6  // 压缩努力程度 (0-6)
          });
          break;
      }
    }
    
    // 保存处理后的图片
    await processedImage.toFile(outputPath);
    
    // 显示文件大小对比
    const inputStats = await fs.promises.stat(inputPath);
    const outputStats = await fs.promises.stat(outputPath);
    const compressionRatio = ((inputStats.size - outputStats.size) / inputStats.size * 100).toFixed(1);
    
    console.log(`Processed: ${inputPath} → ${outputPath}`);
    console.log(`Size: ${(inputStats.size / 1024).toFixed(1)}KB → ${(outputStats.size / 1024).toFixed(1)}KB (${compressionRatio}% reduction)`);
    
  } catch (err: any) {
    console.error(`Error processing ${inputPath}:`, err.message);
  }
}
