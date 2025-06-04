const fs = require("fs");
const path = require("path");
const ts = require("typescript");

// 增强的注释规则配置
const COMMENT_RULES = {
    requiredTags: ["!en"],
    moduleRules: {
        battle: { requiredTags: ["!en", "!combat"] },
        ui: { requiredTags: ["!en", "!ui"] },
        data: { forbiddenTags: ["!combat"] },
    },
    customPatterns: [
        /*  { pattern: /!en\s+.+/, message: "!en 后必须跟随英文描述" },
        { pattern: /!cn\s+.+/, message: "!cn 后必须跟随中文描述" }, */
    ],
};

// 颜色输出工具
const COLOR = {
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
};

const validator = {
    validateComments: function (filePath) {
        try {
            Editor.info("开始检查注释规范...");
            const srcPath = path.join(__dirname, "../../../assets");
            const errorReports = [];
            // 1. 遍历所有TS文件
            validator.walkDir(srcPath, (filePath) => {
                if (!filePath.endsWith(".ts") || filePath.includes("lib") || filePath.includes("third")) return;

                try {
                    const sourceFile = ts.createSourceFile(
                        filePath,
                        fs.readFileSync(filePath, "utf-8"),
                        ts.ScriptTarget.Latest,
                        true
                    );

                    // 2. 分析源文件
                    ts.forEachChild(sourceFile, (node) => {
                        validator.checkNodeComments(node, filePath, errorReports, sourceFile);
                    });
                } catch (e) {
                    Editor.error(`解析文件失败: ${filePath}`, e);
                }
            });

            // 3. 生成报告
            if (errorReports.length > 0) {
                // printValidationReport(errorReports);
                process.exit(1);
            } else {
                Editor.log("✅ 所有注释符合规范要求");
            }
        } catch (error) {
            Editor.log("validateComments error: ", error);
        }
    },

    walkDir: function (dir, callback) {
        const ignoreDirs = ["lib", "third_party", "external", "build"];
        if (ignoreDirs.some((ignore) => dir.includes(ignore))) return;

        fs.readdirSync(dir).forEach((file) => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                validator.walkDir(filePath, callback);
            } else if (stat.isFile()) {
                callback(filePath);
            }
        });
    },
    checkNodeComments: function (node, filePath, errors, sourceFile) {
        try {
            // 检查类、函数、变量等的注释
            // 只检查类/函数/方法/属性
            const isCheckableNode =
                ts.isClassDeclaration(node) ||
                ts.isFunctionDeclaration(node) ||
                ts.isMethodDeclaration(node) ||
                ts.isPropertyDeclaration(node) ||
                ts.isGetAccessor(node) ||
                ts.isSetAccessor(node);

            if (!isCheckableNode) return;
            Editor.info("get the code");
            const startPos = ts.getLineAndCharacterOfPosition(sourceFile, node.pos);
            const endPos = ts.getLineAndCharacterOfPosition(sourceFile, node.end);
            const line = startPos.line + 1; // 行号从1开始

            // FIX 2: 获取文件名（不带路径）
            const fileShort = path.basename(sourceFile.fileName);

            // FIX 3: 获取节点标识符名称（更准确）
            let nodeName = "匿名声明";
            let nodeText = "无法获取代码";
            try {
                // 方法1：尝试获取名称标识符
                const identifier = node.getChildAt(0);
                if (identifier && ts.isIdentifier(identifier)) {
                    nodeName = identifier.text;
                }

                // 方法2：尝试从节点获取文本
                if (node.name && ts.isIdentifier(node.name)) {
                    nodeName = node.name.text;
                }

                // 获取节点文本内容（用于显示）
                nodeText = sourceFile.text.substring(node.pos, node.end);
            } catch (e) {
                console.error(`解析节点错误: ${fileShort}:${line}`, e);
            }
            Editor.info(nodeText);
            // 修复：获取关联的JSDoc注释（更准确的方式）
            const jsDocs = [];
            const comments = [];
            // Editor.info("node:", node);
            try {
                // 处理class的JSDoc
                if (ts.isClassDeclaration(node)) {
                    const classComments = ts.getJSDocCommentsAndTags(node);
                    classComments.forEach((v) => {
                        jsDocs.push({
                            line: 0,
                            text: v.getText(),
                            type: "class",
                        });
                    });

                    // jsDocs.push(...classComments.map((c) => c.getText()));

                    ts.forEachChild(node, (child) => {
                        // Editor.log("child:", child);
                        if (
                            ts.isMethodDeclaration(child) ||
                            ts.isPropertyDeclaration(child) ||
                            ts.isVariableStatement(child)
                        ) {
                            // Editor.log("isMethodDeclaration:", child.getText());
                            const methodComments = ts.getJSDocCommentsAndTags(child);
                            const str = methodComments.map((c) => c.getText());
                            // Editor.log("methodComments:" + str);
                            // jsDocs.push(...methodComments.map((c) => c.getText()));

                            // 1. 获取前导无关文本中的所有注释 (包括单行/多行)
                            const leadingRanges = ts.getLeadingCommentRanges(sourceFile.text, child.pos) || [];
                            const { line } = ts.getLineAndCharacterOfPosition(sourceFile, child.pos);
                            const startLine = line + 2;
                            leadingRanges.forEach((range) => {
                                const text = sourceFile.text.substring(range.pos, range.end);
                                jsDocs.push({
                                    line: startLine,
                                    text,
                                    type: ts.isMethodDeclaration(child)
                                        ? "method"
                                        : ts.isPropertyDeclaration(child)
                                          ? "property"
                                          : "variable",
                                });
                            });
                            if (ts.isMethodDeclaration(child)) {
                                validator.detectMethodParameters(child);
                                validator.analyzeMethodBody(child);
                            }
                        }
                    });
                }
            } catch (e) {
                console.error(`获取注释失败: ${fileShort}:${line}`, e);
            }

            const moduleType = validator.detectModuleType(filePath);
            var hasEnTag = false;
            var hasErrors = false;
            const errorArr = [];
            // 检查所有关联的注释块
            jsDocs.forEach((comment) => {
                const violations = validator.checkCommentRules(comment.text, moduleType);
                if (violations.length > 0) {
                    hasErrors = true;
                    violations.forEach((v) => {
                        hasEnTag = false;

                        // Editor.info(fileShort, line);
                        const str = validator.truncateText(comment.text, 130);
                        // 特别标记缺少 !en 的情况
                        if (v.includes('"!en"')) hasEnTag = true;
                        errorArr.push({
                            line: comment.line,
                            fixHit: validator.createFixHint(hasEnTag, comment.type),
                            comment: str,
                        });
                    });
                }

                // 单独检查是否包含 !en
                if (comment.text.includes("!en")) hasEnTag = true;
            });
            if (errorArr.length > 0) {
                validator.printValidationReport(errorArr);
            }
        } catch (error) {
            Editor.error("checkNodeComments error: ", error);
        }
    },
    checkCommentRules: function (comment, moduleType) {
        const errors = [];
        const rules = {
            ...COMMENT_RULES,
            ...(COMMENT_RULES.moduleRules[moduleType] || {}),
        };

        // 1. 检查必须包含的标记
        if (rules.requiredTags) {
            for (const tag of rules.requiredTags) {
                if (!comment.includes(tag)) {
                    errors.push(`缺少必要标记 "${tag}": {name}`);
                }
            }
        }

        // 2. 检查禁止使用的标记
        if (rules.forbiddenTags) {
            for (const tag of rules.forbiddenTags) {
                if (comment.includes(tag)) {
                    errors.push(`禁止使用标记 "${tag}": {name}`);
                }
            }
        }

        // 3. 检查自定义正则模式
        if (rules.customPatterns) {
            for (const { pattern, message } of rules.customPatterns) {
                if (!pattern.test(comment)) {
                    errors.push(`${message}: {name}`);
                }
            }
        }

        return errors;
    },
    detectModuleType: function (filePath) {
        const pathSegments = filePath.split(path.sep);

        // 优先匹配路径中的关键字
        for (const segment of pathSegments) {
            if (COMMENT_RULES.moduleRules.hasOwnProperty(segment)) {
                return segment;
            }
        }

        return "default";
    },
    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
    },
    createFixHint: function (hasEnTag, type) {
        if (hasEnTag) {
            return `Does not contain "en"`;
        }
        return `It is suggested to add it above the ${type} : \n/** !en description */`;
    },
    printValidationReport: function (errors) {
        Editor.info(` 注释规范检查报告:(共发现 ${errors.length} 处问题):`);
        errors.forEach((error) => {
            Editor.warn(`行: ${error.line}, 错误: ${error.fixHit}, 注释: ${error.comment}`);
        });
    },
    detectMethodParameters: function (methodNode) {
        try {
            // 检查是否包含参数列表
            if (methodNode.parameters) {
                const parameters = methodNode.parameters;
                Editor.log(`方法 ${methodNode.name?.getText()} 有 ${parameters.length} 个参数`);
                // Editor.log(methodNode);
                // 获取方法的所有文档注释
                const methodDocs = ts.getJSDocCommentsAndTags(methodNode);
                if (methodDocs && methodDocs.length > 0) {
                    // 打印注释文本
                    /*  Editor.log("注释文本:", methodDocs[0].comment);

                    // 打印所有标签
                    methodDocs[0].tags?.forEach((tag) => {
                        Editor.log(`标签: @${tag.tagName.text}`);
                        Editor.log(`  参数: ${tag.comment}`);
                    }); */
                }
                // 提取所有 @param 标签
                const paramTags = methodDocs.filter(ts.isJSDocParameterTag).map((tag) => ({
                    name: tag.name.getText(),
                    comment: tag.comment || "",
                }));
            }
        } catch (error) {
            Editor.error("detectMethodParameters error: ", error);
        }
    },
    analyzeMethodBody: function (methodNode) {
        try {
            if (!methodNode.body) {
                Editor.error("methodNode.body is null");
                return;
            }
            //  Editor.log(methodNode.body);
            const body = methodNode.body;
            body.statements.forEach((statement) => {
                if (ts.isVariableStatement(statement)) {
                    statement.declarationList.declarations.forEach((declaration) => {
                        if (declaration.name && ts.isIdentifier(declaration.name)) {
                            const varName = declaration.name.getText();
                            const varType = declaration.type?.getText() || "inferred";
                            const kind = ts.SyntaxKind[statement.declarationList.flags]; // const, let, var
                            Editor.log(`varName:${varName},varType:${varType},kind:${kind}`);
                            Editor.log(`变量声明: ${declaration.name.text}`);
                        }
                    });
                }
            });
            if (!node.declarationList || !node.declarationList.declarations) {
                // 安全遍历
                // Editor.error("node.declarationList.declarations is null", node, node.declarationList);
                return;
            }
            
        } catch (error) {
            Editor.error("analyzeMethodBody error: ", error);
        }
    },
};

module.exports = validator;
