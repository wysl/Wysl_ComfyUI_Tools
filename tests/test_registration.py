"""Registration and pure-contract checks that do not require a ComfyUI install."""

from __future__ import annotations

import importlib
import sys
import types
import unittest
from pathlib import Path


class FakeTensor:
    pass


def install_comfy_stubs():
    torch = types.ModuleType("torch")
    torch.Tensor = FakeTensor
    torch.nn = types.SimpleNamespace(functional=types.SimpleNamespace())
    torch.float16 = object()
    torch.float32 = object()
    torch.float64 = object()
    sys.modules["torch"] = torch
    sys.modules["torch.nn"] = torch.nn
    sys.modules["torch.nn.functional"] = torch.nn.functional

    folder_paths = types.ModuleType("folder_paths")
    folder_paths.get_save_image_path = lambda *args: ("", "wsl", 1, "", "")
    folder_paths.get_output_directory = lambda: ""
    sys.modules["folder_paths"] = folder_paths

    comfy_nodes = types.ModuleType("nodes")
    comfy_nodes.MAX_RESOLUTION = 16384
    comfy_nodes.NODE_CLASS_MAPPINGS = {}
    sys.modules["nodes"] = comfy_nodes

    comfy = types.ModuleType("comfy")
    comfy_cli_args = types.ModuleType("comfy.cli_args")
    comfy_cli_args.args = types.SimpleNamespace(disable_metadata=False)
    comfy.__path__ = []
    sys.modules["comfy"] = comfy
    sys.modules["comfy.cli_args"] = comfy_cli_args

    comfy_api = types.ModuleType("comfy_api")
    latest = types.ModuleType("comfy_api.latest")
    latest.InputImpl = types.SimpleNamespace()
    latest.Types = types.SimpleNamespace()
    comfy_api.__path__ = []
    sys.modules["comfy_api"] = comfy_api
    sys.modules["comfy_api.latest"] = latest


class RegistrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        install_comfy_stubs()
        sys.path.insert(0, str(Path(__file__).resolve().parents[1].parent))
        cls.package = importlib.import_module("Wysl_ComfyUI_Tools")

    def test_all_requested_nodes_are_registered_with_unique_wysl_ids(self):
        mappings = self.package.NODE_CLASS_MAPPINGS
        self.assertEqual(len(mappings), 16)
        self.assertTrue(all(name.startswith("Wysl") for name in mappings))
        self.assertEqual(len(mappings), len(set(mappings)))

    def test_display_names_match_requested_names(self):
        display = self.package.NODE_DISPLAY_NAME_MAPPINGS
        self.assertEqual(display["WyslVideoBlackIntro"], "Wysl-VideoBlackIntro")
        self.assertEqual(display["WyslVfiX2"], "Wysl-VFI x 2")
        self.assertEqual(display["WyslSaveVideo"], "Wysl-SaveVideo")
        self.assertEqual(display["WyslLightroomImage"], "Wysl-LightroomImage")
        self.assertEqual(display["WyslMediaAutoSplitter"], "Wysl-自动拆分媒体")

    def test_swap_and_prompt_contracts(self):
        swap = self.package.NODE_CLASS_MAPPINGS["WyslSwapDimensions"]
        self.assertEqual(swap.swap(640, 480, False), (640, 480))
        self.assertEqual(swap.swap(640, 480, True), (480, 640))
        prompt = self.package.NODE_CLASS_MAPPINGS["WyslMiniMaxH3EasyPrompt"]
        self.assertEqual(prompt.get_prompt("hello"), ("hello",))

    def test_h3_segment_timing_normalizes_duration_input(self):
        timing = self.package.NODE_CLASS_MAPPINGS["WyslMiniMaxH3EasySegmentTiming"]
        self.assertEqual(timing.calculate("4， 4\n2", 24), ("4,4,2", 10.0, 24, 243))

    def test_h3_segment_timing_accepts_units_labels_and_brackets(self):
        timing = self.package.NODE_CLASS_MAPPINGS["WyslMiniMaxH3EasySegmentTiming"]
        self.assertEqual(
            timing.calculate("第1段：6秒\n第2段：6.5s", 24),
            ("6,6.5", 12.5, 24, 311),
        )
        self.assertEqual(timing.calculate("[6, 6]", 24), ("6,6", 12.0, 24, 294))

    def test_h3_segment_timing_uses_h3_temporal_grid(self):
        timing = self.package.NODE_CLASS_MAPPINGS["WyslMiniMaxH3EasySegmentTiming"]
        self.assertEqual(timing.calculate("5,5,5,5,5", 24)[-1], 600)

    def test_h3_segment_timing_uses_a_compact_single_line_input(self):
        timing = self.package.NODE_CLASS_MAPPINGS["WyslMiniMaxH3EasySegmentTiming"]
        options = timing.INPUT_TYPES()["required"]["segment_seconds"][1]
        self.assertFalse(options["multiline"])

    def test_prompt_bridge_restores_linked_h3_segment_seconds(self):
        source = (Path(__file__).resolve().parents[1] / "web" / "prompt_bridge.js").read_text(
            encoding="utf-8",
        )
        self.assertIn('const H3_CONTEXT_NODE = "MiniMaxH3EasyContextSegments";', source)
        self.assertIn(
            'const segmentSecondsLink = linkedInputReference(node, "segment_seconds");',
            source,
        )
        self.assertIn("promptNode.inputs.segment_seconds = segmentSecondsLink;", source)

    def test_wysl_prompt_editor_discovers_downstream_h3_media(self):
        source = (Path(__file__).resolve().parents[1] / "web" / "prompt_editor.js").read_text(
            encoding="utf-8",
        )
        self.assertIn('const NODE_TYPE = "WyslMiniMaxH3EasyPrompt";', source)
        self.assertIn('"MiniMaxH3EasyContextSegments"', source)
        self.assertIn('const LINKS_PROP = "minimax_h3_virtual_media_links";', source)
        self.assertIn('const MEDIA_LOADER_TYPE = "MiniMaxH3EasyMediaLoader";', source)
        self.assertIn("function downstreamH3Targets(promptNode)", source)
        self.assertIn("function mentionOptions(promptNode)", source)
        self.assertIn("function mediaLoaderState(loader)", source)

    def test_wysl_prompt_editor_defaults_to_structured_official_tags(self):
        source = (Path(__file__).resolve().parents[1] / "web" / "prompt_editor.js").read_text(
            encoding="utf-8",
        )
        self.assertIn('const STRUCTURED = "structured";', source)
        self.assertIn('structured.textContent = "结构化";', source)
        self.assertIn('return `<${TYPE_INFO[type].tag} ${ordinal}>`;', source)
        self.assertIn("function patchCanvasKeyHandling()", source)
        self.assertIn("function teardownPromptEditor(node)", source)

    def test_wysl_prompt_editor_matches_upstream_media_labels_and_paste_format(self):
        source = (Path(__file__).resolve().parents[1] / "web" / "prompt_editor.js").read_text(
            encoding="utf-8",
        )
        self.assertIn('image: { label: "图片", tag: "Picture"', source)
        self.assertIn('["图片", "图像", "Image", "Picture"]', source)
        self.assertIn("function pastedMentionCandidates(node)", source)
        self.assertIn("function pastedMentionMatch(node, value, cursor, candidates)", source)
        self.assertIn("function insertTextWithMentionChips(node, editor, text)", source)
        self.assertIn("else insertTextWithMentionChips(node, editor, text);", source)

    def test_prompt_bridge_supports_all_h3_prompt_targets_and_audio_mentions(self):
        source = (Path(__file__).resolve().parents[1] / "web" / "prompt_bridge.js").read_text(
            encoding="utf-8",
        )
        self.assertIn('"MiniMaxH3EasySelectedVideoContext"', source)
        self.assertIn("H3_PROMPT_TARGETS.has(nodeType)", source)
        self.assertIn("audio|音频", source)
        self.assertIn("function mediaLoaderRuntimeIndex(targetNode, mediaType, ordinal)", source)

    def test_h3_segment_timing_rejects_invalid_duration(self):
        timing = self.package.NODE_CLASS_MAPPINGS["WyslMiniMaxH3EasySegmentTiming"]
        with self.assertRaises(ValueError):
            timing.calculate("4,not-a-number", 24)
        with self.assertRaises(ValueError):
            timing.calculate("nan,6", 24)

    def test_video_sampling_uses_the_first_frame_of_each_second(self):
        video = importlib.import_module("Wysl_ComfyUI_Tools.node_modules.video")
        self.assertEqual(video._frame_indices(3.0, 24.0, 100), [0, 24, 48])
        self.assertEqual(video._frame_indices(3.0, 30.0, 50), [0, 30])

    def test_vfi_chunks_overlap_once_and_cover_every_frame_pair(self):
        video = importlib.import_module("Wysl_ComfyUI_Tools.node_modules.video")
        ranges = video._vfi_chunk_ranges(12, 5)
        self.assertEqual(ranges, [(0, 5), (4, 9), (8, 12)])
        pairs = [pair for start, stop in ranges for pair in range(start, stop - 1)]
        self.assertEqual(pairs, list(range(11)))

    def test_vfi_defaults_to_chunked_fp16_low_memory_mode(self):
        vfi = self.package.NODE_CLASS_MAPPINGS["WyslVfiX2"]
        controls = vfi.INPUT_TYPES()["required"]
        self.assertEqual(controls["memory_mode"][1]["default"], "低内存（FP16）")
        self.assertEqual(controls["chunk_frames"][1]["default"], 96)

        source = (Path(__file__).resolve().parents[1] / "node_modules" / "video.py").read_text(
            encoding="utf-8",
        )
        vfi_source = source[source.index("class WyslVfiX2") : source.index("class WyslSaveVideo")]
        self.assertIn("for start, stop in ranges:", vfi_source)
        self.assertIn("interpolated[-2:].copy_", vfi_source)
        self.assertNotIn("torch.cat", vfi_source)

    def test_save_video_uses_comfyui_legacy_video_preview_protocol(self):
        source = (Path(__file__).resolve().parents[1] / "node_modules" / "video.py").read_text(
            encoding="utf-8",
        )
        self.assertIn('"images": [', source)
        self.assertIn('"animated": (True,)', source)
        self.assertNotIn('"wsl_saved_video"', source)

    def test_save_video_preview_keeps_native_layout_and_resizing(self):
        source = (Path(__file__).resolve().parents[1] / "web" / "save_video_preview.js").read_text(
            encoding="utf-8",
        )
        self.assertIn('this.resizable = true;', source)
        self.assertIn('objectFit: "contain"', source)
        self.assertIn("minHeight: MIN_LAYOUT_HEIGHT", source)
        self.assertIn("minWidth: 0", source)
        self.assertNotIn("widget.computeSize =", source)
        self.assertNotIn("MIN_PREVIEW_WIDTH", source)
        self.assertNotIn("MIN_PREVIEW_HEIGHT", source)

    def test_lightroom_controls_default_to_zero(self):
        lightroom = self.package.NODE_CLASS_MAPPINGS["WyslLightroomColor"]
        controls = lightroom.INPUT_TYPES()["required"]
        self.assertEqual(controls["temperature"][1]["default"], 0.0)
        self.assertEqual(controls["tint"][1]["default"], 0.0)
        self.assertEqual(controls["saturation"][1]["default"], 0.0)

    def test_multi_primitive_is_registered_as_a_frontend_virtual_node(self):
        source = (Path(__file__).resolve().parents[1] / "web" / "multi_primitive.js").read_text(
            encoding="utf-8",
        )
        self.assertIn('const NODE_TYPE = "WyslMultiPrimitive";', source)
        self.assertIn('name: "Wysl.MultiPrimitive"', source)
        self.assertIn('category: "Wysl/工具"', source)

    def test_media_splitter_contract(self):
        splitter = self.package.NODE_CLASS_MAPPINGS["WyslMediaAutoSplitter"]
        self.assertEqual(splitter.RETURN_NAMES, ("图像", "音频", "视频", "图片组合"))
        self.assertEqual(splitter.OUTPUT_IS_LIST, (True, True, True, False))
        self.assertEqual(splitter.INPUT_TYPES()["required"]["media_bundle"][0], "MINIMAX_H3_MEDIA_BUNDLE")


if __name__ == "__main__":
    unittest.main()
