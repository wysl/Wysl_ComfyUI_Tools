import { app } from "../../../scripts/app.js";

const PROMPT_NODE = "WyslMiniMaxH3EasyPrompt";
const AREA_SWITCH_NODE = "WyslMiniMaxH3EasyAreaSwitch";
const H3_NODE = "MiniMaxH3Easy";
const REF_PATTERN = /@<?(picture|image|图片|图像|图|video|视频)\s*(\d+)>?/giu;
const LINKS_PROP = "minimax_h3_virtual_media_links";

function graphNodes(graph) {
    return Array.isArray(graph?._nodes) ? graph._nodes : [];
}

function originNode(node, inputName) {
    const input = (node?.inputs || []).find((entry) => entry.name === inputName);
    const link = input?.link;
    if (link == null) return null;
    const graph = node.graph || app.graph;
    const resolved = typeof link === "object" ? link : graph?.getLink?.(link) || graph?._links?.[link];
    const originId = resolved?.origin_id ?? resolved?.originId ?? (Array.isArray(link) ? link[0] : null);
    return Number.isFinite(Number(originId)) ? graph?.getNodeById?.(Number(originId)) || null : null;
}

function resolvePromptNode(node, visited = new Set()) {
    if (!node) return null;
    const id = Number(node.id);
    if (Number.isFinite(id)) {
        if (visited.has(id)) return null;
        visited.add(id);
    }
    const type = String(node.comfyClass || node.type || "");
    if (type === PROMPT_NODE) return node;
    if (type !== AREA_SWITCH_NODE) return null;
    const useFirst = Boolean((node.widgets || []).find((item) => item.name === "use_first")?.value);
    return resolvePromptNode(originNode(node, useFirst ? "first" : "second"), visited);
}

function mentionType(label) {
    return /video|视频/i.test(String(label)) ? "video" : "image";
}

function runtimeIndexForMention(targetNode, mediaType, ordinal) {
    const links = targetNode?.properties?.[LINKS_PROP];
    if (!Array.isArray(links)) return ordinal;
    let count = 0;
    for (let index = 0; index < links.length; index += 1) {
        const linkType = String(links[index]?.media_type || "image").toLowerCase();
        if (linkType !== mediaType) continue;
        count += 1;
        if (count === ordinal) return index + 1;
    }
    return ordinal;
}

function runtimePrompt(value, targetNode) {
    // Keep ordinary @ text unchanged.  Only the media mention forms accepted
    // by H3 are converted into the same placeholders used by the source node.
    return String(value || "").replace(REF_PATTERN, (_match, label, number) => {
        const mediaType = mentionType(label);
        const ordinal = Math.max(1, Number.parseInt(number, 10) || 1);
        const index = runtimeIndexForMention(targetNode, mediaType, ordinal);
        return `__MINIMAX_H3_REF_${index}__`;
    });
}

function patchGraphToPrompt() {
    if (app.__wslPromptBridgePatched || typeof app.graphToPrompt !== "function") return;
    app.__wslPromptBridgePatched = true;
    const original = app.graphToPrompt;
    app.graphToPrompt = async function graphToPromptWithWslPrompt() {
        const promptData = await original.apply(this, arguments);
        const output = promptData?.output || {};
        for (const h3Node of graphNodes(app.graph)) {
            if (String(h3Node.comfyClass || h3Node.type || "") !== H3_NODE) continue;
            const sourceNode = resolvePromptNode(originNode(h3Node, "prompt"));
            if (!sourceNode) continue;
            const sourceData = output[String(sourceNode.id)];
            if (!sourceData?.inputs) continue;
            sourceData.inputs.prompt = runtimePrompt(sourceData.inputs.prompt, h3Node);
        }
        return promptData;
    };
}

function installBridge(attempt = 0) {
    if (app.__wslPromptBridgePatched || attempt > 20) return;
    patchGraphToPrompt();
    if (!app.__wslPromptBridgePatched) setTimeout(() => installBridge(attempt + 1), 250);
}

app.registerExtension({
    name: "Wysl.PromptBridge",
    setup() {
        installBridge();
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== PROMPT_NODE) return;
        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function onWslPromptCreated() {
            const result = originalCreated?.apply(this, arguments);
            const prompt = (this.widgets || []).find((item) => item.name === "prompt");
            if (prompt) prompt.label = "提示词";
            installBridge();
            return result;
        };
    },
});
