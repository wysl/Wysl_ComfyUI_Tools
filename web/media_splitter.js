import { app } from "../../scripts/app.js";

const NODE_TYPE = "WyslMediaSplitter";
const GROUPS = [
    { type: "image", count: "image_count", max: 27, label: "图像" },
    { type: "video", count: "video_count", max: 9, label: "视频" },
    { type: "audio", count: "audio_count", max: 9, label: "音频" },
];
const OUTPUT_TYPES = { image: "IMAGE", video: "VIDEO", audio: "AUDIO" };

function widget(node, name) {
    return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function countFor(node, group) {
    const value = Number.parseInt(widget(node, group.count)?.value ?? 0, 10);
    return Number.isFinite(value) ? Math.max(0, Math.min(group.max, value)) : 0;
}

function outputInfo(name) {
    const match = /^(image|video|audio)_(\d+)$/.exec(String(name || ""));
    if (!match) return null;
    return { type: match[1], index: Number(match[2]) };
}

function desiredOutputs(node) {
    const names = [];
    for (const group of GROUPS) {
        for (let index = 1; index <= countFor(node, group); index += 1) {
            names.push(`${group.type}_${index}`);
        }
    }
    return names;
}

function labelFor(name) {
    const info = outputInfo(name);
    if (!info) return String(name || "");
    const group = GROUPS.find((item) => item.type === info.type);
    return `${group?.label || info.type} ${info.index}`;
}

function removeOutput(node, index) {
    if (typeof node.removeOutput === "function") {
        node.removeOutput(index);
        return;
    }
    const output = node.outputs?.[index];
    if (output?.links) {
        for (const linkId of output.links) node.graph?.removeLink?.(linkId);
    }
    node.outputs?.splice(index, 1);
}

function updateOutputLinkSlots(node) {
    const graph = node?.graph || app.graph;
    if (!graph || !Array.isArray(node?.outputs)) return;
    node.outputs.forEach((output, index) => {
        const links = Array.isArray(output?.links)
            ? output.links
            : output?.link == null ? [] : [output.link];
        for (const linkId of links) {
            const link = graph.links?.[linkId] || graph._links?.[linkId];
            if (!link) continue;
            // LiteGraph calls this origin_slot; newer graph adapters expose
            // camelCase aliases. Keep all present aliases synchronized.
            link.origin_slot = index;
            if ("originSlot" in link) link.originSlot = index;
            if ("from_slot" in link) link.from_slot = index;
            if ("fromSlot" in link) link.fromSlot = index;
        }
    });
}

function rebuildOutputs(node) {
    const desired = desiredOutputs(node);
    const desiredSet = new Set(desired);
    for (let index = (node.outputs || []).length - 1; index >= 0; index -= 1) {
        const output = node.outputs[index];
        if (outputInfo(output?.name) && !desiredSet.has(output.name)) removeOutput(node, index);
    }
    for (const name of desired) {
        if (node.outputs?.some((output) => output?.name === name)) continue;
        node.addOutput?.(name, OUTPUT_TYPES[outputInfo(name).type]);
    }
    const managed = [];
    const other = [];
    for (const output of node.outputs || []) {
        if (!outputInfo(output?.name)) {
            other.push(output);
            continue;
        }
        output.type = OUTPUT_TYPES[outputInfo(output.name).type];
        output.label = labelFor(output.name);
        output.localized_name = output.label;
        managed.push(output);
    }
    const order = new Map(desired.map((name, index) => [name, index]));
    managed.sort((left, right) => order.get(left.name) - order.get(right.name));
    const sorted = [...managed, ...other];
    node.outputs.splice(0, node.outputs.length, ...sorted);
    updateOutputLinkSlots(node);
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

function localize(node) {
    if (!node) return;
    node.title = "Wysl-媒体拆分";
    const labels = {
        image_count: "图像数量",
        video_count: "视频数量",
        audio_count: "音频数量",
        empty_output_mode: "空端口处理",
        media_bundle: "媒体包",
        images: "图像列表",
        videos: "视频列表",
        audios: "音频列表",
    };
    for (const item of node.widgets || []) if (labels[item.name]) item.label = labels[item.name];
    for (const item of node.inputs || []) if (labels[item.name]) {
        item.label = labels[item.name];
        item.localized_name = labels[item.name];
    }
    for (const item of node.outputs || []) {
        if (outputInfo(item.name)) {
            item.label = labelFor(item.name);
            item.localized_name = item.label;
        }
    }
}

function update(node, force = false) {
    if (!node || node.__wyslMediaSplitterUpdating) return;
    const signature = GROUPS.map((group) => countFor(node, group)).join(":");
    if (!force && node.__wyslMediaSplitterSignature === signature) return;
    node.__wyslMediaSplitterUpdating = true;
    try {
        node.__wyslMediaSplitterSignature = signature;
        rebuildOutputs(node);
        localize(node);
        const height = 150 + GROUPS.reduce((sum, group) => sum + countFor(node, group), 0) * 22;
        const width = Math.max(300, Number(node.size?.[0]) || 300);
        if (typeof node.setSize === "function") node.setSize([width, Math.min(900, height)]);
    } finally {
        node.__wyslMediaSplitterUpdating = false;
    }
}

app.registerExtension({
    name: "Wysl.MediaSplitter",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_TYPE) return;
        const setup = (node) => {
            if (!node || node.__wyslMediaSplitterSetup) return;
            node.__wyslMediaSplitterSetup = true;
            node.resizable = true;
            for (const group of GROUPS) {
                const control = widget(node, group.count);
                if (!control || control.__wyslMediaSplitterWatched) continue;
                control.__wyslMediaSplitterWatched = true;
                const original = control.callback;
                control.callback = function wyslMediaSplitterCountChanged() {
                    const result = original?.apply(this, arguments);
                    update(node, true);
                    return result;
                };
            }
            update(node, true);
        };
        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function onNodeCreatedWyslMediaSplitter() {
            const result = originalCreated?.apply(this, arguments);
            setup(this);
            return result;
        };
        const originalAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function onAddedWyslMediaSplitter() {
            const result = originalAdded?.apply(this, arguments);
            setup(this);
            return result;
        };
        const originalConfigured = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function onConfigureWyslMediaSplitter() {
            const result = originalConfigured?.apply(this, arguments);
            setup(this);
            update(this, true);
            return result;
        };
    },
});
