declare module '*.json' {
  interface Config {
    inputDir: string;
    outputDir: string;
    scaleFactor: number;
    folderPattern?: string;
    texturePacker?: {
      enable: boolean;
      cliPath: string;
      textureFormat: string;
      params: string;
      plistOutputDir?: string;
    };
  }

  const value: Config;
  export default value;
}