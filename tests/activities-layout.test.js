const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function renderCard(overrides = {}) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "aktiviteter.js"), "utf8");
    const cards = { innerHTML: "" };
    const group = {
        querySelector: () => cards,
        addEventListener() {}
    };
    const context = vm.createContext({
        activities: [{
            id: "activity-1", namn: "Testlek", kategori: "Lek", material: [],
            beskrivning: "", malgrupp: [], tid: "", kar_namn: "Testkår", ...overrides
        }],
        search: { value: "" },
        categoryFilter: { value: "Alla" },
        targetFilter: { value: "Alla" },
        karFilter: { value: "Alla" },
        auth: { getState: () => ({ karId: "kar-1" }) },
        sync: { canDeleteActivity: activity => activity.id.startsWith("egen-") },
        document: { createElement: () => group },
        grid: { replaceChildren() {} },
        empty: { classList: { toggle() {} } },
        loaded: true,
        collapsedCategories: new Set(),
        targetGroups: ["Familjescouter", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"],
        deleteIcon: "<svg></svg>",
        categoriesFor: activity => [activity.kategori],
        owner: activity => activity.kar_namn,
        renderBadgeIcons: () => '<img alt="Testmärke">',
        updateCollapseAllButtons() {}
    });
    for (const [start, end] of [
        ["function escapeHtml(", "function renderText("],
        ["function renderTargetGroups(", "function renderActivities("],
        ["function renderActivities(", "function showDetail("]
    ]) {
        vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), context);
    }
    context.renderActivities();
    return cards.innerHTML;
}

test("activity cards start with the title and reserve a target area even without targets", () => {
    const html = renderCard();
    assert.match(html, /<article class="activity-card">\s*<h2>/);
    assert.match(html, /<div class="activity-target-tags" aria-label="Målgrupper"><\/div>/);
    assert.doesNotMatch(html, /recipe-category/);
    assert.match(html, /Ingen tidsangivelse/);
    assert.match(html, /<div class="activity-card-bottom">.*Testmärke.*activity-card-actions/);
});

test("activity cards retain escaped full descriptions and target groups for CSS previews", () => {
    const description = "Lång beskrivning med <text> & detaljer. ".repeat(20);
    const html = renderCard({ beskrivning: description, malgrupp: ["Spårare", "Rover"], namn: "<Testlek>" });
    assert.match(html, /&lt;Testlek&gt;/);
    assert.ok(html.includes(description.replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("& detaljer", "&amp; detaljer")));
    assert.match(html, /department-tone-1">Spårare/);
    assert.match(html, /department-tone-5">Rover/);
});

for (const [tid, expected] of [["10", "10 min"], ["2,5", "2,5 min"], ["15–20 min", "15–20 min"]]) {
    test(`activity cards format the duration ${tid}`, () => {
        assert.ok(renderCard({ tid }).includes(`<span>${expected}</span>`));
    });
}

test("delete controls stay inside the footer and remain restricted to editable activities", () => {
    assert.doesNotMatch(renderCard(), /data-activity-action="delete"/);
    const html = renderCard({ id: "egen-1" });
    assert.match(html, /activity-card--local/);
    assert.match(html, /activity-local-badge/);
    assert.match(html, /activity-card-bottom">.*activity-card-actions"><button .*data-activity-action="delete"/);
    assert.match(html, /data-activity-action="view" data-activity-id="egen-1"/);
});
