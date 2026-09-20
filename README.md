# 巅峰极速 3D · LIMITLESS RUSH

基于 **Three.js** 的单文件 3D 竞速闯关游戏。整个游戏是一个 `index.html`——零构建、零依赖安装，浏览器打开即玩，支持键盘、手柄和触屏三套输入。

**在线体验：<https://tuanzi188.github.io/car/>**

## 玩法

- 极限突围闪避竞速：与 AI 车同场较量，冲线跑完 3 圈完赛结算，冠军/完赛标题按名次显示。
- 漂移体系：方向重拖触发漂移，带保速、角度累积、幅度放大与转向区分；大弯有防撞墙轻制动保护。
- 氮气加速：Shift 释放氮气，注意油耗与补给。
- 动态危险事件：第 2 圈起随机出现障碍走廊、窄道夹击，逐圈强化。
- 实时小地图：旋转跟随视角，标注 AI 车距。
- 车辆选择：多车型（含 GT3 空力套件），程序化建模车身、轮组与赛道设施。

## 操作

| 输入 | 控制 |
| --- | --- |
| W / ↑ | 油门 |
| S / ↓ | 刹车 |
| A D / ← → | 转向 |
| Space | 手刹（配合转向触发漂移） |
| Shift | 氮气 |
| Enter | 选车确认 |
| 手柄 | 同语义映射（油门/刹车/转向/手刹/氮气） |
| 触屏 | 左侧摇杆转向，右侧油门/刹车两键 |

键盘 / 触控 / 手柄三源输入分离上报，互不覆盖。

## 运行

**直接玩**：打开上面的 GitHub Pages 链接。

**本地运行**：任意静态服务器均可，例如：

```sh
python -m http.server 8080 --bind 127.0.0.1
# 访问 http://127.0.0.1:8080
```

## 测试

```sh
node --test tests/*.cjs   # PowerShell: node --test (Get-ChildItem tests/*.cjs)
```

9 个回归测试套件（`node:test` + `node:assert/strict`），通过 VM 加载 `index.html` 并对无头 three.js 类打桩，覆盖：物理、操控、输入、菜单、车辆模型、帧回归等。

## 技术要点

- **单文件架构**：HTML/CSS/JS 全部在一个 `index.html` 内，PWA 风格可添加到主屏幕。
- **three.js 本地化**：`three.local.js` 本地引入，无 CDN 依赖，许可见 `THREE-LICENSE.txt`（three.js 采用 MIT 许可）。
- **程序化建模**：挤出式车壳、车削油桶、程序化天空环境贴图、碳纤维/轮毂程序化纹理，不依赖外部模型文件。
- **性能**：车辆/赛道静态部件合并削减 draw call；桌面动态分辨率；阴影分级降载（512 档）；障碍物去投影。
- **帧率无关物理**：手感参数（转向系数、抓地下压力修正、舵角余量、响应速率）与指数平滑均按帧率无关设计。

## 目录结构

```
index.html          # 全部游戏代码（单文件）
three.local.js      # 本地化 three.js
THREE-LICENSE.txt   # three.js 许可证
tests/              # node:test 回归测试套件（9 个）
```

## 许可

本项目代码以 [MIT License](LICENSE) 发布；three.js 的许可见 `THREE-LICENSE.txt`。
