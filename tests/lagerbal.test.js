const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js", "lagerbal.js"), "utf8");
const catalogSource = fs.readFileSync(path.join(root, "js", "songs-catalog.js"), "utf8");

function element(tagName = "") {
    return {
        tagName, children: [], listeners: {}, textContent: "", value: "", hidden: false,
        append(...children) { this.children.push(...children); },
        replaceChildren(...children) { this.children = children; this.textContent = children.map(child => child.textContent).join(""); },
        addEventListener(type, callback) { this.listeners[type] = callback; },
        dispatch(type, event = {}) { this.listeners[type]?.(event); },
        showModal() { this.open = true; },
        close() { this.open = false; },
        select() { this.selected = true; }
    };
}

async function loadPage(response, options = {}) {
    const ids = ["songGrid", "songSearch", "songCategoryFilter", "songStatus", "songDialog", "songDetailTitle", "songDetailCategory", "songDetailInfo", "songDetailLyrics", "closeSongDialog", "shareSongBtn", "songShareDialog", "songShareUrl", "songShareStatus", "copySongShareBtn", "closeSongShareDialog", "cancelSongShareBtn"];
    const elements = Object.fromEntries(ids.map(id => [id, element()]));
    const errors = [];
    const context = vm.createContext({
        document: { getElementById: id => elements[id], createElement: element, createTextNode: text => ({ textContent: text }) },
        fetch: async () => response,
        window: { location: { href: options.url || "https://example.test/gt/lagerbal.html" } },
        navigator: { clipboard: { writeText: options.writeText || (async () => {}) } },
        URL,
        console: { error: (...args) => errors.push(args) }
    });
    vm.runInContext(catalogSource, context);
    vm.runInContext(source, context);
    await new Promise(resolve => setImmediate(resolve));
    return { elements, errors };
}

function cards(elements) {
    return elements.songGrid.children.flatMap(group => group.children[1].children);
}

test("songs are sorted, searchable by text, and open safely with their line breaks", async () => {
    const data = [
        { id: "2", titel: "Öppet", kategori: "Sång", text: "Första\nAndra <versen>", info: "En vän" },
        { id: "1", titel: "Alfabetet", kategori: "Sång", text: "Annan sång" }
    ];
    const { elements: e } = await loadPage({ ok: true, json: async () => data });
    assert.deepEqual(cards(e).map(card => card.children[1].textContent), ["Alfabetet", "Öppet"]);
    assert.equal(e.songStatus.hidden, true);
    e.songSearch.value = "ANDRA <VERSEN>";
    e.songSearch.dispatch("input");
    assert.equal(cards(e).length, 1);
    cards(e)[0].dispatch("click");
    assert.equal(e.songDialog.open, true);
    assert.equal(e.songDetailTitle.textContent, "Öppet");
    assert.equal(e.songDetailInfo.textContent, "En vän");
    assert.equal(e.songDetailLyrics.textContent, "Första\nAndra <versen>");
    e.closeSongDialog.dispatch("click");
    assert.equal(e.songDialog.open, false);
    cards(e)[0].dispatch("click");
    let prevented = false;
    e.songDialog.dispatch("keydown", { key: "Escape", preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(e.songDialog.open, false);
    e.songSearch.value = "saknas";
    e.songSearch.dispatch("input");
    assert.equal(e.songStatus.textContent, "Inga sånger matchar filtreringen.");
    assert.equal(e.songStatus.hidden, false);
    e.songSearch.value = "";
    e.songSearch.dispatch("input");
    assert.equal(e.songStatus.hidden, true);
});

test("categories are grouped and filtered together with search and shown in details", async () => {
    const data = [
        { id: "1", titel: " Örn", kategori: "Rop", text: "Gemensam text" },
        { id: "2", titel: "Båt", kategori: "Lek", text: "Gemensam text" },
        { id: "3", titel: "Apa", kategori: "Rop", text: "Annan text", info: "Med rörelser" },
        { id: "4", titel: "Sång", kategori: "Sång", text: "Gemensam text" }
    ];
    const { elements: e } = await loadPage({ ok: true, json: async () => data });
    assert.deepEqual(e.songGrid.children.map(group => group.children[0].children[0].textContent), ["Sång", "Rop", "Lek"]);
    assert.equal(e.songGrid.children[1].children[0].children[1].textContent, "2 st.");
    assert.deepEqual(e.songGrid.children[1].children[1].children.map(card => card.children[1].textContent), ["Apa", " Örn"]);
    assert.equal(e.songGrid.children[1].children[1].children[0].children[0].textContent, "Rop");
    assert.equal(e.songGrid.children[1].children[1].children[0].children[0].className, "recipe-category");

    e.songGrid.children[1].open = false;
    e.songGrid.children[1].dispatch("toggle");
    e.songCategoryFilter.value = "Rop";
    e.songCategoryFilter.dispatch("change");
    assert.equal(e.songGrid.children[0].open, false);
    e.songSearch.value = "annan";
    e.songSearch.dispatch("input");
    assert.deepEqual(cards(e).map(card => card.children[1].textContent), ["Apa"]);
    cards(e)[0].dispatch("click");
    assert.equal(e.songDetailCategory.textContent, "Rop");
    assert.equal(e.songDetailInfo.textContent, "Med rörelser");
    e.songCategoryFilter.value = "Lek";
    e.songCategoryFilter.dispatch("change");
    assert.equal(cards(e).length, 0);
    assert.equal(e.songStatus.hidden, false);
    e.songSearch.value = "";
    e.songSearch.dispatch("input");
    assert.deepEqual(cards(e).map(card => card.children[1].textContent), ["Båt"]);
    e.songCategoryFilter.value = "";
    e.songCategoryFilter.dispatch("change");
    assert.equal(cards(e).length, 4);
});

test("bold markup is rendered as safe text and searches match the displayed lyrics", async () => {
    const text = "Hej **vår <vän>** igen\n**Refräng** och **sång**\nEnsam **markering";
    const { elements: e } = await loadPage({ ok: true, json: async () => [{ id: "1", titel: "Sång", kategori: "Sång", text }] });
    e.songSearch.value = "hej vår <vän> igen";
    e.songSearch.dispatch("input");
    assert.equal(cards(e).length, 1);
    cards(e)[0].dispatch("click");
    assert.equal(e.songDetailLyrics.textContent, "Hej vår <vän> igen\nRefräng och sång\nEnsam **markering");
    assert.deepEqual(e.songDetailLyrics.children.filter(node => node.tagName === "strong").map(node => node.textContent), ["vår <vän>", "Refräng", "sång"]);
});

test("cards use existing info or a short plain-text lyric preview", async () => {
    const data = [
        { id: "1", titel: "A", kategori: "Sång", info: "Med rörelser", text: "Sångtext" },
        { id: "2", titel: "B", kategori: "Sång", info: "  ", text: "  **Hej <vän>**\n\nNästa rad  " },
        { id: "3", titel: "C", kategori: "Sång", text: "😀".repeat(161) }
    ];
    const { elements: e } = await loadPage({ ok: true, json: async () => data });
    assert.equal(cards(e)[0].children[2].textContent, "Med rörelser");
    assert.equal(cards(e)[1].children[2].textContent, "Hej <vän> Nästa rad");
    assert.equal(cards(e)[2].children[2].textContent, "😀".repeat(160) + "…");
    cards(e)[1].dispatch("click");
    assert.equal(e.songDetailLyrics.textContent, "  Hej <vän>\n\nNästa rad  ");
});

test("sharing copies an encoded link and opens the same song for a guest", async () => {
    const data = [{ id: "sång & 1", titel: "Elden", kategori: "Sång", text: "Text" }];
    const copied = [];
    const response = { ok: true, json: async () => data };
    const { elements: e } = await loadPage(response, {
        url: "https://example.test/gt/lagerbal.html?other=old#fragment",
        writeText: async text => copied.push(text)
    });
    cards(e)[0].dispatch("click");
    e.shareSongBtn.dispatch("click");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(e.songShareDialog.open, true);
    assert.equal(e.songShareUrl.value, "https://example.test/gt/lagerbal.html?song=s%C3%A5ng+%26+1");
    assert.deepEqual(copied, [e.songShareUrl.value]);
    assert.match(e.songShareStatus.textContent, /kopierats/);
    const recipient = await loadPage(response, { url: e.songShareUrl.value });
    assert.equal(recipient.elements.songDialog.open, true);
    assert.equal(recipient.elements.songDetailTitle.textContent, "Elden");
    e.closeSongShareDialog.dispatch("click");
    assert.equal(e.songShareDialog.open, false);
    assert.equal(e.songDialog.open, true);
});

test("sharing offers manual copying when clipboard access fails", async () => {
    const response = { ok: true, json: async () => [{ id: "1", titel: "Sång", kategori: "Sång", text: "Text" }] };
    const { elements: e } = await loadPage(response, { writeText: async () => { throw new Error("blocked"); } });
    cards(e)[0].dispatch("click");
    e.shareSongBtn.dispatch("click");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(e.songShareUrl.selected, true);
    assert.match(e.songShareStatus.textContent, /kopiera manuellt/);
    e.copySongShareBtn.dispatch("click");
    await new Promise(resolve => setImmediate(resolve));
    assert.match(e.songShareStatus.textContent, /kopiera manuellt/);
});

test("a missing shared song reports an error without hiding the catalog", async () => {
    const { elements: e } = await loadPage(
        { ok: true, json: async () => [{ id: "1", titel: "Sång", kategori: "Sång", text: "Text" }] },
        { url: "https://example.test/gt/lagerbal.html?song=missing" }
    );
    assert.equal(e.songDialog.open, undefined);
    assert.equal(e.songGrid.children.length, 1);
    assert.equal(e.songStatus.hidden, false);
    assert.match(e.songStatus.textContent, /kunde inte hittas/);
});

test("empty catalog and load or format errors are reported distinctly", async () => {
    const empty = await loadPage({ ok: true, json: async () => [] });
    assert.equal(empty.elements.songStatus.textContent, "Inga sånger ännu.");
    assert.equal(empty.elements.songStatus.hidden, false);
    for (const response of [
        { ok: false, status: 404 },
        { ok: true, json: async () => [{ id: "1", titel: "Saknar text" }] },
        { ok: true, json: async () => [{ id: "1", titel: "A", kategori: "Sång", text: "A" }, { id: "1", titel: "B", kategori: "Sång", text: "B" }] },
        { ok: true, json: async () => [{ id: "custom:unique", titel: "A", kategori: "Sång", text: "A" }] },
        { ok: true, json: async () => [{ id: "1", titel: "A", kategori: "Annat", text: "A" }] },
        { ok: true, json: async () => [{ id: "1", titel: "A", text: "A" }] }
    ]) {
        const failed = await loadPage(response);
        assert.match(failed.elements.songStatus.textContent, /Kunde inte hämta sångerna/);
        assert.equal(failed.elements.songStatus.hidden, false);
        assert.equal(failed.errors.length, 1);
    }
});

test("the published song catalog can be loaded", async () => {
    const data = JSON.parse(fs.readFileSync(path.join(root, "data", "sanger.json"), "utf8"));
    const { elements, errors } = await loadPage({ ok: true, json: async () => data });
    assert.equal(errors.length, 0);
    assert.ok(cards(elements).length > 0);
    cards(elements)[0].dispatch("click");
    assert.ok(elements.songDetailLyrics.textContent.length > 0);
});

test("search and category filters use the shared initially hidden header control", () => {
    const html = fs.readFileSync(path.join(root, "lagerbal.html"), "utf8");
    assert.match(html, /id="filtersVisibilityToggle"[^>]*aria-expanded="false"[^>]*aria-controls="songFilters"/);
    assert.match(html, /id="songFilters"[^>]*class="[^"]*filters--hidden[^"]*"[^>]*data-page-filters/);
    assert.match(html, /src="js\/header-controls\.js"/);
});

test("all pages link to Lägerbål in both navigation menus", () => {
    const pages = ["index", "marken", "aktiviteter", "lagerbal", "kokbok", "planering", "arrangemang", "arshjul", "scouter", "admin", "utvecklingstrappa"];
    for (const page of pages) {
        const html = fs.readFileSync(path.join(root, `${page}.html`), "utf8");
        const links = html.match(/<a\b[^>]*data-nav-page="lagerbal"[^>]*>[^<]*<\/a>/g) || [];
        assert.equal(links.length, 2, page);
        for (const link of links) assert.match(link, />Lägerbål<\/a>$/, page);
    }
});
