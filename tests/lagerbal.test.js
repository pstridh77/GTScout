const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js", "lagerbal.js"), "utf8");
const catalogSource = fs.readFileSync(path.join(root, "js", "songs-catalog.js"), "utf8");
const plansSource = fs.readFileSync(path.join(root, "js", "campfire-plans.js"), "utf8");

function element(tagName = "") {
    return {
        tagName, children: [], listeners: {}, dataset: {}, textContent: "", value: "", hidden: false,
        classList: { classes: new Set(), toggle(name, force) { if (force) this.classes.add(name); else this.classes.delete(name); }, contains(name) { return this.classes.has(name); } },
        append(...children) { this.children.push(...children); },
        replaceChildren(...children) { this.children = children; this.textContent = children.map(child => child.textContent).join(""); },
        addEventListener(type, callback) { this.listeners[type] = callback; },
        dispatch(type, event = {}) { this.listeners[type]?.(event); },
        showModal() { this.open = true; },
        close() { this.open = false; this.dispatch("close"); },
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
        window: { location: { href: options.url || "https://example.test/gt/lagerbal.html" }, GTScoutSongPlanSelection: options.planSelection },
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

test("opening a song passes it to the campfire plan selector", async () => {
    let selected;
    const { elements: e } = await loadPage(
        { ok: true, json: async () => [{ id: "rop", titel: "Ett rop", kategori: "Rop", text: "Hej" }] },
        { planSelection: { setSong: song => { selected = song; } } }
    );
    cards(e)[0].dispatch("click");
    assert.equal(selected.id, "rop");
    assert.equal(selected.titel, "Ett rop");
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

test("the campfire planning button is in the page hero", () => {
    const html = fs.readFileSync(path.join(root, "lagerbal.html"), "utf8");
    const hero = html.match(/<section class="page-hero"[\s\S]*?<\/section>/);
    assert.ok(hero);
    assert.match(hero[0], /<button id="newCampfirePlan"[^>]*>\+Skapa Lägerbål<\/button>/);
    assert.equal((html.match(/id="newCampfirePlan"/g) || []).length, 1);
});

test("the song planning button opens a separate dialog", () => {
    const html = fs.readFileSync(path.join(root, "lagerbal.html"), "utf8");
    const songDialog = html.match(/<dialog id="songDialog"[\s\S]*?<\/dialog>/)[0];
    assert.match(songDialog, /id="openSongPlanDialog"[^>]*aria-label="Lägg till i lägerbålsplanering"[^>]*hidden/);
    assert.match(songDialog, /id="shareSongBtn"/);
    assert.doesNotMatch(songDialog, /id="songPlanSelect"/);
    assert.match(html, /<dialog id="songPlanDialog"[\s\S]*?id="songPlanSelect"[\s\S]*?<\/dialog>/);
});

test("planned campfires show a total and filter by name without hiding errors", async () => {
    const ids = ["campfirePlansList", "campfirePlansSection", "campfirePlansCount", "campfirePlansSearchToggle", "campfirePlansSearchField", "campfirePlansSearch", "campfirePlansNoResults", "campfirePlansStatus", "newCampfirePlan", "campfirePlanDialog", "campfirePlanForm", "campfirePlanTitle", "campfirePlanDescription", "campfirePlanPicker", "campfirePlanFormStatus", "saveCampfirePlan", "campfirePlanDialogTitle", "campfireLocalNotice", "closeCampfirePlan", "cancelCampfirePlan", "campfireShareDialog", "campfireShareUrl", "campfireShareStatus", "closeCampfireShareDialog", "cancelCampfireShareDialog", "copyCampfireShareBtn", "openSongPlanDialog", "songPlanDialog", "closeSongPlanDialog", "cancelSongPlanDialog", "songPlanSelect", "songPlanAdd", "songPlanStatus"];
    const e = Object.fromEntries(ids.map(id => [id, element()]));
    e.campfirePlansList.querySelectorAll = () => [];
    e.campfirePlansSearchField.hidden = true;
    e.campfirePlansSearchToggle.attributes = {};
    e.campfirePlansSearchToggle.setAttribute = (name, value) => { e.campfirePlansSearchToggle.attributes[name] = value; };
    e.campfirePlansSearch.focus = () => { e.campfirePlansSearch.focused = true; };
    e.campfirePlanTitle.focus = () => {};
    e.newCampfirePlan.focus = () => {};
    let update;
    const plans = [
        { id: "1", title: "Höstläger", description: "Vid sjön", items: [{ id: "song", title: "Gammalt namn" }, { id: "custom:unique", title: "Egen <titel>" }] },
        { id: "2", title: "Vårträff", description: "", items: [] }
    ];
    const state = { loading: false, error: false, contextVersion: 1 };
    const sync = {
        canEdit: () => true,
        init: ({ onChange }) => { update = onChange; update(plans, state); },
        save: async plan => { update([...plans, plan], state); return { localOnly: true }; }
    };
    let clipboardFails = false;
    const errors = [];
    let openedSong = null;
    const context = vm.createContext({
        document: { getElementById: id => e[id] },
        window: {
            location: { href: "https://example.test/gt/lagerbal.html", hash: "" },
            addEventListener() {},
            GTScoutCampfirePlans: sync,
            GTScoutCampfirePicker: { create: () => ({ render: () => "", read: () => [] }) },
            GTScoutSongCatalog: { load: async () => [{ id: "song", titel: "Sångens namn" }], isCustomId: id => id.startsWith("custom:") },
            GTScoutSongModal: { open: song => { openedSong = song; } }
        },
        navigator: { clipboard: { writeText: async () => { if (clipboardFails) throw new Error("blocked"); } } },
        URL, URLSearchParams, TextEncoder, TextDecoder, btoa, atob,
        crypto: { randomUUID: () => "3" },
        console: { error: (...args) => errors.push(args) }
    });
    vm.runInContext(plansSource, context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(e.campfirePlansCount.textContent, "2 st.");
    assert.equal(e.campfirePlansStatus.hidden, true);
    assert.equal(e.campfirePlansStatus.classList.contains("detail-note-warning"), true);
    assert.match(e.campfirePlansStatus.textContent, /Sparas bara i den här webbläsaren/);
    assert.equal(e.campfirePlansSearchField.hidden, true);
    assert.match(e.campfirePlansList.innerHTML, /class="arrangement-delete-icon"[^>]*data-plan-action="delete"[^>]*aria-label="Ta bort Höstläger"[^>]*><svg[\s\S]*?data-plan-action="edit"[\s\S]*?data-plan-action="copy"/);
    assert.match(e.campfirePlansList.innerHTML, /class="campfire-song-button" data-plan-song="song">Sångens namn<\/button>/);
    assert.doesNotMatch(e.campfirePlansList.innerHTML, /lagerbal\.html\?song=/);
    await e.campfirePlansList.listeners.click({ target: { closest: selector => selector === "[data-plan-song]" ? { dataset: { planSong: "song" } } : null } });
    assert.equal(openedSong?.titel, "Sångens namn");
    const oldSave = sync.save;
    let saved;
    sync.save = async plan => {
        saved = plan;
        plans[1] = plan;
        update(plans, state);
        return { localOnly: true };
    };
    context.window.GTScoutSongPlanSelection.setSong({ id: "rop", titel: "Ett rop" });
    assert.equal(e.openSongPlanDialog.hidden, false);
    assert.equal(e.songPlanDialog.open, undefined);
    e.openSongPlanDialog.dispatch("click");
    assert.equal(e.songPlanDialog.open, true);
    e.closeSongPlanDialog.dispatch("click");
    assert.equal(e.songPlanDialog.open, false);
    e.openSongPlanDialog.dispatch("click");
    e.cancelSongPlanDialog.dispatch("click");
    assert.equal(e.songPlanDialog.open, false);
    e.openSongPlanDialog.dispatch("click");
    e.songPlanDialog.dispatch("click", { target: e.songPlanDialog });
    assert.equal(e.songPlanDialog.open, false);
    e.openSongPlanDialog.dispatch("click");
    let prevented = false;
    e.songPlanDialog.dispatch("keydown", { key: "Escape", preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(e.songPlanDialog.open, false);
    e.openSongPlanDialog.dispatch("click");
    assert.match(e.songPlanSelect.innerHTML, /Vårträff/);
    assert.equal(e.songPlanAdd.disabled, true);
    e.songPlanSelect.value = "2";
    e.songPlanSelect.dispatch("change");
    assert.equal(e.songPlanAdd.disabled, false);
    await e.songPlanAdd.listeners.click();
    assert.equal(saved.id, "2");
    assert.equal(saved.items[0].id, "rop");
    assert.equal(saved.items[0].title, "Ett rop");
    assert.equal(e.songPlanDialog.open, false);
    saved = null;
    e.openSongPlanDialog.dispatch("click");
    e.songPlanSelect.value = "2";
    e.songPlanSelect.dispatch("change");
    await e.songPlanAdd.listeners.click();
    assert.equal(saved, null);
    assert.match(e.songPlanStatus.textContent, /finns redan/);
    assert.equal(e.songPlanDialog.open, true);
    context.window.GTScoutSongPlanSelection.setSong({ id: "lek", titel: "En lek" });
    e.songPlanSelect.value = "2";
    e.songPlanSelect.dispatch("change");
    sync.save = async () => ({ localOnly: true, error: new Error("offline") });
    await e.songPlanAdd.listeners.click();
    assert.match(e.songPlanStatus.textContent, /sparades lokalt men kunde inte synkas/);
    assert.equal(e.songPlanDialog.open, true);
    sync.save = async () => { throw new Error("Lagring misslyckades"); };
    await e.songPlanAdd.listeners.click();
    assert.match(e.songPlanStatus.textContent, /Lagring misslyckades/);
    assert.equal(e.songPlanDialog.open, true);
    let finishSave;
    sync.save = () => new Promise(resolve => { finishSave = resolve; });
    const pending = e.songPlanAdd.listeners.click();
    assert.equal(e.songPlanAdd.disabled, true);
    assert.equal(e.songPlanDialog.open, true);
    update(plans, { ...state, contextVersion: 2 });
    assert.equal(e.songPlanSelect.value, "");
    finishSave({ localOnly: false });
    await pending;
    assert.equal(e.songPlanDialog.open, true);
    assert.match(e.songPlanStatus.textContent, /Inloggningen har ändrats/);
    update([], state);
    assert.equal(e.songPlanSelect.disabled, true);
    assert.match(e.songPlanStatus.textContent, /Skapa ett lägerbål först/);
    update(plans, state);
    assert.equal(e.songPlanStatus.textContent, "");
    e.songPlanSelect.value = "2";
    e.songPlanSelect.dispatch("change");
    sync.save = async () => ({ localOnly: false });
    await e.songPlanAdd.listeners.click();
    assert.equal(e.songPlanDialog.open, false);
    errors.length = 0;
    sync.save = oldSave;
    plans[1] = { id: "2", title: "Vårträff", description: "", items: [] };
    sync.canEdit = () => false;
    update(plans, state);
    assert.equal(e.songPlanAdd.disabled, true);
    assert.match(e.songPlanStatus.textContent, /Endast ledare/);
    assert.match(e.campfirePlansList.innerHTML, /data-plan-action="share"[^>]*aria-label="Dela Höstläger"/);
    assert.doesNotMatch(e.campfirePlansList.innerHTML, /data-plan-action="delete"/);
    const shareButton = { dataset: { planAction: "share" }, closest: () => ({ dataset: { planId: "1" } }) };
    await e.campfirePlansList.listeners.click({ target: { closest: () => shareButton } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(e.campfireShareDialog.open, true);
    assert.match(e.campfireShareStatus.textContent, /kopierats/);
    const sharedUrl = e.campfireShareUrl.value;
    assert.match(sharedUrl, /^https:\/\/example\.test\/gt\/lagerbal\.html#campfire=/);
    const sharedLocation = new URL(sharedUrl);
    const sharedIds = ["sharedCampfireView", "sharedCampfireStatus", "sharedCampfireTitle", "sharedCampfireDescription", "sharedCampfireItems", "songDialog", "songDetailTitle", "songDetailCategory", "songDetailInfo", "songDetailLyrics"];
    const shared = Object.fromEntries(sharedIds.map(id => [id, element()]));
    const sharedContext = vm.createContext({
        document: { getElementById: id => shared[id], createElement: element, createTextNode: text => ({ textContent: text }), body: { classList: { add() {} } } },
        window: { location: sharedLocation, addEventListener() {}, GTScoutSongCatalog: { load: async () => [{ id: "song", titel: "Ändrat namn", kategori: "Sång", info: "Vid lägerelden", text: "Första\n**Refräng**" }], isCustomId: id => id.startsWith("custom:") } },
        URLSearchParams, TextDecoder, atob, console
    });
    vm.runInContext(plansSource, sharedContext);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(shared.sharedCampfireTitle.textContent, "Höstläger");
    assert.equal(shared.sharedCampfireDescription.textContent, "Vid sjön");
    assert.equal(shared.sharedCampfireItems.children[0].children[0].textContent, "Sångens namn");
    assert.equal(shared.sharedCampfireItems.children[0].children[0].tagName, "button");
    assert.equal(shared.sharedCampfireItems.children[0].children[0].className, "shared-campfire-song");
    assert.equal(shared.sharedCampfireItems.children[1].textContent, "Egen <titel>");
    assert.equal(shared.sharedCampfireStatus.textContent, "");
    shared.sharedCampfireItems.children[0].children[0].dispatch("click");
    assert.equal(shared.songDialog.open, true);
    assert.equal(shared.songDetailTitle.textContent, "Ändrat namn");
    assert.equal(shared.songDetailCategory.textContent, "Sång");
    assert.equal(shared.songDetailInfo.textContent, "Vid lägerelden");
    assert.equal(shared.songDetailLyrics.textContent, "Första\nRefräng");
    clipboardFails = true;
    await e.copyCampfireShareBtn.listeners.click();
    assert.match(e.campfireShareStatus.textContent, /kopiera manuellt/);
    update(plans, { ...state, contextVersion: 2 });
    assert.equal(e.campfireShareDialog.open, false);
    assert.equal(e.campfireShareUrl.value, "");
    const snapshotLength = length => {
        const snapshot = {
            title: plans[0].title, description: "x".repeat(length),
            items: [{ id: "song", title: "Sångens namn" }, { id: "custom:unique", title: "Egen <titel>" }]
        };
        return "https://example.test/gt/lagerbal.html#campfire=".length + Buffer.from(JSON.stringify(snapshot)).toString("base64url").length;
    };
    let low = 0;
    let high = 6001;
    while (low + 1 < high) {
        const middle = Math.floor((low + high) / 2);
        if (snapshotLength(middle) <= 8000) low = middle;
        else high = middle;
    }
    plans[0].description = "x".repeat(low);
    await e.campfirePlansList.listeners.click({ target: { closest: () => shareButton } });
    assert.equal(e.campfireShareDialog.open, true);
    assert.equal(e.campfireShareUrl.value.length, snapshotLength(low));
    assert.ok(e.campfireShareUrl.value.length <= 8000);
    e.campfireShareDialog.close();
    plans[0].description = "x".repeat(high);
    assert.ok(snapshotLength(high) > 8000);
    await e.campfirePlansList.listeners.click({ target: { closest: () => shareButton } });
    assert.equal(e.campfireShareDialog.open, false);
    assert.match(e.campfirePlansStatus.textContent, /för stort/);
    assert.equal(errors.length, 1);
    plans[0].description = "Vid sjön";
    sync.canEdit = () => true;
    update(plans, state);
    e.campfirePlansSection.open = true;
    e.campfirePlansSection.dispatch("toggle");
    assert.equal(e.campfirePlansStatus.hidden, false);
    e.campfirePlansSearchToggle.dispatch("click");
    assert.equal(e.campfirePlansSearchField.hidden, false);
    assert.equal(e.campfirePlansSearchToggle.attributes["aria-expanded"], "true");
    assert.equal(e.campfirePlansSearch.focused, true);
    e.campfirePlansSearch.value = " HÖST ";
    e.campfirePlansSearch.dispatch("input");
    assert.match(e.campfirePlansList.innerHTML, /Höstläger/);
    assert.doesNotMatch(e.campfirePlansList.innerHTML, /Vårträff/);
    assert.equal(e.campfirePlansCount.textContent, "2 st.");
    e.campfirePlansSearch.value = "saknas";
    e.campfirePlansSearch.dispatch("input");
    assert.equal(e.campfirePlansNoResults.hidden, false);
    e.campfirePlansSearchToggle.dispatch("click");
    assert.equal(e.campfirePlansSearchField.hidden, true);
    assert.equal(e.campfirePlansSearchToggle.attributes["aria-expanded"], "false");
    assert.equal(e.campfirePlansSearch.value, "");
    assert.equal(e.campfirePlansNoResults.hidden, true);
    assert.match(e.campfirePlansList.innerHTML, /Vårträff/);
    e.campfirePlansSearchToggle.dispatch("click");
    e.campfirePlansSearch.value = "Höst";
    e.campfirePlansSearch.dispatch("input");
    e.campfirePlansSection.open = false;
    e.campfirePlansSection.dispatch("toggle");
    assert.equal(e.campfirePlansSearchField.hidden, true);
    assert.equal(e.campfirePlansSearch.value, "");
    update(plans, { ...state, error: true });
    assert.equal(e.campfirePlansStatus.hidden, false);
    assert.match(e.campfirePlansStatus.textContent, /Kunde inte synka/);

    update(plans, state);
    e.newCampfirePlan.dispatch("click");
    assert.equal(e.campfireLocalNotice.classList.contains("hidden"), false);
    assert.match(e.campfireLocalNotice.textContent, /sparas bara i den här webbläsaren/);
    e.campfirePlanTitle.value = "Nytt lägerbål";
    await e.campfirePlanForm.listeners.submit({ preventDefault() {} });
    assert.equal(e.campfirePlansSection.open, true);
    assert.equal(e.campfirePlansSearch.value, "");
    assert.equal(e.campfirePlansCount.textContent, "3 st.");
    assert.match(e.campfirePlansList.innerHTML, /Nytt lägerbål/);
});

test("invalid campfire snapshot links show an error without loading local plans", () => {
    for (const hash of ["#campfire=!", "#campfire=" + Buffer.from('{"title":"Test","description":"","items":[{}]}').toString("base64url"), "#campfire=" + "a".repeat(8001)]) {
        const sharedStatus = element();
        const sharedView = element();
        const context = vm.createContext({
            document: {
                getElementById: id => ({ sharedCampfireStatus: sharedStatus, sharedCampfireView: sharedView })[id],
                body: { classList: { add() {} } }
            },
            window: {
                location: new URL(`https://example.test/lagerbal.html${hash}`),
                addEventListener() {},
                GTScoutCampfirePlans: { init() { throw new Error("Local plans must not load"); } }
            },
            URLSearchParams, TextDecoder, atob,
            console: { error() {} }
        });
        vm.runInContext(plansSource, context);
        assert.equal(sharedView.hidden, false);
        assert.match(sharedStatus.textContent, /ogiltig eller för lång/);
    }
});

test("shared campfires keep snapshot titles when the song catalog cannot load", async () => {
    const snapshot = { title: "Läger", description: "", items: [{ id: "song", title: "Sparad titel" }] };
    const url = new URL("https://example.test/lagerbal.html#campfire=" + Buffer.from(JSON.stringify(snapshot)).toString("base64url"));
    const ids = ["sharedCampfireView", "sharedCampfireStatus", "sharedCampfireTitle", "sharedCampfireDescription", "sharedCampfireItems"];
    const e = Object.fromEntries(ids.map(id => [id, element()]));
    const errors = [];
    const context = vm.createContext({
        document: { getElementById: id => e[id], createElement: element, body: { classList: { add() {} } } },
        window: { location: url, addEventListener() {}, GTScoutSongCatalog: { load: async () => { throw new Error("offline"); }, isCustomId: () => false } },
        URLSearchParams, TextDecoder, atob, console: { error: (...args) => errors.push(args) }
    });
    vm.runInContext(plansSource, context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(e.sharedCampfireItems.children[0].textContent, "Sparad titel");
    assert.match(e.sharedCampfireStatus.textContent, /Kunde inte hämta sångbiblioteket/);
    assert.equal(errors.length, 1);
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
