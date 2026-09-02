# Wsl ComfyUI Tool

独立的 ComfyUI 工具节点包，可与源版 `ComfyUI-MiniMaxH3-Easy` 并列安装。
本项目不注册 MiniMax H3 模型、加载器或 Context 节点，因此不会覆盖源仓库的实现。

## 节点分类

- `Wsl/视频连续性与处理`
  - `Wysl-VideoBlackIntro`
  - `Wysl-VFI x 2`
  - `Wysl-SaveVideo`
- `Wsl/工具`
  - `Wysl-MiniMaxH3Easy-Prompt`
  - `Wysl-MiniMaxH3Easy-AreaSwitch`
  - `Wysl-MultiSet`
  - `Wysl-SwapDimensions`
- `Wsl/Lightroom 调色`
  - `Wysl-LightroomImage`
  - `Wysl-LightroomVideo`
  - `Wysl-LightroomLight`
  - `Wysl-LightroomColor`
  - `Wysl-LightroomDetail`
  - `Wysl-LightroomHSLWarm`
  - `Wysl-LightroomHSLCool`

## 安装

将本目录放入 ComfyUI 的 `custom_nodes` 目录，并与源版 MiniMax H3 节点一起重启 ComfyUI。
节点使用 ComfyUI 自带的 PyTorch 和 `VIDEO` API，不需要额外 Python 依赖。

`Wysl-VFI x 2` 需要已经安装并启用 WhiteRabbit/RIFE 节点，并准备 `rife47.pth` 模型；其余节点不依赖 RIFE。

## 兼容性说明

- 视频节点通过 `core/video_api.py` 兼容不同 ComfyUI 版本的 `VideoComponents` 可选参数。
- `Wysl-MiniMaxH3Easy-Prompt` 输出普通 `STRING`。前端桥接支持 `@Picture 1`、`@Image 1`、`@图片 1` 等媒体引用形式，并将其转换为源 H3 节点使用的运行时占位符。
- `Wysl-MultiSet` 的前端增强会把新连接值同步到 KJ `GetNode` 的选项列表。
- Lightroom 的数值范围和调色算法保持原版行为，所有控件默认值为 `0`。滑条中心为 `0`，并以色温、色调、明度和饱和度渐变提示左右效果。
- 节点类型 ID 使用 `Wysl...` 前缀，避免与源仓库冲突。旧工作流中的 `MiniMaxH3Easy...` 节点需要手动替换为对应的 Wysl 节点。

## 许可证

迁移自 MIT 许可代码的版权和第三方声明见 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`。
