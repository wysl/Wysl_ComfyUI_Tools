"""Small compatibility helpers for ComfyUI's VIDEO API.

ComfyUI releases do not all expose the same optional ``VIDEO`` metadata
arguments.  Keeping the fallback here lets the processing nodes share one
implementation and keeps the public node modules independent of H3 internals.
"""

from __future__ import annotations

from typing import Any

from comfy_api.latest import InputImpl, Types


_MISSING = object()


def components_for_video(video: Any) -> Any:
    if not hasattr(video, "get_components"):
        raise TypeError("Expected a ComfyUI VIDEO value")
    components = video.get_components()
    if not hasattr(components, "images"):
        raise TypeError("The connected VIDEO value has no image frames")
    return components


def _component_kwargs(
    images: Any,
    *,
    audio: Any = _MISSING,
    frame_rate: Any = _MISSING,
    metadata: Any = _MISSING,
    alpha: Any = _MISSING,
) -> dict[str, Any]:
    values = {"images": images}
    for name, value in (
        ("audio", audio),
        ("frame_rate", frame_rate),
        ("metadata", metadata),
        ("alpha", alpha),
    ):
        if value is not _MISSING:
            values[name] = value
    return values


def make_video_components(
    images: Any,
    *,
    audio: Any = _MISSING,
    frame_rate: Any = _MISSING,
    metadata: Any = _MISSING,
    alpha: Any = _MISSING,
) -> Any:
    values = _component_kwargs(
        images,
        audio=audio,
        frame_rate=frame_rate,
        metadata=metadata,
        alpha=alpha,
    )

    # Newer APIs accept all fields.  Older APIs may not have ``alpha`` or
    # ``metadata`` yet, so progressively retry with optional fields removed.
    attempts = [
        values,
        {key: value for key, value in values.items() if key != "alpha"},
        {key: value for key, value in values.items() if key not in {"alpha", "metadata"}},
    ]
    last_error: TypeError | None = None
    for attempt in attempts:
        try:
            return Types.VideoComponents(**attempt)
        except TypeError as error:
            last_error = error
    raise last_error or TypeError("Unable to construct ComfyUI VideoComponents")


def make_video_from_components(source_video: Any, components: Any) -> Any:
    kwargs: dict[str, Any] = {}
    if hasattr(source_video, "get_bit_depth"):
        try:
            kwargs["bit_depth"] = source_video.get_bit_depth()
        except Exception:
            pass
    if hasattr(source_video, "get_color_space"):
        try:
            kwargs["color_space"] = source_video.get_color_space()
        except Exception:
            pass

    try:
        return InputImpl.VideoFromComponents(components, **kwargs)
    except TypeError as error:
        # ``color_space`` was added after the initial VIDEO API.  Retry only
        # the unsupported optional argument and retain all other metadata.
        if "color_space" in str(error) and "color_space" in kwargs:
            kwargs.pop("color_space", None)
            return InputImpl.VideoFromComponents(components, **kwargs)
        if "bit_depth" in str(error) and "bit_depth" in kwargs:
            kwargs.pop("bit_depth", None)
            return InputImpl.VideoFromComponents(components, **kwargs)
        raise


def replace_video_frames(source_video: Any, images: Any) -> Any:
    components = components_for_video(source_video)
    output_components = make_video_components(
        images,
        audio=getattr(components, "audio", None),
        frame_rate=getattr(components, "frame_rate", None),
        metadata=getattr(components, "metadata", None),
        alpha=getattr(components, "alpha", None),
    )
    return make_video_from_components(source_video, output_components)
