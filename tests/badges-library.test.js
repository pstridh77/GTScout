const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");

function loadFunctions(context, start, end) {
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), context);
}

test("badge menu keeps the development ladder and target group view without the old option", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "marken.html"), "utf8");
    assert.doesNotMatch(html, /standardPlanningBadgesBtn|Standardplaneringens märken/);
    assert.match(html, /href="utvecklingstrappa.html"/);
    assert.match(html, /id="targetGroupViewBtn"/);
});

for (const failure of [null, "http", "network"]) {
    test(`badge loading is independent of planning templates (${failure || "success"})`, async () => {
        const requests = [];
        const errors = [];
        const rendered = [];
        const details = { innerHTML: "" };
        const badges = [{ id: "catalogue-badge" }];
        const customBadges = [{ id: "custom-badge" }];
        const context = vm.createContext({
            fetch: async url => {
                requests.push(url);
                assert.equal(url, "data/marken.json");
                if (failure === "network") throw new Error("Offline");
                return { ok: failure !== "http", json: async () => badges };
            },
            window: {
                GTScoutBadges: {
                    ensureLoaded: async () => {},
                    getAllBadges: () => customBadges
                }
            },
            document: { getElementById: () => details },
            console: { error: (...args) => errors.push(args) },
            sharedBadgeIdFromUrl: null,
            baseMarken: [],
            allMarken: [],
            allAktiviteter: [],
            loadCustomActivities: () => [],
            renderMarken: items => rendered.push(items),
            openSharedBadgeFromUrl() {}
        });
        loadFunctions(context, "async function loadMarken(", "function openSharedBadgeFromUrl(");
        await context.loadMarken();
        assert.deepEqual(requests, ["data/marken.json"]);
        if (failure) {
            assert.equal(rendered.length, 0);
            assert.equal(errors.length, 1);
            assert.match(details.innerHTML, /Märkeskatalogen kunde inte laddas/);
            assert.doesNotMatch(details.innerHTML, /standardplanering/);
        } else {
            assert.deepEqual(Array.from(rendered[0]), [...badges, ...customBadges]);
            assert.equal(errors.length, 0);
        }
    });
}

test("an old saved standard-planning preference does not hide badges or lock target group view", () => {
    const stored = new Map([["gtscout_show_standard_planning_badges", "true"]]);
    const attributes = {};
    const handlers = {};
    const button = {
        disabled: false,
        setAttribute: (name, value) => { attributes[name] = value; },
        querySelector: () => ({}),
        addEventListener: (name, handler) => { handlers[name] = handler; }
    };
    const badges = [
        { id: "catalogue-badge", namn: "Fire", kategori: "Nature", malgrupp: ["Spårare"], program: ["A"] },
        { id: "custom-badge", namn: "Camp", kategori: "Nature", malgrupp: ["Rover"], program: ["B"], typ: "Custom" }
    ];
    const filters = { search: "", category: "Alla", targetGroup: ["Alla"], type: "Alla", program: "Alla" };
    const context = vm.createContext({
        document: { getElementById: () => button },
        localStorage: {
            getItem: key => stored.get(key) ?? null,
            setItem: (key, value) => stored.set(key, value)
        },
        SHOW_MISSING_BADGES_STORAGE_KEY: "gtscout_show_missing_badges",
        EXPANDED_BADGES_STORAGE_KEY: "gtscout_expanded_badges",
        expandedBadgeStacks: new Set(),
        allMarken: badges,
        filters,
        getTargetGroups: badge => badge.malgrupp,
        renderMarken() {}
    });
    loadFunctions(context, "function getStoredBoolean(", "const siteMenuBtn");
    loadFunctions(context, "const targetGroupViewBtn", "let baseMarken");
    loadFunctions(context, "function getFilteredMarken(", "function renderMarken(");
    const filteredIds = () => Array.from(context.getFilteredMarken(), badge => badge.id);
    assert.deepEqual(filteredIds(), ["catalogue-badge", "custom-badge"]);
    assert.equal(attributes["aria-pressed"], "false");
    handlers.click();
    assert.equal(attributes["aria-pressed"], "true");
    assert.equal(stored.get("gtscout_show_missing_badges"), "true");
    assert.equal(stored.get("gtscout_expanded_badges"), "false");
    assert.equal(button.disabled, false);
    assert.deepEqual(filteredIds(), ["catalogue-badge", "custom-badge"]);
    handlers.click();
    assert.equal(attributes["aria-pressed"], "false");
    filters.search = "camp";
    assert.deepEqual(filteredIds(), ["custom-badge"]);
    filters.search = "";
    filters.type = "Custom";
    assert.deepEqual(filteredIds(), ["custom-badge"]);
    filters.type = "Alla";
    filters.targetGroup = ["Spårare"];
    assert.deepEqual(filteredIds(), ["catalogue-badge"]);
    filters.program = "B";
    assert.deepEqual(filteredIds(), []);
    filters.targetGroup = ["Alla"];
    filters.category = "Other";
    assert.deepEqual(filteredIds(), []);
});
