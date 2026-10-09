const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const leaderSession = { user: { id: "leader-1", email: "leader@example.test" } };
const leaderProfile = { role: "ledare", kar_id: "kar-1", scout_read: true, scout_write: true };

for (const signedIn of [false, true]) {
    test(`arrangements preserve the Ledare department ${signedIn ? "in database writes" : "locally"}`, async () => {
        const backend = createBackend(signedIn ? leaderSession : null);
        const page = createPage(backend);
        await page.auth.init();
        await page.runTimers();
        page.load("arrangemang-sync.js");
        const sync = page.window.GTScoutArrangements;
        const result = await sync.save({
            id: "leader-kickoff",
            title: "Kickoff",
            start_date: "2026-10-09",
            departments: ["Ledare"],
            agenda: [
                { id: "kickoff", date: "2026-10-09", title: "Kickoff", shared: false, departments: ["Ledare"] },
                { id: "excluded", date: "2026-10-09", title: "Scoutprogram", shared: true, excluded_departments: ["Ledare"] }
            ]
        });
        assert.equal(result.localOnly, !signedIn);
        const stored = JSON.parse(page.storage.get("gtscout_arrangemang"))[0];
        assert.deepEqual(stored.departments, ["Ledare"]);
        assert.deepEqual(stored.agenda[0].departments, ["Ledare"]);
        assert.deepEqual(stored.agenda[1].excluded_departments, ["Ledare"]);
        if (signedIn) {
            const write = backend.requests.find(request => request.table === "arrangemang" && request.operation === "upsert");
            assert.equal(write.rows.data.departments[0], "Ledare");
            assert.equal(write.rows.data.agenda[0].departments[0], "Ledare");
        }
        const reopened = createPage(createBackend(null), page.storage);
        reopened.load("arrangemang-sync.js");
        reopened.window.GTScoutArrangements.init({ onChange() {} });
        assert.equal(reopened.window.GTScoutArrangements.getAll()[0].departments[0], "Ledare");
        assert.equal(reopened.window.GTScoutArrangements.getAll()[0].agenda[0].departments[0], "Ledare");
    });
}

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

for (const signedIn of [false, true]) {
    test(`arrangement participant counts survive ${signedIn ? "database writes" : "local storage"} and reload`, async () => {
        const backend = createBackend(signedIn ? leaderSession : null);
        const page = createPage(backend);
        await page.auth.init();
        await page.runTimers();
        page.load("arrangemang-sync.js");
        await page.window.GTScoutArrangements.save({
            id: "participants-test", title: "Participants", start_date: "2026-10-09",
            departments: ["Spårare", "Ledare"],
            participants: { departments: {
                "Spårare": { scouts: 18, leaders: 0, parents: 5 },
                "Ledare": { scouts: 99, leaders: 6, parents: 99 },
                "Rover": { scouts: 10, leaders: 1 }
            }, officials: 2 }
        });
        const expected = { departments: { "Spårare": { scouts: 18, leaders: 0, parents: 5 }, "Ledare": { scouts: null, leaders: 6, parents: null } }, officials: 2 };
        assert.deepEqual(JSON.parse(page.storage.get("gtscout_arrangemang"))[0].participants, expected);
        if (signedIn) {
            const write = backend.requests.find(request => request.table === "arrangemang" && request.operation === "upsert");
            assert.deepEqual(JSON.parse(JSON.stringify(write.rows.data.participants)), expected);
        }
        const reopened = createPage(createBackend(null), page.storage);
        reopened.load("arrangemang-sync.js");
        reopened.window.GTScoutArrangements.init({ onChange() {} });
        const first = reopened.window.GTScoutArrangements.getAll()[0];
        assert.deepEqual(JSON.parse(JSON.stringify(first.participants)), expected);
        first.participants.departments["Spårare"].scouts = 100;
        assert.equal(reopened.window.GTScoutArrangements.getAll()[0].participants.departments["Spårare"].scouts, 18);
    });
}

test("arrangement participant totals include officials as leaders and only selected departments", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "arrangemang.js"), "utf8");
    const start = source.indexOf("function getParticipantTotals(");
    const end = source.indexOf("function renderParticipantTable(", start);
    const context = vm.createContext({});
    vm.runInContext(source.slice(start, end), context);
    const participants = { departments: {
        "Spårare": { scouts: 18, leaders: 4 },
        "Upptäckare": { scouts: 12, leaders: 3 },
        "Ledare": { scouts: 99, leaders: 6 },
        "Rover": { scouts: 10, leaders: 1 }
    }, officials: 2 };
    const selected = ["Spårare", "Upptäckare", "Ledare"];
    assert.deepEqual(JSON.parse(JSON.stringify(context.getParticipantTotals(selected, participants))),
        { scouts: 30, leaders: 15, parents: 0, total: 45, complete: true, hasCounts: true });
    assert.equal(context.getParticipantSummary(selected, participants), "45 deltagare · 30 scouter · 15 ledare");
    assert.equal(context.getParticipantSummary(selected, participants, true), "45 deltagare");
    assert.equal(context.getParticipantSummary(["Ledare"], participants), "8 deltagare · 0 scouter · 8 ledare");
    participants.departments["Spårare"].scouts = null;
    assert.equal(context.getParticipantSummary(selected, participants), "27 deltagare · 12 scouter · 15 ledare · Preliminärt");
    assert.equal(context.getParticipantSummary(selected, participants, true), "27 deltagare · Preliminärt");
    assert.equal(context.getParticipantSummary(selected, undefined), "Antal ej angivet");
    assert.equal(context.getParticipantSummary(selected, undefined, true), "Antal ej angivet");
    assert.equal(context.getParticipantSummary(["Ledare"], { departments: { "Ledare": { leaders: 0 } }, officials: 0 }),
        "0 deltagare · 0 scouter · 0 ledare");
    participants.departments["Spårare"].scouts = 18;
    participants.departments["Spårare"].parents = 5;
    assert.equal(context.getParticipantSummary(selected, participants), "50 deltagare · 30 scouter · 15 ledare · 5 föräldrar");
    assert.equal(context.getParticipantSummary(selected, participants, true), "50 deltagare");
    participants.departments["Spårare"].parents = null;
    assert.equal(context.getParticipantSummary(selected, participants), "45 deltagare · 30 scouter · 15 ledare · Preliminärt");
});

test("arrangement participant section hides unknown counts only in read mode", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "arrangemang.js"), "utf8");
    const start = source.indexOf("function getParticipantTotals(");
    const end = source.indexOf("function closeMealRecipeDialog(", start);
    const context = vm.createContext({ escapeArrangementHtml: value => String(value ?? "") });
    vm.runInContext(source.slice(start, end), context);
    const item = { id: "participants-test", title: "Test", departments: ["Spårare"] };
    assert.equal(context.renderArrangementParticipants(item, false), "");
    assert.match(context.renderArrangementParticipants(item, true), /data-edit-participants/);
    item.participants = { departments: { "Spårare": { scouts: null, leaders: null } }, officials: null };
    assert.equal(context.renderArrangementParticipants(item, false), "");
    assert.match(context.renderArrangementParticipants(item, true), /data-edit-participants/);
    item.participants.departments["Spårare"].scouts = 0;
    assert.match(context.renderArrangementParticipants(item, false), /arrangement-participants-overview/);
    item.participants.departments["Spårare"].scouts = null;
    item.participants.officials = 2;
    assert.match(context.renderArrangementParticipants(item, false), /arrangement-participants-overview/);
    item.participants.officials = null;
    item.participants.departments["Spårare"].parents = 3;
    assert.match(context.renderArrangementParticipants(item, false), /3 föräldrar/);
    assert.match(context.renderParticipantTable(item.departments, item.participants, true), /aria-label="Föräldrar, Spårare"/);
});

test("arrangement overview hides unknown participant totals when locked", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "arrangemang.js"), "utf8");
    const helpers = source.slice(source.indexOf("function getParticipantTotals("), source.indexOf("function renderParticipantTable("));
    const start = source.indexOf("        const participantTags =");
    const end = source.indexOf("        const participantsHtml =", start);
    let editable = false;
    const item = { departments: ["Spårare"] };
    const context = vm.createContext({
        item, departments: ["Spårare"], escapeArrangementHtml: value => String(value ?? ""),
        isArrangementDetailEditable: () => editable, renderArrangementSchedule: () => ""
    });
    vm.runInContext(helpers, context);
    const render = () => vm.runInContext(`{${source.slice(start, end)} participantSummary;}`, context);
    assert.equal(render(), "");
    editable = true;
    assert.match(render(), /Antal ej angivet/);
    editable = false;
    item.participants = { departments: { "Spårare": { scouts: 0, leaders: 0, parents: 0 } }, officials: 0 };
    assert.match(render(), />0 deltagare</);
    item.participants.departments["Spårare"].scouts = 18;
    assert.match(render(), />18 deltagare</);
    assert.doesNotMatch(render(), /scouter|ledare|föräldrar|ej angivet/);
});

test("arrangement meals link each recipe to the combined participant count", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "arrangemang.js"), "utf8");
    const totals = source.slice(source.indexOf("function getParticipantTotals("), source.indexOf("function getParticipantSummary("));
    const render = source.slice(source.indexOf("function getArrangementRecipeUrl("), source.indexOf("function renderScheduleEntry("));
    const context = vm.createContext({
        URLSearchParams, recipes: [{ id: "soup&bread", namn: "Soup" }, { id: "bread", namn: "Bread" }],
        collapsedArrangementMeals: new Set(), getMealRecipeIds: entry => entry.recipe_ids || [],
        formatArrangementDate: date => date, escapeArrangementHtml: value => String(value ?? "")
    });
    vm.runInContext(totals + render, context);
    const item = { id: "meal-test", departments: ["Spårare", "Ledare"], participants: { departments: {
        "Spårare": { scouts: 41, leaders: 4, parents: 10 }, "Ledare": { leaders: 4 }
    }, officials: 2 }, agenda: [{ id: "meal", kind: "meal", date: "2026-10-09", meal_type: "Lunch", recipe_ids: ["soup&bread", "bread"] }] };
    const url = new URL(context.getArrangementRecipeUrl(item, "soup&bread"), "https://example.test/");
    assert.equal(url.searchParams.get("recipe"), "soup&bread");
    assert.equal(url.searchParams.get("servings"), "61");
    const html = context.renderArrangementMealSummary(item);
    assert.doesNotMatch(html, /target="_blank"/);
    assert.match(html, /recipe=soup%26bread&servings=61/);
    assert.match(html, /recipe=bread&servings=61/);
    assert.match(context.renderArrangementMealSummary(item, true), /data-edit-agenda="meal"/);
    item.participants = undefined;
    assert.equal(new URL(context.getArrangementRecipeUrl(item, "bread"), "https://example.test/").searchParams.has("servings"), false);
    item.agenda[0].recipe_ids = [];
    assert.doesNotMatch(context.renderArrangementMealSummary(item), /<a /);
});

test("recipe links initialize valid serving counts for only the requested recipe", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "kokbok.js"), "utf8");
    const setup = source.slice(source.indexOf("const recipeUrlParams ="), source.indexOf("const RECIPE_MEAL_TYPES ="));
    const target = source.slice(source.indexOf("function getRecipeTargetServings("), source.indexOf("function openSharedRecipeFromUrl("));
    for (const [search, expected] of [
        ["?recipe=soup&servings=61", 61], ["?recipe=soup&servings=2", 2],
        ["?recipe=soup", 4], ["?recipe=soup&servings=0", 4],
        ["?recipe=soup&servings=-2", 4], ["?recipe=soup&servings=1.5", 4],
        ["?recipe=soup&servings=invalid", 4], ["?servings=61", 4]
    ]) {
        const context = vm.createContext({ window: { location: { search } }, URLSearchParams });
        vm.runInContext(setup + target, context);
        assert.equal(context.getRecipeTargetServings({ id: "soup", portioner: 4 }), expected);
        assert.equal(context.getRecipeTargetServings({ id: "other", portioner: 10 }), 10);
        vm.runInContext("recipeServingSelections.set('soup', 12)", context);
        assert.equal(context.getRecipeTargetServings({ id: "soup", portioner: 4 }), 12);
    }
});

test("embedded recipe view shows only the selected recipe and forwards Escape", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "kokbok.js"), "utf8");
    const setup = source.slice(source.indexOf("const recipeUrlParams ="), source.indexOf("const RECIPE_MEAL_TYPES ="));
    const filter = source.slice(source.indexOf("function visibleRecipes("), source.indexOf("function parseAmount("));
    let keydown;
    let bodyClass;
    let message;
    const context = vm.createContext({
        URLSearchParams, window: { location: { search: "?recipe=soup&servings=61&embedded=1" }, parent: { postMessage: value => { message = value; } } },
        document: { body: { classList: { add: value => { bodyClass = value; } } }, addEventListener: (event, callback) => { keydown = callback; } },
        recipes: [{ id: "soup", namn: "Soup", kategori: "Lunch", ingredienser: [] }, { id: "bread", namn: "Bread", kategori: "Lunch", ingredienser: [] }],
        recipeSearch: { value: "" }, recipeCategoryFilter: { value: "Alla" }, recipeDifficultyFilter: { value: "Alla" },
        getRecipeMealType: recipe => recipe.kategori
    });
    vm.runInContext(setup + filter, context);
    assert.equal(bodyClass, "recipe-embedded-view");
    assert.equal(context.visibleRecipes().length, 1);
    assert.equal(context.visibleRecipes()[0].id, "soup");
    keydown({ key: "Enter" });
    assert.equal(message, undefined);
    keydown({ key: "Escape" });
    assert.equal(message.type, "gtscout-close-recipe");
});

test("recipe ingredients scale to arrangement counts including groups smaller than four", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "kokbok.js"), "utf8");
    const start = source.indexOf("function parseAmount(");
    const end = source.indexOf("function renderIngredientEditor(", start);
    const context = vm.createContext({ RECIPE_SCALE_OPTIONS: [4, 10, 25, 50, 100] });
    vm.runInContext(source.slice(start, end), context);
    const ingredient = { mangder: { "4": "400 g", "10": "1000 g", "25": "2500 g", "50": "5000 g", "100": "10000 g" } };
    assert.equal(context.scaleIngredientAmount(ingredient, {}, 61), "6,1 kg");
    assert.equal(context.scaleIngredientAmount(ingredient, {}, 2), "200 g");
    assert.equal(context.scaleIngredientAmount({ mangder: { "4": "1 st", "10": "10 st" } }, {}, 2), "0,5 st");
});

test("empty arrangement schedules hide only in read mode and retain every agenda kind", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "arrangemang.js"), "utf8");
    const start = source.indexOf("function renderArrangementSchedule(item)");
    const end = source.indexOf("function renderArrangementMealSummary(", start);
    let editable = false;
    const context = vm.createContext({
        departments: ["Spårare"],
        isArrangementDetailEditable: () => editable,
        arrangementScheduleOverview: new Set(["schedule-test"]),
        arrangementDayExpansion: new Map(),
        arrangementSchemaExpansion: new Set(),
        arrangementDates: () => [],
        renderArrangementScheduleOverview: () => "<p>Agenda</p>",
        escapeArrangementHtml: value => String(value ?? "")
    });
    vm.runInContext(source.slice(start, end), context);
    const item = { id: "schedule-test", departments: ["Spårare"], agenda: [] };
    assert.equal(context.renderArrangementSchedule(item), "");
    editable = true;
    assert.match(context.renderArrangementSchedule(item), /class="arrangement-schedule"/);
    editable = false;
    for (const kind of ["program", "activity", "meal"]) {
        item.agenda = [{ kind, title: "Test", date: "2026-10-09" }];
        assert.match(context.renderArrangementSchedule(item), /class="arrangement-schedule"/);
        assert.match(context.renderArrangementSchedule(item), /1 programpunkt/);
    }
});

test("arrangement participant normalization keeps unknown counts distinct from zero", async () => {
    const page = createPage(createBackend(null));
    page.load("arrangemang-sync.js");
    const sync = page.window.GTScoutArrangements;
    await sync.save({ id: "legacy-participants", title: "Legacy", start_date: "2026-10-09", departments: ["Spårare"] });
    assert.equal(sync.getAll()[0].participants.departments["Spårare"].scouts, null);
    assert.equal(sync.getAll()[0].participants.departments["Spårare"].parents, 0);
    assert.equal(sync.getAll()[0].participants.officials, null);
    await sync.save({ id: "legacy-participants", title: "Legacy", start_date: "2026-10-09", departments: ["Spårare"],
        participants: { departments: { "Spårare": { scouts: -1, leaders: 1.5, parents: -2 } }, officials: "" } });
    assert.equal(sync.getAll()[0].participants.departments["Spårare"].scouts, null);
    assert.equal(sync.getAll()[0].participants.departments["Spårare"].leaders, null);
    assert.equal(sync.getAll()[0].participants.departments["Spårare"].parents, null);
    await sync.save({ id: "legacy-participants", title: "Legacy", start_date: "2026-10-09", departments: ["Spårare"],
        participants: { departments: { "Spårare": { scouts: "0", leaders: "3", parents: "0" } }, officials: 0 } });
    assert.equal(sync.getAll()[0].participants.departments["Spårare"].scouts, 0);
    assert.equal(sync.getAll()[0].participants.departments["Spårare"].leaders, 3);
    assert.equal(sync.getAll()[0].participants.departments["Spårare"].parents, 0);
    assert.equal(sync.getAll()[0].participants.officials, 0);
});

function createBackend(session = leaderSession, profile = leaderProfile) {
    return { session, profile, callbacks: [], locked: false, requests: [], pending: null };
}

test("local activities remain editable through the shared save API", async () => {
    const original = { id: "egen-local-test", namn: "Original", material: [], kar_id: null };
    const page = createPage(createBackend(null), new Map([["gtscout_custom_activities", JSON.stringify([original])]]));
    page.load("activities-sync.js");
    const sync = page.window.GTScoutActivities;
    sync.init({ onChange() {} });
    assert.equal(sync.canEditActivity(sync.getAllActivities()[0]), true);
    await sync.saveActivity({ ...original, namn: "Updated" });
    assert.equal(sync.getAllActivities()[0].namn, "Updated");
    assert.equal(sync.getAllActivities()[0].kar_id, null);
});

test("leaders cannot edit or delete activities from another kar", async () => {
    const backend = createBackend();
    const page = createPage(backend);
    await page.auth.init();
    await page.runTimers();
    backend.pending = { table: "aktiviteter", promise: Promise.resolve({ data: [{ id: "foreign", namn: "Foreign", kar_id: "kar-2", material: [] }] }) };
    page.load("activities-sync.js");
    const sync = page.window.GTScoutActivities;
    await sync.reload();
    assert.equal(sync.canEditActivity(sync.getAllActivities()[0]), false);
    assert.equal(sync.canDeleteActivity(sync.getAllActivities()[0]), false);
    await assert.rejects(sync.saveActivity({ id: "foreign", namn: "Changed" }), /behörighet/);
    await assert.rejects(sync.deleteActivity("foreign"));
    assert.equal(backend.requests.some(request => request.operation === "upsert" || request.operation === "delete"), false);
});

for (const [role, activityKarId, editable, deletable] of [
    ["gast", "kar-1", false, false],
    ["ledare", "kar-1", true, false],
    ["admin", "kar-1", true, true],
    ["admin", "kar-2", false, false]
]) {
    test(`activity permissions for ${role} and ${activityKarId}`, async () => {
        const backend = createBackend(leaderSession, { ...leaderProfile, role });
        const page = createPage(backend);
        await page.auth.init();
        await page.runTimers();
        const activity = { id: "database-activity", namn: "Original", kar_id: activityKarId, material: [] };
        backend.pending = { table: "aktiviteter", promise: Promise.resolve({ data: [activity] }) };
        page.load("activities-sync.js");
        const sync = page.window.GTScoutActivities;
        await sync.reload();
        assert.equal(sync.canEditActivity(sync.getAllActivities()[0]), editable);
        assert.equal(sync.canDeleteActivity(sync.getAllActivities()[0]), deletable);
        if (editable) {
            await sync.saveActivity({ ...activity, namn: "Updated" });
            const write = backend.requests.find(request => request.table === "aktiviteter" && request.operation === "upsert");
            assert.equal(write.rows.kar_id, "kar-1");
        } else {
            await assert.rejects(sync.saveActivity({ ...activity, namn: "Updated" }));
        }
        if (deletable) {
            await sync.deleteActivity(activity.id);
            const deletion = backend.requests.find(request => request.table === "aktiviteter" && request.operation === "delete");
            assert.equal(deletion.kar_id, "kar-1");
        } else {
            await assert.rejects(sync.deleteActivity(activity.id));
        }
    });
}

test("activity sync reports a failed fetch while preserving its local fallback", async () => {
    const backend = createBackend();
    const cached = { id: "cached-activity", namn: "Cached activity", kar_id: "kar-1", material: [] };
    const page = createPage(backend, new Map([["gtscout_custom_activities", JSON.stringify([cached])]]));
    await page.auth.init();
    await page.runTimers();
    backend.pending = { table: "aktiviteter", promise: Promise.resolve({ error: { message: "Simulated fetch failure" } }) };
    page.load("activities-sync.js");
    let lastState;
    page.window.GTScoutActivities.init({ onChange(state) { lastState = state; } });
    await page.window.GTScoutActivities.ensureLoaded();
    assert.equal(lastState.loaded, true);
    assert.equal(lastState.error, true);
    assert.equal(lastState.activities[0].namn, "Cached activity");
});

for (const fails of [false, true]) {
    test(`recipe sync reports loading and ${fails ? "a fetch error with local fallback" : "the fetched recipe count"}`, async () => {
        const backend = createBackend();
        const cached = { id: "cached-recipe", namn: "Cached recipe", ingredienser: [], portioner: 4 };
        const page = createPage(backend, new Map([["gtscout_kokbok_recept", JSON.stringify([cached])]]));
        await page.auth.init();
        await page.runTimers();
        const response = deferred();
        backend.pending = { table: "kokbok_recept", ...response };
        page.load("kokbok-sync.js");
        const cookbook = page.window.GTScoutCookbook;
        const states = [];
        cookbook.init({ onChange(recipes) { states.push({ ...cookbook.getSyncState(), count: recipes.length }); } });
        assert.equal(cookbook.getSyncState().loading, true);
        assert.equal(cookbook.getSyncState().error, false);
        response.resolve(fails
            ? { error: { message: "Simulated recipe fetch failure" } }
            : { data: [cached, { ...cached, id: "second-recipe", namn: "Second recipe" }] });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(cookbook.getSyncState().loading, false);
        assert.equal(cookbook.getSyncState().error, fails);
        assert.equal(states.at(-1).count, fails ? 1 : 2);
    });
}

function createElement() {
    const classes = new Set();
    const history = [];
    let text = "";
    return {
        history,
        get textContent() { return text; },
        set textContent(value) { text = value; history.push(value); },
        appendChild(child) { text += child.textContent; },
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name),
            toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }
        }
    };
}

function createAuthUi(page) {
    const status = createElement();
    const button = createElement();
    const environment = createElement();
    page.elements.set("authStatus", status);
    page.elements.set("authActionBtn", button);
    page.elements.set(".database-environment", [environment]);
    return { status, button, environment };
}

function createPage(backend, storage = new Map(), displayStorage = new Map()) {
    const timers = new Map();
    const elements = new Map();
    let nextTimer = 0;
    const localStorage = {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key)
    };
    const emit = (event, session) => {
        backend.session = session;
        backend.locked = true;
        try {
            backend.callbacks.forEach(callback => assert.equal(callback(event, session), undefined));
        } finally {
            backend.locked = false;
        }
    };
    const client = {
        auth: {
            getSession: async () => backend.pending?.table === "session" ? backend.pending.promise : { data: { session: backend.session } },
            onAuthStateChange(callback) {
                backend.callbacks.push(callback);
                backend.locked = true;
                try {
                    assert.equal(callback("INITIAL_SESSION", backend.session), undefined);
                } finally {
                    backend.locked = false;
                }
            },
            async signInWithPassword() { emit("SIGNED_IN", leaderSession); return {}; },
            async signOut() { emit("SIGNED_OUT", null); return {}; }
        },
        from(table) {
            assert.equal(backend.locked, false, "Database query inside the auth lock");
            const request = { table, operation: "select" };
            backend.requests.push(request);
            const query = {
                select() { return this; },
                eq(column, value) { request[column] = value; return this; },
                order() { return this; },
                in() { return this; },
                not() { return this; },
                upsert(rows) { request.operation = "upsert"; request.rows = rows; return this; },
                delete() { request.operation = "delete"; return this; },
                maybeSingle() {
                    if (backend.pending?.table === table) return backend.pending.promise;
                    return Promise.resolve({ data: table === "profiles" ? backend.profile : { namn: "Testkar" } });
                },
                then(resolve, reject) {
                    const result = backend.pending?.table === table ? backend.pending.promise : Promise.resolve({ data: [] });
                    return result.then(resolve, reject);
                }
            };
            return query;
        }
    };
    const context = vm.createContext({
        window: {
            GTSCOUT_SUPABASE_CONFIG: { url: "https://example.test", anonKey: "test" },
            supabase: { createClient: () => client },
            location: { search: "" },
            addEventListener() {},
            confirm: () => false
        },
        document: {
            readyState: "loading",
            addEventListener() {},
            createElement,
            createTextNode: text => ({ textContent: text }),
            getElementById: id => elements.get(id) || null,
            querySelectorAll: selector => elements.get(selector) || [],
            body: { classList: { add() {} } }
        },
        localStorage,
        sessionStorage: {
            getItem: key => displayStorage.get(key) ?? null,
            setItem: (key, value) => displayStorage.set(key, value),
            removeItem: key => displayStorage.delete(key)
        },
        console,
        URLSearchParams,
        crypto: globalThis.crypto,
        setTimeout(callback) { const timer = ++nextTimer; timers.set(timer, callback); return timer; },
        clearTimeout: timer => timers.delete(timer)
    });
    const load = filename => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", filename), "utf8"), context);
    const runTimers = async () => {
        for (const [timer, callback] of [...timers]) {
            timers.delete(timer);
            await callback();
        }
    };
    load("auth.js");
    return { window: context.window, localStorage, storage, displayStorage, elements, load, emit, runTimers, auth: context.window.GTScoutAuth };
}

test("auth UI waits for session and profile without flashing guest or local mode", async () => {
    const backend = createBackend();
    const page = createPage(backend);
    const { status, button, environment } = createAuthUi(page);
    const planningStatus = createElement();
    page.elements.set("planningSyncStatus", planningStatus);
    page.load("planering-sync.js");
    page.window.GTScoutPlanningSync.init({ getGroups: () => [], applyGroups() {} });
    const sessionResponse = deferred();
    backend.pending = { table: "session", ...sessionResponse };
    const initialization = page.auth.init();
    assert.equal(status.textContent, "");
    assert.equal(button.textContent, "Logga in");
    assert.equal(button.disabled, true);
    assert.equal(button.classList.contains("hidden"), false);
    assert.equal(environment.history.includes("Lokalt läge"), false);
    assert.equal(planningStatus.textContent, "Kontrollerar inloggning...");

    const profileResponse = deferred();
    backend.pending = { table: "profiles", ...profileResponse };
    sessionResponse.resolve({ data: { session: leaderSession } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(status.textContent, "");
    profileResponse.resolve({ data: leaderProfile });
    await initialization;
    await page.runTimers();
    assert.match(status.textContent, /^Ledare: leader@example.test/);
    assert.equal(button.textContent, "Logga ut");
    assert.equal(button.disabled, false);
    assert.equal(button.classList.contains("hidden"), false);
    assert.equal(status.history.some(text => text.startsWith("Gäst")), false);
    assert.equal(planningStatus.history.some(text => text.includes("inte inloggad")), false);
});

test("auth UI shows guest only after session restoration confirms no login", async () => {
    const backend = createBackend(null);
    const page = createPage(backend);
    const { status, button } = createAuthUi(page);
    const response = deferred();
    backend.pending = { table: "session", ...response };
    const initialization = page.auth.init();
    assert.equal(status.textContent, "");
    assert.equal(button.textContent, "Logga in");
    assert.equal(button.disabled, true);
    response.resolve({ data: { session: null } });
    await initialization;
    await page.runTimers();
    assert.equal(status.textContent, "Gäst");
    assert.equal(button.textContent, "Logga in");
    assert.equal(button.classList.contains("hidden"), false);
});

test("cached identity is rendered before DOMContentLoaded without starting authentication", async () => {
    const backend = createBackend();
    const firstPage = createPage(backend);
    const previous = createAuthUi(firstPage);
    await firstPage.auth.init();
    await firstPage.runTimers();
    const page = createPage(backend, firstPage.storage, firstPage.displayStorage);
    const { status, button } = createAuthUi(page);
    const requestsBeforePreview = backend.requests.length;
    page.auth.renderPreview();
    assert.equal(status.textContent, previous.status.textContent);
    assert.equal(button.textContent, previous.button.textContent);
    assert.equal(button.disabled, true);
    assert.equal(page.auth.isOnline(), false);
    assert.equal(page.auth.isSignedIn(), false);
    assert.equal(backend.requests.length, requestsBeforePreview);
    await page.auth.init();
    await page.runTimers();
    assert.equal(status.textContent, previous.status.textContent);
    assert.equal(button.disabled, false);
});

for (const restoredSession of [leaderSession, null]) {
    test(`cached identity remains during navigation and is ${restoredSession ? "confirmed" : "removed for an expired session"}`, async () => {
        const backend = createBackend();
        const firstPage = createPage(backend);
        const previous = createAuthUi(firstPage);
        await firstPage.auth.init();
        await firstPage.runTimers();
        const previousName = previous.status.textContent;

        backend.session = restoredSession;
        const page = createPage(backend, firstPage.storage, firstPage.displayStorage);
        const { status, button } = createAuthUi(page);
        const response = deferred();
        backend.pending = { table: "session", ...response };
        const initialization = page.auth.init();
        assert.equal(status.textContent, previousName);
        assert.equal(button.textContent, previous.button.textContent);
        assert.equal(button.textContent, "Logga ut");
        assert.equal(button.disabled, true);
        assert.equal(page.auth.isSignedIn(), false);
        assert.equal(page.auth.isLeader(), false);

        response.resolve({ data: { session: restoredSession } });
        await initialization;
        await page.runTimers();
        assert.equal(status.textContent, restoredSession ? previousName : "Gäst");
        assert.equal(button.textContent, restoredSession ? "Logga ut" : "Logga in");
        assert.equal(button.disabled, false);
        if (!restoredSession) assert.equal(page.displayStorage.size, 0);
        await page.auth.signOut();
        assert.equal(page.displayStorage.size, 0);
    });
}

test("auth UI shows local mode immediately when Supabase is not configured", async () => {
    const page = createPage(createBackend(null));
    const { status, button, environment } = createAuthUi(page);
    page.window.GTSCOUT_SUPABASE_CONFIG = {};
    await page.auth.init();
    assert.equal(status.textContent, "Gäst (lokalt läge)");
    assert.equal(environment.textContent, "Lokalt läge");
    assert.equal(button.classList.contains("hidden"), true);
});

test("planning finishes loading while INITIAL_SESSION revalidates the same profile", async () => {
    const backend = createBackend();
    const page = createPage(backend);
    const status = { textContent: "", classList: { toggle() {} } };
    page.elements.set("planningSyncStatus", status);
    let groups = [{ id: "planning-1", name: "Cached planning" }];
    const planningResponse = deferred();
    backend.pending = { table: "planeringar", ...planningResponse };
    page.load("planering-sync.js");
    page.window.GTScoutPlanningSync.init({ getGroups: () => groups, applyGroups: next => { groups = next; } });
    await page.auth.init();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(status.textContent, "Hämtar planeringar...");

    const profileResponse = deferred();
    backend.pending = { table: "profiles", ...profileResponse };
    const refresh = page.runTimers();
    try {
        planningResponse.resolve({ data: [{ id: "planning-1", data: { name: "Database planning" } }] });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(status.textContent, "Synkad med databasen (1 planeringar)");
        assert.equal(groups[0].name, "Database planning");
        assert.equal(page.window.GTScoutPlanningSync.canWrite(), true);
    } finally {
        profileResponse.resolve({ data: leaderProfile });
        await refresh;
    }
});

test("login on arrangements restores the same session and database writes on planning", async () => {
    const backend = createBackend(null);
    const storage = new Map();
    const arrangementsPage = createPage(backend, storage);
    await arrangementsPage.auth.init();
    await arrangementsPage.runTimers();
    await arrangementsPage.auth.signIn("leader@example.test", "test-password");
    await arrangementsPage.runTimers();

    const planningPage = createPage(backend, storage);
    planningPage.load("planering-sync.js");
    planningPage.window.GTScoutPlanningSync.init({ getGroups: () => [], applyGroups() {} });
    await planningPage.auth.init();
    await planningPage.runTimers();
    assert.equal(planningPage.auth.isSignedIn(), true);
    assert.equal(planningPage.auth.isLeader(), true);
    assert.equal(planningPage.window.GTScoutPlanningSync.canWrite(), true);
    planningPage.window.GTScoutPlanningSync.scheduleSave([{ id: "planning-1", name: "Test" }]);
    await planningPage.runTimers();
    const save = backend.requests.find(request => request.table === "planeringar" && request.operation === "upsert");
    assert.equal(save.rows[0].kar_id, "kar-1");
    assert.equal(save.rows[0].created_by, "leader-1");
});

test("logout on another page clears private caches but preserves preferences and public recipes", async () => {
    const backend = createBackend();
    const privateKeys = ["gtscout_planering", "gtscout_badge_notes", "gtscout_custom_activities", "gtscout_custom_badge_activities", "gtscout_arrangemang", "gtscout_scouts"];
    const storage = new Map([...privateKeys, "gtscout_show_meetings", "gtscout_kokbok_recept"].map(key => [key, "cached"]));
    const firstPage = createPage(backend, storage);
    const secondPage = createPage(backend, storage);
    await firstPage.auth.init();
    await secondPage.auth.init();
    await firstPage.runTimers();
    await secondPage.runTimers();
    await firstPage.auth.signOut();
    assert.equal(firstPage.auth.isSignedIn(), false);
    await secondPage.runTimers();
    assert.equal(secondPage.auth.isSignedIn(), false);
    assert.equal(secondPage.auth.getProfile(), null);
    privateKeys.forEach(key => assert.equal(storage.has(key), false));
    assert.equal(storage.get("gtscout_show_meetings"), "cached");
    assert.equal(storage.get("gtscout_kokbok_recept"), "cached");
});

test("queued token refresh cannot undo logout", async () => {
    const page = createPage(createBackend());
    await page.auth.init();
    await page.runTimers();
    page.emit("TOKEN_REFRESHED", leaderSession);
    await page.auth.signOut();
    await page.runTimers();
    assert.equal(page.auth.isSignedIn(), false);
    assert.equal(page.auth.getState().karId, null);
});

test("a late profile response cannot restore permissions after logout", async () => {
    const backend = createBackend();
    const page = createPage(backend);
    await page.auth.init();
    await page.runTimers();
    backend.pending = { table: "profiles", ...deferred() };
    page.emit("TOKEN_REFRESHED", leaderSession);
    const refresh = page.runTimers();
    await page.auth.signOut();
    backend.pending.resolve({ data: leaderProfile });
    await refresh;
    await page.runTimers();
    assert.equal(page.auth.isSignedIn(), false);
    assert.equal(page.auth.isLeader(), false);
    assert.equal(page.auth.getState().karId, null);
});

test("logout clears cached arrangements even while the first reload is pending", async () => {
    const backend = createBackend();
    const page = createPage(backend);
    await page.auth.init();
    await page.runTimers();
    const cached = { id: "arrangement-1", title: "Private arrangement", start_date: "2026-10-08" };
    page.localStorage.setItem("gtscout_arrangemang", JSON.stringify([cached]));
    backend.pending = { table: "arrangemang", ...deferred() };
    page.load("arrangemang-sync.js");
    const sync = page.window.GTScoutArrangements;
    sync.init({ onChange() {} });
    assert.equal(sync.getAll().length, 1);
    await page.auth.signOut();
    assert.equal(sync.getAll().length, 0);
    backend.pending.resolve({ data: [{ id: cached.id, data: cached }] });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sync.getAll().length, 0);
});

test("arrangement sync reports loading until fetched items are available", async () => {
    const backend = createBackend();
    const page = createPage(backend);
    await page.auth.init();
    await page.runTimers();
    const response = deferred();
    backend.pending = { table: "arrangemang", ...response };
    page.load("arrangemang-sync.js");
    const sync = page.window.GTScoutArrangements;
    const states = [];
    sync.init({ onChange: () => states.push({ ...sync.getSyncState(), count: sync.getAll().length }) });
    assert.equal(sync.getSyncState().loading, true);
    assert.equal(sync.getSyncState().error, false);
    response.resolve({ data: [
        { id: "arrangement-1", data: { title: "First", start_date: "2026-10-08" } },
        { id: "arrangement-2", data: { title: "Second", start_date: "2026-10-09" } }
    ] });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sync.getSyncState().loading, false);
    assert.equal(sync.getAll().length, 2);
    assert.equal(states.at(-1).loading, false);
    assert.equal(states.at(-1).count, 2);
});

test("queued planning and note saves do not transfer to the next login", async () => {
    const backend = createBackend();
    const page = createPage(backend);
    await page.auth.init();
    await page.runTimers();
    page.load("planering-sync.js");
    page.load("notes-sync.js");
    page.window.GTScoutPlanningSync.init({ getGroups: () => [], applyGroups() {} });
    page.window.GTScoutNotes.init({ onChange() {} });
    await new Promise(resolve => setImmediate(resolve));
    page.window.GTScoutPlanningSync.scheduleSave([{ id: "old-planning" }]);
    page.window.GTScoutNotes.scheduleSave("badge-1", "Old private note");
    await page.auth.signOut();
    page.emit("SIGNED_IN", { user: { id: "leader-2", email: "other@example.test" } });
    await page.runTimers();
    assert.equal(backend.requests.some(request => request.operation === "upsert"), false);
});

for (const [filename, moduleName, table, key, row] of [
    ["planering-sync.js", "GTScoutPlanningSync", "planeringar", "gtscout_planering", { id: "planning-1", data: { name: "Private planning" } }],
    ["arrangemang-sync.js", "GTScoutArrangements", "arrangemang", "gtscout_arrangemang", { id: "arrangement-1", data: { title: "Private arrangement", start_date: "2026-10-08" } }],
    ["notes-sync.js", "GTScoutNotes", "badge_notes", "gtscout_badge_notes", { badge_id: "badge-1", note: "Private note" }],
    ["scouts-sync.js", "GTScoutScouts", "scouts", "gtscout_scouts", { id: "scout-1", namn: "Private scout", fodelsear: 2015 }]
]) {
    test(`${moduleName} ignores a database response received after logout`, async () => {
        const backend = createBackend();
        const page = createPage(backend);
        await page.auth.init();
        await page.runTimers();
        backend.pending = { table, ...deferred() };
        page.load(filename);
        const sync = page.window[moduleName];
        sync.init({
            getGroups: () => [],
            applyGroups: groups => page.localStorage.setItem(key, JSON.stringify(groups)),
            onChange() {}
        });
        await page.auth.signOut();
        await page.runTimers();
        backend.pending.resolve({ data: [row] });
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(!page.storage.get(key)?.includes("Private"), "Private data reappeared after logout");
    });
}