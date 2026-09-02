import { app } from "../../../scripts/app.js";

const NODE_TYPE = "WyslSaveVideo";
const VIDEO_WIDGET_NAME = "video-preview";
const MIN_PREVIEW_WIDTH = 160;
const MIN_PREVIEW_HEIGHT = 140;
const PATCH_RETRIES = 24;

function isSaveVideoNode(node) {
    return node?.type === NODE_TYPE
        || node?.comfyClass === NODE_TYPE
        || node?.constructor?.comfyClass === NODE_TYPE;
}

function previewWidget(node) {
    return (node?.widgets || []).find((widget) => widget.name === VIDEO_WIDGET_NAME);
}

function stylePreviewElement(container) {
    if (!container) return;

    container.classList.add("wsl-save-video-preview");
    Object.assign(container.style, {
        width: "100%",
        height: "100%",
        minWidth: "0",
        minHeight: "0",
        maxWidth: "100%",
        maxHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        boxSizing: "border-box",
    });

    const video = container.querySelector("video");
    if (!video) return;

    Object.assign(video.style, {
        display: "block",
        width: "100%",
        height: "100%",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
        margin: "auto",
    });
}

function patchPreviewWidget(node) {
    const widget = previewWidget(node);
    const container = widget?.element;
    if (!widget || !container) return false;

    stylePreviewElement(container);

    if (!widget.__wslSaveVideoPreviewPatched) {
        widget.__wslSaveVideoPreviewPatched = true;

        // Keep a small stable minimum so the native node resize handle can
        // reduce the node, regardless of the video's source resolution.
        widget.computeLayoutSize = () => ({
            minHeight: MIN_PREVIEW_HEIGHT,
            minWidth: MIN_PREVIEW_WIDTH,
        });

        // Older ComfyUI builds use computeSize instead of computeLayoutSize.
        if (typeof widget.computeSize !== "function") {
            widget.computeSize = () => [MIN_PREVIEW_WIDTH, MIN_PREVIEW_HEIGHT];
        }

        if (typeof MutationObserver === "function") {
            const observer = new MutationObserver(() => stylePreviewElement(container));
            observer.observe(container, { childList: true, subtree: true });
            widget.__wslSaveVideoPreviewObserver = observer;

            const originalOnRemove = widget.onRemove;
            widget.onRemove = function wslSaveVideoPreviewOnRemove() {
                observer.disconnect();
                return originalOnRemove?.apply(this, arguments);
            };
        }
    }

    stylePreviewElement(container);
    return true;
}

function schedulePreviewPatch(node) {
    if (!node || node.__wslSaveVideoPreviewPatchScheduled) return;
    node.__wslSaveVideoPreviewPatchScheduled = true;

    let retries = PATCH_RETRIES;
    const attempt = () => {
        node.__wslSaveVideoPreviewPatchScheduled = false;
        if (patchPreviewWidget(node) || retries <= 0) return;
        retries -= 1;
        node.__wslSaveVideoPreviewPatchScheduled = true;
        requestAnimationFrame(attempt);
    };

    requestAnimationFrame(attempt);
}

function patchNodeMethods(nodeType) {
    const prototype = nodeType?.prototype;
    if (!prototype || prototype.__wslSaveVideoPreviewMethodsPatched) return;
    prototype.__wslSaveVideoPreviewMethodsPatched = true;

    const originalCreated = prototype.onNodeCreated;
    prototype.onNodeCreated = function wslSaveVideoPreviewCreated() {
        const result = originalCreated?.apply(this, arguments);
        this.resizable = true;
        schedulePreviewPatch(this);
        return result;
    };

    const originalConfigured = prototype.onConfigure;
    prototype.onConfigure = function wslSaveVideoPreviewConfigured() {
        const result = originalConfigured?.apply(this, arguments);
        this.resizable = true;
        schedulePreviewPatch(this);
        return result;
    };

    const originalExecuted = prototype.onExecuted;
    prototype.onExecuted = function wslSaveVideoPreviewExecuted() {
        const result = originalExecuted?.apply(this, arguments);
        schedulePreviewPatch(this);
        return result;
    };

    const originalResized = prototype.onResize;
    prototype.onResize = function wslSaveVideoPreviewResized() {
        const result = originalResized?.apply(this, arguments);
        schedulePreviewPatch(this);
        return result;
    };

    const originalDraw = prototype.onDrawForeground;
    prototype.onDrawForeground = function wslSaveVideoPreviewDraw() {
        const result = originalDraw?.apply(this, arguments);
        patchPreviewWidget(this);
        return result;
    };
}

app.registerExtension({
    name: "Wysl.SaveVideoPreview",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_TYPE) return;
        patchNodeMethods(nodeType);
    },

    onNodeOutputsUpdated() {
        for (const node of app.graph?._nodes || []) {
            if (isSaveVideoNode(node)) schedulePreviewPatch(node);
        }
    },
});
