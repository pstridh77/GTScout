const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createPage(narrow, options = {}) {
    const elements = new Map();
    const prints = [];
    const errors = [];
    const windowHandlers = {};
    function element(id) {
        if (!elements.has(id)) {
            const classes = new Set();
            elements.set(id, {
                value: "0", dataset: {}, attributes: {}, handlers: {}, innerHTML: "",
                classList: {
                    add: name => classes.add(name),
                    remove: name => classes.delete(name),
                    contains: name => classes.has(name),
                    toggle(name, enabled) {
                        if (enabled) classes.add(name); else classes.delete(name);
                    }
                },
                setAttribute(name, value) { this.attributes[name] = value; },
                addEventListener(name, handler) { this.handlers[name] = handler; },
                replaceChildren() {},
                querySelectorAll: selector => selector === "tbody[data-development-year]"
                    ? options.yearGroups || []
                    : options.images || []
            });
        }
        return elements.get(id);
    }
    const buttons = ["overview", "list"].map(mode => {
        const button = element(mode);
        button.dataset.developmentView = mode;
        return button;
    });
    const media = {
        matches: narrow,
        addEventListener(name, handler) { this.change = handler; }
    };
    const context = vm.createContext({
        document: { getElementById: element, querySelectorAll: () => buttons },
        window: {
            matchMedia: () => media,
            print: () => prints.push("print"),
            addEventListener: (name, handler) => { windowHandlers[name] = handler; }
        },
        console: { error: (...args) => errors.push(args) },
        Option: function (text, value) { this.text = text; this.value = value; },
        fetch: async url => ({
            ok: !options.loadError,
            json: async () => url.includes("default-planeringar")
                ? options.templates || [{ name: "Test", plannings: [] }]
                : []
        })
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "development-ladder.js"), "utf8"), context);
    return { elements, buttons, media, prints, errors, windowHandlers };
}

for (const narrow of [true, false]) {
    test(`development ladder defaults to ${narrow ? "details" : "overview"} and adapts across widths`, async () => {
        const page = createPage(narrow);
        await new Promise(resolve => setImmediate(resolve));
        const assertMode = overview => {
            assert.equal(page.elements.get("developmentLadder").classList.contains("development-ladder--overview"), overview);
            assert.equal(page.buttons[0].attributes["aria-pressed"], String(overview));
            assert.equal(page.buttons[1].attributes["aria-pressed"], String(!overview));
            const printButton = page.elements.get("printDevelopmentOverviewBtn");
            assert.equal(printButton.classList.contains("hidden"), !overview);
            assert.equal(printButton.disabled, !overview);
        };
        assertMode(!narrow);
        page.buttons[narrow ? 0 : 1].handlers.click();
        assertMode(narrow);
        page.elements.get("developmentTemplateSelect").handlers.change();
        assertMode(narrow);
        page.media.matches = !narrow;
        page.media.change();
        assertMode(narrow);
        page.media.matches = narrow;
        page.media.change();
        assertMode(!narrow);
        assert.equal(page.elements.get("developmentLadderStatus").classList.contains("development-ladder-status--error"), false);
    });
}

test("development toolbar opts into remembered responsive filter visibility", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "utvecklingstrappa.html"), "utf8");
    assert.match(html, /id="developmentLadderControls"[^>]*data-filter-preference="gtscout_development_filters_visible"/);
});

test("overview printing waits for every image and leaves the selected view unchanged", async () => {
    let finishImage;
    const page = createPage(false, {
        images: [{ decode: () => new Promise(resolve => { finishImage = resolve; }) }]
    });
    const printButton = page.elements.get("printDevelopmentOverviewBtn");
    assert.equal(printButton.disabled, true);
    await new Promise(resolve => setImmediate(resolve));
    const printing = printButton.handlers.click();
    assert.equal(printButton.disabled, true);
    assert.equal(page.prints.length, 0);
    finishImage();
    await printing;
    assert.equal(page.prints.length, 1);
    assert.equal(printButton.disabled, false);
    assert.equal(page.buttons[0].attributes["aria-pressed"], "true");
    assert.equal(page.elements.get("developmentTemplateSelect").value, "0");
    page.buttons[1].handlers.click();
    await printButton.handlers.click();
    assert.equal(page.prints.length, 1);
});

test("image failures prevent incomplete printing and show an error", async () => {
    let fail = true;
    const page = createPage(false, {
        images: [{ decode: async () => { if (fail) throw new Error("Missing image"); } }]
    });
    await new Promise(resolve => setImmediate(resolve));
    await page.elements.get("printDevelopmentOverviewBtn").handlers.click();
    assert.equal(page.prints.length, 0);
    assert.equal(page.errors.length, 1);
    assert.equal(page.elements.get("developmentLadderStatus").classList.contains("development-ladder-status--error"), true);
    assert.equal(page.elements.get("printDevelopmentOverviewBtn").disabled, false);
    fail = false;
    await page.elements.get("printDevelopmentOverviewBtn").handlers.click();
    assert.equal(page.prints.length, 1);
    assert.equal(page.elements.get("developmentLadderStatus").classList.contains("development-ladder-status--error"), false);
    assert.equal(page.elements.get("developmentLadderStatus").textContent, "Visar Test.");
});

test("changing views while images load cancels printing", async () => {
    let finishImage;
    const page = createPage(false, {
        images: [{ decode: () => new Promise(resolve => { finishImage = resolve; }) }]
    });
    await new Promise(resolve => setImmediate(resolve));
    const printing = page.elements.get("printDevelopmentOverviewBtn").handlers.click();
    page.buttons[1].handlers.click();
    finishImage();
    await printing;
    assert.equal(page.prints.length, 0);
    assert.equal(page.elements.get("printDevelopmentOverviewBtn").disabled, true);
    assert.equal(page.elements.get("developmentLadderStatus").classList.contains("development-ladder-status--error"), true);
});

test("printing stays disabled when planning data cannot be loaded", async () => {
    const page = createPage(false, { loadError: true });
    await new Promise(resolve => setImmediate(resolve));
    await page.elements.get("printDevelopmentOverviewBtn").handlers.click();
    assert.equal(page.prints.length, 0);
    assert.equal(page.elements.get("printDevelopmentOverviewBtn").disabled, true);
});

test("overview keeps HT and VT together in ascending year groups on screen", async () => {
    const templates = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "default-planeringar.json"), "utf8"));
    const page = createPage(false, { templates });
    await new Promise(resolve => setImmediate(resolve));
    const html = page.elements.get("developmentLadder").innerHTML;
    const groups = [...html.matchAll(/<tbody data-development-year="(\d+)">([\s\S]*?)<\/tbody>/g)];
    assert.deepEqual(groups.map(group => Number(group[1])), [1, 2, 3]);
    for (const [, year, rows] of groups) {
        assert.deepEqual([...rows.matchAll(/data-term="(HT|VT)"/g)].map(match => match[1]), ["HT", "VT"]);
        assert.ok(rows.includes(`rowspan="2">År ${year}</th>`));
    }
});

for (const years of [[], [1], [1, 2, 3], [1, 2, 3, 4]]) {
    test(`printing reverses ${years.length} year groups and restores screen order after print or cancel`, async () => {
        const groups = years.map(year => {
            const heading = { rowSpan: 2, parentElement: null };
            const rows = ["HT", "VT"].map(term => ({
                term,
                children: [],
                querySelector: selector => selector === `[data-term="${term}"]` ? { dataset: { term } } : null,
                prepend(node) {
                    if (node.parentElement) {
                        const children = node.parentElement.children;
                        children.splice(children.indexOf(node), 1);
                    }
                    this.children.unshift(node);
                    node.parentElement = this;
                }
            }));
            rows[0].prepend(heading);
            return {
                dataset: { developmentYear: String(year) },
                rows,
                heading,
                querySelector: () => heading,
                prepend(row) {
                    rows.splice(rows.indexOf(row), 1);
                    rows.unshift(row);
                }
            };
        });
        const table = {
            appendChild(group) {
                groups.splice(groups.indexOf(group), 1);
                groups.push(group);
            }
        };
        groups.forEach(group => { group.parentElement = table; });
        const page = createPage(false, { yearGroups: groups });
        await new Promise(resolve => setImmediate(resolve));
        const order = () => groups.map(group => Number(group.dataset.developmentYear));
        const assertTerms = expected => {
            for (const group of groups) {
                assert.deepEqual(group.rows.map(row => row.term), expected);
                assert.equal(group.rows[0].children[0], group.heading);
                assert.equal(group.rows[1].children.includes(group.heading), false);
                assert.equal(group.heading.rowSpan, 2);
            }
        };
        assert.deepEqual(order(), years);
        assertTerms(["HT", "VT"]);
        for (let attempt = 0; attempt < 2; attempt++) {
            page.windowHandlers.beforeprint();
            assert.deepEqual(order(), [...years].reverse());
            assertTerms(["VT", "HT"]);
            page.windowHandlers.beforeprint();
            assert.deepEqual(order(), [...years].reverse());
            assertTerms(["VT", "HT"]);
            page.windowHandlers.afterprint();
            assert.deepEqual(order(), years);
            assertTerms(["HT", "VT"]);
        }
    });
}
