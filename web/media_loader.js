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
        .filter((part) => part && part !== "." && part !== "..").join("/");
}

function readState(node) {
    const raw = widget(node, STATE_WIDGET)?.value;
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
        const state = emptyState();
        for (const group of GROUPS) {
            const values = Array.isArray(parsed?.[group.key]) ? parsed[group.key] : [];
            state[group.key] = [...new Set(values.map((entry) => normalizePath(
                typeof entry === "string" ? entry : entry?.filename,
            )).filter(Boolean))];
        }
        return state;
    } catch {
        return emptyState();
    }
}

function writeState(node, state) {
    const normalized = emptyState();
    for (const group of GROUPS) normalized[group.key] = [...new Set(
        (state[group.key] || []).map(normalizePath).filter(Boolean),
    )];
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

function mediaUrl(path) {
    return `/view?${new URLSearchParams({ filename: path, type: "input" }).toString()}`;
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

function makeButton(text, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", handler);
    return button;
}

function filePreview(path, type) {
    const preview = document.createElement("div");
    preview.className = `wysl-media-thumb is-${type}`;
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
        const play = document.createElement("span");
        play.className = "wysl-media-video-mark";
        play.textContent = "▶";
        preview.append(play);
    } else {
        const wave = document.createElement("span");
        wave.className = "wysl-media-audio-wave";
        for (const height of [35, 65, 92, 52, 78, 42, 70]) {
            const bar = document.createElement("i");
            bar.style.setProperty("--bar-height", `${height}%`);
            wave.append(bar);
        }
        preview.append(wave);
    }
    return preview;
}

function fileTypeIcon(type) {
    const icon = document.createElement("span");
    icon.className = `wysl-media-file-icon is-${type}`;
    icon.textContent = type === "image" ? "IMG" : type === "video" ? "VID" : "AUD";
    return icon;
}

function selectedCount(state) {
    return GROUPS.reduce((count, group) => count + state[group.key].length, 0);
}

function updateMinSize(node) {
    node.resizable = true;
    const width = Math.max(275, Number(node.size?.[0]) || 275);
    const height = Math.max(184, Number(node.size?.[1]) || 184);
    if (Array.isArray(node.size) && (node.size[0] < width - 1 || node.size[1] < height - 1)) {
        node.setSize?.([Math.max(node.size[0], width), Math.max(node.size[1], height)]);
    }
}

function syncNodeWidgetLayout(node) {
    const domWidget = node.__wyslMediaLoaderWidget;
    if (!domWidget) return;
    domWidget.computeLayoutSize = () => ({ minHeight: 155, maxHeight: undefined, minWidth: 0 });
    domWidget.options ||= {};
    domWidget.options.getMinHeight = () => 155;
    delete domWidget.options.getMaxHeight;
    delete domWidget.options.getHeight;
    node._widgetSlotsDirty = true;
    node.setDirtyCanvas?.(true, true);
}

function cardTitle(path) {
    return path.split(/[\\/]/).pop() || path;
}

function reorder(node, group, from, target, before) {
    const next = readState(node);
    const values = next[group.key];
    if (!Number.isInteger(from) || !Number.isInteger(target) || from === target) return;
    const [moved] = values.splice(from, 1);
    let insertAt = target + (from < target ? -1 : 0) + (before ? 0 : 1);
    insertAt = Math.max(0, Math.min(values.length, insertAt));
    values.splice(insertAt, 0, moved);
    writeState(node, next);
    render(node);
}

function createSelectedCard(node, group, path, index) {
    const card = document.createElement("div");
    card.className = `wysl-media-card is-${group.type}`;
    card.draggable = true;
    card.dataset.index = String(index);
    card.dataset.path = path;
    card.title = cardTitle(path);
    card.append(filePreview(path, group.type));

    const order = document.createElement("span");
    order.className = "wysl-media-order";
    order.textContent = String(index + 1);
    card.append(order);

    const remove = makeButton("×", "wysl-media-remove", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = readState(node);
        next[group.key].splice(Number(card.dataset.index), 1);
        writeState(node, next);
        render(node);
    });
    remove.title = "移除";
    remove.setAttribute("aria-label", "移除");
    card.append(remove);

    card.addEventListener("dragstart", (event) => {
        node.__wyslMediaLoaderDrag = { group, card };
        card.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", path);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
        card.classList.remove("is-dragging");
        node.__wyslMediaLoaderDrag = null;
        node.__wyslMediaLoaderPanel?.querySelectorAll(".is-reorder-target").forEach((item) => item.classList.remove("is-reorder-target"));
    });
    card.addEventListener("dragover", (event) => {
        const drag = node.__wyslMediaLoaderDrag;
        if (!drag || drag.group.type !== group.type) return;
        event.preventDefault();
        event.stopPropagation();
        card.classList.add("is-reorder-target");
    });
    card.addEventListener("dragleave", () => card.classList.remove("is-reorder-target"));
    card.addEventListener("drop", (event) => {
        const drag = node.__wyslMediaLoaderDrag;
        if (!drag || drag.group.type !== group.type) return;
        event.preventDefault();
        event.stopPropagation();
        card.classList.remove("is-reorder-target");
        const rect = card.getBoundingClientRect();
        reorder(node, group, Number(drag.card.dataset.index), index, event.clientX < rect.left + rect.width / 2);
    });
    return card;
}

function renderGroup(node, group, state) {
    const section = document.createElement("section");
    section.className = `wysl-media-group is-${group.type}`;
    const header = document.createElement("div");
    header.className = "wysl-media-group-header";
    const name = document.createElement("span");
    name.textContent = group.label;
    const count = document.createElement("span");
    count.className = "wysl-media-group-count";
    count.textContent = String(state[group.key].length);
    header.append(name, count);
    const list = document.createElement("div");
    list.className = "wysl-media-card-list";
    const values = state[group.key];
    if (!values.length) {
        const empty = document.createElement("span");
        empty.className = "wysl-media-group-empty";
        empty.textContent = "未选择";
        list.append(empty);
    } else {
        values.forEach((path, index) => list.append(createSelectedCard(node, group, path, index)));
    }
    section.append(header, list);
    return section;
}

function clearSelection(node) {
    writeState(node, emptyState());
    render(node);
}

function createFileRow(node, group, item, state, modal) {
    const row = document.createElement("label");
    row.className = "wysl-media-file-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state[group.key].includes(item.path);
    checkbox.addEventListener("change", () => {
        const next = readState(node);
        const values = next[group.key];
        const index = values.indexOf(item.path);
        if (checkbox.checked && index < 0) values.push(item.path);
        if (!checkbox.checked && index >= 0) values.splice(index, 1);
        writeState(node, next);
        render(node);
        refreshModal(node, modal);
    });
    const thumb = fileTypeIcon(group.type);
    const name = document.createElement("span");
    name.className = "wysl-media-file-name";
    name.textContent = item.name;
    name.title = item.path;
    row.append(checkbox, thumb, name);
    return row;
}

function refreshModal(node, modal) {
    if (!modal || !modal.isConnected) return;
    const data = node.__wyslMediaLoaderFolderData || { folder: "", parent: "", directories: [], files: [] };
    const state = readState(node);
    const body = modal.querySelector(".wysl-media-modal-body");
    const path = modal.querySelector(".wysl-media-modal-path");
    const selectAll = modal.querySelector(".wysl-media-modal-select-all");
    if (!body || !path) return;
    path.textContent = `input/${data.folder || ""}`;
    body.replaceChildren();
    if (node.__wyslMediaLoaderFolderLoading) {
        const loading = document.createElement("div");
        loading.className = "wysl-media-modal-empty";
        loading.textContent = "正在读取当前目录…";
        body.append(loading);
        return;
    }
    if (data.error) {
        const error = document.createElement("div");
        error.className = "wysl-media-modal-empty is-error";
        error.textContent = data.error;
        body.append(error);
        return;
    }
    if (data.directories?.length) {
        const folders = document.createElement("div");
        folders.className = "wysl-media-modal-folders";
        for (const directory of data.directories) {
            const button = makeButton(`📁 ${directory.name}`, "wysl-media-folder-chip", () => loadFolder(node, directory.path));
            button.title = directory.path;
            folders.append(button);
        }
        body.append(folders);
    }
    const files = data.files || [];
    if (!files.length) {
        const empty = document.createElement("div");
        empty.className = "wysl-media-modal-empty";
        empty.textContent = "当前目录没有可用媒体文件";
        body.append(empty);
    } else {
        for (const group of GROUPS) {
            const groupFiles = files.filter((item) => item.type === group.type);
            if (!groupFiles.length) continue;
            const heading = document.createElement("div");
            heading.className = "wysl-media-modal-group-title";
            heading.textContent = group.label;
            body.append(heading);
            const list = document.createElement("div");
            list.className = "wysl-media-file-list";
            for (const item of groupFiles) list.append(createFileRow(node, group, item, state, modal));
            body.append(list);
        }
    }
    if (selectAll) selectAll.disabled = !files.length;
}

async function loadFolder(node, folder = "") {
    node.__wyslMediaLoaderFolder = normalizePath(folder);
    node.__wyslMediaLoaderFolderLoading = true;
    refreshModal(node, node.__wyslMediaLoaderModal);
    try {
        node.__wyslMediaLoaderFolderData = await listFolder(node.__wyslMediaLoaderFolder);
    } catch (error) {
        node.__wyslMediaLoaderFolderData = { error: error?.message || String(error), folder: node.__wyslMediaLoaderFolder, directories: [], files: [] };
    } finally {
        node.__wyslMediaLoaderFolderLoading = false;
        refreshModal(node, node.__wyslMediaLoaderModal);
    }
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
    refreshModal(node, node.__wyslMediaLoaderModal);
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

function openModal(node) {
    if (node.__wyslMediaLoaderModal?.isConnected) {
        refreshModal(node, node.__wyslMediaLoaderModal);
        return;
    }
    const modal = document.createElement("div");
    modal.className = "wysl-media-modal-overlay";
    const dialog = document.createElement("div");
    dialog.className = "wysl-media-modal";
    const header = document.createElement("div");
    header.className = "wysl-media-modal-header";
    const title = document.createElement("strong");
    title.textContent = "添加媒体";
    const close = makeButton("×", "wysl-media-modal-close", () => closeModal(node));
    close.title = "关闭";
    close.setAttribute("aria-label", "关闭");
    header.append(title, close);
    const controls = document.createElement("div");
    controls.className = "wysl-media-modal-controls";
    const path = document.createElement("span");
    path.className = "wysl-media-modal-path";
    const choose = makeButton("选择文件夹", "wysl-media-modal-folder", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = "image/*,audio/*,video/*";
        input.webkitdirectory = true;
        input.addEventListener("change", () => {
            const files = Array.from(input.files || []).filter((file) => typeForFile(file));
            if (files.length) addDroppedFiles(node, files).catch((error) => console.error("Wysl folder import failed", error));
            input.remove();
        }, { once: true });
        input.addEventListener("cancel", () => input.remove(), { once: true });
        document.body.append(input);
        input.click();
    });
    const up = makeButton("上级", "wysl-media-modal-up", () => loadFolder(node, node.__wyslMediaLoaderFolderData?.parent || ""));
    const root = makeButton("input 根目录", "wysl-media-modal-root", () => loadFolder(node, ""));
    const selectAll = makeButton("当前目录全选", "wysl-media-modal-select-all", () => selectCurrentFolder(node));
    controls.append(path, root, up, choose, selectAll);
    const body = document.createElement("div");
    body.className = "wysl-media-modal-body";
    const footer = document.createElement("div");
    footer.className = "wysl-media-modal-footer";
    footer.append(makeButton("完成", "wysl-media-modal-done", () => closeModal(node)));
    dialog.append(header, controls, body, footer);
    modal.append(dialog);
    modal.addEventListener("pointerdown", (event) => {
        if (event.target === modal) closeModal(node);
    });
    document.body.append(modal);
    node.__wyslMediaLoaderModal = modal;
    refreshModal(node, modal);
    if (!node.__wyslMediaLoaderFolderData) loadFolder(node, "");
}

function closeModal(node) {
    node.__wyslMediaLoaderModal?.remove();
    node.__wyslMediaLoaderModal = null;
}

function render(node) {
    const panel = node?.__wyslMediaLoaderPanel;
    if (!panel) return;
    const state = readState(node);
    panel.querySelector(".wysl-media-count").textContent = `${selectedCount(state)} 个已选`;
    const groups = panel.querySelector(".wysl-media-groups");
    groups.replaceChildren(...GROUPS.map((group) => renderGroup(node, group, state)));
    const status = panel.querySelector(".wysl-media-status");
    status.textContent = node.__wyslMediaLoaderUploading ? "正在上传并分类…" : "拖入图片、音频或视频，会自动分类";
    panel.classList.toggle("is-empty", selectedCount(state) === 0);
    syncNodeWidgetLayout(node);
}

function installStyles() {
    if (document.getElementById("wysl-media-loader-style")) return;
    const style = document.createElement("style");
    style.id = "wysl-media-loader-style";
    style.textContent = `
      .wysl-media-loader-panel{box-sizing:border-box;width:100%;height:100%;min-height:0;display:flex;flex-direction:column;gap:6px;padding:7px;border:1px solid rgba(255,255,255,.1);border-radius:6px;background:#24272b;color:#dfe4e8;font:12px/1.35 sans-serif;overflow:hidden}
      .wysl-media-toolbar{display:flex;align-items:center;gap:5px;min-height:25px;flex:0 0 auto}.wysl-media-title{font-weight:650;color:#f1f3f5;margin-right:2px}.wysl-media-count{color:#8c969f;font-size:10px;margin-right:auto}.wysl-media-toolbar button,.wysl-media-modal button{border:1px solid rgba(255,255,255,.14);border-radius:4px;background:#343a40;color:#e9edf0;padding:4px 8px;cursor:pointer;font:inherit}.wysl-media-toolbar button:hover,.wysl-media-modal button:hover{background:#46505a;border-color:rgba(255,255,255,.26)}.wysl-media-clear{color:#d7afb0!important}.wysl-media-groups{display:flex;flex:1 1 auto;flex-direction:column;gap:4px;min-height:0;overflow:hidden}
      .wysl-media-group{min-width:0;padding-top:5px;border-top:1px solid rgba(255,255,255,.09)}.wysl-media-group-header{display:flex;align-items:center;gap:5px;margin-bottom:4px;color:#cbd2d7;font-size:10px;font-weight:650}.wysl-media-group-count{color:#89949d;font-variant-numeric:tabular-nums}.wysl-media-card-list{display:flex;align-items:center;gap:6px;min-height:52px;overflow-x:auto;overflow-y:hidden;padding:2px 2px 4px 1px;scrollbar-width:thin}.wysl-media-group-empty{color:#737e87;font-size:10px;padding-left:3px}.wysl-media-card{position:relative;flex:0 0 54px;width:54px;height:54px;border:1px solid #444b50;border-radius:5px;background:#16191c;cursor:grab;transition:border-color .12s,opacity .12s,transform .12s}.wysl-media-card:hover,.wysl-media-card.is-reorder-target{border-color:#85a8c4}.wysl-media-card.is-dragging{opacity:.35;transform:scale(.95)}.wysl-media-card:active{cursor:grabbing}.wysl-media-thumb{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:4px;background:#151719}.wysl-media-thumb img,.wysl-media-thumb video{width:100%;height:100%;object-fit:contain;display:block}.wysl-media-thumb.is-audio{background:#142a27}.wysl-media-audio-wave{display:flex;align-items:center;justify-content:center;gap:3px;width:75%;height:55%}.wysl-media-audio-wave i{display:block;width:3px;height:var(--bar-height);border-radius:2px;background:#46c5b1}.wysl-media-video-mark{position:absolute;left:4px;bottom:4px;display:grid;place-items:center;width:15px;height:15px;border-radius:50%;background:rgba(0,0,0,.72);color:#fff;font-size:8px}.wysl-media-order{position:absolute;left:3px;top:3px;z-index:2;min-width:12px;padding:1px 3px;border-radius:3px;background:rgba(0,0,0,.74);color:#fff;text-align:center;font-size:9px;line-height:1.2;font-variant-numeric:tabular-nums}.wysl-media-remove{position:absolute!important;right:3px;top:3px;z-index:4;width:17px;height:17px;padding:0!important;border:1px solid rgba(0,0,0,.4)!important;border-radius:50%!important;background:rgba(62,72,80,.88)!important;color:#fff!important;display:grid;place-items:center;font-size:14px!important;line-height:1;opacity:0;visibility:hidden;transition:opacity .12s,transform .12s}.wysl-media-card:hover .wysl-media-remove,.wysl-media-card:focus-within .wysl-media-remove{opacity:1;visibility:visible}.wysl-media-remove:hover{background:#9b4d4d!important}
      .wysl-media-status{flex:0 0 auto;padding:4px 5px;border:1px dashed rgba(142,171,194,.32);border-radius:4px;color:#94a6b3;font-size:10px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wysl-media-loader-panel.is-empty .wysl-media-status{border-color:rgba(255,255,255,.12);color:#7c858c}.wysl-media-loader-panel.is-drop-target{border-color:#86abc7;box-shadow:inset 0 0 0 1px rgba(134,171,199,.28)}.wysl-media-loader-panel.is-drop-target::after{content:"释放以自动分类";position:absolute;inset:7px;z-index:10;display:flex;align-items:center;justify-content:center;border:1px dashed rgba(159,195,222,.7);border-radius:5px;background:rgba(28,35,40,.92);color:#d8e7f1;font-size:12px;font-weight:650;pointer-events:none}
      .wysl-media-modal-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.58)}.wysl-media-modal{display:flex;flex-direction:column;width:min(720px,calc(100vw - 40px));max-height:min(680px,calc(100vh - 40px));border:1px solid #4b545b;border-radius:7px;background:#25292d;box-shadow:0 18px 55px rgba(0,0,0,.5);color:#e3e7ea;font:12px/1.35 sans-serif}.wysl-media-modal-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1)}.wysl-media-modal-header strong{font-size:13px}.wysl-media-modal-close{width:24px;height:24px;padding:0!important;font-size:18px!important;line-height:1}.wysl-media-modal-controls{display:flex;align-items:center;gap:5px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08)}.wysl-media-modal-path{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#aebbc4}.wysl-media-modal-controls button{flex:0 0 auto;font-size:11px}.wysl-media-modal-body{min-height:100px;overflow:auto;padding:10px}.wysl-media-modal-folders{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px}.wysl-media-folder-chip{font-size:11px!important}.wysl-media-modal-group-title{margin:9px 0 4px;color:#9eb7c9;font-size:11px;font-weight:650}.wysl-media-file-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:3px 7px}.wysl-media-file-row{display:flex;align-items:center;min-width:0;gap:6px;padding:4px;border-radius:4px;cursor:pointer}.wysl-media-file-row:hover{background:rgba(255,255,255,.07)}.wysl-media-file-row input{margin:0;accent-color:#74a9cf}.wysl-media-file-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wysl-media-file-icon{display:grid;place-items:center;flex:0 0 34px;width:34px;height:27px;border-radius:3px;background:#344451;color:#bed2df;font-size:8px;font-weight:700;letter-spacing:.03em}.wysl-media-file-icon.is-image{background:#3d4650;color:#b9cee0}.wysl-media-file-icon.is-audio{background:#294d48;color:#8ee3d4}.wysl-media-file-icon.is-video{background:#493f51;color:#d1bfe1}.wysl-media-modal-empty{padding:28px 8px;color:#818b93;text-align:center}.wysl-media-modal-empty.is-error{color:#d39b9b}.wysl-media-modal-footer{display:flex;justify-content:flex-end;padding:8px 10px;border-top:1px solid rgba(255,255,255,.1)}.wysl-media-modal-done{background:#3f657f!important}
    `;
    document.head.append(style);
}

function setup(node) {
    if (!node || node.__wyslMediaLoaderSetup || typeof node.addDOMWidget !== "function") return;
    node.__wyslMediaLoaderSetup = true;
    installStyles();
    hideWidget(node);
    const panel = document.createElement("div");
    panel.className = "wysl-media-loader-panel";
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    panel.addEventListener("dragenter", (event) => {
        if (!event.dataTransfer?.items?.length) return;
        event.preventDefault();
        event.stopPropagation();
        panel.classList.add("is-drop-target");
    });
    panel.addEventListener("dragover", (event) => {
        if (!event.dataTransfer?.items?.length) return;
        event.preventDefault();
        event.stopPropagation();
        panel.classList.add("is-drop-target");
    });
    panel.addEventListener("dragleave", (event) => {
        if (event.relatedTarget instanceof Node && panel.contains(event.relatedTarget)) return;
        panel.classList.remove("is-drop-target");
    });
    panel.addEventListener("drop", (event) => {
        const files = Array.from(event.dataTransfer?.files || []).filter((file) => typeForFile(file));
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        panel.classList.remove("is-drop-target");
        addDroppedFiles(node, files).catch((error) => console.error("Wysl media drop failed", error));
    });
    const toolbar = document.createElement("div");
    toolbar.className = "wysl-media-toolbar";
    const title = document.createElement("span");
    title.className = "wysl-media-title";
    title.textContent = "媒体";
    const count = document.createElement("span");
    count.className = "wysl-media-count";
    const add = makeButton("添加媒体", "wysl-media-add", () => openModal(node));
    const clear = makeButton("清空", "wysl-media-clear", () => clearSelection(node));
    toolbar.append(title, count, add, clear);
    const groups = document.createElement("div");
    groups.className = "wysl-media-groups";
    const status = document.createElement("div");
    status.className = "wysl-media-status";
    panel.append(toolbar, groups, status);
    panel.addEventListener("wheel", (event) => {
        event.preventDefault();
        event.stopPropagation();
        app.canvas?.processMouseWheel?.(event);
    }, { passive: false, capture: true });
    node.__wyslMediaLoaderPanel = panel;
    const domWidget = node.addDOMWidget("wysl_media_loader", "wysl_media_loader", panel, {
        serialize: false,
        getValue: () => String(widget(node, STATE_WIDGET)?.value || ""),
        setValue: (value) => {
            const stateWidget = widget(node, STATE_WIDGET);
            if (stateWidget) stateWidget.value = String(value || "");
            render(node);
        },
        getMinHeight: () => 155,
        afterResize: () => syncNodeWidgetLayout(node),
    });
    if (domWidget) domWidget.serialize = false;
    node.__wyslMediaLoaderWidget = domWidget;
    render(node);
    updateMinSize(node);
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
            return result;
        };
        const originalRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function onRemovedWyslMediaLoader() {
            closeModal(this);
            return originalRemoved?.apply(this, arguments);
        };
    },
});
