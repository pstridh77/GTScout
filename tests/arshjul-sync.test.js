const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const readScript = name => fs.readFileSync(path.join(__dirname, "..", "js", name), "utf8");
const settle = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function wheel(id = "wheel", schemaVersion = 4) {
    return {
        id, name: id, schema_version: schemaVersion, local_kar_id: "kar-1",
        rings: [{ id: "arrangements", name: "Arrangemang", color: "#398a86" }],
        events: []
    };
}

function arrangement(fields = {}) {
    return {
        id: "source", title: "Hajk", start_date: "2026-10-20", end_date: "2026-10-21",
        ...fields
    };
}

function createPage({ wheels = [], arrangements = [], localWheels = [], localArrangements = [], signedIn = true, leader = true, admin = false, search = "", handleRequest, chartMode, viewportWidth = 1024 } = {}) {
    const elements = new Map();
    const listeners = [];
    const windowListeners = {};
    const requests = [];
    const errors = [];
    const clipboardWrites = [];
    const printCalls = [];
    const storage = new Map([
        ["gtscout_arshjul", JSON.stringify(localWheels)],
        ["gtscout_arrangemang", JSON.stringify(localArrangements)],
        ["gtscout_arshjul_view", JSON.stringify({ mode: "calendar", year: 2026, chartMode })]
    ]);
    const tables = {
        arshjul: wheels.map(item => ({ id: item.id, name: item.name, share_token: item.share_token || null, data: structuredClone(item) })),
        arrangemang: arrangements.map(item => ({ id: item.id, data: structuredClone(item) }))
    };
    let userId = signedIn ? "user-1" : null;
    let karId = signedIn ? "kar-1" : null;
    let isLeader = leader;
    let renderCount = 0;
    function element(id) {
        assert.notEqual(id, "addYearWheelRingBtn", "The removed ring button must not be referenced");
        if (!elements.has(id)) {
            const classes = new Set();
            elements.set(id, {
                value: "", textContent: "", dataset: {}, handlers: {}, style: {},
                getBoundingClientRect() { return { top: 200, bottom: 236, left: 500, height: id === "yearWheelChartCard" ? 720 : 36 }; },
                set innerHTML(value) {
                    if (id === "yearWheelChart") {
                        renderCount++;
                        assert.ok(renderCount < 100, "Rendering must not enter a feedback loop");
                    }
                    this.markup = value;
                },
                get innerHTML() { return this.markup || ""; },
                classList: {
                    add: name => classes.add(name),
                    remove: name => classes.delete(name),
                    contains: name => classes.has(name),
                    toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }
                },
                addEventListener(name, callback) { this.handlers[name] = callback; },
                querySelector(selector) {
                    if (selector === "[data-department-toggle-all]") return null;
                    return element(`${id} ${selector}`);
                },
                querySelectorAll(selector) {
                    if (id === "yearWheelRingList" && selector === ".year-wheel-ring-filter-group" && this.innerHTML.includes("year-wheel-ring-filter-group")) {
                        return [element(`${id} .year-wheel-ring-filter-group`)];
                    }
                    if (selector === "[data-year-step]") {
                        return [...this.innerHTML.matchAll(/data-year-step="(-?1)"/g)].map(([, step]) => {
                            const button = element(`${id} [data-year-step="${step}"]`);
                            button.dataset.yearStep = step;
                            return button;
                        });
                    }
                    if (selector === "[data-month-create]") {
                        return [...this.innerHTML.matchAll(/data-month-create="([^"]+)" data-ring-create="([^"]+)"/g)].map(([, date, ringId]) => {
                            const mark = element(`${id} month ${date}${ringId === "arrangements" ? "" : ` ring ${ringId}`}`);
                            mark.dataset.monthCreate = date;
                            mark.dataset.ringCreate = ringId;
                            return mark;
                        });
                    }
                    if (selector === "[data-event-edit]") {
                        return [...this.innerHTML.matchAll(/data-event-edit="([^"]+)"/g)].map(([, eventId]) => {
                            const mark = element(`${id} event ${eventId}`);
                            mark.dataset.eventEdit = eventId;
                            return mark;
                        });
                    }
                    if (id === "yearWheelRingList" && selector === "[data-ring-toggle]") {
                        return [...this.innerHTML.matchAll(/data-ring-toggle="([^"]+)"( checked)?/g)].map(([, ringId, checked]) => {
                            const input = element(`${id} ring ${ringId}`);
                            input.dataset.ringToggle = ringId;
                            input.checked = Boolean(checked);
                            return input;
                        });
                    }
                    return [];
                },
                attributes: {},
                setAttribute(name, value) { this.attributes[name] = value; },
                removeAttribute() {}, focus() {}
            });
        }
        return elements.get(id);
    }
    async function execute(request) {
        requests.push(request);
        assert.ok(requests.length < 100, "Database writes must terminate");
        const result = await handleRequest?.(request);
        if (result !== undefined) return result; 
        if (request.operation === "rpc") {
            const row = tables.arshjul.find(item => (item.share_token || item.data.share_token) === request.args.requested_token); 
            return { data: row ? [{ id: row.id, name: row.name, data: structuredClone(row.data) }] : [], error: null };
        }
        if (request.operation === "select") return { data: structuredClone(tables[request.table]) };
        const rows = tables[request.table]; 
        const index = rows.findIndex(row => row.id === (request.row?.id || request.id));
        if (request.operation === "delete") {
            if (index >= 0) rows.splice(index, 1); 
        } else if (index >= 0) rows[index] = structuredClone(request.row);
        else rows.push(structuredClone(request.row)); 
        return { error: null };
    } 
    const client = {
        from(table) { 
            const request = { table, operation: "select" };
            return { 
                select() { return this; },
                eq(key, value) { request[key] = value; return this; }, 
                order() { return this; },
                upsert(row) { request.operation = "upsert"; request.row = structuredClone(row); return this; }, 
                delete() { request.operation = "delete"; return this; },
                then(resolve, reject) { return execute(request).then(resolve, reject); } 
            };
        },
        rpc(name, args) { return execute({ operation: "rpc", name, args }); }
    };
    const auth = {
            getClient: () => client, 
        getState: () => ({ karId, loading: false }),
        getUser: () => userId ? { id: userId } : null,
        isSignedIn: () => Boolean(userId),
        isOnline: () => true,
        isLeader: () => isLeader || admin,
        isAdmin: () => admin,
        onChange(callback) { listeners.push(callback); callback(); }
    };
    const context = vm.createContext({
             window: { 
            GTScoutAuth: auth,
            GTScoutYearWheelPrint: { openDocument: options => printCalls.push(options) },
            location: { search, pathname: "/arshjul.html", href: "https://example.test/arshjul.html" },
            navigator: { clipboard: { async writeText(value) { clipboardWrites.push(value); } } },
             innerWidth: viewportWidth,
             addEventListener(name, callback) { windowListeners[name] = callback; }, confirm: () => true
        },
        document: {
            readyState: "complete", getElementById: element, querySelectorAll: () => [], querySelector: () => null,
             body: element("body") 
        },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
             setItem: (key, value) => storage.set(key, value) 
        },
        crypto: globalThis.crypto,
        URL,
             URLSearchParams, 
        FormData: class {
                 constructor(form) { this.values = form.values; } 
            entries() { return Object.entries(this.values); }
                 getAll(key) { return this.values[key] === undefined ? [] : [this.values[key]].flat(); } 
        },
             console: { error: (...args) => errors.push(args) } 
    });
    for (const name of ["participants.js", "arrangemang-sync.js", "arshjul-sync.js", "arshjul.js"]) {
         vm.runInContext(readScript(name), context); 
    }
    return {
        requests, errors, elements, tables, clipboardWrites, printCalls,
        sync: context.window.GTScoutYearWheelSync,
        arrangements: context.window.GTScoutArrangements,
        stored: () => JSON.parse(storage.get("gtscout_arshjul")),
        preferences: () => JSON.parse(storage.get("gtscout_arshjul_view")),
        resize(width) {
            context.window.innerWidth = width;
            windowListeners.resize?.();
        },
        changeAuth(nextUserId, nextKarId, nextLeader = isLeader) {
            userId = nextUserId;
            karId = nextKarId;
            isLeader = nextLeader;
            listeners.forEach(callback => callback());
        },
        unlockEditing() { elements.get("yearWheelEditToggle").handlers.click(); }
    };
}

test("read-only users can open both print layouts without saving data", async () => {
    const page = createPage({ wheels: [wheel()], leader: false });
    await settle();
    const printButton = page.elements.get("yearWheelMenuPrintBtn");
    assert.equal(printButton.disabled, false);
    for (const mode of ["wheel", "list"]) {
        printButton.handlers.click();
        assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Skriv ut årshjul");
        const form = page.elements.get("yearWheelForm");
        form.values = { print_layout: mode };
        form.handlers.submit({ preventDefault() {}, currentTarget: form });
        assert.equal(page.printCalls.at(-1).mode, mode);
        assert.equal(page.printCalls.at(-1).wheel.id, "wheel");
        assert.equal(page.printCalls.at(-1).range.start.toISOString(), "2026-01-01T00:00:00.000Z");
    }
    assert.equal(page.printCalls.length, 2);
    assert.equal(page.requests.filter(request => request.operation !== "select").length, 0);
});

test("print action is disabled when there is no wheel", async () => {
    const page = createPage();
    await settle();
    assert.equal(page.elements.get("yearWheelMenuPrintBtn").disabled, true);
});

test("shared wheels allow printing without edit permissions", async () => {
    const page = createPage({
        wheels: [{ ...wheel(), share_token: "public-token" }],
        signedIn: false, search: "?share=public-token"
    });
    await settle();
    await settle();
    assert.equal(page.elements.get("yearWheelMenuPrintBtn").disabled, false);
    page.elements.get("yearWheelMenuPrintBtn").handlers.click();
    assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Skriv ut årshjul");
});

function createHelpers() {
    const source = readScript("arshjul.js");
    const context = vm.createContext({ crypto: globalThis.crypto });
    vm.runInContext(source.slice(source.indexOf("    const VIEW_STORAGE_KEY"), source.indexOf("    function readViewPreferences")), context);
    vm.runInContext(source.slice(source.indexOf("    function syncArrangementEvents("), source.indexOf("    function getDisplayedRings(")), context);
    return context;
}

for (const [field, limit] of [["title", 120], ["responsible", 100], ["location", 120], ["notes", 2000]]) {
    for (const offset of [-1, 0, 1]) {
        test(`arrangement ${field} at ${limit + offset} characters converges after normalization`, () => {
            const helpers = createHelpers();
            const value = "x".repeat(limit + offset);
            const input = arrangement(field === "responsible"
                ? { responsibilities: [{ person: value }] }
                : { [field]: value });
            const original = structuredClone(input);
            const updated = helpers.syncArrangementEvents(wheel(), [input]);
            assert.equal(updated.events[0][field], "x".repeat(Math.min(limit, limit + offset)));
            assert.equal(helpers.syncArrangementEvents(helpers.normalizeWheel(updated), [input]), null);
            assert.deepEqual(input, original, "Source arrangement text must not be truncated");
        });
    }
    test(`arrangement ${field} trims whitespace at the truncation boundary`, () => {
        const helpers = createHelpers();
        const value = "x".repeat(limit - 1) + " \nÅterstående text";
        const input = arrangement(field === "responsible"
            ? { responsibilities: [{ person: value }] }
            : { [field]: value });
        const updated = helpers.syncArrangementEvents(wheel(), [input]);
        assert.equal(updated.events[0][field], "x".repeat(limit - 1));
        assert.equal(helpers.syncArrangementEvents(helpers.normalizeWheel(updated), [input]), null);
    });
}

test("automatic sync batches migration and long arrangement texts once per wheel", async () => {
    const input = arrangement({
        title: "T".repeat(121), notes: "N".repeat(1999) + " rest",
        location: "P".repeat(119) + " rest",
        responsibilities: [{ person: "A".repeat(99) + " rest" }]
    });
    const page = createPage({ wheels: [wheel("old", 2), wheel("current")], arrangements: [input] });
    await settle();
    const writes = page.requests.filter(request => request.operation === "upsert");
    assert.equal(writes.length, 2);
    for (const { row } of writes) {
        assert.equal(row.data.schema_version, 4);
        assert.equal(row.data.events[0].title.length, 120);
        assert.equal(row.data.events[0].notes.length, 1999);
        assert.equal(row.data.events[0].location.length, 119);
        assert.equal(row.data.events[0].responsible.length, 99);
    }
    assert.equal(page.tables.arshjul.find(row => row.id === "old").data.rings.filter(ring => ring.name === "Terminer").length, 1);
    page.changeAuth("user-1", "kar-1");
    await settle();
    assert.equal(page.requests.filter(request => request.operation === "upsert").length, 2);
    assert.deepEqual(page.errors, []);
});

for (const delayedTable of ["arshjul", "arrangemang"]) {
    test(`automatic sync works when ${delayedTable} loads last`, async () => {
        const gate = deferred();
        const page = createPage({
            wheels: [wheel()], arrangements: [arrangement({ title: "T".repeat(121) })],
            handleRequest: request => request.table === delayedTable && request.operation === "select"
                ? gate.promise : undefined
        });
        await settle();
        gate.resolve(undefined);
        await settle();
        assert.equal(page.requests.filter(request => request.operation === "upsert").length, 1);
        assert.equal(page.tables.arshjul[0].data.events[0].title.length, 120);
        assert.deepEqual(page.errors, []);
    });
}

test("saving a wheel notifies the view without re-reading arrangement sources", async () => {
    const page = createPage({ wheels: [wheel()] });
    await settle();
    page.arrangements.getAll = () => assert.fail("Save notifications must not restart automatic sync");
    await page.sync.saveWheel({ ...wheel(), name: "Manually edited" });
    assert.equal(page.elements.get("yearWheelDisplayName").textContent, "Manually edited");
    assert.equal(page.stored()[0].local_only, false);
    assert.deepEqual(page.errors, []);
});

test("creating a wheel still imports arrangements in the initial save", async () => {
    const page = createPage({ arrangements: [arrangement({ title: "T".repeat(121) })] });
    await settle();
    page.elements.get("yearWheelMenuAddBtn").handlers.click();
    const form = page.elements.get("yearWheelForm");
    const fields = page.elements.get("yearWheelFormFields").innerHTML;
    const ringIds = [...fields.matchAll(/name="ring_ids" value="([^"]+)"[^>]*checked/g)].map(match => match[1]);
    form.values = { name: "New wheel", start_month: "8", ring_ids: ringIds };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    await settle();
    assert.equal(page.tables.arshjul.length, 1);
    assert.equal(page.tables.arshjul[0].data.events[0].title.length, 120);
    assert.equal(page.requests.filter(request => request.table === "arshjul" && request.operation === "upsert").length, 1);
    assert.deepEqual(page.errors, []);
});

for (const isNew of [true, false]) {
    test(`custom rings can be created through ${isNew ? "new wheel" : "wheel settings"}`, async () => {
        const page = createPage({ wheels: isNew ? [] : [wheel()] });
        await settle();
        if (!isNew) page.unlockEditing();
        page.elements.get(isNew ? "yearWheelMenuAddBtn" : "yearWheelMenuSettingsBtn").handlers.click();
        const markup = page.elements.get("yearWheelFormFields").innerHTML;
        assert.match(markup, /data-config-ring-action="add"/);
        assert.doesNotMatch(markup, /new_ring_name|new_ring_color/);
        const form = page.elements.get("yearWheelForm");
        form.values = {
            name: "Configured wheel", start_month: "3",
            ...(isNew ? {} : { ring_ids: "arrangements" })
        };
        clickRingAction(page, "add");
        assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Lägg till ring");
        form.values = { name: "Föräldragrupp", color: "#123456", color_variant: "custom" };
        form.handlers.submit({ preventDefault() {}, currentTarget: form });
        assert.equal(page.tables.arshjul.length, isNew ? 0 : 1, "Ring draft must not save the wheel");
        const restored = page.elements.get("yearWheelFormFields").innerHTML;
        assert.match(restored, /value="Configured wheel"/);
        assert.match(restored, /value="3" selected/);
        const selectedIds = [...restored.matchAll(/name="ring_ids" value="([^"]+)"[^>]*checked/g)].map(match => match[1]);
        form.values = { name: "Configured wheel", start_month: "3", ring_ids: selectedIds };
        form.handlers.submit({ preventDefault() {}, currentTarget: form });
        await settle();
        const saved = page.tables.arshjul[0].data;
        const custom = saved.rings.find(ring => ring.name === "Föräldragrupp");
        assert.ok(custom);
        assert.equal(custom.color, "#123456");
        assert.equal(custom.color_variant, "custom");
        assert.equal(custom.sync_arrangements, false);
        assert.equal(saved.rings.length, isNew ? 1 : 2);
        assert.equal(saved.start_month, 3);
        assert.equal(custom.parent_id, "");
        assert.match(page.elements.get("yearWheelRingList").innerHTML, /Föräldragrupp/);
        assert.deepEqual(page.errors, []);
    });
}

test("new ring named Arrangemang enables sync by default", async () => {
    const page = createPage({ wheels: [wheel()] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const form = page.elements.get("yearWheelForm");
    form.values = { name: "wheel", start_month: "8", ring_ids: ["arrangements"] };
    clickRingAction(page, "add");

    const fields = page.elements.get("yearWheelFormFields");
    const nameInput = fields.querySelector('[name="name"]');
    const syncToggle = fields.querySelector('[name="sync_arrangements"]');
    nameInput.value = "Arrangemang";
    nameInput.handlers.input();
    assert.equal(syncToggle.checked, true);
    nameInput.value = "Styrelse";
    nameInput.handlers.input();
    assert.equal(syncToggle.checked, false);
    syncToggle.checked = true;
    syncToggle.handlers.change();
    nameInput.value = "Arrangemang";
    nameInput.handlers.input();
    assert.equal(syncToggle.checked, true);

    form.values = { name: "Arrangemang", color: "#123456", parent_id: "", sync_arrangements: "on" };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    const configuredMarkup = fields.innerHTML;
    const ringIds = [...configuredMarkup.matchAll(/name="ring_ids" value="([^"]+)"[^>]*checked/g)].map(match => match[1]);
    form.values = { name: "wheel", start_month: "8", ring_ids: ringIds };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    await settle();

    assert.equal(page.tables.arshjul[0].data.rings.find(ring => ring.id !== "arrangements").sync_arrangements, true);
    assert.deepEqual(page.errors, []);
});

test("legacy department grouping migrates into an editable root and child rings", async () => {
    const configuredWheel = wheel("legacy", 3);
    configuredWheel.group_departments = true;
    configuredWheel.department_ring_color = "#123456";
    configuredWheel.rings = [
        { id: "common", name: "Kårgemensamt", color: "#991d1b" },
        { id: "scouts", name: "Spårare", color: "#41a62a" },
        { id: "explorers", name: "Upptäckare", color: "#00a8e1" }
    ];
    configuredWheel.events = [
        { id: "scout-event-1", ring_id: "scouts", title: "Möte 1", start_date: "2026-03-01", end_date: "2026-03-01" },
        { id: "scout-event-2", ring_id: "explorers", title: "Möte 2", start_date: "2026-03-08", end_date: "2026-03-08" }
    ];
    const page = createPage({ wheels: [configuredWheel] });
    await settle();

    const saved = page.tables.arshjul[0].data;
    const root = saved.rings.find(ring => ring.name === "Avdelning");
    assert.ok(root);
    assert.equal(root.color, "#123456");
    assert.equal(root.children_display, "grouped");
    assert.equal(saved.rings.find(ring => ring.id === "scouts").parent_id, root.id);
    assert.equal(saved.rings.find(ring => ring.id === "explorers").parent_id, root.id);
    assert.deepEqual(saved.events.map(event => event.ring_id), ["scouts", "explorers"]);
    assert.match(page.elements.get("yearWheelChart").innerHTML, /<textPath[^>]*>Avdelning<\/textPath>/);
    assert.match(page.elements.get("yearWheelRingList").innerHTML, new RegExp(`data-ring-group-toggle="${root.id}"`));
    await page.sync.saveWheel({
        ...saved,
        events: [...saved.events, {
            id: "board-event", ring_id: root.id, title: "Styrelsemöte",
            start_date: "2026-04-12", end_date: "2026-04-12"
        }]
    });
    assert.match(page.elements.get("yearWheelChart").innerHTML, /data-event-edit="board-event"/);
    page.unlockEditing();
    assert.ok(page.elements.get("yearWheelChart").querySelectorAll("[data-month-create]")
        .some(mark => mark.dataset.ringCreate === root.id));

    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const form = page.elements.get("yearWheelForm");
    const ringIds = saved.rings.map(ring => ring.id);
    form.values = { name: saved.name, start_month: String(saved.start_month), ring_ids: ringIds };
    clickRingAction(page, "edit", root.id);
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /Summera händelser i ringen/);
    form.values = {
        name: "Avdelning", color: "#123456", parent_id: "", children_display: "individual",
        color_variant: "custom"
    };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    form.values = { name: saved.name, start_month: String(saved.start_month), ring_ids: ringIds };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    await settle();

    const individuallyDisplayed = page.tables.arshjul[0].data;
    assert.equal(individuallyDisplayed.rings.find(ring => ring.id === root.id).children_display, "individual");
    const individualChart = page.elements.get("yearWheelChart").innerHTML;
    assert.match(individualChart, /<textPath[^>]*>Spårare<\/textPath>/);
    assert.match(individualChart, /<textPath[^>]*>Upptäckare<\/textPath>/);
    assert.match(individualChart, /fill="#d9dfe4" class="year-wheel-ring-background"/);
    assert.match(individualChart, /data-event-edit="scout-event-1"[^]*?fill="#41a62a"/);
    assert.match(individualChart, /data-event-edit="scout-event-2"[^]*?fill="#00a8e1"/);
    assert.deepEqual(page.errors, []);

    const individualWheel = { ...configuredWheel, id: "legacy-individual", group_departments: false };
    const individualPage = createPage({ wheels: [individualWheel] });
    await settle();
    assert.equal(individualPage.tables.arshjul[0].data.rings.find(ring => ring.name === "Avdelning").children_display, "individual");
});

test("a custom root can contain event-owning child rings without allowing deeper nesting", async () => {
    const page = createPage({ wheels: [wheel()] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const form = page.elements.get("yearWheelForm");
    form.values = { name: "wheel", start_month: "8", ring_ids: ["arrangements"] };
    clickRingAction(page, "add");
    form.values = { name: "Styrelse", color: "#123456", parent_id: "" };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });

    const settingsMarkup = page.elements.get("yearWheelFormFields").innerHTML;
    const boardId = settingsMarkup.match(/data-config-ring-action="edit" data-ring-id="([^"]+)" aria-label="Redigera Styrelse"/)?.[1];
    assert.ok(boardId);
    form.values = { name: "wheel", start_month: "8", ring_ids: ["arrangements", boardId] };
    clickRingAction(page, "add-child", "", boardId);
    assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Lägg till ring");
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, new RegExp(`<option value="${boardId}" selected>Styrelse</option>`));
    form.values = { name: "Kassör", color: "#abcdef", parent_id: boardId };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });

    const nestedMarkup = page.elements.get("yearWheelFormFields").innerHTML;
    assert.match(nestedMarkup, /Kassör/);
    assert.match(nestedMarkup, /data-config-ring-action="add-child" data-parent-id="[^"]+"/);
    const childId = nestedMarkup.match(/data-config-ring-action="edit" data-ring-id="([^"]+)" aria-label="Redigera Kassör"/)?.[1];
    assert.ok(childId);
    form.values = { name: "wheel", start_month: "8", ring_ids: ["arrangements", boardId, childId] };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    await settle();

    const saved = page.tables.arshjul[0].data;
    assert.equal(saved.rings.find(ring => ring.id === childId).parent_id, boardId);
    assert.equal(saved.rings.find(ring => ring.id === boardId).parent_id, "");
    assert.equal(saved.rings.find(ring => ring.id === boardId).children_display, "grouped");
    assert.deepEqual(page.errors, []);
});

function clickRingAction(page, action, ringId = "", parentId = "") {
    page.elements.get("yearWheelFormFields").handlers.click({
        target: {
            closest: selector => selector === "[data-config-ring-action]"
                ? { dataset: { configRingAction: action, ringId, parentId }, disabled: false }
                : null
        }
    });
}

test("collapsed department filter stays collapsed after a ring selection change", async () => {
    const configuredWheel = wheel();
    configuredWheel.rings = [
        { id: "board", name: "Styrelse", color: "#991d1b" },
        { id: "scouts", name: "Spårare", color: "#41a62a", parent_id: "board" },
        { id: "common", name: "Kårgemensamt", color: "#991d1b" }
    ];
    const page = createPage({ wheels: [configuredWheel] });
    await settle();

    const list = page.elements.get("yearWheelRingList");
    const ringGroup = list.querySelector(".year-wheel-ring-filter-group");
    assert.equal(ringGroup.open, true);
    ringGroup.open = false;
    ringGroup.handlers.toggle();

    const scoutToggle = list.querySelectorAll("[data-ring-toggle]").find(input => input.dataset.ringToggle === "scouts");
    scoutToggle.checked = false;
    scoutToggle.handlers.change();

    assert.equal(ringGroup.open, false);
    assert.doesNotMatch(list.innerHTML, /<details class="year-wheel-ring-filter-group" open/);
    assert.deepEqual(page.errors, []);
});

test("ring order can be changed in wheel settings and is saved for the shared wheel", async () => {
    const original = wheel();
    original.rings.push(
        { id: "custom-1", name: "Extra 1", color: "#123456" },
        { id: "custom-2", name: "Extra 2", color: "#654321" }
    );
    const page = createPage({ wheels: [original] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const form = page.elements.get("yearWheelForm");
    form.values = {
        name: "wheel", start_month: "8",
        ring_ids: ["arrangements", "custom-1", "custom-2"]
    };

    let markup = page.elements.get("yearWheelFormFields").innerHTML;
    assert.match(markup, /Den första ringen visas ytterst/);
    assert.deepEqual(
        [...markup.matchAll(/data-config-ring-action="move-up" data-ring-id="([^"]+)"/g)].map(match => match[1]),
        ["arrangements", "custom-1", "custom-2"]
    );
    clickRingAction(page, "move-down", "arrangements");
    markup = page.elements.get("yearWheelFormFields").innerHTML;
    assert.deepEqual(
        [...markup.matchAll(/data-config-ring-action="move-up" data-ring-id="([^"]+)"/g)].map(match => match[1]),
        ["custom-1", "arrangements", "custom-2"]
    );

    const fields = page.elements.get("yearWheelFormFields");
    fields.handlers.dragstart({
        target: { closest: () => ({ dataset: { ringDragHandle: "custom-2" } }) },
        dataTransfer: { setData() {}, effectAllowed: "" }
    });
    fields.handlers.drop({
        target: { closest: () => ({ dataset: { ringId: "arrangements" } }) },
        preventDefault() {}
    });
    markup = fields.innerHTML;
    assert.deepEqual(
        [...markup.matchAll(/data-ring-drag-handle="([^"]+)"/g)].map(match => match[1]),
        ["custom-1", "custom-2", "arrangements"]
    );

    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    await settle();
    const saved = page.tables.arshjul[0].data;
    assert.deepEqual(saved.rings.map(ring => ring.id), ["custom-1", "custom-2", "arrangements"]);
    assert.deepEqual(page.stored()[0].rings.map(ring => ring.id), ["custom-1", "custom-2", "arrangements"]);
    assert.deepEqual(page.errors, []);
});

test("settings edit and delete ring drafts without losing wheel inputs or saving early", async () => {
    const original = wheel();
    original.rings.push({ id: "custom", name: "Extra", color: "#123456" });
    const page = createPage({ wheels: [original] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const form = page.elements.get("yearWheelForm");
    const values = { name: "Changed wheel", start_month: "4", ring_ids: ["arrangements", "custom"] };
    form.values = values;
    clickRingAction(page, "edit", "custom");
    assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Redigera ring");
    form.values = { name: "Renamed", color: "#abcdef", color_variant: "custom" };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    assert.equal(page.tables.arshjul[0].data.rings[1].name, "Extra");
    let markup = page.elements.get("yearWheelFormFields").innerHTML;
    assert.match(markup, /Renamed/);
    assert.match(markup, /--ring-color:#abcdef/);
    assert.match(markup, /value="Changed wheel"/);
    form.values = values;
    clickRingAction(page, "edit", "arrangements");
    page.elements.get("deleteYearWheelItemBtn").handlers.click();
    markup = page.elements.get("yearWheelFormFields").innerHTML;
    assert.doesNotMatch(markup, /data-ring-id="arrangements"/);
    form.values = { ...values, ring_ids: ["custom"] };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    await settle();
    assert.equal(page.tables.arshjul[0].data.rings.length, 1);
    assert.equal(page.tables.arshjul[0].data.rings[0].name, "Renamed");
    assert.deepEqual(page.errors, []);
});

test("closing a ring dialog returns to settings, closing settings discards all ring drafts", async () => {
    const page = createPage({ wheels: [wheel()] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const form = page.elements.get("yearWheelForm");
    form.values = { name: "Unsaved", start_month: "2", ring_ids: ["arrangements"] };
    clickRingAction(page, "add");
    page.elements.get("closeYearWheelModal").handlers.click();
    assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Inställningar för årshjul");
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /value="Unsaved"/);
    form.values = { name: "Unsaved", start_month: "2", ring_ids: ["arrangements"] };
    clickRingAction(page, "edit", "arrangements");
    form.values = { name: "Changed ring", color: "#123456", color_variant: "custom" };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    page.elements.get("closeYearWheelModal").handlers.click();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    assert.doesNotMatch(page.elements.get("yearWheelFormFields").innerHTML, /Changed ring|Unsaved/);
    assert.equal(page.requests.filter(request => request.operation === "upsert").length, 0);
    assert.deepEqual(page.errors, []);
});

test("settings use compact edit links and prevent deleting rings with events in the ring dialog", async () => {
    const page = createPage({ wheels: [wheel()], arrangements: [arrangement()] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const markup = page.elements.get("yearWheelFormFields").innerHTML;
    assert.match(markup, /class="year-wheel-ring-edit"[^>]+data-config-ring-action="edit"/);
    assert.doesNotMatch(markup, /data-config-ring-action="delete"/);
    const form = page.elements.get("yearWheelForm");
    form.values = { name: "wheel", start_month: "8", ring_ids: ["arrangements"] };
    clickRingAction(page, "edit", "arrangements");
    assert.equal(page.elements.get("deleteYearWheelItemBtn").disabled, true);
    page.elements.get("deleteYearWheelItemBtn").handlers.click();
    assert.match(page.elements.get("yearWheelFormMessage").textContent, /Flytta eller ta bort/);
    assert.equal(page.tables.arshjul[0].data.rings.length, 1);
    assert.deepEqual(page.errors, []);
});

test("the main year-wheel view has no add-ring button", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "arshjul.html"), "utf8");
    assert.doesNotMatch(html, /addYearWheelRingBtn|\+ Ring/);
});

test("year wheel filters default to hidden on mobile and remember explicit visibility", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "arshjul.html"), "utf8");
    assert.match(html, /id="yearWheelToolbar"[^>]*data-filter-preference="gtscout_arshjul_filters_visible"/);
    for (const narrow of [false, true]) {
        for (const saved of [null, "true", "false"]) {
            const classes = new Set();
            const attributes = {};
            let click;
            let stored = saved;
            const filters = {
                dataset: { filterPreference: "gtscout_arshjul_filters_visible" },
                classList: {
                    contains: name => classes.has(name),
                    toggle(name, force) {
                        const add = force === undefined ? !classes.has(name) : force;
                        if (add) classes.add(name); else classes.delete(name);
                    }
                },
                querySelector: () => null
            };
            const toggle = {
                dataset: {},
                setAttribute: (name, value) => { attributes[name] = value; },
                addEventListener: (name, handler) => { click = handler; }
            };
            const context = vm.createContext({
                document: {
                    getElementById: id => id === "filtersVisibilityToggle" ? toggle : null,
                    querySelector: selector => selector === "[data-page-filters]" ? filters : null
                },
                window: { matchMedia: () => ({ matches: narrow }) },
                localStorage: {
                    getItem: () => stored,
                    setItem(key, value) {
                        assert.equal(key, "gtscout_arshjul_filters_visible");
                        stored = value;
                    }
                },
                console
            });
            vm.runInContext(readScript("header-controls.js"), context);
            const visible = saved === "true" || (saved !== "false" && !narrow);
            assert.equal(classes.has("filters--hidden"), !visible);
            assert.equal(attributes["aria-expanded"], String(visible));
            click();
            assert.equal(stored, String(!visible));
            assert.equal(attributes["aria-expanded"], String(!visible));
            vm.runInContext(readScript("header-controls.js"), context);
            assert.equal(classes.has("filters--hidden"), visible);
        }
    }
});

test("event list collapse control uses the shared mobile style and stays in sync with the menu", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "arshjul.html"), "utf8");
    assert.match(html, /class="section-collapse-controls">\s*<button class="section-collapse-toggle"[^>]*data-collapse-all="year-wheel-months"[^>]*aria-controls="yearWheelEvents"/);
    const buttons = [false, true].map(isMenu => ({
        classList: { contains: () => isMenu },
        setAttribute(name, value) { this[name] = value; }
    }));
    const source = readScript("arshjul.js");
    const context = vm.createContext({
        document: { querySelectorAll: () => buttons }
    });
    vm.runInContext(source.slice(source.indexOf("    function toggleEventMonths("), source.indexOf("    function updateYearWheelMenuActions(")), context);
    const groups = ["2026-01", "2026-02"].map(month => ({ open: true, dataset: { eventMonth: month } }));
    const collapsed = new Set();
    context.updateEventMonthToggle(groups);
    assert.equal(buttons[0].textContent, "Fäll ihop");
    context.toggleEventMonths(groups, collapsed);
    context.updateEventMonthToggle(groups);
    assert.equal(buttons[0].textContent, "Visa");
    assert.equal(buttons[1].textContent, "Visa alla månader");
    assert.equal(buttons[0]["aria-expanded"], "false");
    assert.equal(collapsed.size, 2);
    context.toggleEventMonths(groups, collapsed);
    context.updateEventMonthToggle(groups);
    assert.equal(buttons[0].textContent, "Fäll ihop");
    assert.equal(buttons[1].textContent, "Fäll ihop alla månader");
    assert.equal(buttons[0]["aria-expanded"], "true");
    assert.equal(collapsed.size, 0);
    context.updateEventMonthToggle([]);
    assert.equal(buttons[0].disabled, true);
});

test("ring filters are collapsed inside the toolbar instead of a sidebar", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "arshjul.html"), "utf8");
    const toolbar = html.slice(html.indexOf('<section id="yearWheelToolbar"'), html.indexOf('<section class="year-wheel-layout"'));
    assert.match(toolbar, /<details id="yearWheelRingFilters" class="year-wheel-ring-filters">/);
    assert.match(toolbar, /<summary>Visa ringar<\/summary>/);
    assert.match(toolbar, /id="yearWheelRingList"/);
    assert.match(toolbar, /id="yearWheelReadOnlyNote"/);
    assert.doesNotMatch(html, /year-wheel-rings-panel/);
});

test("add event menu action forwards to the existing button and respects its availability", async () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "arshjul.html"), "utf8");
    const hero = html.match(/<section class="page-hero year-wheel-hero"[\s\S]*?<\/section>/)?.[0];
    assert.ok(hero);
    assert.match(hero, /id="addYearWheelEventBtn" class="btn-primary"/);
    assert.equal((html.match(/id="addYearWheelEventBtn"/g) || []).length, 1);
    assert.match(html, /id="yearWheelMenuAddEventBtn"[^>]*data-header-action="addYearWheelEventBtn"/);
    for (const options of [
        { wheels: [wheel()] },
        { wheels: [] },
        { wheels: [wheel()], leader: false },
        { wheels: [{ ...wheel(), rings: [] }] }
    ]) {
        const page = createPage(options);
        await settle();
        assert.equal(page.elements.get("yearWheelMenuAddEventBtn").disabled, page.elements.get("addYearWheelEventBtn").disabled);
        assert.deepEqual(page.errors, []);
    }
});

test("year wheel starts locked and opens events read-only until unlocked", async () => {
    const page = createPage({ wheels: [{
        ...wheel(),
        events: [{
            id: "event-1", ring_id: "arrangements", title: "Kårstämma",
            start_date: "2026-05-10", end_date: "2026-05-10"
        }]
    }] });
    await settle();

    const lockButton = page.elements.get("yearWheelEditToggle");
    const addEventButton = page.elements.get("addYearWheelEventBtn");
    const settingsButton = page.elements.get("yearWheelMenuSettingsBtn");
    const settingsTooltip = page.elements.get("yearWheelMenuSettingsTooltip");
    assert.equal(lockButton.attributes["aria-pressed"], "false");
    assert.equal(addEventButton.disabled, true);
    assert.equal(settingsButton.disabled, true);
    assert.equal(settingsTooltip.classList.contains("hidden"), false);
    assert.equal(settingsTooltip.title, "Lås upp årshjulet för att kunna ändra inställningar.");
    assert.doesNotMatch(page.elements.get("yearWheelChart").innerHTML, /data-month-create/);

    const eventMark = page.elements.get("yearWheelChart").querySelectorAll("[data-event-edit]")[0];
    assert.ok(eventMark);
    eventMark.handlers.click();
    assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Visa händelse");
    assert.equal(page.elements.get("yearWheelForm").querySelector('[type="submit"]').classList.contains("hidden"), true);
    assert.equal(page.elements.get("deleteYearWheelItemBtn").classList.contains("hidden"), true);
    const form = page.elements.get("yearWheelForm");
    form.values = {};
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    assert.equal(page.requests.filter(request => request.operation !== "select").length, 0);

    lockButton.handlers.click();
    assert.equal(lockButton.attributes["aria-pressed"], "true");
    assert.equal(addEventButton.disabled, false);
    assert.equal(settingsButton.disabled, false);
    assert.equal(settingsTooltip.title, "");
    eventMark.handlers.click();
    assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Redigera händelse");
    assert.deepEqual(page.errors, []);
});

test("only the lock floats throughout the page and adapts to header and toolbar visibility", () => {
    const classes = new Set();
    const button = {
        style: {},
        classList: {
            contains: name => classes.has(name),
            toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }
        }
    };
    let anchor = { top: 300, left: 700 };
    let header = { bottom: 140 };
    let toolbar = { top: 150, bottom: 250, height: 100 };
    const elements = {
        yearWheelEditToggle: button,
        yearWheelEditControl: { getBoundingClientRect: () => anchor },
        yearWheelToolbar: { getBoundingClientRect: () => toolbar }
    };
    const context = vm.createContext({
        byId: id => elements[id],
        document: { querySelector: () => ({ getBoundingClientRect: () => header }) }
    });
    const source = readScript("arshjul.js");
    vm.runInContext(source.slice(source.indexOf("    function updateStickyYearWheelLock("), source.indexOf("    function showYearWheelShareModal(")), context);
    context.updateStickyYearWheelLock();
    assert.equal(classes.has("year-wheel-edit-toggle--sticky"), false);
    anchor = { top: 100, left: 700 };
    toolbar = { top: 80, bottom: 180, height: 100 };
    context.updateStickyYearWheelLock();
    assert.equal(button.style.top, "188px");
    assert.equal(button.style.left, "700px");
    assert.equal(classes.has("year-wheel-edit-toggle--sticky"), true);
    toolbar = { top: 0, bottom: 0, height: 0 };
    context.updateStickyYearWheelLock();
    assert.equal(button.style.top, "148px");
    header = { bottom: 38 };
    anchor = { top: -4000, left: 300 };
    context.updateStickyYearWheelLock();
    assert.equal(button.style.top, "46px");
    assert.equal(button.style.left, "300px");
    assert.equal(classes.has("year-wheel-edit-toggle--sticky"), true);
    anchor = { top: 300, left: 300 };
    context.updateStickyYearWheelLock();
    assert.equal(button.style.top, "");
    assert.equal(button.style.left, "");
    assert.equal(classes.has("year-wheel-edit-toggle--sticky"), false);
});

test("event dialog copies saved events to next year using the list action", async () => {
    const original = {
        id: "event-1", ring_id: "arrangements", title: "Hajk",
        start_date: "2026-05-10", end_date: "2026-05-12",
        responsible: "Anna", location: "Skogen", notes: "Ta med tält"
    };
    const page = createPage({ wheels: [{ ...wheel(), events: [original] }] });
    await settle();
    const chart = page.elements.get("yearWheelChart");
    chart.querySelectorAll("[data-event-edit]")[0].handlers.click();
    const copyButton = page.elements.get("copyYearWheelEventBtn");
    assert.equal(copyButton.classList.contains("hidden"), true);
    copyButton.handlers.click();
    assert.equal(page.tables.arshjul[0].data.events.length, 1);

    page.unlockEditing();
    chart.querySelectorAll("[data-event-edit]")[0].handlers.click();
    assert.equal(copyButton.classList.contains("hidden"), false);
    copyButton.handlers.click();
    await settle();
    const events = page.tables.arshjul[0].data.events;
    assert.equal(events.length, 2);
    const copy = events.find(event => event.id !== original.id);
    assert.equal(copy.start_date, "2027-05-10");
    assert.equal(copy.end_date, "2027-05-12");
    assert.equal(copy.copied_from_id, original.id);
    assert.equal(copy.needs_review, true);
    for (const field of ["title", "ring_id", "responsible", "location", "notes"]) {
        assert.equal(copy[field], original[field]);
    }
    assert.equal(page.preferences().year, 2027);
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /name="start_date"[^>]*value="2027-05-10"/);
    page.elements.get("addYearWheelEventBtn").handlers.click();
    assert.equal(copyButton.classList.contains("hidden"), true);
    assert.deepEqual(page.errors, []);
});

test("month sectors open new events on the first day in calendar and operational years", async () => {
    const page = createPage({ wheels: [wheel()] });
    await settle();
    page.unlockEditing();
    const chart = page.elements.get("yearWheelChart");
    assert.equal(chart.querySelectorAll("[data-month-create]").length, 12);
    for (const date of ["2026-01-01", "2026-12-01"]) {
        page.elements.get(`yearWheelChart month ${date}`).handlers.click();
        assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Lägg till händelse");
        const fields = page.elements.get("yearWheelFormFields").innerHTML;
        assert.match(fields, new RegExp(`name="start_date"[^>]*value="${date}"`));
        assert.match(fields, new RegExp(`name="end_date"[^>]*value="${date}"`));
        page.elements.get("closeYearWheelModal").handlers.click();
    }
    page.elements.get("yearWheelMode").value = "operational";
    page.elements.get("yearWheelMode").handlers.change();
    const dates = chart.querySelectorAll("[data-month-create]").map(mark => mark.dataset.monthCreate);
    assert.equal(dates[0], "2026-08-01");
    assert.equal(dates[11], "2027-07-01");
    for (const key of ["Enter", " "]) {
        let prevented = false;
        page.elements.get("yearWheelChart month 2027-01-01").handlers.keydown({
            key, preventDefault() { prevented = true; }
        });
        assert.equal(prevented, true);
        assert.match(page.elements.get("yearWheelFormFields").innerHTML, /name="start_date"[^>]*value="2027-01-01"/);
        page.elements.get("closeYearWheelModal").handlers.click();
    }
    page.elements.get("addYearWheelEventBtn").handlers.click();
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /name="start_date"[^>]*value="2026-08-01"/);
    assert.equal(page.requests.filter(request => request.operation !== "select").length, 0);
    assert.deepEqual(page.errors, []);
});

test("month creation is unavailable without edit permission or rings", async () => {
    for (const options of [
        { wheels: [wheel()], leader: false },
        { wheels: [{ ...wheel(), rings: [] }] }
    ]) {
        const page = createPage(options);
        await settle();
        assert.doesNotMatch(page.elements.get("yearWheelChart").innerHTML, /data-month-create/);
        assert.deepEqual(page.errors, []);
    }
});

test("month sectors preselect the clicked ring including its white label band", async () => {
    const page = createPage({ wheels: [{
        ...wheel(),
        rings: [
            { id: "outer", name: "Yttre", color: "#398a86" },
            { id: "inner", name: "Inre", color: "#398a86" }
        ]
    }] });
    await settle();
    page.unlockEditing();
    const chart = page.elements.get("yearWheelChart");
    assert.equal(chart.querySelectorAll("[data-month-create]").length, 24);
    assert.match(chart.innerHTML, /A 250 250[^>]*A 160 160[^>]*data-ring-create="outer"/);
    assert.match(chart.innerHTML, /A 160 160[^>]*A 64 64[^>]*data-ring-create="inner"/);
    for (const ringId of ["outer", "inner"]) {
        page.elements.get(`yearWheelChart month 2026-05-01 ring ${ringId}`).handlers.click();
        const fields = page.elements.get("yearWheelFormFields").innerHTML;
        assert.match(fields, new RegExp(`<option value="${ringId}" selected>`));
        assert.match(fields, /name="start_date"[^>]*value="2026-05-01"/);
        page.elements.get("closeYearWheelModal").handlers.click();
    }
    assert.deepEqual(page.errors, []);
});

test("event arcs keep sharp corners even for narrow events", () => {
    const source = readScript("arshjul.js");
    const context = vm.createContext({});
    vm.runInContext(source.slice(source.indexOf("    function point("), source.indexOf("    function getRingTextColor(")), context);
    for (const span of [0.001, 0.1, 0.75]) {
        const path = context.arcPath(100, 90, 0, span);
        assert.doesNotMatch(path, /\bQ\b/);
        assert.doesNotMatch(path, /NaN|Infinity/);
    }
    assert.doesNotMatch(context.arcPath(100, 90, 0, 0.1), /\bQ\b/);
});

test("colored rings occupy at least 70 percent of each ring slot", async () => {
    for (const ringCount of [4, 10]) {
        const page = createPage({ wheels: [{
            ...wheel(),
            rings: Array.from({ length: ringCount }, (_, index) => ({
                id: `ring-${index}`, name: `Ring ${index}`, color: "#398a86"
            }))
        }] });
        await settle();
        const markup = page.elements.get("yearWheelChart").innerHTML;
        const gaps = [...markup.matchAll(/stroke-width="([\d.]+)" class="year-wheel-ring-gap"/g)];
        assert.equal(gaps.length, ringCount);
        for (const [, width] of gaps) {
            assert.ok(Number(width) <= Number((180 / ringCount * 0.3).toFixed(2)));
        }
        assert.deepEqual(page.errors, []);
    }
});

test("year arrows change the personal year while locked and respect year limits", async () => {
    const page = createPage({ wheels: [wheel()], leader: false });
    await settle();
    const chart = page.elements.get("yearWheelChart");
    const [previous, next] = chart.querySelectorAll("[data-year-step]");
    assert.match(chart.innerHTML, /data-year-step="-1" transform="translate\(300 350\)"/);
    assert.match(chart.innerHTML, /data-year-step="1" transform="translate\(340 350\)"/);
    assert.match(chart.innerHTML, /y="292" class="year-wheel-center-subtitle"[^>]*>Kalenderår</);
    previous.handlers.click();
    assert.equal(page.preferences().year, 2025);
    next.handlers.keydown({ key: "Enter", preventDefault() {} });
    assert.equal(page.preferences().year, 2026);
    next.handlers.keydown({ key: " ", preventDefault() {} });
    assert.equal(page.preferences().year, 2027);
    assert.equal(page.elements.get("yearWheelYear").value, 2027);

    page.elements.get("yearWheelMode").value = "operational";
    page.elements.get("yearWheelMode").handlers.change();
    assert.match(chart.innerHTML, /data-year-step="-1" transform="translate\(300 350\)"/);
    assert.match(chart.innerHTML, /data-year-step="1" transform="translate\(340 350\)"/);
    assert.match(chart.innerHTML, /y="292" class="year-wheel-center-subtitle"[^>]*>Verksamhetsår</);
    for (const [year, button, step] of [[1900, previous, -1], [2200, next, 1]]) {
        page.elements.get("yearWheelYear").value = year;
        page.elements.get("yearWheelYear").handlers.change();
        button.handlers.click();
        assert.equal(page.preferences().year, year);
        assert.match(chart.innerHTML, new RegExp(`data-year-step="${step}"[^>]*aria-disabled="true"`));
    }
    assert.equal(page.requests.filter(request => request.operation !== "select").length, 0);
    assert.deepEqual(page.errors, []);
});

test("center year opens a dialog and changes the personal year without write permission", async () => {
    const page = createPage({ wheels: [wheel()], leader: false });
    await settle();
    const yearButton = page.elements.get("yearWheelChart [data-year-edit]");
    assert.match(page.elements.get("yearWheelChart").innerHTML, /<text x="320" y="320" class="year-wheel-center-title year-wheel-year-edit" text-anchor="middle" dominant-baseline="central"/);
    assert.match(page.elements.get("yearWheelChart").innerHTML, /<text x="320" y="292" class="year-wheel-center-subtitle"/);
    assert.match(page.elements.get("yearWheelChart").innerHTML, /role="button" tabindex="0" data-year-edit/);
    yearButton.handlers.click();
    assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Ändra år");
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /name="year".*value="2026"/);
    const form = page.elements.get("yearWheelForm");
    for (const invalid of ["", "1899", "2201", "2027.5", "abc"]) {
        form.values = { year: invalid };
        form.handlers.submit({ preventDefault() {}, currentTarget: form });
        assert.match(page.elements.get("yearWheelFormMessage").textContent, /1900 och 2200/);
        assert.equal(page.preferences().year, 2026);
    }
    form.values = { year: "2027" };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    assert.equal(page.preferences().year, 2027);
    assert.equal(page.elements.get("yearWheelYear").value, 2027);
    assert.equal(page.elements.get("yearWheelModal").classList.contains("hidden"), true);
    for (const key of ["Enter", " "]) {
        let prevented = false;
        yearButton.handlers.keydown({ key, preventDefault() { prevented = true; } });
        assert.equal(prevented, true);
        assert.equal(page.elements.get("yearWheelModal").classList.contains("hidden"), false);
        page.elements.get("closeYearWheelModal").handlers.click();
    }
    assert.equal(page.requests.filter(request => request.operation !== "select").length, 0);
    assert.deepEqual(page.errors, []);
});

test("chart display mode defaults to details and persists overview without database writes", async () => {
    const page = createPage({ wheels: [wheel()] });
    await settle();
    const overview = page.elements.get("yearWheelOverviewBtn");
    const details = page.elements.get("yearWheelDetailsBtn");
    const chart = page.elements.get("yearWheelChart");
    assert.equal(details.attributes["aria-pressed"], "true");
    assert.equal(overview.attributes["aria-pressed"], "false");
    assert.equal(chart.classList.contains("year-wheel-chart--overview"), false);
    assert.equal(page.elements.get("body").classList.contains("year-wheel-page--details"), true);
    assert.equal(page.elements.get("body").classList.contains("year-wheel-page--overview"), false);
    assert.match(chart.innerHTML, /viewBox="24 24 592 592"/);
    assert.match(chart.innerHTML, /class="year-wheel-ring-label" dominant-baseline="central"/);
    assert.match(chart.innerHTML, /A 244\.00 244\.00 0 0 1/);
    assert.equal((chart.innerHTML.match(/class="year-wheel-month-label"/g) || []).length, 12);
    assert.ok(chart.innerHTML.indexOf('class="year-wheel-month-label"') > chart.innerHTML.lastIndexOf('class="year-wheel-ring-gap"'));
    overview.handlers.click();
    assert.equal(overview.attributes["aria-pressed"], "true");
    assert.equal(details.attributes["aria-pressed"], "false");
    assert.equal(chart.classList.contains("year-wheel-chart--overview"), true);
    assert.equal(page.elements.get("body").classList.contains("year-wheel-page--details"), false);
    assert.equal(page.elements.get("body").classList.contains("year-wheel-page--overview"), true);
    assert.equal(page.preferences().chartMode, "overview");
    details.handlers.click();
    assert.equal(chart.classList.contains("year-wheel-chart--overview"), false);
    assert.equal(page.preferences().chartMode, "details");
    assert.equal(page.elements.get("body").classList.contains("year-wheel-page--details"), true);
    assert.equal(page.elements.get("body").classList.contains("year-wheel-page--overview"), false);
    assert.equal(page.requests.filter(request => request.operation !== "select").length, 0);
    assert.deepEqual(page.errors, []);
});

for (const mode of ["overview", "details", "invalid"]) {
    test(`chart display mode restores ${mode} preference safely`, async () => {
        const page = createPage({ wheels: [wheel()], chartMode: mode });
        await settle();
        assert.equal(page.elements.get("yearWheelOverviewBtn").attributes["aria-pressed"], String(mode === "overview"));
        assert.equal(page.elements.get("yearWheelDetailsBtn").attributes["aria-pressed"], String(mode !== "overview"));
        assert.equal(page.elements.get("yearWheelChart").classList.contains("year-wheel-chart--overview"), mode === "overview");
        assert.equal(page.elements.get("body").classList.contains("year-wheel-page--details"), mode !== "overview");
        assert.equal(page.elements.get("body").classList.contains("year-wheel-page--overview"), mode === "overview");
        assert.deepEqual(page.errors, []);
    });
}

test("overview places a compact event list beside the wheel only on wide screens", () => {
    const css = readScript("../css/style.css");
    assert.match(css, /@media \(min-width: 1200px\)\s*\{\s*\.year-wheel-page--overview \.year-wheel-layout\s*\{\s*grid-template-columns:\s*minmax\(0,\s*2fr\)\s+minmax\(300px,\s*1fr\);/);
    assert.match(css, /@media \(max-width: 680px\)\s*\{\s*\.year-wheel-view-toggle\s*\{\s*display:\s*none;/);
    assert.match(css, /\.year-wheel-page--overview \.year-wheel-main\s*\{\s*display:\s*contents;/);
    assert.match(css, /\.year-wheel-page--overview \.year-wheel-events-section\s*\{\s*display:\s*grid;\s*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\);/);
    assert.match(css, /\.year-wheel-page--overview \.year-wheel-events\s*\{\s*min-height:\s*0;\s*overflow-y:\s*auto;/);
    assert.match(css, /\.year-wheel-page--overview \.year-wheel-events \.recipe-meal-summary\s*\{\s*position:\s*static;/);
    assert.match(css, /\.year-wheel-layout\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
});

test("overview event list matches wheel height on wide screens and clears the height when narrow", async () => {
    const page = createPage({ wheels: [wheel()], chartMode: "overview", viewportWidth: 1280 });
    await settle();
    const eventSection = page.elements.get("yearWheelEventsSection");
    assert.equal(eventSection.style.height, "720px");
    page.resize(1100);
    assert.equal(eventSection.style.height, "");
    page.resize(1440);
    assert.equal(eventSection.style.height, "720px");
    page.elements.get("yearWheelDetailsBtn").handlers.click();
    assert.equal(eventSection.style.height, "");
    assert.deepEqual(page.errors, []);
});

test("overview event cards show date before title, ring, and details", async () => {
    const configuredWheel = wheel();
    configuredWheel.events = [{
        id: "overview-event", ring_id: "arrangements", title: "Hösthajk",
        start_date: "2026-10-20", end_date: "2026-10-21",
        responsible: "Anna", location: "Skogen", notes: "Samling vid stugan"
    }];
    const overviewPage = createPage({ wheels: [configuredWheel], chartMode: "overview" });
    await settle();
    const overviewMarkup = overviewPage.elements.get("yearWheelEvents").innerHTML;
    const dateIndex = overviewMarkup.indexOf("year-wheel-event-card-date");
    const titleIndex = overviewMarkup.indexOf("<strong>Hösthajk");
    const ringIndex = overviewMarkup.indexOf("year-wheel-event-card-ring");
    const detailsIndex = overviewMarkup.indexOf("year-wheel-event-card-info");
    assert.ok(dateIndex >= 0 && dateIndex < titleIndex);
    assert.ok(titleIndex < ringIndex && ringIndex < detailsIndex);
    assert.match(overviewMarkup, /20 okt\.\s*–21 okt\./);
    assert.match(overviewMarkup, /Samling vid stugan/);

    const detailsPage = createPage({ wheels: [configuredWheel], chartMode: "details" });
    await settle();
    const detailsMarkup = detailsPage.elements.get("yearWheelEvents").innerHTML;
    const css = readScript("../css/style.css");
    assert.equal(detailsMarkup, overviewMarkup);
    assert.match(css, /\.year-wheel-event-card\s*\{[^}]*grid-template-columns:\s*58px minmax\(0,\s*1fr\) auto/);
    assert.equal(detailsPage.elements.get("yearWheelEventsSection").style.height, "");
    assert.deepEqual(overviewPage.errors, []);
    assert.deepEqual(detailsPage.errors, []);
});

test("overview event cards are color-marked by their ring", async () => {
    const configuredWheel = wheel();
    configuredWheel.rings.push({ id: "board", name: "Styrelse", color: "#123456" });
    configuredWheel.events = [
        { id: "arrangement-event", ring_id: "arrangements", title: "Hösthajk", start_date: "2026-10-20" },
        { id: "board-event", ring_id: "board", title: "Styrelsemöte", start_date: "2026-10-21" }
    ];
    const page = createPage({ wheels: [configuredWheel], chartMode: "overview" });
    await settle();
    const markup = page.elements.get("yearWheelEvents").innerHTML;
    assert.match(markup, /class="year-wheel-event-card" style="--event-ring-color:#398a86"[^]*?Hösthajk/);
    assert.match(markup, /class="year-wheel-event-card" style="--event-ring-color:#123456"[^]*?Styrelsemöte/);
    assert.match(readScript("../css/style.css"), /\.year-wheel-event-card\s*\{[^}]*border-left:\s*3px solid var\(--event-ring-color\)/);
    assert.deepEqual(page.errors, []);
});

test("changed arrangements automatically update wheels without repeated writes", async () => {
    const page = createPage({ wheels: [wheel()], arrangements: [arrangement()] });
    await settle();
    assert.equal(page.tables.arshjul[0].data.rings[0].sync_arrangements, true);
    const before = page.requests.filter(request => request.table === "arshjul" && request.operation === "upsert").length;
    const input = arrangement({ title: "T".repeat(121), notes: "N".repeat(2001) });
    await page.arrangements.save(input);
    await settle();
    assert.equal(page.tables.arshjul[0].data.events[0].title, "T".repeat(120));
    assert.equal(page.tables.arshjul[0].data.events[0].notes, "N".repeat(2000));
    assert.equal(page.tables.arrangemang[0].data.title, input.title);
    assert.equal(page.tables.arrangemang[0].data.notes, input.notes);
    assert.equal(page.requests.filter(request => request.table === "arshjul" && request.operation === "upsert").length, before + 1);
    assert.deepEqual(page.errors, []);
});

for (const action of ["keep", "delete", "cancel"]) {
    test(`turning off arrangement sync can ${action === "keep" ? "keep linked events as regular events" : "remove linked events"}`, async () => {
        const page = createPage({ wheels: [wheel()], arrangements: [arrangement()] });
        await settle();
        assert.equal(page.tables.arshjul[0].data.events[0].source_arrangement_id, "source");
        page.unlockEditing();
        page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
        const form = page.elements.get("yearWheelForm");
        form.values = { name: "wheel", start_month: "8", ring_ids: ["arrangements"] };
        clickRingAction(page, "edit", "arrangements");
        const ringForm = page.elements.get("yearWheelFormFields").innerHTML;
        assert.match(ringForm, /name="sync_arrangements" type="checkbox" checked/);
        assert.match(ringForm, /name="arrangement_sync_action" value=""/);
        assert.doesNotMatch(ringForm, /<select[^>]*name="arrangement_sync_action"/);
        const syncToggle = page.elements.get("yearWheelFormFields").querySelector('[name="sync_arrangements"]');
        syncToggle.checked = true;
        syncToggle.checked = false;
        syncToggle.handlers.change();
        const choicePopup = page.elements.get("yearWheelArrangementSyncModal");
        assert.equal(choicePopup.classList.contains("hidden"), false);
        assert.match(page.elements.get("yearWheelArrangementSyncMessage").textContent, /1 synkad händelse/);
        const choiceButton = page.elements.get({
            keep: "keepYearWheelArrangementEventsBtn",
            delete: "deleteYearWheelArrangementEventsBtn",
            cancel: "cancelYearWheelArrangementSyncBtn"
        }[action]);
        choiceButton.handlers.click();
        assert.equal(choicePopup.classList.contains("hidden"), true);
        assert.equal(syncToggle.checked, action === "cancel");
        const selectedAction = page.elements.get('yearWheelFormFields [name="arrangement_sync_action"]');
        assert.equal(selectedAction.value, action === "cancel" ? "" : action);
        form.values = {
            name: "Arrangemang", color: "#398a86", parent_id: "",
            children_display: "grouped", arrangement_sync_action: selectedAction.value,
            ...(action === "cancel" ? { sync_arrangements: "on" } : {})
        };
        form.handlers.submit({ preventDefault() {}, currentTarget: form });
        form.values = { name: "wheel", start_month: "8", ring_ids: ["arrangements"] };
        form.handlers.submit({ preventDefault() {}, currentTarget: form });
        await settle();

        const saved = page.tables.arshjul[0].data;
        assert.equal(saved.rings[0].sync_arrangements, action === "cancel");
        if (action === "keep") {
            assert.equal(saved.events.length, 1);
            assert.equal(saved.events[0].source_arrangement_id, "");
        } else if (action === "delete") {
            assert.equal(saved.events.length, 0);
        } else {
            assert.equal(saved.events.length, 1);
            assert.equal(saved.events[0].source_arrangement_id, "source");
        }
        const writesBeforeSourceChange = page.requests.filter(request =>
            request.table === "arshjul" && request.operation === "upsert"
        ).length;
        await page.arrangements.save(arrangement({ title: "Updated after sync was disabled" }));
        await settle();
        assert.equal(page.requests.filter(request =>
            request.table === "arshjul" && request.operation === "upsert"
        ).length, writesBeforeSourceChange + Number(action === "cancel"));
        assert.equal(page.tables.arshjul[0].data.events.length, action === "delete" ? 0 : 1);
        if (action === "cancel") {
            assert.equal(page.tables.arshjul[0].data.events[0].title, "Updated after sync was disabled");
        }
        assert.deepEqual(page.errors, []);
    });
}

test("local wheels migrate and sync long texts without a database login", async () => {
    const page = createPage({
        signedIn: false,
        localWheels: [{ ...wheel("offline", 2), local_only: true, local_kar_id: null }],
        localArrangements: [arrangement({ title: "T".repeat(121), notes: "N".repeat(2001) })]
    });
    await settle();
    assert.equal(page.requests.length, 0);
    assert.equal(page.stored()[0].schema_version, 4);
    assert.equal(page.stored()[0].events[0].title.length, 120);
    assert.equal(page.stored()[0].events[0].notes.length, 2000);
    assert.deepEqual(page.errors, []);
});

test("read-only users see linked events without uploading derived changes", async () => {
    const page = createPage({ wheels: [wheel()], arrangements: [arrangement({ title: "T".repeat(121) })], leader: false });
    await settle();
    assert.match(page.elements.get("yearWheelEvents").innerHTML, /T{120}/);
    assert.equal(page.requests.filter(request => request.operation !== "select").length, 0);
    assert.deepEqual(page.errors, []);
});

test("year-wheel sharing saves before showing a link and admin rotation invalidates the prior token", async () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "arshjul.html"), "utf8");
    const shareActions = html.slice(html.indexOf("id=\"rotateYearWheelShareBtn\""), html.indexOf("</div>", html.indexOf("id=\"rotateYearWheelShareBtn\"")));
    assert.ok(shareActions.indexOf("rotateYearWheelShareBtn") < shareActions.indexOf("closeYearWheelShareBtn"));
    assert.ok(shareActions.indexOf("closeYearWheelShareBtn") < shareActions.indexOf("copyYearWheelShareBtn"));

    const page = createPage({ wheels: [wheel()], admin: true });
    await settle();
    assert.equal(page.elements.get("shareYearWheelBtn").classList.contains("hidden"), false);

    await page.elements.get("shareYearWheelBtn").handlers.click();
    const firstToken = page.tables.arshjul[0].share_token;
    assert.match(firstToken, /^[0-9a-f-]{36}$/i);
    assert.match(page.elements.get("yearWheelShareUrl").value, new RegExp(`share=${firstToken}`));
    assert.equal(page.elements.get("rotateYearWheelShareBtn").classList.contains("hidden"), false);
    assert.equal(page.clipboardWrites.at(-1), page.elements.get("yearWheelShareUrl").value);

    await page.elements.get("rotateYearWheelShareBtn").handlers.click();
    const rotatedToken = page.tables.arshjul[0].share_token;
    assert.notEqual(rotatedToken, firstToken);
    assert.match(page.elements.get("yearWheelShareUrl").value, new RegExp(`share=${rotatedToken}`));
    assert.equal(page.clipboardWrites.at(-1), page.elements.get("yearWheelShareUrl").value);
    assert.deepEqual(page.errors, []);
});

test("year-wheel share token opens a read-only view without login", async () => {
    const shared = wheel();
    shared.share_token = globalThis.crypto.randomUUID();
    const page = createPage({ wheels: [shared], signedIn: false, search: `?share=${shared.share_token}` });
    await settle();
    assert.equal(page.elements.get("yearWheelDisplayName").textContent, shared.name);
    assert.match(page.elements.get("yearWheelSyncStatus").textContent, /Delat årshjul/);
    assert.equal(page.elements.get("addYearWheelEventBtn").disabled, true);
    assert.equal(page.elements.get("shareYearWheelBtn").classList.contains("hidden"), true);
    assert.ok(page.requests.some(request => request.operation === "rpc" && request.name === "get_shared_arshjul"));
    assert.equal(page.requests.some(request => request.operation === "upsert"), false);
    assert.deepEqual(page.errors, []);
});

test("year-wheel share link is not exposed if the token cannot be saved", async () => {
    const page = createPage({
        wheels: [wheel()],
        handleRequest: request => request.table === "arshjul" && request.operation === "upsert"
            ? { error: new Error("simulated database failure") }
            : undefined
    });
    await settle();
    await page.elements.get("shareYearWheelBtn").handlers.click();

    assert.equal(page.elements.get("yearWheelShareUrl").value, "");
    assert.match(page.elements.get("yearWheelShareStatus").textContent, /kunde inte sparas i databasen/i);
    assert.equal(page.tables.arshjul[0].share_token, null);
});

test("local migration is uploaded with current arrangement data, not the old pending snapshot", async () => {
    const pending = { ...wheel("local", 2), local_only: true };
    const page = createPage({ localWheels: [pending], arrangements: [arrangement()] });
    await settle();
    const writes = page.requests.filter(request => request.table === "arshjul" && request.operation === "upsert");
    assert.equal(page.tables.arshjul[0].data.schema_version, 4);
    assert.equal(page.tables.arshjul[0].data.events[0].title, "Hajk");
    assert.equal(writes.length, 1);
    assert.deepEqual(page.errors, []);
});

test("overlapping saves preserve the latest local data and serialize database writes", async () => {
    const gate = deferred();
    let blockFirst = true;
    const page = createPage({
        wheels: [wheel()],
        handleRequest(request) {
            if (request.operation === "upsert" && blockFirst) {
                blockFirst = false;
                return gate.promise;
            }
        }
    });
    await settle();
    const first = page.sync.saveWheel({ ...wheel(), name: "First" });
    await settle();
    const latest = page.sync.saveWheel({ ...wheel(), name: "Latest" });
    await settle();
    assert.equal(page.requests.filter(request => request.operation === "upsert").length, 1);
    assert.equal(page.stored()[0].name, "Latest");
    assert.equal(page.stored()[0].local_only, true);
    gate.resolve(undefined);
    await Promise.all([first, latest]);
    assert.equal(page.stored()[0].name, "Latest");
    assert.equal(page.stored()[0].local_only, false);
    assert.equal(page.tables.arshjul[0].data.name, "Latest");
    assert.deepEqual(page.errors, []);
});

test("deleting during a save cannot recreate the deleted wheel", async () => {
    const gate = deferred();
    const page = createPage({
        wheels: [wheel()],
        handleRequest: request => request.operation === "upsert" ? gate.promise : undefined
    });
    await settle();
    const save = page.sync.saveWheel({ ...wheel(), name: "Saving" });
    await settle();
    const remove = page.sync.removeWheel("wheel");
    gate.resolve(undefined);
    await Promise.all([save, remove]);
    assert.equal(page.stored().length, 0);
    assert.equal(page.tables.arshjul.length, 0);
    assert.deepEqual(page.errors, []);
});

test("failed writes retain local changes and do not block subsequent saves", async () => {
    let fail = true;
    const page = createPage({
        wheels: [wheel()],
        handleRequest(request) {
            if (request.operation === "upsert" && fail) {
                fail = false;
                return { error: { message: "Database unavailable" } };
            }
        }
    });
    await settle();
    await page.sync.saveWheel({ ...wheel(), name: "Offline edit" });
    assert.equal(page.stored()[0].local_only, true);
    assert.match(page.elements.get("yearWheelSyncStatus").textContent, /Database unavailable/);
    assert.equal(page.errors.length, 1);
    await page.sync.saveWheel({ ...wheel(), name: "Retry" });
    assert.equal(page.stored()[0].local_only, false);
    assert.equal(page.tables.arshjul[0].data.name, "Retry");
});

test("failed deletion restores the wheel locally and reports the error", async () => {
    const page = createPage({
        wheels: [wheel()],
        handleRequest: request => request.operation === "delete"
            ? { error: { message: "Delete denied" } } : undefined
    });
    await settle();
    await page.sync.removeWheel("wheel");
    assert.equal(page.stored()[0].id, "wheel");
    assert.equal(page.elements.get("yearWheelDisplayName").textContent, "wheel");
    assert.match(page.elements.get("yearWheelSyncStatus").textContent, /Delete denied/);
    assert.equal(page.errors.length, 1);
});

test("logout invalidates running and queued writes without restoring shared data", async () => {
    const gate = deferred();
    const page = createPage({
        wheels: [wheel()],
        handleRequest: request => request.operation === "upsert" ? gate.promise : undefined
    });
    await settle();
    const first = page.sync.saveWheel({ ...wheel(), name: "Running" });
    await settle();
    const queued = page.sync.saveWheel({ ...wheel(), name: "Queued" });
    page.changeAuth(null, null);
    gate.resolve(undefined);
    await Promise.all([first, queued]);
    assert.equal(page.requests.filter(request => request.operation === "upsert").length, 1);
    assert.equal(page.elements.get("yearWheelDisplayName").textContent, "Inget årshjul valt");
    assert.equal(page.stored().every(item => item.local_only && item.local_kar_id === "kar-1"), true);
    assert.deepEqual(page.errors, []);
});

test("switching user and troop invalidates queued writes from the previous context", async () => {
    const gate = deferred();
    const page = createPage({
        wheels: [wheel()],
        handleRequest: request => request.operation === "upsert" ? gate.promise : undefined
    });
    await settle();
    const first = page.sync.saveWheel({ ...wheel(), name: "Old context" });
    await settle();
    const queued = page.sync.saveWheel({ ...wheel(), name: "Old queued edit" });
    page.tables.arshjul = [];
    page.tables.arrangemang = [];
    page.changeAuth("user-2", "kar-2");
    await settle();
    gate.resolve(undefined);
    await Promise.all([first, queued]);
    assert.equal(page.requests.filter(request => request.operation === "upsert").length, 1);
    assert.equal(page.elements.get("yearWheelDisplayName").textContent, "Inget årshjul valt");
    assert.equal(page.stored().some(item => item.local_kar_id === "kar-2"), false);
    assert.deepEqual(page.errors, []);
});

test("a late year-wheel load cannot restore data after logout", async () => {
    const gate = deferred();
    const page = createPage({
        wheels: [wheel()],
        handleRequest: request => request.table === "arshjul" && request.operation === "select"
            ? gate.promise : undefined
    });
    await settle();
    page.changeAuth(null, null);
    gate.resolve(undefined);
    await settle();
    assert.equal(page.stored().length, 0);
    assert.equal(page.elements.get("yearWheelDisplayName").textContent, "Inget årshjul valt");
    assert.equal(page.requests.filter(request => request.operation === "upsert").length, 0);
    assert.deepEqual(page.errors, []);
});
