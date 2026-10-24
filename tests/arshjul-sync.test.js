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

function wheel(id = "wheel", schemaVersion = 5) {
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

function createPage({ wheels = [], arrangements = [], localWheels = [], localArrangements = [], defaultWheelId = null, signedIn = true, leader = true, admin = false, search = "", handleRequest, chartMode, viewportWidth = 1024, confirm = () => true } = {}) {
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
        arshjul: wheels.map(item => ({ id: item.id, kar_id: "kar-1", name: item.name, share_token: item.share_token || null, data: structuredClone(item) })),
        arrangemang: arrangements.map(item => ({ id: item.id, data: structuredClone(item) })),
        kar_arshjul_settings: defaultWheelId ? [{ kar_id: "kar-1", default_wheel_id: defaultWheelId }] : []
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
                    if (["[data-series-edit]", "[data-restore-occurrence]"].includes(selector)) {
                        const attribute = selector.slice(1, -1);
                        const datasetKey = attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
                        return [...this.innerHTML.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))].map(([, value]) => {
                            const button = element(`${id} ${attribute} ${value}`);
                            button.dataset[datasetKey] = value;
                            return button;
                        });
                    }
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
        if (request.operation === "select") {
            const rows = tables[request.table] || [];
            const selectedRows = request.table === "kar_arshjul_settings"
                ? rows.filter(row => Object.entries(request.filters || {}).every(([key, value]) => row[key] === value))
                : rows;
            return { data: structuredClone(selectedRows) };
        }
        const rows = tables[request.table] || (tables[request.table] = []);
        const index = rows.findIndex(row => request.table === "kar_arshjul_settings"
            ? row.kar_id === request.row?.kar_id
            : row.id === (request.row?.id || request.id));
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
                eq(key, value) { request[key] = value; request.filters = { ...request.filters, [key]: value }; return this; },
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
             addEventListener(name, callback) { windowListeners[name] = callback; }, confirm
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
    for (const name of ["participants.js", "arrangemang-sync.js", "arshjul-sync.js", "arshjul-recurrence.js", "arshjul.js"]) {
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
    const page = createPage({ wheels: [{ ...wheel(), share_token: "public-token" }], leader: false });
    await settle();
    const printButton = page.elements.get("yearWheelMenuPrintBtn");
    assert.equal(printButton.disabled, false);
    assert.equal(page.elements.get("yearWheelMenuDefaultBtn").classList.contains("hidden"), true);
    for (const mode of ["wheel", "list"]) {
        printButton.handlers.click();
        assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Skriv ut årshjul");
        assert.match(page.elements.get("yearWheelFormFields").innerHTML, /class="year-wheel-dialog-help" aria-label="Hjälp om utskrift"/);
        const form = page.elements.get("yearWheelForm");
        form.values = { print_layout: mode };
        form.handlers.submit({ preventDefault() {}, currentTarget: form });
        assert.equal(page.printCalls.at(-1).mode, mode);
        assert.equal(page.printCalls.at(-1).wheel.id, "wheel");
        assert.equal(page.printCalls.at(-1).qrUrl, "https://example.test/arshjul.html?share=public-token");
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

test("the configured troop default wheel opens first and admins can change it", async () => {
    const page = createPage({
        wheels: [
            { ...wheel("wheel-a"), name: "Alpha" },
            { ...wheel("wheel-b"), name: "Beta" }
        ],
        defaultWheelId: "wheel-b",
        admin: true,
        leader: false
    });
    await settle();
    await settle();

    assert.equal(page.elements.get("yearWheelSelect").value, "wheel-b");
    assert.equal(page.elements.get("yearWheelCount").textContent, "2 av 2");
    assert.equal(page.elements.get("yearWheelSelect").attributes["aria-label"], "Välj årshjul: Beta, 2 av 2");
    const defaultButton = page.elements.get("yearWheelMenuDefaultBtn");
    assert.equal(defaultButton.classList.contains("hidden"), false);
    defaultButton.handlers.click();
    assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Välj standardårshjul");
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /option value="wheel-b" selected/);

    const form = page.elements.get("yearWheelForm");
    form.values = { default_wheel_id: "wheel-a" };
    await form.handlers.submit({ preventDefault() {}, currentTarget: form });
    assert.equal(page.tables.kar_arshjul_settings[0].default_wheel_id, "wheel-a");
    assert.equal(page.elements.get("yearWheelSelect").value, "wheel-a");
    assert.equal(page.elements.get("yearWheelCount").textContent, "1 av 2");
    assert.equal(page.elements.get("yearWheelSelect").attributes["aria-label"], "Välj årshjul: Alpha, 1 av 2");
    assert.deepEqual(page.errors, []);

    const fallback = createPage({
        wheels: [{ ...wheel("wheel-a"), name: "Alpha" }, { ...wheel("wheel-b"), name: "Beta" }],
        defaultWheelId: "deleted-wheel"
    });
    await settle();
    assert.equal(fallback.elements.get("yearWheelSelect").value, "wheel-a");
});

test("year wheel selector stays with the chart outside the hideable filters", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "arshjul.html"), "utf8");
    const filters = html.indexOf('id="yearWheelToolbar"');
    const selector = html.indexOf('id="yearWheelSelect"');
    const chart = html.indexOf('id="yearWheelChartCard"');
    assert.ok(selector > chart);
    assert.ok(selector > html.indexOf("</section>", filters));
    assert.match(html, /id="yearWheelCount"/);
    assert.match(html, /<h2 class="year-wheel-selector">[^]*?<select id="yearWheelSelect"/);
    assert.doesNotMatch(html, /id="yearWheelDisplayName"/);
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
    const context = vm.createContext({ crypto: globalThis.crypto, window: {} });
    vm.runInContext(readScript("arshjul-recurrence.js"), context);
    vm.runInContext(source.slice(source.indexOf("    const VIEW_STORAGE_KEY"), source.indexOf("    function readViewPreferences")), context);
    vm.runInContext(source.slice(source.indexOf("    function syncArrangementEvents("), source.indexOf("    function getDisplayedRings(")), context);
    return context;
}

function recurringWheel(fields = {}) {
    return {
        ...wheel(),
        events: [{
            id: "cleanup", ring_id: "arrangements", title: "Städdag", start_date: "2026-01-01", end_date: "2026-01-01",
            responsible: "Anna", location: "Stugan", notes: "",
            recurrence: { type: "yearly_week", week: 46, weekday: 7 }, exceptions: {}, ...fields
        }]
    };
}

function selectYear(page, year) {
    const input = page.elements.get("yearWheelYear");
    input.value = String(year);
    input.handlers.change();
}

function openOccurrence(page, date, scope = "occurrence") {
    const chart = page.elements.get("yearWheelChart");
    const mark = chart.querySelectorAll("[data-event-edit]").find(item => item.dataset.eventEdit === `cleanup@${date}`);
    assert.ok(mark, `Expected visible occurrence ${date}`);
    mark.handlers.click();
    if (!page.elements.get("yearWheelEditScopeModal").classList.contains("hidden")) {
        page.elements.get(scope === "series" ? "yearWheelEditSeriesBtn" : "yearWheelEditOccurrenceBtn").handlers.click();
    }
}

async function saveEvent(page, values) {
    if (values.recurrence_type !== undefined) {
        const fields = page.elements.get("yearWheelFormFields");
        fields.querySelector('[name="start_date"]').value = values.start_date;
        fields.querySelector("[data-edit-recurrence]").handlers.click();
        const recurrenceForm = page.elements.get("yearWheelRecurrenceForm");
        recurrenceForm.values = values;
        recurrenceForm.handlers.submit({ preventDefault() {}, currentTarget: recurrenceForm });
        if (!page.elements.get("yearWheelRecurrenceModal").classList.contains("hidden")) return;
    }
    const form = page.elements.get("yearWheelForm");
    form.values = values;
    await form.handlers.submit({ preventDefault() {}, currentTarget: form });
    await settle();
}

test("creating a recurring event saves a series, not generated occurrences, and skips next-year copies", async () => {
    const page = createPage({ wheels: [wheel()] });
    await settle();
    page.unlockEditing();
    page.elements.get("addYearWheelEventBtn").handlers.click();
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /name="recurring" type="checkbox"/);
    assert.doesNotMatch(page.elements.get("yearWheelFormFields").innerHTML, /name="recurrence_type"/);
    await saveEvent(page, {
        title: "Städdag", ring_id: "arrangements", start_date: "2026-01-01", end_date: "2026-01-01",
        recurrence_type: "yearly_week", recurrence_week: "46", recurrence_weekday: "7"
    });
    const saved = page.tables.arshjul[0].data;
    assert.equal(saved.events.length, 1);
    assert.equal(saved.schema_version, 6);
    assert.equal(saved.recurrence_format, 1);
    assert.deepEqual(saved.events[0].recurrence, { type: "yearly_week", weekday: 7, week: 46 });
    assert.match(page.elements.get("yearWheelEvents").innerHTML, /Återkommande/);
    const mark = page.elements.get("yearWheelChart").querySelectorAll("[data-event-edit]")[0];
    assert.match(mark.dataset.eventEdit, /@2026-11-15$/);
    mark.handlers.click();
    page.elements.get("yearWheelEditOccurrenceBtn").handlers.click();
    assert.equal(page.elements.get("copyYearWheelEventBtn").classList.contains("hidden"), true);
    page.elements.get("copyYearWheelEventBtn").handlers.click();
    assert.equal(page.tables.arshjul[0].data.events.length, 1);
    page.elements.get("closeYearWheelModal").handlers.click();
    page.elements.get("yearWheelMenuCopyEventsBtn").handlers.click();
    assert.doesNotMatch(page.elements.get("yearWheelFormFields").innerHTML, /name="copy_event_ids"/);
    assert.equal(page.errors.length, 0);
});

test("recurrence checkbox opens a separate dialog and cancelling restores the unchecked choice without losing event inputs", async () => {
    const page = createPage({ wheels: [wheel()] });
    await settle();
    page.unlockEditing();
    page.elements.get("addYearWheelEventBtn").handlers.click();
    const fields = page.elements.get("yearWheelFormFields");
    const title = fields.querySelector('[name="title"]');
    const start = fields.querySelector('[name="start_date"]');
    const checkbox = fields.querySelector('[name="recurring"]');
    title.value = "Oskriven städdag";
    start.value = "2027-01-01";
    const before = page.requests.filter(item => item.operation === "upsert").length;
    for (const cancel of [
        () => page.elements.get("cancelYearWheelRecurrenceBtn").handlers.click(),
        () => page.elements.get("closeYearWheelRecurrenceModal").handlers.click(),
        () => page.elements.get("yearWheelRecurrenceModal").handlers.click({ target: page.elements.get("yearWheelRecurrenceModal") }),
        () => page.elements.get("yearWheelRecurrenceModal").handlers.keydown({ key: "Escape", preventDefault() {} })
    ]) {
        checkbox.checked = true;
        checkbox.handlers.change({ target: checkbox });
        assert.equal(page.elements.get("yearWheelModal").classList.contains("hidden"), true);
        assert.equal(page.elements.get("yearWheelRecurrenceModal").classList.contains("hidden"), false);
        assert.match(page.elements.get("yearWheelRecurrenceFields").innerHTML, /name="recurrence_type"/);
        assert.match(page.elements.get("yearWheelRecurrenceFields").innerHTML, /value="yearly_weekday" selected/);
        const ruleOptions = page.elements.get("yearWheelRecurrenceFields").innerHTML.match(/name="recurrence_type">([^]*?)<\/select>/)[1];
        assert.deepEqual([...ruleOptions.matchAll(/value="([^"]+)"/g)].map(([, value]) => value),
            ["yearly_date", "yearly_weekday", "yearly_week", "monthly_date", "monthly_weekday", "weekly"]);
        assert.match(page.elements.get("yearWheelRecurrenceFields").innerHTML, /class="year-wheel-dialog-help" aria-label="Hjälp om upprepning"/);
        cancel();
        assert.equal(page.elements.get("yearWheelModal").classList.contains("hidden"), false);
        assert.equal(page.elements.get("yearWheelRecurrenceModal").classList.contains("hidden"), true);
        assert.equal(checkbox.checked, false);
        assert.equal(title.value, "Oskriven städdag");
        assert.equal(start.value, "2027-01-01");
    }
    assert.equal(page.requests.filter(item => item.operation === "upsert").length, before);
});

test("applying a rule updates only the event draft and cancelling later rule edits preserves it", async () => {
    const page = createPage({ wheels: [wheel()] });
    await settle();
    page.unlockEditing();
    page.elements.get("addYearWheelEventBtn").handlers.click();
    const fields = page.elements.get("yearWheelFormFields");
    fields.querySelector('[name="start_date"]').value = "2026-01-01";
    const checkbox = fields.querySelector('[name="recurring"]');
    checkbox.checked = true;
    checkbox.handlers.change({ target: checkbox });
    const form = page.elements.get("yearWheelRecurrenceForm");
    form.values = { recurrence_type: "yearly_week", recurrence_week: "46", recurrence_weekday: "7" };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    assert.equal(checkbox.checked, true);
    assert.match(fields.querySelector("[data-recurrence-choice-summary]").textContent, /söndag vecka 46/);
    assert.equal(page.tables.arshjul[0].data.events.length, 0);
    fields.querySelector("[data-edit-recurrence]").handlers.click();
    page.elements.get("cancelYearWheelRecurrenceBtn").handlers.click();
    assert.equal(checkbox.checked, true);
    assert.match(fields.querySelector("[data-recurrence-choice-summary]").textContent, /söndag vecka 46/);
    await saveEvent(page, {
        title: "Städdag", ring_id: "arrangements", start_date: "2026-01-01", end_date: "2026-01-01"
    });
    assert.equal(page.tables.arshjul[0].data.events[0].recurrence.week, 46);
});

test("unchecking recurring removes the rule when the event is saved", async () => {
    const page = createPage({ wheels: [recurringWheel()] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelEvents").querySelectorAll("[data-series-edit]")[0].handlers.click();
    const fields = page.elements.get("yearWheelFormFields");
    const checkbox = fields.querySelector('[name="recurring"]');
    assert.equal(checkbox.checked, true);
    checkbox.checked = false;
    checkbox.handlers.change({ target: checkbox });
    assert.equal(fields.querySelector("[data-edit-recurrence]").classList.contains("hidden"), true);
    assert.equal(page.tables.arshjul[0].data.events[0].recurrence.week, 46);
    await saveEvent(page, {
        title: "Städdag", ring_id: "arrangements", start_date: "2026-11-15", end_date: "2026-11-15"
    });
    assert.equal(page.tables.arshjul[0].data.events[0].recurrence, null);
    assert.deepEqual(page.tables.arshjul[0].data.events[0].exceptions, {});
});

test("moving a single year persists an exception through reload without changing following years", async () => {
    const page = createPage({ wheels: [recurringWheel()] });
    await settle();
    page.unlockEditing();
    selectYear(page, 2027);
    openOccurrence(page, "2027-11-21");
    await saveEvent(page, {
        title: "Städdag", start_date: "2027-11-13", end_date: "2027-11-14",
        responsible: "Anna", location: "Ny plats", notes: ""
    });
    const saved = page.tables.arshjul[0].data;
    assert.equal(saved.events.length, 1);
    assert.equal(saved.events[0].start_date, "2026-01-01");
    assert.deepEqual(saved.events[0].exceptions, {
        "2027-11-21": { start_date: "2027-11-13", end_date: "2027-11-14", location: "Ny plats" }
    });
    assert.match(page.elements.get("yearWheelEvents").innerHTML, /Ändrat tillfälle/);
    assert.match(page.elements.get("yearWheelEvents").innerHTML, /Ny plats/);
    openOccurrence(page, "2027-11-21");
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /name="start_date"[^>]*value="2027-11-13"/);
    const movedMarkup = page.elements.get("yearWheelFormFields").innerHTML;
    assert.match(movedMarkup, /Flyttad från 21 november 2027/);
    assert.ok(movedMarkup.indexOf("Flyttad från") > movedMarkup.indexOf('name="end_date"'));
    assert.ok(movedMarkup.indexOf("Flyttad från") < movedMarkup.indexOf('name="responsible"'));
    assert.doesNotMatch(movedMarkup, /Ursprungligt tillfälle/);
    page.elements.get("closeYearWheelModal").handlers.click();
    const reloaded = createPage({ wheels: [saved] });
    await settle();
    selectYear(reloaded, 2027);
    assert.match(reloaded.elements.get("yearWheelEvents").innerHTML, /13 nov/);
    selectYear(reloaded, 2028);
    assert.match(reloaded.elements.get("yearWheelEvents").innerHTML, /19 nov/);
    assert.doesNotMatch(reloaded.elements.get("yearWheelEvents").innerHTML, /Ny plats/);
    assert.equal(reloaded.errors.length, 0);
});

test("recurring occurrence asks scope before opening either editor and cancellation leaves data unchanged", async () => {
    const page = createPage({ wheels: [recurringWheel({
        exceptions: { "2026-11-15": { start_date: "2026-11-07", end_date: "2026-11-07", location: "Annan plats" } }
    })] });
    await settle();
    page.unlockEditing();
    const modal = page.elements.get("yearWheelEditScopeModal");
    const clickOccurrence = () => page.elements.get("yearWheelChart").querySelectorAll("[data-event-edit]")[0].handlers.click();
    const before = JSON.stringify(page.tables.arshjul);
    for (const cancel of [
        () => page.elements.get("cancelYearWheelEditScopeBtn").handlers.click(),
        () => page.elements.get("closeYearWheelEditScopeModal").handlers.click(),
        () => modal.handlers.click({ target: modal }),
        () => modal.handlers.keydown({ key: "Escape", preventDefault() {} })
    ]) {
        clickOccurrence();
        assert.equal(modal.classList.contains("hidden"), false);
        assert.match(page.elements.get("yearWheelEditScopeDescription").textContent, /Städdag.*7 november 2026/);
        assert.equal(page.elements.get("yearWheelModal").classList.contains("hidden"), true);
        cancel();
        assert.equal(modal.classList.contains("hidden"), true);
        assert.equal(page.elements.get("yearWheelModal").classList.contains("hidden"), true);
    }
    clickOccurrence();
    page.elements.get("yearWheelEditOccurrenceBtn").handlers.click();
    assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Redigera tillfälle");
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /name="start_date"[^>]*value="2026-11-07"/);
    assert.doesNotMatch(page.elements.get("yearWheelFormFields").innerHTML, /recurrence_scope|name="recurring"/);
    page.elements.get("closeYearWheelModal").handlers.click();
    clickOccurrence();
    page.elements.get("yearWheelEditSeriesBtn").handlers.click();
    assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Redigera serie");
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /name="start_date"[^>]*value="2026-01-01"/);
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /name="recurring"/);
    assert.doesNotMatch(page.elements.get("yearWheelFormFields").innerHTML, /recurrence_scope/);
    assert.equal(JSON.stringify(page.tables.arshjul), before);
});

test("cancelled occurrences stay absent and can be restored from the series manager", async () => {
    const page = createPage({ wheels: [recurringWheel()] });
    await settle();
    page.unlockEditing();
    openOccurrence(page, "2026-11-15");
    assert.equal(page.elements.get("deleteYearWheelItemBtn").textContent, "Ställ in tillfället");
    assert.equal(page.elements.get("deleteYearWheelItemBtn").attributes["aria-label"], "Ställ in tillfället");
    assert.equal(page.elements.get("deleteYearWheelItemBtn").classList.contains("year-wheel-delete-button--text"), true);
    page.elements.get("deleteYearWheelItemBtn").handlers.click();
    await settle();
    assert.deepEqual(page.tables.arshjul[0].data.events[0].exceptions, { "2026-11-15": { cancelled: true } });
    const list = page.elements.get("yearWheelEvents");
    assert.match(list.innerHTML, /Inga händelser/);
    list.querySelectorAll("[data-series-edit]")[0].handlers.click();
    const fields = page.elements.get("yearWheelFormFields");
    assert.match(fields.innerHTML, /Inställt/);
    fields.querySelectorAll("[data-restore-occurrence]")[0].handlers.click();
    await settle();
    assert.deepEqual(page.tables.arshjul[0].data.events[0].exceptions, {});
    assert.match(list.innerHTML, /15 nov/);
    assert.equal(page.errors.length, 0);
});

test("whole-series text edits preserve patches, while rule edits require confirmation before removing exceptions", async () => {
    let allow = false;
    const confirmations = [];
    const page = createPage({
        wheels: [recurringWheel({ exceptions: { "2027-11-21": { cancelled: true } } })],
        confirm: message => { confirmations.push(message); return allow; }
    });
    await settle();
    page.unlockEditing();
    openOccurrence(page, "2026-11-15", "series");
    const deleteButton = page.elements.get("deleteYearWheelItemBtn");
    assert.match(deleteButton.innerHTML, /<svg/);
    assert.equal(deleteButton.classList.contains("year-wheel-delete-button--text"), false);
    assert.equal(deleteButton.attributes["aria-label"], "Ta bort hela serien");
    assert.equal(deleteButton.attributes.title, "Ta bort hela serien");
    const values = {
        title: "Gemensam städdag", ring_id: "arrangements", start_date: "2026-01-01", end_date: "2026-01-01",
        responsible: "Anna", location: "Stugan", notes: "", recurrence_type: "yearly_week", recurrence_week: "46", recurrence_weekday: "7"
    };
    await saveEvent(page, values);
    assert.equal(confirmations.length, 0);
    assert.equal(page.tables.arshjul[0].data.events[0].exceptions["2027-11-21"].cancelled, true);
    page.elements.get("yearWheelEvents").querySelectorAll("[data-series-edit]")[0].handlers.click();
    await saveEvent(page, { ...values, recurrence_week: "45", recurrence_weekday: "6" });
    assert.equal(confirmations.length, 1);
    assert.equal(page.tables.arshjul[0].data.events[0].recurrence.week, 46);
    allow = true;
    await saveEvent(page, { ...values, recurrence_week: "45", recurrence_weekday: "6" });
    assert.equal(page.tables.arshjul[0].data.events[0].recurrence.week, 45);
    assert.deepEqual(page.tables.arshjul[0].data.events[0].exceptions, {});
});

test("only moved occurrences show their original date beside the date fields in read-only views", async () => {
    for (const [override, moved] of [
        [{ notes: "Ta med handskar" }, false],
        [{ start_date: "2026-11-15", end_date: "2026-11-16" }, false],
        [{ start_date: "2026-11-07", end_date: "2026-11-07" }, true]
    ]) {
        const page = createPage({ wheels: [recurringWheel({ exceptions: { "2026-11-15": override } })], leader: false });
        await settle();
        openOccurrence(page, "2026-11-15");
        const markup = page.elements.get("yearWheelFormFields").innerHTML;
        assert.equal(markup.includes("Flyttad från 15 november 2026"), moved);
        assert.doesNotMatch(markup, /Ursprungligt tillfälle|Tillfället har ett undantag/);
        assert.equal(page.requests.filter(item => item.operation === "upsert").length, 0);
    }
});

test("public recurring wheels calculate occurrences read-only without uploading generated events", async () => {
    const original = { ...recurringWheel(), share_token: "recurring-public" };
    const page = createPage({ wheels: [original], signedIn: false, leader: false, search: "?share=recurring-public" });
    await settle();
    openOccurrence(page, "2026-11-15");
    assert.equal(page.elements.get("yearWheelEditScopeModal").classList.contains("hidden"), true);
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /söndag vecka 46/);
    assert.doesNotMatch(page.elements.get("yearWheelFormFields").innerHTML, /Ursprungligt tillfälle|Flyttad från|Tillfället har ett undantag/);
    assert.doesNotMatch(page.elements.get("yearWheelFormFields").innerHTML, /name="recurrence_type"/);
    assert.equal(page.elements.get("deleteYearWheelItemBtn").classList.contains("hidden"), true);
    assert.equal(page.requests.filter(item => item.operation === "upsert").length, 0);
});

test("invalid recurrence input is shown as a form error, not saved as an ordinary event", async () => {
    const page = createPage({ wheels: [wheel()] });
    await settle();
    page.unlockEditing();
    page.elements.get("addYearWheelEventBtn").handlers.click();
    const values = { title: "Städdag", ring_id: "arrangements", start_date: "2026-01-01", end_date: "2026-01-01",
        recurrence_type: "yearly_week", recurrence_week: "54", recurrence_weekday: "7" };
    await saveEvent(page, values);
    assert.match(page.elements.get("yearWheelRecurrenceMessage").textContent, /veckonummer/);
    assert.equal(page.tables.arshjul[0].data.events.length, 0);
    await saveEvent(page, { ...values, recurrence_week: "46", recurrence_until: "2025-12-31" });
    assert.match(page.elements.get("yearWheelRecurrenceMessage").textContent, /slutdatum/);
    assert.equal(page.tables.arshjul[0].data.events.length, 0);
});

test("invalid or unsupported saved recurrence data is reported and cannot be overwritten", async () => {
    for (const original of [recurringWheel({ recurrence: { type: "unknown" } }), { ...recurringWheel(), schema_version: 7 }]) {
        const page = createPage({ wheels: [original] });
        await settle();
        assert.match(page.elements.get("yearWheelSourceStatus").textContent, /Kunde inte läsa årshjulets data/);
        assert.equal(page.elements.get("addYearWheelEventBtn").disabled, true);
        assert.equal(page.errors.length, 1);
        assert.equal(page.requests.filter(item => item.operation === "upsert").length, 0);
    }
});

test("wheel source chains preserve recurrence and exceptions instead of materializing a single year", () => {
    const helpers = createHelpers();
    const source = recurringWheel({ exceptions: { "2027-11-21": { start_date: "2027-11-13", end_date: "2027-11-13" } } });
    const target = { ...wheel("target"), rings: [{
        id: "target-ring", name: "Samlat", color: "#123456",
        sync_from_wheel: { wheel_id: source.id, ring_ids: ["arrangements"] }
    }] };
    const result = helpers.syncWheelSources([target, source].map(item => helpers.normalizeWheel(item)));
    assert.equal(result[0].events.length, 1);
    const copy = result[0].events[0];
    assert.deepEqual(JSON.parse(JSON.stringify(copy.recurrence)), source.events[0].recurrence);
    assert.deepEqual(JSON.parse(JSON.stringify(copy.exceptions)), source.events[0].exceptions);
    assert.equal(copy.source_wheel_event_id, "cleanup");
    assert.deepEqual(helpers.syncWheelSources(result), result);
    const range = { start: new Date("2027-01-01T00:00:00Z"), end: new Date("2027-12-31T00:00:00Z") };
    const occurrences = helpers.window.GTScoutYearWheelRecurrence.expand(result[0].events, range);
    assert.equal(occurrences.length, 1);
    assert.equal(occurrences[0].start_date, "2027-11-13");
});

function linkedWheels() {
    const source = {
        ...wheel("board"),
        rings: [
            { id: "chair", name: "Ordförande", color: "#123456" },
            { id: "treasurer", name: "Kassör", color: "#abcdef", parent_id: "chair" },
            { id: "other", name: "Övrigt", color: "#abcdef" }
        ],
        events: [
            { id: "meeting", ring_id: "chair", title: "Styrelsemöte", start_date: "2026-10-20", end_date: "2026-10-21", responsible: "Anna", notes: "Underlag" },
            { id: "budget", ring_id: "treasurer", title: "Budget", start_date: "2027-01-15", end_date: "2027-01-15" },
            { id: "private", ring_id: "other", title: "Inte vald", start_date: "2026-10-21", end_date: "2026-10-21" }
        ]
    };
    const target = {
        ...wheel("troop"),
        rings: [{
            id: "board-summary", name: "Styrelse", color: "#398a86",
            sync_from_wheel: { wheel_id: "board", ring_ids: ["chair"], include_children: true }
        }],
        events: [{ id: "own", ring_id: "board-summary", title: "Egen händelse", start_date: "2026-10-01", end_date: "2026-10-01" }]
    };
    return { source, target };
}

test("wheel chart marks every sync type with an overlay and explains sources on hover and focus", async () => {
    const original = wheel();
    original.rings = [{ id: "mixed", name: "Styrelse", color: "#398a86", sync_arrangements: false }];
    original.events = [
        { id: "own", title: "Egen", ring_id: "mixed", start_date: "2026-02-01", end_date: "2026-02-01" },
        { id: "wheel-event", title: "Hämtat möte", ring_id: "mixed", start_date: "2026-03-01", end_date: "2026-03-01", source_wheel_id: "board", source_wheel_name: "Styrelse <2026>", source_wheel_ring_name: "Möten" },
        { id: "arrangement-event", title: "Hajk", ring_id: "mixed", start_date: "2026-04-01", end_date: "2026-04-01", source_arrangement_id: "arrangement" },
        { id: "planning-event", title: "Avdelningsmöte", ring_id: "mixed", start_date: "2026-05-01", end_date: "2026-05-01", source_planning_id: "plan" }
    ];
    const page = createPage({ wheels: [original] });
    await settle();
    const chart = page.elements.get("yearWheelChart");
    assert.equal((chart.innerHTML.match(/class="year-wheel-event-sync-overlay"/g) || []).length, 3);
    assert.match(chart.innerHTML, /year-wheel-sync-legend/);
    assert.match(chart.innerHTML, /Hämtad från Styrelse &lt;2026&gt; → Möten/);
    assert.match(chart.innerHTML, /Hämtad från arrangemang/);
    assert.match(chart.innerHTML, /Hämtad från avdelningsmöten/);
    assert.match(chart.innerHTML, /Egen händelse/);
    const own = chart.innerHTML.split('data-event-edit="own"')[1].split("</g>")[0];
    assert.doesNotMatch(own, /sync-overlay/);
    const mark = chart.querySelectorAll("[data-event-edit]").find(item => item.dataset.eventEdit === "wheel-event");
    const info = chart.querySelector("[data-chart-event-info]");
    mark.handlers.focus();
    assert.match(info.textContent, /Hämtad från Styrelse <2026> → Möten/);
    mark.handlers.mouseenter();
    mark.handlers.mouseleave();
    assert.match(info.textContent, /Hämtad från/);
    mark.handlers.blur();
    assert.equal(info.textContent, "");
    mark.handlers.mouseenter();
    assert.match(info.textContent, /Hämtad från/);
    mark.handlers.mouseleave();
    assert.equal(info.textContent, "");
});

test("wheel chart omits the source legend when only own events are visible", async () => {
    const original = wheel();
    original.events = [{ id: "own", title: "Egen", ring_id: "arrangements", start_date: "2026-02-01", end_date: "2026-02-01" }];
    const page = createPage({ wheels: [original] });
    await settle();
    assert.doesNotMatch(page.elements.get("yearWheelChart").innerHTML, /class="year-wheel-sync-legend"/);
});

test("wheel sources merge selected rings and children across years and converge without duplicates", () => {
    const helpers = createHelpers();
    const { source, target } = linkedWheels();
    const input = [target, source].map(item => helpers.normalizeWheel(item));
    const original = JSON.stringify(input);
    const updated = helpers.syncWheelSources(input);
    const events = updated[0].events;
    assert.equal(events.length, 3);
    assert.equal(events[0].id, "own");
    assert.deepEqual(Array.from(events.slice(1), item => item.source_wheel_event_id), ["meeting", "budget"]);
    assert.equal(events[1].responsible, "Anna");
    assert.equal(events[1].notes, "Underlag");
    assert.equal(events[1].ring_id, "board-summary");
    assert.equal(events[1].color_variant, "ring");
    assert.equal(events[1].source_arrangement_id, "");
    assert.equal(events[1].source_planning_id, "");
    assert.equal(events[1].source_wheel_ring_name, "Ordförande");
    assert.equal(JSON.stringify(input), original, "Sources must not be mutated");
    assert.equal(helpers.syncWheelSources(updated)[0], updated[0], "Unchanged sync must preserve identity");
    const changed = helpers.normalizeWheel({ ...updated[1], events: [{ ...source.events[0], title: "Flyttat", responsible: "", notes: "" }] });
    const refreshed = helpers.syncWheelSources([updated[0], changed])[0];
    assert.equal(refreshed.events.length, 2, "Deleted source events must disappear, but own events remain");
    assert.equal(refreshed.events[1].id, events[1].id);
    assert.equal(refreshed.events[1].title, "Flyttat");
    assert.equal(refreshed.events[1].responsible, "");
    assert.equal(refreshed.events[1].notes, "");
});

test("wheel sources support multiple explicit rings, exclude new rings and honor include-children", () => {
    const helpers = createHelpers();
    const { source, target } = linkedWheels();
    target.rings[0].sync_from_wheel.include_children = false;
    let result = helpers.syncWheelSources([target, source].map(item => helpers.normalizeWheel(item)));
    assert.equal(result[0].events.length, 2);
    target.rings[0].sync_from_wheel.ring_ids = ["chair", "treasurer"];
    result = helpers.syncWheelSources([target, source].map(item => helpers.normalizeWheel(item)));
    assert.equal(result[0].events.length, 3);
    assert.equal(result[0].events.some(item => item.title === "Inte vald"), false);
});

test("child inclusion is independent per selected source root and legacy settings are preserved", () => {
    const helpers = createHelpers();
    const { source, target } = linkedWheels();
    source.rings.push({ id: "other-child", name: "Annan underring", parent_id: "other", color: "#123456" });
    source.events.push({ id: "other-event", ring_id: "other-child", title: "Annan aktivitet", start_date: "2026-10-20", end_date: "2026-10-20" });
    const settings = target.rings[0].sync_from_wheel;
    settings.ring_ids = ["chair", "other"];
    settings.include_children_ring_ids = ["chair"];
    let result = helpers.syncWheelSources([target, source].map(item => helpers.normalizeWheel(item)));
    assert.equal(result[0].events.some(item => item.title === "Budget"), true);
    assert.equal(result[0].events.some(item => item.title === "Annan aktivitet"), false);
    settings.include_children_ring_ids = ["other"];
    result = helpers.syncWheelSources([target, source].map(item => helpers.normalizeWheel(item)));
    assert.equal(result[0].events.some(item => item.title === "Budget"), false);
    assert.equal(result[0].events.some(item => item.title === "Annan aktivitet"), true);
    delete settings.include_children_ring_ids;
    const migrated = helpers.normalizeWheel(target);
    assert.deepEqual(Array.from(migrated.rings[0].sync_from_wheel.include_children_ring_ids), ["chair", "other"]);
    assert.equal(helpers.normalizeWheel(migrated).rings[0].sync_from_wheel.include_children_ring_ids.length, 2);
});

test("source selection only offers individual child controls for root rings", () => {
    const helpers = createHelpers();
    const { source } = linkedWheels();
    source.rings = [source.rings[0], source.rings[2], source.rings[1]];
    vm.runInContext(readScript("arshjul.js").slice(
        readScript("arshjul.js").indexOf("    function renderWheelSourceSelection("),
        readScript("arshjul.js").indexOf("    function openRingForm(")), helpers);
    helpers.inputWheel = source;
    vm.runInContext("wheels = [inputWheel]", helpers);
    const markup = helpers.renderWheelSourceSelection("board", ["chair", "treasurer"], ["chair"]);
    assert.match(markup, /data-source-children="chair"><label[^>]*><input[^>]*name="source_child_ring_ids" value="chair"[^>]* checked/);
    assert.match(markup, /Ta med underringar till Ordförande/);
    assert.doesNotMatch(markup, /data-source-children="treasurer"/);
    assert.match(markup, /data-source-children="other" hidden/);
    assert.doesNotMatch(markup, /name="source_include_children"/);
    assert.match(markup, /class="year-wheel-source-row year-wheel-source-row--child"/);
    assert.match(markup, /<span>Ta med underringar<\/span>/);
    assert.doesNotMatch(markup, /<span>Ta med underringar till/);
    assert.doesNotMatch(markup, /<span>Ordförande · Kassör<\/span>/);
    assert.ok(markup.indexOf('value="treasurer"') < markup.indexOf('value="other"'),
        "Children must be grouped directly after their parent regardless of storage order");
    const inheritedOnly = helpers.renderWheelSourceSelection("board", ["chair"], ["chair"], "Styrelse");
    assert.match(inheritedOnly, /name="source_ring_ids" value="treasurer" checked disabled/);
    assert.doesNotMatch(inheritedOnly, /type="hidden" name="source_ring_ids" value="treasurer"/);
    assert.match(inheritedOnly, /Händelserna samlas i målringen Styrelse/);
    assert.match(helpers.renderWheelSourceSelection("board", [], []), /Inga ringar valda/);
});

test("source lists disable all ring choices for direct and indirect circular wheel links", () => {
    const helpers = createHelpers();
    const { source, target } = linkedWheels();
    const script = readScript("arshjul.js");
    vm.runInContext(script.slice(script.indexOf("    function renderWheelSourceSelection("),
        script.indexOf("    function openRingForm(")), helpers);
    const bridge = {
        ...wheel("bridge"),
        rings: [{ id: "bridge-ring", name: "Samlat", sync_from_wheel: { wheel_id: "troop", ring_ids: ["board-summary"] } }]
    };
    helpers.inputWheels = [source, target, bridge];
    vm.runInContext("wheels = inputWheels", helpers);
    for (const sourceId of ["troop", "bridge", "board"]) {
        const markup = helpers.renderWheelSourceSelection(sourceId, [], [], "Ordförande", "board");
        assert.match(markup, /year-wheel-source-options--blocked/);
        assert.match(markup, /<fieldset[^>]* disabled/);
        assert.match(markup, /hämtar händelser från varandra/);
        assert.doesNotMatch(markup, /<strong>Hämtas:/);
    }
    const allowed = helpers.renderWheelSourceSelection("board", [], [], "Styrelse", "troop");
    assert.doesNotMatch(allowed, /year-wheel-source-options--blocked/);
    assert.doesNotMatch(allowed, /<fieldset[^>]* disabled/);
    assert.match(allowed, /<strong>Hämtas:/);
});

test("wheel settings discreetly label sync sources on roots, children and empty rings", async () => {
    const { source, target } = linkedWheels();
    target.rings.push(
        { id: "arrangements", name: "Arrangemang", color: "#123456", sync_arrangements: true },
        { id: "meetings", name: "Möten", parent_id: "board-summary", color: "#123456", sync_meetings_from_department: true },
        { id: "plain", name: "Vanlig ring", color: "#123456" },
        { id: "missing", name: "Saknad källa", color: "#123456", sync_from_wheel: { wheel_id: "missing-source", ring_ids: ["ring"] } }
    );
    source.name = 'Styrelse <2026>';
    const page = createPage({ wheels: [target, source] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const markup = page.elements.get("yearWheelFormFields").innerHTML;
    assert.match(markup, /Styrelse<span class="year-wheel-ring-sync-label">Synkar från årshjul: Styrelse &lt;2026&gt;<\/span>/);
    assert.match(markup, /Arrangemang<span class="year-wheel-ring-sync-label">Synkar från arrangemang<\/span>/);
    assert.match(markup, /Möten<span class="year-wheel-ring-sync-label">Synkar från avdelningsmöten<\/span>/);
    assert.match(markup, /Saknad källa<span class="year-wheel-ring-sync-label">Synkar från annat årshjul<\/span>/);
    assert.match(markup, /year-wheel-ring-option-name">Vanlig ring<\/span>/);
});

test("inherited source checks restore manual selections when child inclusion is disabled", async () => {
    const { source, target } = linkedWheels();
    const page = createPage({ wheels: [target, source] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    page.elements.get("yearWheelForm").values = { name: "troop", start_month: "8" };
    clickRingAction(page, "edit", "board-summary");
    const fields = page.elements.get("yearWheelFormFields");
    fields.querySelector('[name="source_wheel_id"]').value = "board";
    const list = fields.querySelector("[data-wheel-sync-rings]");
    const change = (name, value, checked) => list.handlers.change({
        target: { closest: () => ({ name, value, checked }) }
    });
    change("source_child_ring_ids", "chair", false);
    assert.match(list.innerHTML, /name="source_ring_ids" value="treasurer"  >/);
    change("source_ring_ids", "treasurer", true);
    change("source_child_ring_ids", "chair", true);
    assert.match(list.innerHTML, /name="source_ring_ids" value="treasurer" checked disabled/);
    assert.match(list.innerHTML, /type="hidden" name="source_ring_ids" value="treasurer"/);
    assert.match(list.innerHTML, /Ingår via Ordförande/);
    assert.match(list.innerHTML, /<strong>Hämtas:<\/strong> Ordförande, Ordförande · Kassör/);
    change("source_child_ring_ids", "chair", false);
    assert.match(list.innerHTML, /name="source_ring_ids" value="treasurer" checked >/);
    assert.doesNotMatch(list.innerHTML, /Ingår via Ordförande/);
    change("source_ring_ids", "chair", false);
    assert.match(list.innerHTML, /data-source-children="chair" hidden/);
    assert.match(list.innerHTML, /name="source_ring_ids" value="treasurer" checked >/);
    change("source_ring_ids", "chair", true);
    assert.doesNotMatch(list.innerHTML, /Ingår via Ordförande/);
});

test("wheel source chains resolve in dependency order and cyclic or cross-troop links are rejected", () => {
    const helpers = createHelpers();
    const { source, target } = linkedWheels();
    const top = {
        ...wheel("overview"),
        rings: [{ id: "all", name: "Samlat", sync_from_wheel: { wheel_id: "troop", ring_ids: ["board-summary"] } }]
    };
    const result = helpers.syncWheelSources([top, target, source].map(item => helpers.normalizeWheel(item)));
    assert.equal(result[0].events.length, 3);
    assert.equal(helpers.syncWheelSources(result)[0], result[0]);
    const settings = { wheel_id: "overview", ring_ids: ["all"] };
    assert.match(helpers.getWheelSourceError(result[2], settings, result), /hämta händelser från varandra/);
    assert.match(helpers.getWheelSourceError(result[1], { wheel_id: "troop", ring_ids: ["board-summary"] }, result), /hämta händelser från varandra/);
    const foreign = { ...result[2], local_kar_id: "kar-2" };
    assert.match(helpers.getWheelSourceError(result[1], result[1].rings[0].sync_from_wheel, [foreign]), /samma kår/);
    const cyclic = result.map(item => item.id === "board"
        ? helpers.normalizeWheel({ ...item, rings: item.rings.map(ring => ({ ...ring, sync_from_wheel: settings })) }) : item);
    assert.doesNotThrow(() => helpers.syncWheelSources(cyclic));
});

test("missing wheel sources or rings preserve existing copies rather than treating failure as deletion", () => {
    const helpers = createHelpers();
    const { source, target } = linkedWheels();
    const result = helpers.syncWheelSources([target, source].map(item => helpers.normalizeWheel(item)));
    assert.equal(helpers.syncWheelSources([result[0]])[0], result[0]);
    const missingRing = helpers.normalizeWheel({ ...result[1], rings: [source.rings[2]], events: [] });
    assert.equal(helpers.syncWheelSources([result[0], missingRing])[0], result[0]);
    const emptySource = helpers.normalizeWheel({ ...result[1], events: [] });
    assert.equal(helpers.syncWheelSources([result[0], emptySource])[0].events.length, 1);
});

test("wheel links persist on load, stay read-only, support deep links and shared snapshots", async () => {
    const { source, target } = linkedWheels();
    const page = createPage({ wheels: [target, source], defaultWheelId: "troop" });
    await settle();
    assert.equal(page.tables.arshjul[0].data.events.length, 3);
    const writes = page.requests.filter(item => item.operation === "upsert");
    assert.equal(writes.length, 1);
    page.unlockEditing();
    const mark = page.elements.get("yearWheelChart").querySelectorAll("[data-event-edit]")
        .find(item => item.dataset.eventEdit !== "own");
    mark.handlers.click();
    assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Visa händelse");
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /Hämtad från board → Ordförande/);
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /arshjul.html\?wheel=board/);
    assert.equal(page.elements.get("deleteYearWheelItemBtn").classList.contains("hidden"), true);
    const deepLink = createPage({ wheels: [target, source], search: "?wheel=board" });
    await settle();
    assert.equal(deepLink.elements.get("yearWheelSelect").value, "board");
    const snapshot = { ...page.tables.arshjul[0].data, share_token: "shared" };
    const shared = createPage({ wheels: [snapshot], signedIn: false, search: "?share=shared" });
    await settle();
    assert.match(shared.elements.get("yearWheelEvents").innerHTML, /Styrelsemöte/);
    assert.equal(shared.requests.filter(item => item.operation === "upsert").length, 0);
    assert.equal(shared.elements.get("yearWheelSourceStatus").classList.contains("hidden"), true);
    const reader = createPage({ wheels: [target, source], leader: false });
    await settle();
    assert.match(reader.elements.get("yearWheelEvents").innerHTML, /Styrelsemöte/);
    assert.equal(reader.requests.filter(item => item.operation === "upsert").length, 0);
    assert.deepEqual(page.errors, []);
});

test("ring settings select a wheel source and preserve the existing draft workflow", async () => {
    const { source, target } = linkedWheels();
    target.rings[0].sync_from_wheel = null;
    const page = createPage({ wheels: [target, source] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const form = page.elements.get("yearWheelForm");
    form.values = { name: "troop", start_month: "8" };
    clickRingAction(page, "edit", "board-summary");
    assert.match(page.elements.get("yearWheelFormFields").innerHTML, /Synka från annat årshjul/);
    form.values = {
        name: "Styrelse", color: "#398a86",
        sync_from_wheel_enabled: "on", source_wheel_id: "board",
        source_ring_ids: ["chair", "treasurer"],
        source_child_ring_ids: ["chair", "treasurer", "other"]
    };
    await form.handlers.submit({ preventDefault() {}, currentTarget: form });
    assert.equal(page.tables.arshjul[0].data.rings[0].sync_from_wheel, null, "Draft must not save early");
    form.values = { name: "troop", start_month: "8" };
    await form.handlers.submit({ preventDefault() {}, currentTarget: form });
    await settle();
    const saved = page.tables.arshjul[0].data;
    assert.deepEqual(saved.rings[0].sync_from_wheel.ring_ids, ["chair", "treasurer"]);
    assert.deepEqual(saved.rings[0].sync_from_wheel.include_children_ring_ids, ["chair"]);
    assert.equal(saved.events.length, 3);
});

test("editing and deleting a source event updates dependent wheels in the same page", async () => {
    const { source, target } = linkedWheels();
    const page = createPage({ wheels: [source, target], defaultWheelId: "board" });
    await settle();
    page.unlockEditing();
    const mark = page.elements.get("yearWheelChart").querySelectorAll("[data-event-edit]")
        .find(item => item.dataset.eventEdit === "meeting");
    mark.handlers.click();
    const form = page.elements.get("yearWheelForm");
    form.values = {
        title: "Ändrat styrelsemöte", ring_id: "chair", start_date: "2026-10-22", end_date: "2026-10-23",
        responsible: "", location: "", notes: "", color_variant: "ring"
    };
    await form.handlers.submit({ preventDefault() {}, currentTarget: form });
    await settle();
    let copy = page.tables.arshjul[1].data.events.find(item => item.source_wheel_event_id === "meeting");
    assert.equal(copy.title, "Ändrat styrelsemöte");
    assert.equal(copy.start_date, "2026-10-22");
    assert.equal(copy.responsible, "");
    const updatedMark = page.elements.get("yearWheelChart").querySelectorAll("[data-event-edit]")
        .find(item => item.dataset.eventEdit === "meeting");
    updatedMark.handlers.click();
    page.elements.get("deleteYearWheelItemBtn").handlers.click();
    await settle();
    copy = page.tables.arshjul[1].data.events.find(item => item.source_wheel_event_id === "meeting");
    assert.equal(copy, undefined);
    assert.equal(page.tables.arshjul[1].data.events.some(item => item.id === "own"), true);
    assert.deepEqual(page.errors, []);
});

test("missing source warnings are visible and cyclic settings cannot be saved", async () => {
    const { source, target } = linkedWheels();
    const missing = createPage({ wheels: [target] });
    await settle();
    assert.match(missing.elements.get("yearWheelSourceStatus").textContent, /Källårshjulet saknas/);
    assert.equal(missing.elements.get("yearWheelSourceStatus").classList.contains("hidden"), false);
    const page = createPage({ wheels: [source, target] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const form = page.elements.get("yearWheelForm");
    form.values = { name: "board", start_month: "8" };
    clickRingAction(page, "edit", "chair");
    const fields = page.elements.get("yearWheelFormFields");
    assert.match(fields.innerHTML, /<option value="troop"[^>]* disabled>troop – hämtar redan från det här årshjulet<\/option>/);
    const selector = fields.querySelector('[name="source_wheel_id"]');
    selector.value = "troop";
    selector.handlers.change();
    assert.match(fields.querySelector("[data-wheel-sync-rings]").innerHTML,
        /<fieldset[^>]*year-wheel-source-options--blocked[^>]* disabled/);
    form.values = {
        name: "Ordförande", color: "#123456", sync_from_wheel_enabled: "on",
        source_wheel_id: "troop", source_ring_ids: ["board-summary"]
    };
    await form.handlers.submit({ preventDefault() {}, currentTarget: form });
    assert.match(page.elements.get("yearWheelFormMessage").textContent, /hämta händelser från varandra/);
    assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Redigera ring");
});

test("narrowing a source selection only detaches excluded copies", async () => {
    const { source, target } = linkedWheels();
    const page = createPage({ wheels: [target, source] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const form = page.elements.get("yearWheelForm");
    form.values = { name: "troop", start_month: "8" };
    clickRingAction(page, "edit", "board-summary");
    form.values = {
        name: "Styrelse", color: "#398a86", sync_from_wheel_enabled: "on",
        source_wheel_id: "board", source_ring_ids: ["chair"]
    };
    await form.handlers.submit({ preventDefault() {}, currentTarget: form });
    assert.match(page.elements.get("yearWheelArrangementSyncMessage").textContent, /1 hämtad händelse/);
    form.values.wheel_sync_action = "keep";
    await form.handlers.submit({ preventDefault() {}, currentTarget: form });
    form.values = { name: "troop", start_month: "8" };
    await form.handlers.submit({ preventDefault() {}, currentTarget: form });
    await settle();
    const events = page.tables.arshjul[0].data.events;
    assert.equal(events.length, 3);
    assert.equal(events.find(item => item.title === "Budget").source_wheel_id, "");
    assert.equal(events.find(item => item.title === "Styrelsemöte").source_wheel_id, "board");
});

for (const action of ["keep", "delete"]) {
    test(`disconnecting a wheel source requires an explicit ${action} choice`, async () => {
        const { source, target } = linkedWheels();
        const page = createPage({ wheels: [target, source] });
        await settle();
        page.unlockEditing();
        page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
        const form = page.elements.get("yearWheelForm");
        form.values = { name: "troop", start_month: "8" };
        clickRingAction(page, "edit", "board-summary");
        form.values = { name: "Styrelse", color: "#398a86" };
        await form.handlers.submit({ preventDefault() {}, currentTarget: form });
        assert.equal(page.elements.get("yearWheelArrangementSyncModal").classList.contains("hidden"), false);
        assert.match(page.elements.get("yearWheelArrangementSyncMessage").textContent, /2 hämtade händelser/);
        page.elements.get("cancelYearWheelArrangementSyncBtn").handlers.click();
        assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Redigera ring");
        await form.handlers.submit({ preventDefault() {}, currentTarget: form });
        form.requestSubmit = () => {
            form.values.wheel_sync_action = page.elements.get('yearWheelFormFields [name="wheel_sync_action"]').value;
            form.handlers.submit({ preventDefault() {}, currentTarget: form });
        };
        page.elements.get(action === "keep" ? "keepYearWheelArrangementEventsBtn" : "deleteYearWheelArrangementEventsBtn").handlers.click();
        form.values = { name: "troop", start_month: "8" };
        await form.handlers.submit({ preventDefault() {}, currentTarget: form });
        await settle();
        const saved = page.tables.arshjul[0].data;
        assert.equal(saved.rings[0].sync_from_wheel, null);
        assert.equal(saved.events.length, action === "keep" ? 3 : 1);
        assert.equal(saved.events.every(item => !item.source_wheel_id), true);
        assert.deepEqual(page.errors, []);
    });
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
        assert.equal(row.data.schema_version, 5);
        assert.equal(row.data.events[0].title.length, 120);
        assert.equal(row.data.events[0].notes.length, 1999);
        assert.equal(row.data.events[0].location.length, 119);
        assert.equal(row.data.events[0].responsible.length, 99);
    }
    assert.equal(page.tables.arshjul.find(row => row.id === "old").data.rings.some(ring => ring.name === "Terminer"), false);
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
    assert.match(page.elements.get("yearWheelSelect").attributes["aria-label"], /Manually edited/);
    assert.equal(page.stored()[0].local_only, false);
    assert.deepEqual(page.errors, []);
});

test("new wheels start empty and import arrangements after adding the standard ring", async () => {
    const page = createPage({ arrangements: [arrangement({ title: "T".repeat(121) })] });
    await settle();
    page.elements.get("yearWheelMenuAddBtn").handlers.click();
    const form = page.elements.get("yearWheelForm");
    let fields = page.elements.get("yearWheelFormFields").innerHTML;
    assert.match(fields, /Inga ringar har lagts till ännu/);
    assert.doesNotMatch(fields, /value="Arrangemang"/);
    form.values = { name: "New wheel", start_month: "8" };
    clickRingAction(page, "add");
    const ringFields = page.elements.get("yearWheelFormFields");
    const preset = ringFields.querySelector('[name="default_ring"]');
    preset.value = "Arrangemang";
    preset.handlers.change();
    assert.equal(ringFields.querySelector('[name="name"]').value, "Arrangemang");
    form.values = {
        name: "Arrangemang", color: "#c56b36", parent_id: "", sync_arrangements: "on"
    };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    form.values = { name: "New wheel", start_month: "8" };
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

test("standard departments can be added as independent rings or placed under Avdelningar", async () => {
    const page = createPage({ wheels: [wheel()] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const form = page.elements.get("yearWheelForm");
    form.values = { name: "wheel", start_month: "8" };

    clickRingAction(page, "add");
    let fields = page.elements.get("yearWheelFormFields");
    const presets = fields.querySelector('[name="default_ring"]');
    assert.match(fields.innerHTML, /<option value="Ledare">Ledare<\/option>/);
    presets.value = "Avdelningar";
    presets.handlers.change();
    form.values = { name: "Avdelningar", color: "#00a8e1", parent_id: "" };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    let savedDraft = page.elements.get("yearWheelFormFields").innerHTML;
    const departmentRootId = [...savedDraft.matchAll(/data-ring-id="([^"]+)"/g)]
        .map(([, ringId]) => ringId).find(ringId => ringId !== "arrangements");
    assert.ok(departmentRootId);

    const addChild = page.elements.get("yearWheelFormFields").innerHTML.match(
        new RegExp(`data-config-ring-action="add-child" data-parent-id="${departmentRootId}"`)
    );
    assert.ok(addChild);
    clickRingAction(page, "add-child", "", departmentRootId);
    fields = page.elements.get("yearWheelFormFields");
    fields.querySelector('[name="default_ring"]').value = "Spårare";
    fields.querySelector('[name="default_ring"]').handlers.change();
    const syncMeetings = fields.querySelector('[name="sync_meetings_from_department"]');
    assert.equal(syncMeetings.checked, true);
    assert.equal(fields.querySelector('[name="sync_meetings_department"]').value, "Spårare");
    assert.equal(fields.querySelector("[data-meeting-sync-settings]").hidden, false);
    const ringName = fields.querySelector('[name="name"]');
    ringName.value = "Äventyrare";
    ringName.handlers.input();
    assert.equal(syncMeetings.checked, true);
    assert.equal(fields.querySelector('[name="sync_meetings_department"]').value, "Äventyrare");
    ringName.value = "Egen ring";
    ringName.handlers.input();
    assert.equal(syncMeetings.checked, false);
    assert.equal(fields.querySelector("[data-meeting-sync-settings]").hidden, true);
    ringName.value = "Spårare";
    ringName.handlers.input();
    form.values = {
        name: "Spårare", color: "#41a62a", color_variant: "standard",
        parent_id: departmentRootId, sync_meetings_from_department: "on",
        sync_meetings_department: "Spårare"
    };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    savedDraft = page.elements.get("yearWheelFormFields").innerHTML;
    assert.match(savedDraft, new RegExp(`data-ring-id="${departmentRootId}"`));
    assert.match(savedDraft, /Spårare/);

    form.values = { name: "wheel", start_month: "8" };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });
    await settle();
    const saved = page.tables.arshjul[0].data;
    const root = saved.rings.find(ring => ring.name === "Avdelningar");
    const scout = saved.rings.find(ring => ring.name === "Spårare");
    assert.ok(root);
    assert.equal(root.parent_id, "");
    assert.equal(scout.parent_id, root.id);
    assert.equal(scout.sync_meetings_from_department, true);
    assert.equal(scout.sync_meetings_department, "Spårare");
    assert.deepEqual(page.errors, []);
});

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

test("department rings expose planning sync with their department preselected", async () => {
    const page = createPage({
        wheels: [{
            ...wheel(),
            rings: [{ id: "scouts", name: "Spårare", color: "#41a62a", color_variant: "standard" }]
        }]
    });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    page.elements.get("yearWheelForm").values = {
        name: "wheel", start_month: "8", ring_ids: ["scouts"]
    };
    clickRingAction(page, "edit", "scouts");

    const markup = page.elements.get("yearWheelFormFields").innerHTML;
    assert.match(markup, /<option value="Spårare" selected>Spårare<\/option>/);
    assert.match(markup, /name="sync_meetings_from_department" type="checkbox"/);
});

test("planning meeting sync imports only dated meetings from the selected department and identifies their plan", () => {
    const helpers = createHelpers();
    const input = {
        ...wheel(),
        rings: [{
            id: "spares",
            name: "Spårare",
            color: "#41a62a",
            sync_meetings_from_department: true,
            sync_meetings_department: "Spårare"
        }]
    };
    const groups = [
        {
            id: "plan-1", level: "Spårare", name: "Läsår 1 HT",
            meetings: [
                { id: "meeting-1", week: "2", date: "2026-09-10", responsible: "Ada", location: "Scoutstugan" },
                { id: "meeting-undated", week: "3", date: "" }
            ]
        },
        {
            id: "plan-other", level: "Upptäckare", name: "Läsår 1 HT",
            meetings: [{ id: "other-meeting", date: "2026-09-11" }]
        }
    ];

    const updated = helpers.syncPlanningMeetingEvents(input, groups);
    assert.equal(updated.events.length, 1);
    assert.equal(updated.events[0].source_planning_id, "plan-1");
    assert.equal(updated.events[0].source_meeting_id, "meeting-1");
    assert.match(updated.events[0].title, /Spårare · Läsår 1 HT · Träff 2/);
    assert.equal(updated.events[0].start_date, "2026-09-10");
    assert.equal(updated.events[0].end_date, "2026-09-10");
    assert.equal(updated.events[0].responsible, "Ada");
    assert.equal(helpers.syncPlanningMeetingEvents(updated, groups), null, "Repeated source data must not create or change events");
});

test("planning meeting sync includes new plans by default, honors exclusions and drops meetings whose date is cleared", () => {
    const helpers = createHelpers();
    const configuredWheel = {
        ...wheel(),
        rings: [{
            id: "spares",
            name: "Spårare",
            color: "#41a62a",
            sync_meetings_from_department: true,
            sync_meetings_department: "Spårare",
            sync_excluded_planning_ids: ["excluded-plan"]
        }]
    };
    const groups = [
        { id: "included-plan", level: "Spårare", name: "Läsår 1 HT", meetings: [{ id: "m1", date: "2026-09-10" }] },
        { id: "new-plan", level: "Spårare", name: "Läsår 2 VT", meetings: [{ id: "m2", date: "2027-02-10" }] },
        { id: "excluded-plan", level: "Spårare", name: "Undantagen", meetings: [{ id: "m3", date: "2027-03-10" }] }
    ];

    const updated = helpers.syncPlanningMeetingEvents(configuredWheel, groups);
    assert.deepEqual(Array.from(updated.events, event => event.source_planning_id).sort(), ["included-plan", "new-plan"]);
    const withoutDate = groups.map(group => group.id === "included-plan"
        ? { ...group, meetings: [{ id: "m1", date: "" }] }
        : group);
    const cleared = helpers.syncPlanningMeetingEvents(updated, withoutDate);
    assert.deepEqual(Array.from(cleared.events, event => event.source_planning_id), ["new-plan"]);
});

test("event overflow list shows each event title, ring and date", () => {
    const source = readScript("arshjul.js");
    const start = source.indexOf("function renderEventOverflowRows(");
    const end = source.indexOf("function openEventOverflow(", start);
    const context = vm.createContext({
        COLORS: ["#398a86"],
        escapeHtml: value => String(value).replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[character])),
        formatDate: value => `formatted:${value}`,
        getEventColor: () => "#41a62a"
    });
    vm.runInContext(source.slice(start, end), context);
    const rows = context.renderEventOverflowRows([
        {
            id: "meeting-1",
            title: "Spårare · Läsår 1 HT · Träff 2",
            ring_id: "scouts",
            start_date: "2026-09-10",
            end_date: "2026-09-10"
        },
        {
            id: "event-2",
            title: "Kårkväll",
            ring_id: "common",
            start_date: "2026-09-11",
            end_date: "2026-09-12"
        }
    ], new Map([
        ["scouts", { name: "Spårare" }],
        ["common", { name: "Kårgemensamt" }]
    ]), true);

    assert.match(rows, /data-overflow-event="meeting-1"/);
    assert.match(rows, /Spårare · Läsår 1 HT · Träff 2/);
    assert.match(rows, /Spårare · formatted:2026-09-10/);
    assert.match(rows, /data-overflow-event="event-2"/);
    assert.match(rows, /Kårkväll/);
    assert.match(rows, /Kårgemensamt · formatted:2026-09-11 – formatted:2026-09-12/);
    assert.equal((rows.match(/class="year-wheel-overflow-event"/g) || []).length, 2);
});

test("overflow list hides save action but individual event editing restores it", () => {
    const source = readScript("arshjul.js");
    const start = source.indexOf("function openModal(");
    const end = source.indexOf("function closeModal(", start);
    const elements = new Map();
    const element = name => {
        if (!elements.has(name)) {
            const classes = new Set();
            elements.set(name, {
                classList: {
                    add(value) { classes.add(value); },
                    remove(value) { classes.delete(value); },
                    toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); },
                    contains(value) { return classes.has(value); }
                },
                querySelector() { return element(`${name} child`); },
                focus() {},
                setAttribute() {},
                removeAttribute() {}
            });
        }
        return elements.get(name);
    };
    const context = vm.createContext({
        modalMode: "",
        editingId: "",
        byId: element,
        canEdit: () => true
    });
    vm.runInContext(source.slice(start, end), context);
    const submitButton = element("yearWheelForm").querySelector('[type="submit"]');

    context.openModal("Händelser nära varandra", "<div>Händelselista</div>", "event-overflow");
    assert.equal(submitButton.classList.contains("hidden"), true);
    context.openModal("Redigera händelse", "<input>", "event", "meeting-1");
    assert.equal(submitButton.classList.contains("hidden"), false);
    const deleteButton = element("deleteYearWheelItemBtn");
    deleteButton.classList.add("year-wheel-delete-button--text");
    deleteButton.innerHTML = "Ta bort hela serien";
    context.openModal("Redigera ring", "<input>", "ring", "ring-1");
    assert.equal(deleteButton.classList.contains("year-wheel-delete-button--text"), false);
    assert.match(deleteButton.innerHTML, /<svg/);
});

test("excluding a planning source opens a clear choice dialog instead of a browser confirm", async () => {
    const sourceWheel = {
        ...wheel(),
        rings: [{
            id: "scouts",
            name: "Spårare",
            color: "#41a62a",
            sync_meetings_from_department: true,
            sync_meetings_department: "Spårare"
        }],
        events: [{
            id: "linked-meeting",
            ring_id: "scouts",
            title: "Spårare · Läsår 1 HT · Träff 2",
            start_date: "2026-09-10",
            end_date: "2026-09-10",
            source_planning_id: "plan-1",
            source_meeting_id: "meeting-1"
        }]
    };
    const page = createPage({ wheels: [sourceWheel] });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const form = page.elements.get("yearWheelForm");
    form.values = { name: "wheel", start_month: "8", ring_ids: ["scouts"] };
    clickRingAction(page, "edit", "scouts");

    form.values = {
        name: "Spårare",
        color: "#41a62a",
        parent_id: "",
        color_variant: "standard",
        sync_meetings_from_department: "on",
        sync_meetings_department: "Spårare",
        sync_excluded_planning_ids: JSON.stringify(["plan-1"]),
        planning_sync_action: ""
    };
    form.handlers.submit({ preventDefault() {}, currentTarget: form });

    const popup = page.elements.get("yearWheelArrangementSyncModal");
    assert.equal(popup.classList.contains("hidden"), false);
    assert.equal(page.elements.get("yearWheelArrangementSyncTitle").textContent, "Planeringens möten synkas inte längre");
    assert.match(page.elements.get("yearWheelArrangementSyncMessage").textContent, /Det synkade mötet kommer inte längre att uppdateras/);
    assert.equal(page.elements.get("keepYearWheelArrangementEventsBtn").textContent, "Behåll mötet som vanlig händelse");
    assert.equal(page.elements.get("deleteYearWheelArrangementEventsBtn").textContent, "Ta bort mötet från årshjulet");
    page.elements.get("cancelYearWheelArrangementSyncBtn").handlers.click();
    assert.equal(popup.classList.contains("hidden"), true);
});

test("legacy department rings migrate without special grouping", async () => {
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
    assert.equal(saved.rings.some(ring => ring.name === "Avdelning"), false);
    assert.equal(saved.rings.find(ring => ring.id === "scouts").parent_id, "");
    assert.equal(saved.rings.find(ring => ring.id === "explorers").parent_id, "");
    assert.deepEqual(saved.events.map(event => event.ring_id), ["scouts", "explorers"]);
    assert.match(page.elements.get("yearWheelChart").innerHTML, /<textPath[^>]*>Spårare<\/textPath>/);
    assert.match(page.elements.get("yearWheelChart").innerHTML, /<textPath[^>]*>Upptäckare<\/textPath>/);
    assert.deepEqual(page.errors, []);
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

test("ring filters show root and child names instead of array indexes", async () => {
    const configuredWheel = wheel();
    configuredWheel.rings = [
        { id: "department", name: "Avdelning", color: "#00a8d6" },
        { id: "younger", name: "Spårare", color: "#41a62a", parent_id: "department" },
        { id: "older", name: "Äventyrare <äldre>", color: "#692b99", parent_id: "department" },
        { id: "board", name: "Styrelse & kår", color: "#398a86" },
        { id: "treasurer", name: "Kassör", color: "#123456", parent_id: "board" },
        { id: "common", name: "Kårgemensamt", color: "#991d1b" }
    ];
    const page = createPage({ wheels: [configuredWheel] });
    await settle();

    const list = page.elements.get("yearWheelRingList");
    const assertLabels = () => {
        const labels = [...list.innerHTML.matchAll(/<span>([^<]*)<\/span>/g)].map(match => match[1]);
        assert.deepEqual(labels, [
            "Avdelning", "Avdelning · egna händelser", "Spårare", "Äventyrare &lt;äldre&gt;",
            "Styrelse &amp; kår", "Styrelse &amp; kår · egna händelser", "Kassör", "Kårgemensamt"
        ]);
    };
    assertLabels();

    const scoutToggle = list.querySelectorAll("[data-ring-toggle]").find(input => input.dataset.ringToggle === "younger");
    scoutToggle.checked = false;
    scoutToggle.handlers.change();

    assertLabels();
    assert.equal(list.querySelectorAll("[data-ring-toggle]").find(input => input.dataset.ringToggle === "younger").checked, false);
    assert.deepEqual(page.errors, []);
});

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

test("leaders and admins delete year wheels from settings when editing is unlocked", async () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "arshjul.html"), "utf8");
    assert.doesNotMatch(html, /deleteYearWheelBtn/);
    for (const role of [{ leader: true }, { leader: false, admin: true }]) {
        const page = createPage({ wheels: [wheel("first"), wheel("second")], ...role });
        await settle();
        assert.equal(page.elements.get("yearWheelMenuSettingsBtn").disabled, true);

        page.unlockEditing();
        page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
        assert.equal(page.elements.get("yearWheelModalTitle").textContent, "Inställningar för årshjul");
        const deleteButton = page.elements.get("deleteYearWheelItemBtn");
        assert.equal(deleteButton.classList.contains("hidden"), false);
        deleteButton.handlers.click();
        await settle();

        assert.deepEqual(page.stored().map(item => item.id), ["second"]);
        assert.match(page.elements.get("yearWheelSelect").attributes["aria-label"], /second/);
        assert.equal(page.requests.filter(request => request.operation === "delete").length, 1);
        assert.deepEqual(page.errors, []);
    }
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

test("short event arcs use six days of visual width, leaving a gap between weekly events", () => {
    const source = readScript("arshjul.js");
    const start = source.indexOf("function getEventArcFractions(");
    const end = source.indexOf("function getEventLaneLayout(", start);
    const context = vm.createContext({});
    vm.runInContext(source.slice(start, end), context);

    const days = 365;
    const first = context.getEventArcFractions(20, 21, days);
    const nextWeek = context.getEventArcFractions(27, 28, days);

    assert.ok(Math.abs((first.to - first.from) * days - 6) < 1e-9);
    assert.ok(Math.abs((nextWeek.to - nextWeek.from) * days - 6) < 1e-9);
    assert.ok(Math.abs((nextWeek.from - first.to) * days - 1) < 1e-9);
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

test("ring settings stack controls and give ring labels and event counts their own space", () => {
    const css = readScript("../css/style.css");
    const mobileCss = css.slice(css.lastIndexOf("@media (max-width: 680px)"));
    assert.match(mobileCss, /\.year-wheel-ring-config\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    assert.match(mobileCss, /\.year-wheel-ring-config\.year-wheel-ring-config-group-row\s*\{\s*grid-template-columns:\s*13px minmax\(0,\s*1fr\) auto;/);
    assert.match(mobileCss, /\.year-wheel-ring-actions\s*\{\s*grid-column:\s*1 \/ -1;\s*justify-self:\s*end;\s*flex-wrap:\s*wrap;\s*opacity:\s*1;/);
    assert.match(mobileCss, /\.year-wheel-ring-option,\s*\.year-wheel-ring-config-children \.year-wheel-ring-option\s*\{\s*grid-template-columns:\s*13px minmax\(0,\s*1fr\) auto;/);
    assert.match(mobileCss, /\.year-wheel-ring-option small\s*\{\s*grid-column:\s*3;\s*white-space:\s*normal;\s*overflow-wrap:\s*anywhere;/);
    assert.match(css, /\.year-wheel-ring-group-details\s*\{[^}]*grid-column:\s*2 \/ -1;/);
    assert.match(mobileCss, /\.year-wheel-ring-group-details > summary\s*\{\s*flex-wrap:\s*wrap;/);
    assert.match(mobileCss, /\.year-wheel-ring-group-details > summary > \.year-wheel-ring-actions\s*\{\s*flex-basis:\s*100%;\s*justify-content:\s*flex-end;/);
});

test("root ring actions stay in the group heading before child rings", async () => {
    const configuredWheel = wheel();
    configuredWheel.rings.push(
        { id: "board", name: "Styrelse", color: "#398a86" },
        { id: "treasurer", name: "Kassör", color: "#123456", parent_id: "board" }
    );
    const page = createPage({ wheels: [configuredWheel], viewportWidth: 320 });
    await settle();
    page.unlockEditing();
    page.elements.get("yearWheelMenuSettingsBtn").handlers.click();
    const fields = page.elements.get("yearWheelFormFields");
    const markup = fields.innerHTML;
    const heading = markup.match(/<summary>\s*<span class="year-wheel-ring-option-name">Styrelse<\/span>([\s\S]*?)<\/summary>/)?.[1];
    assert.ok(heading);
    for (const action of ["move-up", "move-down", "edit"]) {
        assert.ok(heading.includes(`data-config-ring-action="${action}" data-ring-id="board"`));
    }
    assert.ok(heading.includes('data-config-ring-action="add-child" data-parent-id="board"'));
    assert.ok(heading.includes('data-ring-drag-handle="board"'));
    assert.ok(markup.indexOf(heading) < markup.indexOf('data-ring-id="treasurer"'));

    let prevented = false;
    fields.handlers.click({
        target: { closest: selector => selector === "[data-ring-drag-handle]" ? {} : null },
        preventDefault() { prevented = true; }
    });
    assert.equal(prevented, true, "Clicking the drag handle must not collapse the group");
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

for (const chartMode of ["overview", "details"]) {
    test(`${chartMode} event list shows parent and child ring names while root names stay unchanged`, async () => {
        const configuredWheel = wheel();
        configuredWheel.rings.push(
            { id: "department", name: "Avdelning & kår", color: "#123456" },
            { id: "scouts", name: "Spårare <yngre>", color: "#41a62a", parent_id: "department" }
        );
        configuredWheel.events = [
            { id: "child-event", ring_id: "scouts", title: "Scoutmöte", start_date: "2026-10-20" },
            { id: "root-event", ring_id: "department", title: "Avdelningsmöte", start_date: "2026-10-21" }
        ];
        const page = createPage({ wheels: [configuredWheel], chartMode });
        await settle();
        const markup = page.elements.get("yearWheelEvents").innerHTML;
        assert.match(markup, /class="year-wheel-event-card-ring">Avdelning &amp; kår · Spårare &lt;yngre&gt;<\/span>/);
        assert.match(markup, /class="year-wheel-event-card-ring">Avdelning &amp; kår<\/span>/);
        assert.deepEqual(page.errors, []);
    });
}

test("event list labels all child rings with their parent", async () => {
    const configuredWheel = wheel();
    configuredWheel.rings.push(
        { id: "department", name: "Avdelning", color: "#123456" },
        { id: "scouts", name: "Spårare", color: "#41a62a", parent_id: "department" }
    );
    configuredWheel.events = [{
        id: "scout-meeting", ring_id: "scouts", title: "Veckomöte",
        start_date: "2026-10-20", end_date: "2026-10-20"
    }];
    const page = createPage({ wheels: [configuredWheel] });
    await settle();
    const markup = page.elements.get("yearWheelEvents").innerHTML;
    assert.match(markup, /class="year-wheel-event-card-ring">Avdelning · Spårare<\/span>/);
    assert.deepEqual(page.errors, []);
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
    assert.equal(page.stored()[0].schema_version, 5);
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
    assert.match(page.elements.get("yearWheelSelect").attributes["aria-label"], new RegExp(shared.name));
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
    assert.equal(page.tables.arshjul[0].data.schema_version, 5);
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
    assert.match(page.elements.get("yearWheelSelect").attributes["aria-label"], /wheel/);
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
    assert.equal(page.elements.get("yearWheelSelect").attributes["aria-label"], "Inga årshjul");
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
    assert.equal(page.elements.get("yearWheelSelect").attributes["aria-label"], "Inga årshjul");
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
    assert.equal(page.elements.get("yearWheelSelect").attributes["aria-label"], "Inga årshjul");
    assert.equal(page.requests.filter(request => request.operation === "upsert").length, 0);
    assert.deepEqual(page.errors, []);
});
