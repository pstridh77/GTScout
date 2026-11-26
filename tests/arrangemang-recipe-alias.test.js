const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const readScript = name => fs.readFileSync(path.join(__dirname, "..", "js", name), "utf8");
const departments = ["Familjescouter", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover", "Ledare"];
const recipe = { id: "recipe-1", namn: "Pasta och köttfärssås" };

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
            campfire_items: [{ id: "rop", title: "" }, { id: "rop", title: " Rop " }, { id: "sang", title: "Sång" }, { id: "rop", title: "Dubblett" }]
        }]
    });
    const entry = normalize(item).agenda[0];
    assert.equal(entry.kind, "campfire");
    assert.deepEqual(JSON.parse(JSON.stringify(entry.campfire_items)), [{ id: "rop", title: "Rop" }, { id: "sang", title: "Sång" }]);
});

test("campfire picker starts with closed categories and a recipe-style selection summary", () => {
    const source = readScript("arrangemang.js");
    const start = source.indexOf("function renderCampfireSelection(items)");
    const end = source.indexOf("function addCampfireFields", start);
    const context = vm.createContext({
        window: { GTScoutSongCatalog: { categories: ["Sång", "Rop", "Lek"] } },
        campfireSongs: [{ id: "song", titel: "Sången", kategori: "Sång" }, { id: "game", titel: "Leken", kategori: "Lek" }],
        campfireCatalogState: "loaded",
        escapeArrangementHtml: value => String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character])
    });
    vm.runInContext(source.slice(start, end), context);
    const empty = context.renderCampfirePicker({ campfire_items: [] });
    assert.match(empty, /Inga sånger, rop eller lekar valda/);
    assert.match(empty, /data-clear-campfire disabled/);
    assert.ok(empty.indexOf("Sök sång, rop eller lek") < empty.indexOf("Inga sånger, rop eller lekar valda"));
    const selected = context.renderCampfirePicker({ campfire_items: [{ id: "missing", title: "Saknad" }, { id: "song", title: "Sången" }] });
    assert.match(selected, /2 valda/);
    assert.match(selected, /Saknad \(finns inte längre i biblioteket\)/);
    assert.ok(selected.indexOf('data-campfire-selected="missing"') < selected.indexOf('data-campfire-selected="song"'));
    assert.equal((selected.match(/<details class="agenda-recipe-category">/g) || []).length, 2);
    assert.doesNotMatch(selected, /<details class="agenda-recipe-category" open>/);
});

test("campfire search opens matching categories and keeps selected categories open when cleared", () => {
    const source = readScript("arrangemang.js");
    const start = source.indexOf("function filterCampfirePicker(picker)");
    const end = source.indexOf("function changeCampfireSelection", start);
    const context = vm.createContext({});
    vm.runInContext(source.slice(start, end), context);
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
    context.filterCampfirePicker(picker);
    assert.equal(songGroup.hidden, true);
    assert.equal(callGroup.open, true);
    assert.equal(noResultsHidden, true);
    search.value = "";
    context.filterCampfirePicker(picker);
    assert.equal(songGroup.hidden, false);
    assert.equal(songGroup.open, true);
    assert.equal(callGroup.open, false);
});

test("moving a campfire item keeps focus on an available sort button", () => {
    const source = readScript("arrangemang.js");
    const start = source.indexOf("function handleCampfireAction(event)");
    const end = source.indexOf("function getMealRecipeIds", start);
    let items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    let focused = "";
    const picker = {
        querySelectorAll: () => items.map((item, index) => ({
            dataset: { campfireSelected: item.id },
            querySelector: selector => {
                const direction = selector.includes('="-1"') ? -1 : selector.includes('="1"') ? 1 : index ? -1 : 1;
                if ((direction === -1 && index === 0) || (direction === 1 && index === items.length - 1)) return null;
                return { focus: () => { focused = `${item.id}:${direction}`; } };
            }
        })),
        querySelector: () => null
    };
    const row = { dataset: { campfireSelected: "b" } };
    const button = {
        dataset: { campfireMove: "-1" },
        hasAttribute: () => false,
        closest: selector => selector === ".agenda-campfire-picker" ? picker : row
    };
    const context = vm.createContext({
        readCampfireItems: () => items.slice(),
        updateCampfireSelection: (_picker, next) => { items = next; }
    });
    vm.runInContext(source.slice(start, end), context);
    assert.equal(context.handleCampfireAction({ target: { closest: () => button } }), true);
    assert.deepEqual(items.map(item => item.id), ["b", "a", "c"]);
    assert.equal(focused, "b:1");
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
        campfire_items: [{ id: "a", title: "Gammalt namn" }, { id: "b", title: "Saknad <sång>" }]
    };
    const html = context.renderAgendaEntry(entry, { departments: [] }, [], [{ id: "a", titel: "Nytt namn" }]);
    assert.match(html, /Sånger, rop och lekar: Nytt namn, Saknad &lt;sång&gt;/);
    assert.match(html, /agenda-meta">Lägerbål/);
});
