const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createPage(narrow) {
    const elements = new Map();
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
                replaceChildren() {}
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
        window: { matchMedia: () => media },
        Option: function (text, value) { this.text = text; this.value = value; },
        fetch: async url => ({
            ok: true,
            json: async () => url.includes("default-planeringar")
                ? [{ name: "Test", plannings: [] }]
                : []
        })
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "development-ladder.js"), "utf8"), context);
    return { elements, buttons, media };
}

for (const narrow of [true, false]) {
    test(`development ladder defaults to ${narrow ? "details" : "overview"} and adapts across widths`, async () => {
        const page = createPage(narrow);
        await new Promise(resolve => setImmediate(resolve));
        const assertMode = overview => {
            assert.equal(page.elements.get("developmentLadder").classList.contains("development-ladder--overview"), overview);
            assert.equal(page.buttons[0].attributes["aria-pressed"], String(overview));
            assert.equal(page.buttons[1].attributes["aria-pressed"], String(!overview));
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
