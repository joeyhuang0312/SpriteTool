@echo off
chcp 65001 >nul
REM 批处理文件：直接执行SpriteTool项目
REM 作者：AI助手
REM 功能：使用pnpm start命令执行index.ts文件

title SpriteTool 启动器
echo ========================================
echo       SpriteTool 项目启动器
echo ========================================
echo.
echo 正在启动SpriteTool项目...
echo.

echo [执行] 运行命令：pnpm start
echo ========================================
echo.
pnpm start

REM 执行完成后暂停，方便查看结果
echo.
echo ========================================
echo [完成] 程序执行完毕！
echo ========================================
pause