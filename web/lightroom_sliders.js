import { app } from "../../../scripts/app.js";

const NODE_TYPES = new Set([
    "WyslLightroomImage",
    "WyslLightroomVideo",
    "WyslLightroomLight",
    "WyslLightroomColor",
    "WyslLightroomDetail",
    "WyslLightroomHSLWarm",
    "WyslLightroomHSLCool",
]);

const HSL_ZONES = [
    ["red", 0], ["orange", 30], ["yellow", 60], ["green", 120],
    ["aqua", 180], ["blue", 210], ["purple", 270], ["magenta", 330],
];

const LABELS = {
    temperature: "色温", tint: "色调", exposure: "曝光度", contrast: "对比度",
    highlights: "高光", shadows: "阴影", whites: "白色色阶", blacks: "黑色色阶",
    texture: "纹理", clarity: "清晰度", dehaze: "去朦胧", vibrance: "鲜艳度", saturation: "饱和度",
    red: "红色", orange: "橙色", yellow: "黄色", green: "绿色",
    aqua: "青色", blue: "蓝色", purple: "紫色", magenta: "洋红色",
};

const HSL_LABELS = { hue: "色相", saturation: "饱和度", lightness: "明亮度" };

function controlLabel(name) {
    const match = String(name).match(/^([a-z]+)_(hue|saturation|lightness)$/);
    return match ? `${LABELS[match[1]] || match[1]}${HSL_LABELS[match[2]]}` : LABELS[name] || name;
}

function localize(node) {
    for (const item of node?.widgets || []) {
        if (item?.name) item.label = controlLabel(item.name);
    }
    for (const item of node?.inputs || []) {
        if (item.name === "image") item.label = "图像";
        if (item.name === "video") item.label = "视频";
        if (item.name === "media") item.label = "图像或视频";
    }
}

function widgetY(control, index) {
    const value = control?.last_y ?? control?.y;
    if (Number.isFinite(Number(value))) return Number(value);
    return 20 + index * 30;
}

function hslColor(hue, saturation = 82, lightness = 54) {
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function gradientFor(context, name, x, width) {
    const gradient = context.createLinearGradient(x, 0, x + width, 0);
    if (name === "temperature") {
        gradient.addColorStop(0, "#4d8fd8");
        gradient.addColorStop(0.5, "#9aa4b0");
        gradient.addColorStop(1, "#e4ac55");
        return gradient;
    }
    if (name === "tint") {
        gradient.addColorStop(0, "#68a76a");
        gradient.addColorStop(0.5, "#a5a5a5");
        gradient.addColorStop(1, "#d277b4");
        return gradient;
    }
    if (["saturation", "vibrance"].includes(name)) {
        gradient.addColorStop(0, "#777b82");
        gradient.addColorStop(0.5, "#9ba0a8");
        gradient.addColorStop(1, "#e15d75");
        return gradient;
    }
    if (["exposure", "highlights", "whites", "lightness"].includes(name)) {
        gradient.addColorStop(0, "#22252a");
        gradient.addColorStop(0.5, "#8b9097");
        gradient.addColorStop(1, "#f1f3f5");
        return gradient;
    }
    if (["shadows", "blacks"].includes(name)) {
        gradient.addColorStop(0, "#111318");
        gradient.addColorStop(0.5, "#737982");
        gradient.addColorStop(1, "#d8dbe0");
        return gradient;
    }

    const match = String(name).match(/^([a-z]+)_(hue|saturation|lightness)$/);
    if (match) {
        const zone = HSL_ZONES.find(([key]) => key === match[1]);
        const center = zone?.[1] ?? 0;
        if (match[2] === "hue") {
            gradient.addColorStop(0, hslColor(center - 38));
            gradient.addColorStop(0.5, hslColor(center));
            gradient.addColorStop(1, hslColor(center + 38));
        } else if (match[2] === "saturation") {
            gradient.addColorStop(0, "#72767d");
            gradient.addColorStop(0.5, hslColor(center, 48));
            gradient.addColorStop(1, hslColor(center, 96));
        } else {
            gradient.addColorStop(0, "#111318");
            gradient.addColorStop(0.5, hslColor(center, 82, 54));
            gradient.addColorStop(1, "#f1f3f5");
        }
        return gradient;
    }

    gradient.addColorStop(0, "#34383e");
    gradient.addColorStop(0.5, "#8c929a");
    gradient.addColorStop(1, "#d6d9de");
    return gradient;
}

function drawIndicators(node, context) {
    if (!node || node.flags?.collapsed) return;
    const width = Math.max(80, Number(node.size?.[0] || 260) - 16);
    const x = 8;
    context.save();
    context.globalAlpha = 0.86;
    for (const [index, control] of (node.widgets || []).entries()) {
        if (!control?.name || !(control.options?.min != null && control.options?.max != null)) continue;
        const y = widgetY(control, index) + Math.max(12, Number(control.height || 26)) - 4;
        const min = Number(control.options.min);
        const max = Number(control.options.max);
        const value = Math.max(min, Math.min(max, Number(control.value) || 0));
        const ratio = (value - min) / Math.max(1e-6, max - min);
        context.fillStyle = gradientFor(context, control.name, x, width);
        context.fillRect(x, y, width, 3);
        context.fillStyle = "rgba(245, 247, 250, 0.58)";
        context.fillRect(x + width * 0.5 - 0.5, y - 2, 1, 7);
        context.fillStyle = "#f7c873";
        context.fillRect(x + width * ratio - 1, y - 2, 2, 7);
    }
    context.restore();
}

app.registerExtension({
    name: "Wysl.LightroomSliders",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!NODE_TYPES.has(nodeData?.name)) return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function onWslLightroomCreated() {
            const result = originalCreated?.apply(this, arguments);
            localize(this);
            return result;
        };

        const originalConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function onWslLightroomConfigured() {
            const result = originalConfigure?.apply(this, arguments);
            localize(this);
            return result;
        };

        const originalDraw = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function onWslLightroomDraw(context) {
            const result = originalDraw?.apply(this, arguments);
            drawIndicators(this, context);
            return result;
        };
    },
});
