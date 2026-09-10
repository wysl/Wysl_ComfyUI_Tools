import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "WyslMediaLoader";
const STATE_WIDGET = "media_state";
const GROUPS = [
    { key: "images", type: "image", label: "图片", output: "multi output" },
    { key: "audios", type: "audio", label: "音频", output: "audio output" },
    { key: "videos", type: "video", label: "视频", output: "video output" },
];

function widget(node, name) {
    return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function emptyState() {
    return { images: [], audios: [], videos: [] };
}

function normalizePath(value) {
    return String(value || "").replaceAll("\\", "/").replace(/^\/+/, "").split("/")
        .filter((part) => part && part !== "." && part !== "..")
        .join("/");
}

function readState(node) {
    const raw = widget(node, STATE_WIDGET)?.value;
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
        const state = emptyState();
        for (const group of GROUPS) {
            const values = Array.isArray(parsed?.[group.key]) ? parsed[group.key] : [];
            state[group.key] = [...new Set(values.map((entry) => {
                if (typeof entry === "string") return normalizePath(entry);
                return normalizePath(entry?.filename);
            }).filter(Boolean))];
        }
        return state;
    } catch {
        return emptyState();
    }
}

function writeState(node, state) {
    const normalized = emptyState();
    for (const group of GROUPS) {
        normalized[group.key] = [...new Set((state[group.key] || []).map(normalizePath).filter(Boolean))];
    }
    const value = JSON.stringify(normalized);
    const stateWidget = widget(node, STATE_WIDGET);
    if (stateWidget) {
        stateWidget.value = value;
        if (stateWidget._state) stateWidget._state.value = value;
    }
    node.properties ||= {};
    node.properties.wysl_media_loader_state = value;
    node.graph?.setDirtyCanvas?.(true, true);
    node.graph?.change?.();
}

function extension(path) {
    const name = String(path || "").toLowerCase();
    return name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
}

function typeForFile(file) {
    const mime = String(file?.type || "").toLowerCase();
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    const ext = extension(file?.name);
    if ([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff", ".avif", ".heic"].includes(ext)) return "image";
    if ([".wav", ".mp3", ".flac", ".ogg", ".oga", ".m4a", ".aac", ".opus", ".wma"].includes(ext)) return "audio";
    if ([".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v", ".mpeg", ".mpg", ".wmv", ".flv"].includes(ext)) return "video";
    return "";
}

function viewUrl(filename) {
    const params = new URLSearchParams({ filename, type: "input" });
    return `/view?${params.toString()}`;
}

function mediaUrl(path) {
    return viewUrl(path);
}

async function listFolder(folder) {
    const params = new URLSearchParams({ folder: String(folder || "") });
    const response = await api.fetchApi(`/wysl/media-loader/list?${params.toString()}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
}

async function uploadOne(file) {
    const form = new FormData();
    form.append("image", file, String(file?.name || "wysl-media"));
    form.append("type", "input");
    const response = await api.fetchApi("/upload/image", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    const name = String(data?.name || data?.filename || "").trim();
    if (!name) throw new Error("上传接口没有返回文件名");
    const subfolder = String(data?.subfolder || "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    return subfolder ? `${subfolder}/${name}` : name;
}

function hideWidget(node) {
    const stateWidget = widget(node, STATE_WIDGET);
    if (!stateWidget) return;
    stateWidget.hidden = true;
    stateWidget.type = "hidden";
    stateWidget.computeSize = () => [0, -4];
    stateWidget.options ||= {};
    stateWidget.options.hidden = true;
}

function selected(state, group, path) {
    return state[group.key].includes(path);
}

function toggleFile(node, group, path, checked) {
    const state = readState(node);
    const values = state[group.key];
    const index = values.indexOf(path);
    if (checked && index < 0) values.push(path);
    if (!checked && index >= 0) values.splice(index, 1);
    writeState(node, state);
    render(node);
}

function filePreview(path, type, small = false) {
    const preview = document.createElement("div");
    preview.className = `wysl-media-preview is-${type}${small ? " is-small" : ""}`;
    if (type === "image") {
        const image = document.createElement("img");
        image.src = mediaUrl(path);
        image.alt = "";
        image.loading = "lazy";
        preview.append(image);
    } else if (type === "video") {
        const video = document.createElement("video");
        video.src = mediaUrl(path);
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        preview.append(video);
    } else {
        const icon = document.createElement("span");
        icon.textContent = "♫";
        preview.append(icon);
    }
    return preview;
}

function fileRow(node, group, item, state) {
    const row = document.createElement("label");
    row.className = "wysl-media-file-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected(state, group, item.path);
    checkbox.addEventListener("change", () => toggleFile(node, group, item.path, checkbox.checked));
    row.append(checkbox, filePreview(item.path, group.type, true));
    const name = document.createElement("span");
    name.className = "wysl-media-file-name";
    name.textContent = item.name;
    name.title = item.path;
    row.append(name);
    return row;
}

function directoryRow(node, directory) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wysl-media-directory";
    button.textContent = `📁 ${directory.name}`;
    button.title = directory.path;
    button.addEventListener("click", () => loadFolder(node, directory.path));
    return button;
}

function breadcrumb(node, folder, parent) {
    const row = document.createElement("div");
    row.className = "wysl-media-breadcrumb";
    const root = document.createElement("button");
    root.type = "button";
    root.textContent = "input";
    root.addEventListener("click", () => loadFolder(node, ""));
    row.append(root);
    if (folder) {
        const separator = document.createElement("span");
        separator.textContent = " / ";
        row.append(separator);
        const current = document.createElement("span");
        current.textContent = folder;
        row.append(current);
        const up = document.createElement("button");
        up.type = "button";
        up.className = "wysl-media-up";
        up.textContent = "上级";
        up.title = parent ? `返回 ${parent}` : "返回 input 根目录";
        up.addEventListener("click", () => loadFolder(node, parent || ""));
        row.append(up);
    }
    return row;
}

function currentFolderFiles(node, data, state) {
    const section = document.createElement("div");
    section.className = "wysl-media-browser-section";
    const title = document.createElement("div");
    title.className = "wysl-media-section-title";
    title.textContent = "当前目录媒体";
    section.append(title);
    if (!data.files?.length) {
        const empty = document.createElement("div");
        empty.className = "wysl-media-empty";
        empty.textContent = "当前目录没有可用媒体文件";
        section.append(empty);
        return section;
    }
    const list = document.createElement("div");
    list.className = "wysl-media-file-list";
    for (const group of GROUPS) {
        const files = data.files.filter((item) => item.type === group.type);
        if (!files.length) continue;
        const groupTitle = document.createElement("div");
        groupTitle.className = "wysl-media-group-title";
        groupTitle.textContent = group.label;
        list.append(groupTitle);
        for (const item of files) list.append(fileRow(node, group, item, state));
    }
    section.append(list);
    return section;
}

function selectedPreview(node, state) {
    const section = document.createElement("div");
    section.className = "wysl-media-selected-section";
    const title = document.createElement("div");
    title.className = "wysl-media-section-title";
    title.textContent = "已选择媒体（按输出顺序）";
    section.append(title);
    for (const group of GROUPS) {
        const values = state[group.key];
        const groupBox = document.createElement("div");
        groupBox.className = "wysl-media-selected-group";
        const label = document.createElement("div");
        label.className = "wysl-media-group-title";
        label.textContent = `${group.label} · ${values.length}`;
        groupBox.append(label);
        const cards = document.createElement("div");
        cards.className = "wysl-media-selected-list";
        values.forEach((path, index) => {
            const card = document.createElement("div");
            card.className = "wysl-media-selected-card";
            card.title = path;
            card.append(filePreview(path, group.type));
            const order = document.createElement("span");
            order.className = "wysl-media-order";
            order.textContent = String(index + 1);
            card.append(order);
            cards.append(card);
        });
        if (!values.length) {
            const empty = document.createElement("span");
            empty.className = "wysl-media-empty-inline";
            empty.textContent = "未选择";
            cards.append(empty);
        }
        groupBox.append(cards);
        section.append(groupBox);
    }
    return section;
}

function makeButton(text, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", handler);
    return button;
}

function installStyles() {
    if (document.getElementById("wysl-media-loader-style")) return;
    const style = document.createElement("style");
    style.id = "wysl-media-loader-style";
    style.textContent = `
      .wysl-media-loader-panel { box-sizing:border-box; width:100%; min-height:260px; padding:8px; color:#d8dce2; background:rgba(25,28,33,.72); border:1px solid rgba(255,255,255,.08); border-radius:6px; font:12px/1.35 sans-serif; overflow:auto; }
      .wysl-media-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:5px; margin-bottom:7px; }
      .wysl-media-toolbar button, .wysl-media-breadcrumb button { border:1px solid rgba(255,255,255,.13); border-radius:4px; background:#333941; color:#e4e8ee; padding:4px 7px; cursor:pointer; }
      .wysl-media-toolbar button:hover, .wysl-media-breadcrumb button:hover, .wysl-media-directory:hover { background:#46505a; }
      .wysl-media-path { min-width:80px; flex:1; color:#aab7c3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wysl-media-breadcrumb { display:flex; align-items:center; gap:4px; margin:3px 0 7px; color:#b7c1ca; }
      .wysl-media-up { margin-left:auto; }
      .wysl-media-browser-section, .wysl-media-selected-section { margin-top:7px; padding-top:6px; border-top:1px solid rgba(255,255,255,.08); }
      .wysl-media-section-title { color:#f0f2f5; font-weight:600; margin-bottom:5px; }
      .wysl-media-group-title { color:#91b7d4; font-size:11px; margin:5px 0 3px; }
      .wysl-media-directory-list { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px; }
      .wysl-media-directory { border:1px solid rgba(255,255,255,.1); border-radius:4px; background:#2f353b; color:#d6dde4; padding:4px 7px; cursor:pointer; }
      .wysl-media-file-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:3px 7px; }
      .wysl-media-file-row { display:flex; align-items:center; min-width:0; gap:5px; padding:3px; border-radius:4px; cursor:pointer; }
      .wysl-media-file-row:hover { background:rgba(255,255,255,.07); }
      .wysl-media-file-row input { margin:0; accent-color:#6da6d3; }
      .wysl-media-file-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wysl-media-preview { position:relative; width:58px; height:42px; flex:none; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:3px; background:#1c2025; color:#9aa7b2; font-size:20px; }
      .wysl-media-preview.is-small { width:30px; height:24px; font-size:13px; }
      .wysl-media-preview img, .wysl-media-preview video { width:100%; height:100%; object-fit:cover; }
      .wysl-media-selected-group { margin-bottom:5px; }
      .wysl-media-selected-list { display:flex; flex-wrap:wrap; gap:5px; min-height:28px; }
      .wysl-media-selected-card { position:relative; width:58px; height:42px; border:1px solid rgba(255,255,255,.12); border-radius:3px; overflow:hidden; }
      .wysl-media-order { position:absolute; left:2px; top:2px; min-width:14px; padding:1px 3px; border-radius:3px; color:#fff; background:rgba(0,0,0,.72); text-align:center; font-size:10px; }
      .wysl-media-empty, .wysl-media-empty-inline { color:#89939d; }
      .wysl-media-drop { margin-top:7px; padding:7px; border:1px dashed rgba(141,174,202,.48); border-radius:4px; color:#aebdca; text-align:center; }
      .wysl-media-loader-panel.is-drop-target { border-color:#81afd2; background:rgba(55,79,99,.33); }
    `;
    document.head.append(style);
}

function updateSize(node) {
    node.resizable = true;
    if (!Array.isArray(node.size)) return;
    const width = Math.max(330, Number(node.size[0]) || 330);
    const height = Math.max(280, Number(node.size[1]) || 280);
    if (Math.abs(Number(node.size[0]) - width) > 1 || Math.abs(Number(node.size[1]) - height) > 1) {
        node.setSize?.([width, height]);
    }
}

async function loadFolder(node, folder = "") {
    node.__wyslMediaLoaderFolder = normalizePath(folder);
    node.__wyslMediaLoaderLoading = true;
    render(node);
    try {
        node.__wyslMediaLoaderFolderData = await listFolder(node.__wyslMediaLoaderFolder);
    } catch (error) {
        node.__wyslMediaLoaderFolderData = { error: error?.message || String(error), folder: node.__wyslMediaLoaderFolder, directories: [], files: [] };
    } finally {
        node.__wyslMediaLoaderLoading = false;
        render(node);
    }
}

async function addDroppedFiles(node, files) {
    const list = Array.from(files || []).filter((file) => typeForFile(file));
    if (!list.length) return;
    node.__wyslMediaLoaderUploading = true;
    render(node);
    const state = readState(node);
    const errors = [];
    for (const file of list) {
        const type = typeForFile(file);
        const group = GROUPS.find((item) => item.type === type);
        if (!group) continue;
        try {
            const path = await uploadOne(file);
            if (!state[group.key].includes(path)) state[group.key].push(path);
        } catch (error) {
            errors.push(`${file.name}: ${error?.message || error}`);
        }
    }
    writeState(node, state);
    node.__wyslMediaLoaderUploading = false;
    if (errors.length) globalThis.alert?.(errors.join("\n"));
    render(node);
}

function selectCurrentFolder(node) {
    const data = node.__wyslMediaLoaderFolderData || {};
    const state = readState(node);
    for (const item of data.files || []) {
        const group = GROUPS.find((entry) => entry.type === item.type);
        if (group && !state[group.key].includes(item.path)) state[group.key].push(item.path);
    }
    writeState(node, state);
    render(node);
}

function clearSelection(node) {
    writeState(node, emptyState());
    render(node);
}

function chooseFolder(node) {
    const current = node.__wyslMediaLoaderFolder || "";
    const selected = globalThis.prompt?.(
        "输入 ComfyUI/input 下的文件夹路径；留空表示 input 根目录",
        current,
    );
    if (selected !== null && selected !== undefined) loadFolder(node, selected);
}

function render(node) {
    const panel = node?.__wyslMediaLoaderPanel;
    if (!panel) return;
    panel.replaceChildren();
    const state = readState(node);
    const data = node.__wyslMediaLoaderFolderData || { folder: "", directories: [], files: [] };
    const toolbar = document.createElement("div");
    toolbar.className = "wysl-media-toolbar";
    toolbar.append(
        makeButton("选择文件夹", "wysl-media-folder-button", () => chooseFolder(node)),
        makeButton("当前目录全选", "wysl-media-select-all", () => selectCurrentFolder(node)),
        makeButton("清空已选", "wysl-media-clear", () => clearSelection(node)),
        makeButton("刷新", "wysl-media-refresh", () => loadFolder(node, node.__wyslMediaLoaderFolder || "")),
    );
    const path = document.createElement("span");
    path.className = "wysl-media-path";
    path.textContent = node.__wyslMediaLoaderUploading ? "正在上传并分类媒体..." : node.__wyslMediaLoaderLoading ? "正在读取当前目录..." : `input/${data.folder || ""}`;
    toolbar.append(path);
    panel.append(toolbar, breadcrumb(node, data.folder || "", data.parent || ""));

    const directories = document.createElement("div");
    directories.className = "wysl-media-directory-list";
    for (const directory of data.directories || []) directories.append(directoryRow(node, directory));
    if (directories.childElementCount) panel.append(directories);
    if (data.error) {
        const error = document.createElement("div");
        error.className = "wysl-media-empty";
        error.textContent = data.error;
        panel.append(error);
    } else {
        panel.append(currentFolderFiles(node, data, state));
    }
    panel.append(selectedPreview(node, state));
    const drop = document.createElement("div");
    drop.className = "wysl-media-drop";
    drop.textContent = "将图片、音频、视频混合拖到这里，会自动分类并按拖入顺序加入";
    panel.append(drop);
    updateSize(node);
}

function setup(node) {
    if (!node || node.__wyslMediaLoaderSetup || typeof node.addDOMWidget !== "function") return;
    node.__wyslMediaLoaderSetup = true;
    installStyles();
    hideWidget(node);
    const panel = document.createElement("div");
    panel.className = "wysl-media-loader-panel";
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    panel.addEventListener("dragover", (event) => {
        if (!event.dataTransfer?.files?.length && !Array.from(event.dataTransfer?.items || []).some((item) => item.kind === "file")) return;
        event.preventDefault();
        event.stopPropagation();
        panel.classList.add("is-drop-target");
    });
    panel.addEventListener("dragleave", () => panel.classList.remove("is-drop-target"));
    panel.addEventListener("drop", (event) => {
        const files = Array.from(event.dataTransfer?.files || []);
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        panel.classList.remove("is-drop-target");
        addDroppedFiles(node, files).catch((error) => console.error("Wysl media drop failed", error));
    });
    node.__wyslMediaLoaderPanel = panel;
    const domWidget = node.addDOMWidget("wysl_media_loader", "wysl_media_loader", panel, {
        serialize: false,
        getValue: () => String(widget(node, STATE_WIDGET)?.value || ""),
        setValue: (value) => {
            const stateWidget = widget(node, STATE_WIDGET);
            if (stateWidget) stateWidget.value = String(value || "");
            render(node);
        },
        getMinHeight: () => 280,
        afterResize: () => render(node),
    });
    if (domWidget) domWidget.serialize = false;
    node.__wyslMediaLoaderWidget = domWidget;
    render(node);
    loadFolder(node, "");
}

app.registerExtension({
    name: "Wysl.MediaLoader",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_TYPE) return;
        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function onNodeCreatedWyslMediaLoader() {
            const result = originalCreated?.apply(this, arguments);
            setup(this);
            return result;
        };
        const originalAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function onAddedWyslMediaLoader() {
            const result = originalAdded?.apply(this, arguments);
            setup(this);
            return result;
        };
        const originalConfigured = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function onConfigureWyslMediaLoader() {
            const result = originalConfigured?.apply(this, arguments);
            setup(this);
            render(this);
            loadFolder(this, this.__wyslMediaLoaderFolder || "");
            return result;
        };
    },
});
