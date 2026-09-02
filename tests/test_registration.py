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
        sys.path.insert(0, str(Path(__file__).resolve().parents[2].parent))
        cls.package = importlib.import_module("Wsl_Comfyui_Tool")

    def test_all_requested_nodes_are_registered_with_unique_wysl_ids(self):
        mappings = self.package.NODE_CLASS_MAPPINGS
        self.assertEqual(len(mappings), 14)
        self.assertTrue(all(name.startswith("Wysl") for name in mappings))
        self.assertEqual(len(mappings), len(set(mappings)))

    def test_display_names_match_requested_names(self):
        display = self.package.NODE_DISPLAY_NAME_MAPPINGS
        self.assertEqual(display["WyslVideoBlackIntro"], "Wysl-VideoBlackIntro")
        self.assertEqual(display["WyslVfiX2"], "Wysl-VFI x 2")
        self.assertEqual(display["WyslSaveVideo"], "Wysl-SaveVideo")
        self.assertEqual(display["WyslLightroomImage"], "Wysl-LightroomImage")

    def test_swap_and_prompt_contracts(self):
        swap = self.package.NODE_CLASS_MAPPINGS["WyslSwapDimensions"]
        self.assertEqual(swap.swap(640, 480, False), (640, 480))
        self.assertEqual(swap.swap(640, 480, True), (480, 640))
        prompt = self.package.NODE_CLASS_MAPPINGS["WyslMiniMaxH3EasyPrompt"]
        self.assertEqual(prompt.get_prompt("hello"), ("hello",))

    def test_video_sampling_uses_the_first_frame_of_each_second(self):
        video = importlib.import_module("Wsl_Comfyui_Tool.node_modules.video")
        self.assertEqual(video._frame_indices(3.0, 24.0, 100), [0, 24, 48])
        self.assertEqual(video._frame_indices(3.0, 30.0, 50), [0, 30])

    def test_lightroom_controls_default_to_zero(self):
        lightroom = self.package.NODE_CLASS_MAPPINGS["WyslLightroomColor"]
        controls = lightroom.INPUT_TYPES()["required"]
        self.assertEqual(controls["temperature"][1]["default"], 0.0)
        self.assertEqual(controls["tint"][1]["default"], 0.0)
        self.assertEqual(controls["saturation"][1]["default"], 0.0)


if __name__ == "__main__":
    unittest.main()
