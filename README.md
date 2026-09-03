# Wysl ComfyUI Tools

独立的 ComfyUI 工具节点包，可与源版 `ComfyUI-MiniMaxH3-Easy` 并列安装。
本项目不注册 MiniMax H3 模型、加载器或 Context 节点，因此不会覆盖源仓库的实现。

## 节点分类

- `Wysl/视频连续性与处理`
  - `Wysl-VideoBlackIntro`
  - `Wysl-VFI x 2`
  - `Wysl-SaveVideo`
- `Wysl/工具`
  - `Wysl-MiniMaxH3Easy-Prompt`
  - `Wysl-MiniMaxH3Easy-AreaSwitch`
  - `Wysl-MultiSet`
  - `Wysl-MultiPrimitive`
  - `Wysl-SwapDimensions`
  - `Wysl-自动拆分媒体`
  - `Wysl-H3分段时长`
- `Wysl/Lightroom 调色`
  - `Wysl-LightroomImage`
  - `Wysl-LightroomVideo`
  - `Wysl-LightroomLight`
  - `Wysl-LightroomColor`
  - `Wysl-LightroomDetail`
  - `Wysl-LightroomHSLWarm`
  - `Wysl-LightroomHSLCool`

`Wysl-自动拆分媒体` 接收 `MiniMax H3 Easy 多媒体加载` 的混合媒体包，分别输出图像、音频和视频列表；
第四个 `图片组合` 输出会将所有图像按自动网格拼接成一张图。图像列表保持原始分辨率，组合图默认将单张图片长边限制为 1024，
可在节点中调整该限制。空媒体类别会被 ComfyUI 惰性阻塞，不会影响其他已连接类别的执行。

`Wysl-H3分段时长` 将 `6,6`、`6秒\n6秒`、中文标点、括号和常见分段标注统一转换为
源版 `MiniMax H3 Easy 上下文分段` 可接受的逗号格式，并输出总秒数、整数分段 FPS 和目标总帧数。
FPS 是播放速率，不会按分段相加；目标总帧数按合计时长一次应用 `17k+5` 原生时间网格计算。`上下文帧数` 不属于时长，
它是分段之间用于连续性的重叠帧数，仍应在源版上下文分段节点中单独设置。使用 `6,6` 时，
提示词也必须有两个 `---` 分隔的内容块，否则源版节点会报“分段数量不匹配”。

## 安装

将本目录放入 ComfyUI 的 `custom_nodes` 目录，并与源版 MiniMax H3 节点一起重启 ComfyUI。
节点使用 ComfyUI 自带的 PyTorch 和 `VIDEO` API，不需要额外 Python 依赖。

`Wysl-VFI x 2` 需要已经安装并启用 WhiteRabbit/RIFE 节点，并准备 `rife47.pth` 模型；其余节点不依赖 RIFE。
该节点会按相邻帧重叠方式分块补帧，避免长视频产生完整输入锁页副本和最终整段复制。默认的
`低内存（FP16）` 仅以 FP16 缓存结果，RIFE 推理仍使用 FP32；补帧后还要进行精度敏感处理时可选择
`最高兼容（FP32）`。`chunk_frames` 默认 48，调小会降低临时内存，调大通常会减少分块调用开销。

## 兼容性说明

- 视频节点通过 `core/video_api.py` 兼容不同 ComfyUI 版本的 `VideoComponents` 可选参数。
- `Wysl-MiniMaxH3Easy-Prompt` 输出普通 `STRING`。前端桥接支持 `@Picture 1`、`@Image 1`、`@图片 1` 等媒体引用形式，并将其转换为源 H3 节点使用的运行时占位符。
- `Wysl-MultiSet` 的前端增强会把新连接值同步到 KJ `GetNode` 的选项列表。
- Lightroom 的数值范围和调色算法保持原版行为，所有控件默认值为 `0`。滑条中心为 `0`，并以色温、色调、明度和饱和度渐变提示左右效果。
- 节点类型 ID 使用 `Wysl...` 前缀，避免与源仓库冲突。旧工作流中的 `MiniMaxH3Easy...` 节点需要手动替换为对应的 Wysl 节点。

## 许可证

迁移自 MIT 许可代码的版权和第三方声明见 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`。
