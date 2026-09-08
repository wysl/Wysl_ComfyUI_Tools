# Wysl ComfyUI Tools

独立的 ComfyUI 工具节点包，可与源版 `ComfyUI-MiniMaxH3-Easy` 并列安装。
本项目不注册 MiniMax H3 模型、加载器或 Context 节点，因此不会覆盖源仓库的实现。

## 节点分类

- `Wysl/视频连续性与处理`
  - `Wysl-VideoBlackIntro`
  - `Wysl-VFI x 2`
  - `Wysl-SaveVideo`
- `Wysl/H3 分段处理`
  - `Wysl-H3 分段彩噪`
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
- `Wysl/图像生成`
  - `Wysl-Grok Imagine Image`

`Wysl-Grok Imagine Image` 使用 OpenAI-compatible 的 Grok2API 图片接口，默认模型为
`grok-imagine-image-2.0`。它支持文生图，也支持将 ComfyUI `IMAGE` 批次作为参考图发送到
`/v1/images/edits`，输出标准的 `IMAGE` 批次。节点只显示配置中的 `name`，不会在工作流中保存
endpoint 或 API Key。

配置模板见 `config/grok_image_endpoints.example.json`。将它复制为
`<ComfyUI>/user/Wysl_ComfyUI_Tools/grok_image_endpoints.json`，或通过环境变量
`WYSL_GROK_IMAGE_CONFIG` 指定配置文件路径，然后填写多组 `profiles`。每组至少需要 `name`、
`endpoint` 和 `api_key`，可选 `edits_endpoint`、`model`、`allow_nsfw`。例如：

```json
{
  "profiles": [
    {
      "name": "本地 grok2api",
      "endpoint": "http://127.0.0.1:8000/v1/images/generations",
      "edits_endpoint": "http://127.0.0.1:8000/v1/images/edits",
      "api_key": "你的客户端 API Key",
      "model": "grok-imagine-image-2.0",
      "allow_nsfw": false
    }
  ]
}
```

节点中的 NSFW 选项只是兼容标记。`grok2api` 当前由服务端的
`provider.web.allowNSFW` 控制是否把 `enable_nsfw` 传给 Grok Web，并且账号还需要完成协议、
生日和 NSFW 状态设置；单独在节点中打开不能绕过服务端审核。开启时应在 grok2api 管理设置中
启用 Web Provider 的 `allowNSFW`，再按其账号管理流程完成账号状态设置。

`grok2api` 当前图片接口支持的参数范围是：

- `aspect_ratio`：`auto`、`1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`、`2:1`、`1:2`、
  `19.5:9`、`9:19.5`、`20:9`、`9:20`、`21:9`、`5:2`
- `size`：`auto`、`1024x1024`、`1024x1536`、`1536x1024`
- `resolution`：`1k` 或 `2k`

节点现在以 `aspect_ratio` 为优先控制项：选择了比例后不会再同时发送冲突的旧 `size` 值，避免
`16:9 + 1024x1536` 被网关解析成竖图。比例为“自动”时，旧工作流中的手动 `size` 仍然有效。
节点不会在本地强行拉伸或裁剪返回图片，避免人物和物体变形；最终尺寸必须由兼容服务正确转发
官方的 `aspect_ratio` 与 `resolution` 参数。若某个第三方网关始终返回 `768x1152`，说明网关没有
执行比例参数，需要更新网关或改用支持官方接口的 endpoint，而不是在节点中拉伸图片。
图片编辑请求仍会自动省略 `quality`，因为该服务端的 `/v1/images/edits` 不接受它。

`Wysl-自动拆分媒体` 接收 `MiniMax H3 Easy 多媒体加载` 的混合媒体包，分别输出图像、音频和视频列表；
第四个 `图片组合` 输出会将所有图像按自动网格拼接成一张图。图像列表保持原始分辨率，组合图默认将单张图片长边限制为 1024，
可在节点中调整该限制。空媒体类别会被 ComfyUI 惰性阻塞，不会影响其他已连接类别的执行。

`Wysl-H3分段时长` 将 `6,6`、`6秒\n6秒`、中文标点、括号和常见分段标注统一转换为
源版 `MiniMax H3 Easy 上下文分段` 可接受的逗号格式，并输出总秒数、整数分段 FPS 和目标总帧数。
FPS 是播放速率，不会按分段相加；目标总帧数按合计时长一次应用 `17k+5` 原生时间网格计算。`上下文帧数` 不属于时长，
它是分段之间用于连续性的重叠帧数，仍应在源版上下文分段节点中单独设置。使用 `6,6` 时，
提示词也必须有两个 `---` 分隔的内容块，否则源版节点会报“分段数量不匹配”。

`Wysl-H3 分段彩噪` 是源版分段二采的中间节点，接线为：
`MiniMax H3 Easy Segment Render.segments -> Wysl-H3 分段彩噪.segments -> MiniMax H3 Easy Segment Refine.segments`。
它逐段解码一采结果，只给实际交付画面加入块状彩噪，再编码回原来的 `MINIMAX_H3_SEGMENTS` 数据结构；
首部上下文、音频、提示词、媒体引用和分段计划保持不变。默认彩噪强度从 `0.20` 在末尾 8 帧渐退到 `0.00`，
并启用逐像素亮度保护。该节点会增加一次视频 VAE 解码与编码，属于实验性二采预处理。

## 安装

将本目录放入 ComfyUI 的 `custom_nodes` 目录，并与源版 MiniMax H3 节点一起重启 ComfyUI。
节点使用 ComfyUI 自带的 PyTorch 和 `VIDEO` API，不需要额外 Python 依赖。

`Wysl-VFI x 2` 需要已经安装并启用 WhiteRabbit/RIFE 节点，并准备 `rife47.pth` 模型；其余节点不依赖 RIFE。
该节点会按相邻帧重叠方式分块补帧，避免长视频产生完整输入锁页副本和最终整段复制。默认的
`低内存（FP16）` 仅以 FP16 缓存结果，RIFE 推理仍使用 FP32；补帧后还要进行精度敏感处理时可选择
`最高兼容（FP32）`。`chunk_frames` 默认 96，调小会降低临时内存，调大通常会减少分块调用开销。

`Wysl-SaveVideo` 的 `time_format` 可选择仅使用原有递增序号，或在文件名中加入本机日期时间、紧凑日期时间、
日期或时分秒。`年月日-时分（冲突自动编号）` 会优先生成 `Wsl_20260102-1730.mp4`；同一分钟保存多个同名前缀
视频时，才依次生成 `Wsl_20260102-1730-2.mp4`、`Wsl_20260102-1730-3.mp4`，避免覆盖。其他旧时间格式继续
保留原有递增序号，以兼容现有工作流和文件命名。

## 兼容性说明

- 视频节点通过 `core/video_api.py` 兼容不同 ComfyUI 版本的 `VideoComponents` 可选参数。
- `Wysl-MiniMaxH3Easy-Prompt` 输出普通 `STRING`。前端桥接支持 `@Picture 1`、`@Image 1`、`@图片 1` 等媒体引用形式，并将其转换为源 H3 节点使用的运行时占位符。
- `Wysl-MultiSet` 的前端增强会把新连接值同步到 KJ `GetNode` 的选项列表。
- Lightroom 的数值范围和调色算法保持原版行为，所有控件默认值为 `0`。滑条中心为 `0`，并以色温、色调、明度和饱和度渐变提示左右效果。
- 节点类型 ID 使用 `Wysl...` 前缀，避免与源仓库冲突。旧工作流中的 `MiniMaxH3Easy...` 节点需要手动替换为对应的 Wysl 节点。

## 许可证

迁移自 MIT 许可代码的版权和第三方声明见 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`。
