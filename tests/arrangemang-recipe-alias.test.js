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
