# BMFont Creator

将目录中的字符图片转换为游戏使用的位图字体。基于 Electron + React + TypeScript，当前已验证 macOS Apple Silicon；代码和打包配置支持后续移植 Windows、Linux。

## 使用

1. 打开应用，点击「导入目录」，选择存放字符图片的文件夹。只扫描该目录，不递归子目录。
2. 左侧选中字符，检查或修改字符映射、X/Y 偏移、前进量；不需要的图片可取消「参与字体导出」。
3. 在右侧调整行高、基线、字间距、图集留白及尺寸上限，在「文字预览」输入实际游戏文字检查效果。
4. 点击「导出字体」，生成同名的 `.fnt` 和透明 `.png`。Cocos2d-x 请选择默认的 **BMFont Text**。
5. 点击「保存」保存 `.bmfont` 工程。工程内嵌图片，可以移动到其他目录或电脑后继续编辑。

支持 PNG、JPG/JPEG、WebP；透明字符推荐 PNG。也可通过「导入 .fnt」打开已有的 BMFont **文本**字体。空白页提供 sample 示例入口，原始示例文件始终保持不变。

## 图片命名

| 文件名 | 对应字符 |
| --- | --- |
| `0.png`、`A.png`、`中.png` | 文件名本身的单个字符 |
| `U+4E2D.png`、`uni4E2D.png`、`0x4E2D.png` | Unicode 十六进制编码，即「中」 |
| `char_65.png` | Unicode 十进制编码，即「A」 |
| `space.png`、`plus.png`、`minus.png` | 空格、加号、减号 |
| `slash.png`、`backslash.png`、`colon.png` | `/`、`\`、`:` |
| `question.png`、`asterisk.png`、`quote.png` | `?`、`*`、双引号 |

`0.png` 始终对应数字 0，不会解释为编码 0。`10.png` 这样的多字符名称不会猜测其含义，需要手动映射为一个字符或排除。重复字符和未映射字符会阻止导出。支持完整 Unicode 码点，BMP 以外的字符会显示引擎兼容性提示；组合表情等多个码点不能作为一个 BMFont 字符。

## 排版与兼容性

- 使用 [AngelCode BMFont](https://angelcode.com/products/bmfont/doc/file_format.html) 规范；默认输出文本，也可输出 XML 格式的 `.fnt`。
- 使用单页 RGBA PNG、不旋转字符、不做通道打包。Cocos2d-x v3 的加载器只支持单页，因此溢出时会提示提高尺寸上限或减少字符。
- 图集可以使用 2 的幂尺寸，也可自动裁去空白区域。留白是图集中每个字符四周的透明像素，不改变字符大小。
- 开启「裁切透明边缘」时自动补偿 X/Y 偏移，保持前进量不变；关闭时保留完整图片。原始输入图片不会被修改。
- 行高、基线与图片尺寸独立。字号是元数据，不会缩放图片。已有字体的特殊参数会被保留，例如 sample 的图片高 90、行高 32。
- 图集打包为确定性的 MaxRects 算法，预览使用与导出相同的字符度量，并保留导入字体的字偶间距。
- 预览以 BMFont 度量绘制图片；具体引擎的锚点、换行、缩放和采样设置仍需在游戏中确认。
- 导入不支持 XML、二进制或通道打包的现有 BMFont。XML 导出不适用于 Cocos2d-x 默认文本加载器。

将 `.fnt` 与 `.png` 放在同一资源目录，用 [Cocos2d-x Label API](https://docs.cocos2d-x.org/cocos2d-x/v3/en/ui_components/labels.html) 加载：

```cpp
auto label = cocos2d::Label::createWithBMFont("fonts/score.fnt", "+100x2");
this->addChild(label);
```

## 开发与打包

使用 **Node.js 24 LTS**（最低 22.12）。首次启动时 Electron 会下载官方运行文件。全部字体处理在本机进行，不需要账户、云服务或网络 API。

```sh
npm install
npm start
```

```sh
npm run dev          # 监听构建，界面修改后 Cmd+R 刷新；主进程修改后重启
npm run typecheck
npm test
npm run test:coverage
npm run test:e2e     # 真实 Electron 工作流，结果和截图写入 test-results/
npm run pack:mac     # release/mac-arm64/BMFont Creator.app
npm run dist:mac     # Apple Silicon DMG 和 ZIP
```

macOS 包为本地开发版本，未做 Developer ID 签名或公证。Windows/Linux 需要分别在相应系统安装依赖并运行 `npx electron-builder --win` / `--linux`；尚未在这两个平台验证。Intel Mac 可在对应系统以 `--mac --x64` 打包并测试。

导入限制：最多 2048 个字符，单文件 32 MB，单张字符图片 1600 万像素，总字符像素 6400 万，工程 128 MB，图集边长最高 8192。高分辨率资源建议拆分字体。

快捷键：`⌘I` 导入目录、`⌘O` 打开工程、`⌘S` 保存、`⌘⇧S` 另存为、`⌘E` 导出。顶部撤销/重做支持最近 50 次编辑；文本输入框保留系统文本编辑行为。

## 目录结构

- `src/core/`：字符映射、排版、MaxRects、BMFont 解析与序列化。
- `src/main/`：隔离的桌面文件操作、图片处理和原生对话框。
- `src/renderer/`：编辑界面、图集和位图文字预览。
- `tests/`：使用真实 PNG 和 sample 的核心与文件测试。
- `scripts/e2e.mjs`：Electron 操作验证。

渲染进程禁用 Node 集成、启用隔离和受限预加载桥接；仅加载本地资源。原生导出在确认覆盖后暂存 PNG/描述文件并成对替换。
