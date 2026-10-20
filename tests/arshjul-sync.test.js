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

function wheel(id = "wheel", schemaVersion = 3) {
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

function createPage({ wheels = [], arrangements = [], localWheels = [], localArrangements = [], signedIn = true, leader = true, handleRequest, chartMode } = {}) {
    const elements = new Map();
    const listeners = [];
    const requests = [];
    const errors = [];
    const storage = new Map([
        ["gtscout_arshjul", JSON.stringify(localWheels)],
        ["gtscout_arrangemang", JSON.stringify(localArrangements)],
        ["gtscout_arshjul_view", JSON.stringify({ mode: "calendar", year: 2026, chartMode })]
    ]);
    const tables = {
        arshjul: wheels.map(item => ({ id: item.id, name: item.name, data: structuredClone(item) })),
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
                    if (selector === "[data-month-create]") {
                        return [...this.innerHTML.matchAll(/data-month-create="([^"]+)" data-ring-create="([^"]+)"/g)].map(([, date, ringId]) => {
                            const mark = element(`${id} month ${date}${ringId === "arrangements" ? "" : ` ring ${ringId}`}`);
                            mark.dataset.monthCreate = date;
                            mark.dataset.ringCreate = ringId;
                            return mark;
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
        }
    };
    const auth = {
        getClient: () => client,
        getState: () => ({ karId, loading: false }),
        getUser: () => userId ? { id: userId } : null,
        isSignedIn: () => Boolean(userId),
        isOnline: () => true,
        isLeader: () => isLeader,
        onChange(callback) { listeners.push(callback); callback(); }
    };
    const context = vm.createContext({
        window: { GTScoutAuth: auth, location: { search: "" }, addEventListener() {}, confirm: () => true },
        document: {
            readyState: "complete", getElementById: element, querySelectorAll: () => [],
            body: element("body")
        },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value)
        },
        crypto: globalThis.crypto,
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
        requests, errors, elements, tables,
        sync: context.window.GTScoutYearWheelSync,
        arrangements: context.window.GTScoutArrangements,
        stored: () => JSON.parse(storage.get("gtscout_arshjul")),
        preferences: () => JSON.parse(storage.get("gtscout_arshjul_view")),
        changeAuth(nextUserId, nextKarId, nextLeader = isLeader) {
            userId = nextUserId;
            karId = nextKarId;
            isLeader = nextLeader;
            listeners.forEach(callback => callback());
        }
    };
}

function createHelpers() {
    const source = readScript("arshjul.js");
    const context = vm.createContext({ crypto: globalThis.crypto });
    vm.runInContext(source.slice(source.indexOf("    const VIEW_STORAGE_KEY"), source.indexOf("    function readViewPreferences")), context);
    vm.runInContext(source.slice(source.indexOf("    function syncArrangementEvents("), source.indexOf("    function isDepartmentRing(")), context);
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
        assert.equal(row.data.schema_version, 3);
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
    const ringIds = [...fields.matchAll(/name="ring_ids" value="([^"]+)" checked/g)].map(match => match[1]);
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
        page.elements.get(isNew ? "yearWheelMenuAddBtn" : "yearWheelMenuSettingsBtn").handlers.click();
        const markup = page.elements.get("yearWheelFormFields").innerHTML;
        assert.match(markup, /data-config-ring-action="add"/);
        assert.doesNotMatch(markup, /new_ring_name|new_ring_color/);
        const form = page.elements.get("yearWheelForm");
        form.values = {
            name: "Configured wheel", start_month: "3", group_departments: "individual",
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
        assert.match(restored, /value="individual" selected/);
        const selectedIds = [...restored.matchAll(/name="ring_ids" value="([^"]+)" checked/g)].map(match => match[1]);
        form.values = { name: "Configured wheel", start_month: "3", group_departments: "individual", ring_ids: selectedIds };
        form.handlers.submit({ preventDefault() {}, currentTarget: form });
        await settle();
        const saved = page.tables.arshjul[0].data;
        const custom = saved.rings.find(ring => ring.name === "Föräldragrupp");
        assert.ok(custom);
        assert.equal(custom.color, "#123456");
        assert.equal(custom.color_variant, "custom");
        assert.equal(saved.rings.length, isNew ? 1 : 2);
        assert.equal(saved.start_month, 3);
        assert.equal(saved.group_departments, false);
        assert.match(page.elements.get("yearWheelRingList").innerHTML, /Föräldragrupp/);
        assert.deepEqual(page.errors, []);
    });
}

function clickRingAction(page, action, ringId = "") {
    page.elements.get("yearWheelFormFields").handlers.click({
        target: { closest: () => ({ dataset: { configRingAction: action, ringId }, disabled: false }) }
    });
}

test("settings edit and delete ring drafts without losing wheel inputs or saving early", async () => {
    const original = wheel();
    original.rings.push({ id: "custom", name: "Extra", color: "#123456" });
    const page = createPage({ wheels: [original] });
    await settle();
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

test("month sectors open new events on the first day in calendar and operational years", async () => {
    const page = createPage({ wheels: [wheel()] });
    await settle();
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
    const chart = page.elements.get("yearWheelChart");
    assert.equal(chart.querySelectorAll("[data-month-create]").length, 24);
    assert.match(chart.innerHTML, /A 253 253[^>]*A 163 163[^>]*data-ring-create="outer"/);
    assert.match(chart.innerHTML, /A 163 163[^>]*A 64 64[^>]*data-ring-create="inner"/);
    for (const ringId of ["outer", "inner"]) {
        page.elements.get(`yearWheelChart month 2026-05-01 ring ${ringId}`).handlers.click();
        const fields = page.elements.get("yearWheelFormFields").innerHTML;
        assert.match(fields, new RegExp(`<option value="${ringId}" selected>`));
        assert.match(fields, /name="start_date"[^>]*value="2026-05-01"/);
        page.elements.get("closeYearWheelModal").handlers.click();
    }
    assert.deepEqual(page.errors, []);
});

test("center year opens a dialog and changes the personal year without write permission", async () => {
    const page = createPage({ wheels: [wheel()], leader: false });
    await settle();
    const yearButton = page.elements.get("yearWheelChart [data-year-edit]");
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
    assert.equal(page.preferences().chartMode, "overview");
    details.handlers.click();
    assert.equal(chart.classList.contains("year-wheel-chart--overview"), false);
    assert.equal(page.preferences().chartMode, "details");
    assert.equal(page.elements.get("body").classList.contains("year-wheel-page--details"), true);
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
        assert.deepEqual(page.errors, []);
    });
}

test("changed arrangements automatically update wheels without repeated writes", async () => {
    const page = createPage({ wheels: [wheel()], arrangements: [arrangement()] });
    await settle();
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

test("local wheels migrate and sync long texts without a database login", async () => {
    const page = createPage({
        signedIn: false,
        localWheels: [{ ...wheel("offline", 2), local_only: true, local_kar_id: null }],
        localArrangements: [arrangement({ title: "T".repeat(121), notes: "N".repeat(2001) })]
    });
    await settle();
    assert.equal(page.requests.length, 0);
    assert.equal(page.stored()[0].schema_version, 3);
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

test("local migration is uploaded with current arrangement data, not the old pending snapshot", async () => {
    const pending = { ...wheel("local", 2), local_only: true };
    const page = createPage({ localWheels: [pending], arrangements: [arrangement()] });
    await settle();
    const writes = page.requests.filter(request => request.table === "arshjul" && request.operation === "upsert");
    assert.equal(page.tables.arshjul[0].data.schema_version, 3);
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
