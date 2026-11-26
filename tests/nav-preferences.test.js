const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadNavPreferences(stored = null, role = "gast", canReadScouts = true, migrated = true) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "nav-preferences.js"), "utf8");
    const values = {
        gtscout_nav_preferences: stored,
        gtscout_nav_lagerbal_added: migrated ? "1" : null
    };
    const localStorage = {
        getItem: key => values[key] || null,
        setItem: (key, value) => { values[key] = value; },
        removeItem: key => { delete values[key]; }
    };
    const context = vm.createContext({
        window: {
            GTScoutAuth: { getState: () => ({ role }), canReadScouts: () => canReadScouts }
        },
        document: {
            querySelectorAll: () => [],
            createElement: () => ({
                className: "", id: "", innerHTML: "",
                setAttribute() {}, addEventListener() {},
                querySelector: () => null, querySelectorAll: () => [],
                remove() {}, click() {}
            }),
            body: { append() {} },
            addEventListener() {}
        },
        localStorage,
        console
    });
    vm.runInContext(source, context);
    return context.window.GTScoutNavPreferences;
}

// Objekt från vm-kontexten har annan Object-prototyp – serialisera före deepEqual.
const roundTrip = value => JSON.parse(JSON.stringify(value));

test("default pages for guest", () => {
    const nav = loadNavPreferences(null, "gast");
    assert.deepEqual(roundTrip(nav.getDefaultPages("gast")), ["index", "marken", "aktiviteter", "lagerbal", "kokbok"]);
});

test("default pages for leader", () => {
    const nav = loadNavPreferences(null, "ledare");
    assert.deepEqual(roundTrip(nav.getDefaultPages("ledare")), ["index", "marken", "aktiviteter", "lagerbal", "kokbok", "planering", "arrangemang", "arshjul", "scouter", "utvecklingstrappa"]);
});

test("default pages for admin", () => {
    const nav = loadNavPreferences(null, "admin");
    assert.deepEqual(roundTrip(nav.getDefaultPages("admin")), ["index", "marken", "aktiviteter", "lagerbal", "kokbok", "planering", "arrangemang", "arshjul", "scouter", "admin", "utvecklingstrappa"]);
});

test("stored pages override defaults", () => {
    const nav = loadNavPreferences(JSON.stringify(["index", "planering"]), "admin");
    assert.deepEqual(roundTrip(nav.getVisiblePages("admin")), ["index", "marken", "planering"]);
});

test("invalid stored pages fall back to defaults", () => {
    const nav = loadNavPreferences(JSON.stringify(["invalid", "pages"]), "ledare");
    assert.deepEqual(roundTrip(nav.getVisiblePages("ledare")), ["index", "marken", "aktiviteter", "lagerbal", "kokbok", "planering", "arrangemang", "arshjul", "scouter", "utvecklingstrappa"]);
});

test("corrupt stored pages fall back to defaults", () => {
    const nav = loadNavPreferences("not json", "gast");
    assert.deepEqual(roundTrip(nav.getVisiblePages("gast")), ["index", "marken", "aktiviteter", "lagerbal", "kokbok"]);
});

test("stored pages are limited to what the role may see", () => {
    const allPages = ["index", "marken", "aktiviteter", "lagerbal", "kokbok", "planering", "arrangemang", "arshjul", "scouter", "admin", "utvecklingstrappa"];
    const nav = loadNavPreferences(JSON.stringify(allPages), "gast");
    assert.deepEqual(roundTrip(nav.getVisiblePages("gast")), ["index", "marken", "aktiviteter", "lagerbal", "kokbok"]);
});

test("leader without scout access does not get scouter", () => {
    const nav = loadNavPreferences(null, "ledare", false);
    assert.deepEqual(roundTrip(nav.getVisiblePages("ledare")), ["index", "marken", "aktiviteter", "lagerbal", "kokbok", "planering", "arrangemang", "arshjul", "utvecklingstrappa"]);
});

test("stored scouter is hidden for leader without scout access", () => {
    const nav = loadNavPreferences(JSON.stringify(["marken", "scouter"]), "ledare", false);
    assert.deepEqual(roundTrip(nav.getVisiblePages("ledare")), ["marken"]);
});

test("empty selection after role filter falls back to defaults", () => {
    const nav = loadNavPreferences(JSON.stringify(["planering"]), "gast");
    assert.deepEqual(roundTrip(nav.getVisiblePages("gast")), ["index", "marken", "aktiviteter", "lagerbal", "kokbok"]);
});

test("old stored index is migrated to both hem and marken", () => {
    const nav = loadNavPreferences(JSON.stringify(["index", "aktiviteter"]), "gast");
    assert.deepEqual(roundTrip(nav.getVisiblePages("gast")), ["index", "marken", "aktiviteter"]);
});

test("legacy preferences gain Lägerbål once without changing other choices", () => {
    const nav = loadNavPreferences(JSON.stringify(["marken", "planering"]), "ledare", true, false);
    assert.deepEqual(roundTrip(nav.getVisiblePages("ledare")), ["marken", "lagerbal", "planering"]);
    assert.deepEqual(roundTrip(nav.getVisiblePages("gast")), ["marken", "lagerbal"]);
});

test("users can hide Lägerbål after migration", () => {
    const nav = loadNavPreferences(JSON.stringify(["marken", "planering"]), "ledare");
    assert.deepEqual(roundTrip(nav.getVisiblePages("ledare")), ["marken", "planering"]);
});
