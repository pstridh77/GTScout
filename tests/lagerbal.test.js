const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js", "lagerbal.js"), "utf8");

function element() {
    return {
        children: [], listeners: {}, textContent: "", value: "", hidden: false,
        append(...children) { this.children.push(...children); },
        replaceChildren(...children) { this.children = children; },
        addEventListener(type, callback) { this.listeners[type] = callback; },
        dispatch(type, event = {}) { this.listeners[type]?.(event); },
        showModal() { this.open = true; },
        close() { this.open = false; }
    };
}

async function loadPage(response) {
    const ids = ["songGrid", "songSearch", "songStatus", "songDialog", "songDetailTitle", "songDetailAuthor", "songDetailLyrics", "closeSongDialog"];
    const elements = Object.fromEntries(ids.map(id => [id, element()]));
    const errors = [];
    vm.runInNewContext(source, {
        document: { getElementById: id => elements[id], createElement: element },
        fetch: async () => response,
        console: { error: (...args) => errors.push(args) }
    });
    await new Promise(resolve => setImmediate(resolve));
    return { elements, errors };
}

test("songs are sorted, searchable by text, and open safely with their line breaks", async () => {
    const data = [
        { id: "2", titel: "Öppet", text: "Första\nAndra <versen>", upphovsperson: "En vän" },
        { id: "1", titel: "Alfabetet", text: "Annan sång" }
    ];
    const { elements: e } = await loadPage({ ok: true, json: async () => data });
    assert.deepEqual(e.songGrid.children.map(card => card.children[0].textContent), ["Alfabetet", "Öppet"]);
    assert.equal(e.songStatus.hidden, true);
    e.songSearch.value = "ANDRA <VERSEN>";
    e.songSearch.dispatch("input");
    assert.equal(e.songGrid.children.length, 1);
    e.songGrid.children[0].dispatch("click");
    assert.equal(e.songDialog.open, true);
    assert.equal(e.songDetailTitle.textContent, "Öppet");
    assert.equal(e.songDetailAuthor.textContent, "En vän");
    assert.equal(e.songDetailLyrics.textContent, "Första\nAndra <versen>");
    e.closeSongDialog.dispatch("click");
    assert.equal(e.songDialog.open, false);
    e.songGrid.children[0].dispatch("click");
    let prevented = false;
    e.songDialog.dispatch("keydown", { key: "Escape", preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(e.songDialog.open, false);
    e.songSearch.value = "saknas";
    e.songSearch.dispatch("input");
    assert.equal(e.songStatus.textContent, "Inga sånger matchar sökningen.");
    assert.equal(e.songStatus.hidden, false);
    e.songSearch.value = "";
    e.songSearch.dispatch("input");
    assert.equal(e.songStatus.hidden, true);
});

test("empty catalog and load or format errors are reported distinctly", async () => {
    const empty = await loadPage({ ok: true, json: async () => [] });
    assert.equal(empty.elements.songStatus.textContent, "Inga sånger ännu.");
    assert.equal(empty.elements.songStatus.hidden, false);
    for (const response of [
        { ok: false, status: 404 },
        { ok: true, json: async () => [{ id: "1", titel: "Saknar text" }] },
        { ok: true, json: async () => [{ id: "1", titel: "A", text: "A" }, { id: "1", titel: "B", text: "B" }] }
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
    assert.ok(elements.songGrid.children.length > 0);
    elements.songGrid.children[0].dispatch("click");
    assert.ok(elements.songDetailLyrics.textContent.length > 0);
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
