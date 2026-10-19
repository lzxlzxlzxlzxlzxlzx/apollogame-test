# DokiWorld App 资产、构建与发布规范

## 1. 资产闭包

正式 App 必须脱离 Apollo 源目录、断网并部署在任意子路径后仍可运行。

- 游戏美术进入本地 AssetIndex；标记 filled 的条目必须有真实文件和消费槽。
- build 使用 `exportAppAssetClosure()` 复制真实字节并生成 `ASSET-CLOSURE.json`。
- JS/CSS 的开发期 public 绝对前缀使用 `rewritePortableRuntimeBases()` 改为 dist 相对路径。
- 字体、音频等非 art 树通过 `extraTrees` 显式登记，不能靠开发机路径偶然可见。
- 必需资源禁止 HTTP/HTTPS 远程依赖。合同允许的远程图片只能 render-only，失败不改变规则。
- 禁止 `..` 逃逸、绝对路径、符号链接、悬空 material key、未消费的孤儿台账条目。

## 2. Build 固定顺序

每个 `scripts/build.mjs` 按以下顺序：

1. 读取并校验源码 `manifest.json`；
2. 清空旧 `dist/`；
3. 以 `base:'./'` 构建浏览器 bundle；
4. 复制 manifest 到 dist 根；
5. 调用 `exportAppDocumentation()`；
6. 调用 `exportAppAssetClosure()`；
7. 调用 `rewritePortableRuntimeBases()`；
8. 断言 entry、文档和全部声明文件存在；
9. 生成覆盖除自身外全部文件的 `SHA256SUMS.txt`。

禁止 App 自写另一套文档/资产遍历器，禁止构建后手工覆盖 dist，禁止从 DokiWorld 部署目录反向复制为源码。

## 3. Dist 结构

```text
dist/
├─ index.html
├─ manifest.json
├─ assets/<bundled-js-css>
├─ art/index.json
├─ art/<runtime-assets>
├─ docs/integration.zh-CN.md
├─ ASSET-CLOSURE.json
└─ SHA256SUMS.txt
```

确实没有 art 的 App 可省略 `art/` 与闭包报告，但工程文档必须说明。dist 禁止包含源码、测试、`node_modules`、`.env`、token、API key、测试凭据或绝对本机路径。

SHA 清单使用大写 SHA-256、两个空格、POSIX 包内相对路径，覆盖除清单自身外所有文件。集合缺失、多余或哈希不一致均禁止交付。

## 4. 调用说明闭包

`manifest.documentation` 是唯一文档清单。构建调用 `exportAppDocumentation()`，验证 locale、标题、安全 `.md` 相对路径与源文件，并原样复制进 dist。发布面再用 `dokiworld-docs-export.mjs <app-id>` 兜底；`dokiworld-docs-guard.mjs` 必须通过。只在部署目录手改文档无效。

## 5. Zip 与安装

正式出口：

```text
release/<app-id>/<app-id>-dokiworld.zip
```

zip 根直接是 dist 内容，即打开压缩包就能看到 `index.html` 与 `manifest.json`；不得再包一层目录。

DokiWorld 本地安装目标：

```text
C:/Users/24652/Desktop/projects/dokiworlds/frontend/public/apps/<app-id>/
```

复制完整 dist 内容，不得只复制 JS、manifest 或 art。部署副本不是源码真相。安装后既要在 APPS 面板确认目录识别，也要用嵌套 `apps.launch()` 验证真实输入输出；空 data 预览不能替代合同联调。

## 6. 新鲜度规则

源码 manifest、调用说明、bundle 输入或任一资产比 dist 对应文件更新时，dist 即过期，必须重新构建。发布前比较源码与产物并复核 SHA；不得以“上次构建通过”代替本次验证。

