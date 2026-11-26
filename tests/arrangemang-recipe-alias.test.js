const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const readScript = name => fs.readFileSync(path.join(__dirname, "..", "js", name), "utf8");
const departments = ["Familjescouter", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover", "Ledare"];
const recipe = { id: "recipe-1", namn: "Pasta och köttfärssås" };

function loadCampfirePicker(songs = [], state = "loaded", dialogs = {}) {
    const context = vm.createContext({ window: dialogs, crypto: require("node:crypto").webcrypto });
    vm.runInContext(readScript("songs-catalog.js"), context);
    vm.runInContext(readScript("campfire-picker.js"), context);
    return context.window.GTScoutCampfirePicker.create({
        getSongs: () => songs,
        getCatalogState: () => state,
        escapeHtml: value => String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character])
    });
}

function loadArrangementNormalizer() {
    const source = readScript("arrangemang-sync.js");
    const start = source.indexOf("    function normalize(item) {");
    const end = source.indexOf("\n    function readLocal()", start);
    const context = vm.createContext({
        crypto: globalThis.crypto,
        DEPARTMENTS: departments,
        TENT_TYPES: ["3-manna", "4-manna", "Y-Tält", "Militärtält"],
        normalizeParticipantCount: () => null,
        window: { GTScoutParticipants: { normalizeOverride: () => null } }
    });
    vm.runInContext(source.slice(start, end), context);
    return context.normalize;
}

test("arrangement normalization persists only nonempty aliases for selected recipes", () => {
    const normalize = loadArrangementNormalizer();
    const item = normalize({
        id: "arrangement-1",
        title: "Läger",
        start_date: "2026-06-01",
        end_date: "2026-06-01",
        agenda: [{
            id: "meal-1",
            date: "2026-06-01",
            kind: "meal",
            title: "Middag",
            recipe_ids: [recipe.id],
            recipe_aliases: {
                [recipe.id]: " Kapten Carbonara ",
                "recipe-2": "Ej vald rätt",
                "recipe-3": "   "
            }
        }]
    });

    assert.deepEqual({ ...normalize(item).agenda[0].recipe_aliases }, { [recipe.id]: "Kapten Carbonara" });
});

test("campfire program survives normalization with ordered song IDs and fallback titles", () => {
    const normalize = loadArrangementNormalizer();
    const item = normalize({
        id: "arrangement-1", title: "Läger", start_date: "2026-06-01", end_date: "2026-06-01",
        agenda: [{
            id: "campfire-1", date: "2026-06-01", kind: "campfire", title: "Kvällsbål",
            campfire_items: [{ id: "rop", title: "" }, { id: "rop", title: " Rop " }, { id: "custom:unique", title: " Egen " }, { id: "sang", title: "Sång" }, { id: "rop", title: "Dubblett" }]
        }]
    });
    const entry = normalize(item).agenda[0];
    assert.equal(entry.kind, "campfire");
    assert.deepEqual(JSON.parse(JSON.stringify(entry.campfire_items)), [{ id: "rop", title: "Rop" }, { id: "custom:unique", title: "Egen" }, { id: "sang", title: "Sång" }]);
});

test("custom campfire titles are editable and not treated as missing, including on catalog failure", () => {
    for (const state of ["loaded", "error"]) {
        const picker = loadCampfirePicker([], state);
        const html = picker.render({ campfire_items: [{ id: "custom:unique", title: 'Egen <"sång">' }, { id: "missing", title: "Saknad" }] });
        assert.match(html, /<span>Egen &lt;&quot;sång&quot;&gt;<\/span>/);
        assert.match(html, /data-campfire-edit/);
        assert.doesNotMatch(html, /data-campfire-custom-title/);
        assert.match(html, /data-campfire-custom-new/);
        assert.doesNotMatch(html, /Egen &lt;&quot;sång&quot;&gt; \(finns inte längre i biblioteket\)/);
        if (state === "loaded") assert.match(html, /Saknad \(finns inte längre i biblioteket\)/);
        const row = { dataset: { campfireSelected: "custom:unique", campfireTitle: "Egen titel" } };
        assert.equal(picker.read({ querySelectorAll: () => [row] })[0].title, "Egen titel");
    }
});

test("editing a custom title preserves its identity and rejects empty or too long titles", () => {
    const replies = [" Ändrad titel ", null, "   ", "a".repeat(161)];
    const errors = [];
    const campfirePicker = loadCampfirePicker([], "loaded", {
        prompt: () => replies.shift(), alert: message => errors.push(message)
    });
    let items = [{ id: "custom:unique", title: "Original" }, { id: "song", title: "Sång" }];
    let focused = false;
    const selection = { set innerHTML(html) {
        items = [...html.matchAll(/data-campfire-selected="([^"]+)" data-campfire-title="([^"]*)"/g)]
            .map(match => ({ id: match[1], title: match[2] }));
    } };
    const picker = {
        querySelector: () => selection,
        querySelectorAll: selector => selector === ".agenda-campfire-target" ? [] : items.map(item => ({
            dataset: { campfireSelected: item.id, campfireTitle: item.title },
            querySelector: () => ({ focus: () => { focused = true; } })
        }))
    };
    const row = { dataset: { campfireSelected: "custom:unique" } };
    const button = {
        hasAttribute: name => name === "data-campfire-edit",
        closest: selector => selector === ".agenda-campfire-picker" ? picker : row
    };
    const event = { target: { closest: () => button } };
    campfirePicker.action(event);
    assert.deepEqual(items, [{ id: "custom:unique", title: "Ändrad titel" }, { id: "song", title: "Sång" }]);
    assert.equal(focused, true);
    campfirePicker.action(event);
    campfirePicker.action(event);
    campfirePicker.action(event);
    assert.equal(items[0].title, "Ändrad titel");
    assert.equal(errors.length, 2);
});

test("custom title input requires text and adds unique entries in order", () => {
    const campfirePicker = loadCampfirePicker();
    let items = [{ id: "song", title: "Sång" }];
    const selection = { set innerHTML(html) {
        items = [...html.matchAll(/data-campfire-selected="([^"]+)" data-campfire-title="([^"]*)"/g)]
            .map(match => ({ id: match[1], title: match[2] }));
    } };
    const addInput = { value: "   ", focus() {}, matches: selector => selector === "[data-campfire-custom-new]", closest: () => picker };
    const button = { disabled: true, hasAttribute: name => name === "data-campfire-custom-add", closest: () => picker };
    const picker = {
        querySelector: selector => selector === "[data-campfire-selection]" ? selection : selector === "[data-campfire-custom-new]" ? addInput : button,
        querySelectorAll: selector => selector === ".agenda-campfire-target" ? [] : items.map(item => ({
            dataset: { campfireSelected: item.id, campfireTitle: item.title }, querySelector: () => null
        }))
    };
    campfirePicker.input({ target: addInput });
    assert.equal(button.disabled, true);
    addInput.value = "  Egen sång  ";
    campfirePicker.input({ target: addInput });
    assert.equal(button.disabled, false);
    campfirePicker.action({ target: { closest: () => button } });
    assert.equal(items[1].title, "Egen sång");
    assert.match(items[1].id, /^custom:/);
    assert.equal(button.disabled, true);
    addInput.value = "Egen sång";
    campfirePicker.input({ target: addInput });
    campfirePicker.action({ target: { closest: () => button } });
    assert.notEqual(items[1].id, items[2].id);
    assert.deepEqual(items.map(item => item.title), ["Sång", "Egen sång", "Egen sång"]);
});

test("campfire picker starts with closed categories and a recipe-style selection summary", () => {
    const picker = loadCampfirePicker([{ id: "song", titel: "Sången", kategori: "Sång" }, { id: "game", titel: "Leken", kategori: "Lek" }]);
    const empty = picker.render({ campfire_items: [] });
    assert.match(empty, /Inga sånger valda/);
    assert.match(empty, /data-clear-campfire disabled/);
    assert.ok(empty.indexOf("Sök sång") < empty.indexOf("Inga sånger valda"));
    const selected = picker.render({ campfire_items: [{ id: "missing", title: "Saknad" }, { id: "song", title: "Sången" }] });
    assert.match(selected, /2 valda/);
    assert.match(selected, /Saknad \(finns inte längre i biblioteket\)/);
    assert.ok(selected.indexOf('data-campfire-selected="missing"') < selected.indexOf('data-campfire-selected="song"'));
    assert.equal((selected.match(/<details class="agenda-recipe-category">/g) || []).length, 2);
    assert.doesNotMatch(selected, /<details class="agenda-recipe-category" open>/);
});

test("campfire search opens matching categories and keeps selected categories open when cleared", () => {
    const campfirePicker = loadCampfirePicker();
    const song = { textContent: "Sången", hidden: false };
    const call = { textContent: "Ropet", hidden: false };
    const group = (choice, checked) => ({
        hidden: false, open: false,
        querySelectorAll: () => [choice],
        querySelector: () => checked ? {} : null
    });
    const songGroup = group(song, true);
    const callGroup = group(call, false);
    const search = { value: "rop" };
    let noResultsHidden;
    const picker = {
        querySelector: selector => selector === ".agenda-campfire-search" ? search : {
            classList: { toggle: (_name, value) => { noResultsHidden = value; } }
        },
        querySelectorAll: selector => selector === ".agenda-recipe-choice" ? [song, call] : [songGroup, callGroup]
    };
    campfirePicker.filter(picker);
    assert.equal(songGroup.hidden, true);
    assert.equal(callGroup.open, true);
    assert.equal(noResultsHidden, true);
    search.value = "";
    campfirePicker.filter(picker);
    assert.equal(songGroup.hidden, false);
    assert.equal(songGroup.open, true);
    assert.equal(callGroup.open, false);
});

test("moving a campfire item keeps focus on an available sort button", () => {
    const campfirePicker = loadCampfirePicker();
    let items = [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }];
    let focused = "";
    const selection = { set innerHTML(html) {
        items = [...html.matchAll(/data-campfire-selected="([^"]+)" data-campfire-title="([^"]+)"/g)]
            .map(match => ({ id: match[1], title: match[2] }));
    } };
    const picker = {
        querySelectorAll: selector => selector === ".agenda-campfire-target" ? [] : items.map((item, index) => ({
            dataset: { campfireSelected: item.id, campfireTitle: item.title },
            querySelector: selector => {
                const direction = selector.includes('="-1"') ? -1 : selector.includes('="1"') ? 1 : index ? -1 : 1;
                if ((direction === -1 && index === 0) || (direction === 1 && index === items.length - 1)) return null;
                return { focus: () => { focused = `${item.id}:${direction}`; } };
            }
        })),
        querySelector: selector => selector === "[data-campfire-selection]" ? selection : null
    };
    const row = { dataset: { campfireSelected: "b" } };
    const button = {
        dataset: { campfireMove: "-1" },
        hasAttribute: () => false,
        closest: selector => selector === ".agenda-campfire-picker" ? picker : row
    };
    assert.equal(campfirePicker.action({ target: { closest: () => button } }), true);
    assert.deepEqual(items.map(item => item.id), ["b", "a", "c"]);
    assert.equal(focused, "b:1");
});

test("choosing a planned campfire copies its ordered items and protects existing choices", () => {
    const source = readScript("arrangemang.js");
    const start = source.indexOf("function chooseCampfirePlan(event)");
    const end = source.indexOf("function addCampfireFields", start);
    const plan = { id: "plan", title: "Kvällsbål", items: [{ id: "rop", title: "Rop" }, { id: "custom:unique", title: "Egen" }, { id: "sang", title: "Sång" }] };
    const picker = {};
    const title = { value: "" };
    const container = { querySelector: selector => selector === ".agenda-campfire-picker" ? picker : title };
    let existing = [{ id: "old", title: "Tidigare" }];
    let confirmed = false;
    const select = {
        value: "plan",
        matches: selector => selector === "[data-campfire-plan]",
        closest: () => container
    };
    const context = vm.createContext({
        campfirePlans: [plan],
        readCampfireItems: () => existing,
        updateCampfireSelection: (_picker, items) => { existing = items.map(item => ({ ...item })); },
        confirm: () => confirmed,
        agendaEntryDialogFields: container
    });
    vm.runInContext(source.slice(start, end), context);
    assert.equal(context.chooseCampfirePlan({ target: select }), true);
    assert.deepEqual(existing, [{ id: "old", title: "Tidigare" }]);
    select.value = "plan";
    confirmed = true;
    context.chooseCampfirePlan({ target: select });
    assert.deepEqual(existing, plan.items);
    assert.equal(title.value, "Kvällsbål");
    plan.items[0].title = "Ändrat original";
    assert.equal(existing[0].title, "Rop");
});

test("meal recipe picker provides an optional alternative name for each selected recipe", () => {
    const source = readScript("arrangemang.js");
    const start = source.indexOf("function getMealRecipeIds(entry)");
    const end = source.indexOf("function updateMealRecipePicker", start);
    const context = vm.createContext({
        recipes: [recipe],
        escapeArrangementHtml: value => String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character])
    });
    vm.runInContext(source.slice(start, end), context);

    const html = context.renderMealRecipePicker({
        recipe_ids: [recipe.id],
        recipe_aliases: { [recipe.id]: "Kapten Carbonara" }
    });
    assert.match(html, /Alternativt namn för Pasta och köttfärssås/);
    assert.match(html, /data-recipe-alias="recipe-1" maxlength="160" value="Kapten Carbonara"/);
    assert.match(html, /agenda-entry-recipe-alias" title="Visas istället för receptnamnet/);
});

test("arrangement schedule print uses aliases and falls back to cookbook names", () => {
    const source = readScript("arrangemang-print.js");
    const start = source.indexOf("    function getRecipeNames(entry, recipes)");
    const end = source.indexOf("    function renderAgendaDays", start);
    const context = vm.createContext({
        escapeHtml: value => String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]),
        getTargetDepartments: () => []
    });
    vm.runInContext(source.slice(start, end), context);
    const entry = {
        kind: "meal",
        title: "Middag",
        date: "2026-06-01",
        recipe_ids: [recipe.id],
        recipe_aliases: { [recipe.id]: "Kapten Carbonara" }
    };
    const arrangement = { departments: [] };
    const aliased = context.renderAgendaEntry(entry, arrangement, [recipe]);
    assert.match(aliased, /Recept: Kapten Carbonara/);
    assert.doesNotMatch(aliased, /Recept: Pasta och köttfärssås/);
    assert.match(context.renderAgendaEntry({ ...entry, recipe_aliases: {} }, arrangement, [recipe]), /Recept: Pasta och köttfärssås/);
});

test("campfire print preserves order and uses saved titles when songs are missing", () => {
    const source = readScript("arrangemang-print.js");
    const start = source.indexOf("    function getRecipeNames(entry, recipes)");
    const end = source.indexOf("    function renderAgendaDays", start);
    const context = vm.createContext({
        escapeHtml: value => String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]),
        getTargetDepartments: () => []
    });
    vm.runInContext(source.slice(start, end), context);
    const entry = {
        kind: "campfire", title: "Lägerbål",
        campfire_items: [{ id: "a", title: "Gammalt namn" }, { id: "custom:unique", title: "Egen" }, { id: "b", title: "Saknad <sång>" }]
    };
    const html = context.renderAgendaEntry(entry, { departments: [] }, [], [{ id: "a", titel: "Nytt namn" }]);
    assert.match(html, /Sånger: Nytt namn, Egen, Saknad &lt;sång&gt;/);
    assert.match(html, /agenda-meta">Lägerbål/);
});
