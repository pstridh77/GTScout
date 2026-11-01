const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadNavPreferences(stored = null, role = "gast") {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "nav-preferences.js"), "utf8");
    const localStorage = {
        getItem: key => key === "gtscout_nav_preferences" ? stored : null,
        setItem() {},
        removeItem() {}
    };
    const context = vm.createContext({
        window: {
            GTScoutAuth: { getState: () => ({ role }) }
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
    assert.deepEqual(roundTrip(nav.getDefaultPages("gast")), ["index", "aktiviteter", "kokbok"]);
});

test("default pages for leader", () => {
    const nav = loadNavPreferences(null, "ledare");
    assert.deepEqual(roundTrip(nav.getDefaultPages("ledare")), ["index", "aktiviteter", "kokbok", "planering", "arrangemang", "arshjul", "scouter", "utvecklingstrappa"]);
});

test("default pages for admin", () => {
    const nav = loadNavPreferences(null, "admin");
    assert.deepEqual(roundTrip(nav.getDefaultPages("admin")), ["index", "aktiviteter", "kokbok", "planering", "arrangemang", "arshjul", "scouter", "admin", "utvecklingstrappa"]);
});

test("stored pages override defaults", () => {
    const nav = loadNavPreferences(JSON.stringify(["index", "planering"]), "admin");
    assert.deepEqual(roundTrip(nav.getVisiblePages("admin")), ["index", "planering"]);
});

test("invalid stored pages fall back to defaults", () => {
    const nav = loadNavPreferences(JSON.stringify(["invalid", "pages"]), "ledare");
    assert.deepEqual(roundTrip(nav.getVisiblePages("ledare")), ["index", "aktiviteter", "kokbok", "planering", "arrangemang", "arshjul", "scouter", "utvecklingstrappa"]);
});

test("corrupt stored pages fall back to defaults", () => {
    const nav = loadNavPreferences("not json", "gast");
    assert.deepEqual(roundTrip(nav.getVisiblePages("gast")), ["index", "aktiviteter", "kokbok"]);
});
