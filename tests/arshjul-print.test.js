const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "arshjul-print.js"), "utf8"), context);
const { buildDocument } = context.window.GTScoutYearWheelPrint;

const rings = [
    { id: "board", name: "Styrelse", color: "#398a86" },
    { id: "scouts", name: "Spårare", color: "#41a62a" }
];
const event = (id, start, end = start, fields = {}) => ({
    id, ring_id: "board", title: id, start_date: start, end_date: end,
    responsible: "", location: "", notes: "", ...fields
});
const range = (start = "2026-01-01", next = "2027-01-01") => ({
    start: new Date(`${start}T00:00:00Z`),
    end: new Date(new Date(`${next}T00:00:00Z`).getTime() - 86400000),
    endExclusive: new Date(`${next}T00:00:00Z`)
});
const options = (events = [], fields = {}) => ({
    wheel: { name: "Kårens årshjul", rings, events },
    rings, range: range(), mode: "wheel", ...fields
});

test("wheel fits an A3 landscape sheet and includes twelve months and an activity summary", () => {
    const html = buildDocument(options());
    assert.match(html, /@page\{size:A3 landscape;margin:10mm\}/);
    assert.match(html, /height:276mm/);
    for (const month of ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"]) {
        assert.match(html, new RegExp(`>${month}</text>`));
    }
    assert.match(html, /Aktiviteter i perioden/);
    assert.match(html, /<div class="activity-summary-heading"><h2 id="activity-summary-title">Aktiviteter i perioden<\/h2><\/div>/);
    assert.doesNotMatch(html, /Ringar · utifrån och in|Läs hjulet/);
    assert.match(html, /Styrelse/);
    assert.match(html, /Spårare/);
});

test("list includes full details in hidden rings and lists spanning events once", () => {
    const html = buildDocument(options([
        event("Flerdagarshajk", "2026-01-31", "2026-02-02", {
            ring_id: "scouts", responsible: "Anna", location: "Skogen",
            notes: "Första raden\nAndra raden", needs_review: true
        })
    ], { rings: [rings[0]], mode: "list" }));
    assert.match(html, /@page\{size:A4 portrait;margin:13mm\}/);
    assert.equal((html.match(/<h3>Flerdagarshajk<\/h3>/g) || []).length, 1);
    for (const text of ["Spårare", "Anna", "Skogen", "Första raden\nAndra raden", "behöver kontrolleras"]) {
        assert.ok(html.includes(text), text);
    }
    assert.match(html, /31 jan\. 2026 – 2 feb\. 2026/);
});

test("A3 activity summary lists selected events once in chronological order with full names and dates", () => {
    const html = buildDocument(options([
        event("Senare aktivitet", "2026-03-15", "2026-04-02", { responsible: "Anna", location: "Skogen" }),
        event("Dold aktivitet", "2026-01-01", undefined, { ring_id: "scouts" }),
        event("Tidig <aktivitet>", "2026-02-01")
    ], { rings: [rings[0]], eventColors: { "Senare aktivitet": "#123456" } }));
    const summary = html.slice(html.indexOf('<aside class="activity-summary"'), html.indexOf("</aside>"));
    assert.equal((summary.match(/class="activity-summary-item"/g) || []).length, 2);
    assert.ok(summary.indexOf("Tidig &lt;aktivitet&gt;") < summary.indexOf("Senare aktivitet"));
    assert.doesNotMatch(summary, /Dold aktivitet/);
    for (const value of ["15 mars – 2 apr.", "Styrelse", "--activity-color:#123456"]) {
        assert.ok(summary.includes(value), value);
    }
    assert.match(summary, /activity-summary-overflow[^>]*hidden/);
    assert.match(html, /window\.addEventListener\("beforeprint", fitActivitySummary\)/);
    assert.match(html, /\.activity-summary-row\{[^}]*grid-template-columns:34mm minmax\(0,1fr\)/);
    assert.match(html, /\.activity-summary-date\{[^}]*white-space:nowrap/);
});

test("A3 summary preserves all input rows for fitting and includes a visible-overflow explanation", () => {
    const events = Array.from({ length: 100 }, (_, index) => event(`Aktivitet ${index}`, "2026-04-01"));
    const html = buildDocument(options(events));
    assert.equal((html.match(/class="activity-summary-item"/g) || []).length, events.length);
    assert.match(html, /Välj A4-listan för hela listan/);
    assert.match(html, /for \(const size of \[12, 11\.5, 11, 10\.5, 10, 9\.5, 9, 8\.5, 8, 7\.5, 7\]\)/);
});

test("summary hides ring names before shrinking text and restores them when everything fits", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "arshjul-print.js"), "utf8");
    const classes = new Set();
    const items = Array.from({ length: 10 }, () => ({ hidden: false }));
    const notice = { hidden: true, textContent: "" };
    let fontSize = "";
    let availableHeight = 150;
    const list = {
        children: items,
        get clientHeight() { return availableHeight; },
        get scrollHeight() {
            return items.filter(item => !item.hidden).length * (classes.has("activity-summary--without-rings") ? 10 : 20);
        }
    };
    const summary = {
        querySelector: selector => selector === ".activity-summary-list" ? list : notice,
        classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
        style: { setProperty(name, value) { fontSize = value; } }
    };
    const helpers = vm.createContext({ document: { querySelector: () => summary } });
    vm.runInContext(source.slice(source.indexOf("    function fitActivitySummary("), source.indexOf("    function buildDocument(")), helpers);
    helpers.fitActivitySummary();
    assert.ok(classes.has("activity-summary--without-rings"));
    assert.equal(fontSize, "12pt", "Ring names should be removed before reducing the font");
    assert.ok(items.every(item => !item.hidden));
    assert.equal(notice.hidden, true);

    availableHeight = 250;
    helpers.fitActivitySummary();
    assert.equal(classes.has("activity-summary--without-rings"), false);
    assert.equal(fontSize, "12pt");
    assert.ok(items.every(item => !item.hidden));

    availableHeight = 50;
    helpers.fitActivitySummary();
    assert.ok(classes.has("activity-summary--without-rings"));
    assert.equal(notice.hidden, false);
    assert.equal(items.filter(item => !item.hidden).length, 5);
    assert.match(notice.textContent, /5 av 10 aktiviteter visas/);
});

test("A3 summary includes one month heading per month and keeps spanning events in their first visible month", () => {
    const html = buildDocument(options([
        event("Tidigare start", "2025-12-15", "2026-02-10"),
        event("Januarihajk", "2026-01-31", "2026-02-02"),
        event("Februarimöte", "2026-02-15"),
        event("Februarihajk", "2026-02-20"),
        event("Marsmöte", "2026-03-01")
    ]));
    const summary = html.slice(html.indexOf('<aside class="activity-summary"'), html.indexOf("</aside>"));
    const headings = [...summary.matchAll(/<h3 class="activity-summary-month">([^<]+)<\/h3>/g)].map(match => match[1]);
    assert.deepEqual(headings, ["januari 2026", "februari 2026", "mars 2026"]);
    assert.ok(summary.indexOf("januari 2026") < summary.indexOf("Tidigare start"));
    assert.ok(summary.indexOf("Januarihajk") < summary.indexOf("februari 2026"));
    assert.match(summary, /<li class="activity-summary-item"[^>]*><h3 class="activity-summary-month">/);
    assert.match(summary, /<li class="activity-summary-item"><h3 class="activity-summary-month">januari 2026<\/h3><div class="activity-summary-row" style="--activity-color:/);
    assert.doesNotMatch(summary, /<li[^>]*style="--activity-color:/);
    assert.match(html, /\.activity-summary-row\{[^}]*border-left:1mm solid var\(--activity-color\)/);
});

test("inclusive period overlap excludes events just outside the period", () => {
    const html = buildDocument(options([
        event("before", "2025-12-31"), event("after", "2027-01-01"),
        event("cross-start", "2025-12-30", "2026-01-01"),
        event("cross-end", "2026-12-31", "2027-01-02"),
        event("inside", "2026-06-01")
    ], { mode: "list" }));
    assert.doesNotMatch(html, /<h3>(before|after)<\/h3>/);
    for (const id of ["cross-start", "cross-end", "inside"]) assert.ok(html.includes(`<h3>${id}</h3>`));
    assert.match(html, /3 händelser/);
});

test("operational year includes the next calendar year and omits dates outside its boundaries", () => {
    const html = buildDocument(options([
        event("Sommar före", "2026-07-31"),
        event("Höst", "2026-08-01"),
        event("Vår", "2027-03-01"),
        event("Sista dagen", "2027-07-31"),
        event("Nästa period", "2027-08-01")
    ], { range: range("2026-08-01", "2027-08-01"), mode: "list" }));
    assert.ok(html.indexOf("<h3>Höst") < html.indexOf("<h3>Vår"));
    assert.match(html, /<h3>Sista dagen/);
    assert.doesNotMatch(html, /<h3>(Sommar före|Nästa period)/);
    const wheel = buildDocument(options([], { range: range("2027-08-01", "2028-08-01") }));
    assert.match(wheel, /2027–2028/);
    assert.doesNotMatch(wheel, /NaN|Infinity/);
});

test("wheel respects selected source rings when departments are grouped", () => {
    const grouped = [{ id: "group", name: "Avdelning", color: "#00a8e1", sourceRings: [rings[1]] }];
    const html = buildDocument(options([
        event("Hidden board event", "2026-02-02"),
        event("Scout event", "2026-02-03", "2026-03-15", { ring_id: "scouts" })
    ], { rings: grouped }));
    assert.doesNotMatch(html, /Hidden board event/);
    assert.match(html, />Scout event<\/text(?:Path)?>/);
    assert.match(html, /data-label-kind="detail"[^>]*>(?:<textPath[^>]*>)?Spårare<\/text(?:Path)?>/);
    assert.match(html, /1 händelse/);
});

test("all simultaneous events appear without an interactive overflow badge", () => {
    const events = Array.from({ length: 40 }, (_, index) => event(`Simultaneous ${index}`, "2026-01-20"));
    const html = buildDocument(options(events));
    for (const item of events) assert.ok(html.includes(`aria-label="${item.title} ·`), item.title);
    assert.equal((html.match(/role="group"/g) || []).length, 40);
    assert.doesNotMatch(html, /NaN|Infinity|font-size="-|data-event-overflow/);
});

test("multi-month events have one continuous arc and one label with extra details", () => {
    const html = buildDocument(options([
        event("Vinterhajk", "2026-01-15", "2026-03-15", { responsible: "Anna", location: "Skogen" })
    ]));
    assert.equal((html.match(/aria-label="Vinterhajk ·/g) || []).length, 1);
    assert.equal((html.match(/class="print-event-arc"/g) || []).length, 1);
    assert.equal((html.match(/>Vinterhajk<\/textPath>/g) || []).length, 1);
    const [, from, to] = html.match(/class="print-event-arc" data-from="([^"]+)" data-to="([^"]+)"/);
    assert.equal(Number(from), 14 / 365);
    assert.equal(Number(to), 74 / 365);
    assert.match(html, />Skogen<\/textPath>/);
    assert.match(html, />Ansv: Anna<\/textPath>/);
});

test("short events crossing a month boundary remain a single event", () => {
    const html = buildDocument(options([event("Kort hajk", "2026-01-31", "2026-02-01")]));
    assert.equal((html.match(/aria-label="Kort hajk ·/g) || []).length, 1);
    const [, from, to] = html.match(/class="print-event-arc" data-from="([^"]+)" data-to="([^"]+)"/);
    assert.ok(Math.abs(Number(to) - Number(from) - 7 / 365) < 1e-10);
});

test("overlapping multi-month events use separate lanes while later events reuse lanes", () => {
    const html = buildDocument(options([
        event("first", "2026-01-01", "2026-03-01"),
        event("overlap", "2026-02-01", "2026-04-01"),
        event("later", "2026-05-01", "2026-06-01")
    ]));
    const lanes = [...html.matchAll(/class="print-event-arc" data-from="[^"]+" data-to="[^"]+" data-lane="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(lanes, ["0", "1", "0"]);
});

test("isolated events fill the shared ring even when events elsewhere overlap", () => {
    const grouped = [{ id: "group", name: "Avdelning", color: "#00a8e1", sourceRings: rings }];
    const html = buildDocument(options([
        event("Överlapp ett", "2026-01-01", "2026-02-01"),
        event("Överlapp två", "2026-01-15", "2026-02-15", { ring_id: "scouts" }),
        event("Ensam aktivitet", "2026-04-01", "2026-04-30", { ring_id: "scouts" })
    ], { rings: grouped }));
    const labels = [...html.matchAll(/data-print-label="([^"]+)"/g)].map(match => JSON.parse(match[1]
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")));
    const single = buildDocument(options([
        event("Ensam aktivitet", "2026-04-01", "2026-04-30", { ring_id: "scouts" })
    ], { rings: grouped }));
    const standalone = JSON.parse(single.match(/data-print-label="([^"]+)"/)[1].replace(/&quot;/g, '"'));
    const isolated = labels.find(label => label.title === "Ensam aktivitet");
    assert.equal(isolated.inner, standalone.inner);
    assert.equal(isolated.outer, standalone.outer);
    const first = labels.find(label => label.title === "Överlapp ett");
    const second = labels.find(label => label.title === "Överlapp två");
    assert.ok(first.inner > second.outer, "Overlapping events must stay in separate radial tracks");
    assert.ok(isolated.outer - isolated.inner > (first.outer - first.inner) * 1.9);
});

test("events clipping both period boundaries produce a complete annulus without duplication", () => {
    const html = buildDocument(options([event("Hela året", "2025-12-01", "2027-02-01")]));
    assert.equal((html.match(/aria-label="Hela året ·/g) || []).length, 1);
    const arc = html.match(/class="print-event-arc" data-from="0" data-to="1" data-lane="0" d="([^"]+)"/);
    assert.ok(arc);
    assert.equal((arc[1].match(/M /g) || []).length, 2);
    assert.doesNotMatch(html, /NaN|Infinity/);
});

test("print reuses screen ring backgrounds and contrasting event text colors", () => {
    const html = buildDocument(options([event("Hajk", "2026-01-01", "2026-02-01")], {
        eventColors: { Hajk: "#eeeeee" }, eventTextColors: { Hajk: "#17303b" },
        ringBackgroundColors: { board: "#dfeceb" }
    }));
    assert.match(html, /class="print-ring-background"[^>]+fill="#dfeceb"/);
    assert.match(html, /class="print-event-arc"[^>]+fill="#eeeeee"/);
    assert.match(html, /<text[^>]+fill="#17303b"/);
});

test("text is escaped and full list descriptions are never truncated", () => {
    const title = '<img src=x onerror="alert(1)">';
    const notes = "<script>alert('x')</script>\n" + "Fullständig anteckning ".repeat(80);
    const input = options([event(title, "2026-01-01", undefined, { notes })], { mode: "list" });
    input.wheel.name = "<Kår & vänner>";
    const original = structuredClone(input);
    const html = buildDocument(input);
    assert.doesNotMatch(html, /<img|<script>/);
    assert.match(html, /&lt;Kår &amp; vänner&gt;/);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
    assert.ok(html.includes("Fullständig anteckning ".repeat(80)));
    assert.deepEqual(input, original);
});

test("empty selections and periods produce informative print documents", () => {
    assert.match(buildDocument(options([], { rings: [] })), /Inga ringar valda/);
    assert.match(buildDocument(options([], { mode: "list" })), /Inga händelser i den valda perioden/);
    assert.throws(() => buildDocument(options([], { mode: "invalid" })), /Okänd utskriftslayout/);
});

function labelLayout(fields = {}) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "arshjul-print.js"), "utf8");
    const helpers = vm.createContext({});
    vm.runInContext(source.slice(source.indexOf("    const DAY"), source.indexOf("    function renderWheel(")), helpers);
    return helpers.layoutEventLabel({
        inner: 300, outer: 345, from: 0.25, to: 0.25 + 7 / 365,
        title: "Vårens stora scoutdag", dates: "1 apr. – 3 apr.", details: ["Scoutgården", "Ansv: Anna"],
        ...fields
    });
}

test("short event names wrap and take priority over all metadata", () => {
    const lines = labelLayout();
    const titles = lines.filter(line => line.kind === "title");
    assert.ok(titles.length > 1, "The name must use several lines instead of a single truncated line");
    assert.equal(titles.map(line => line.text).join(" "), "Vårens stora scoutdag");
    assert.ok(titles.every(line => !line.text.includes("…")));
    assert.equal(lines.filter(line => line.kind === "date").length, 0);
});

test("long unbroken names can wrap at character boundaries", () => {
    const title = "Scoutarrangemangsplanering";
    const lines = labelLayout({ title, outer: 370 });
    assert.equal(lines.filter(line => line.kind === "title").map(line => line.text).join(""), title);
});

test("date intervals are either shown in full or omitted, never truncated", () => {
    for (const outer of [320, 345, 370, 420]) {
        const dates = "1 apr. – 30 apr.";
        const lines = labelLayout({ outer, title: "Hajk", dates });
        const dateLines = lines.filter(line => line.kind === "date");
        if (dateLines.length) assert.equal(dateLines.map(line => line.text).join(" "), dates);
        assert.ok(dateLines.every(line => !line.text.includes("…")));
    }
    const spacious = labelLayout({ title: "Hajk", to: 0.5, outer: 450 });
    assert.equal(spacious.filter(line => line.kind === "date").map(line => line.text).join(" "), "1 apr. – 3 apr.");
});

test("short narrow sectors use their radial length for the name", () => {
    const lines = labelLayout({ inner: 300, outer: 400, title: "Verksamhetsplanering" });
    assert.ok(lines.length > 0);
    assert.ok(lines.every(line => line.rotation !== undefined));
    assert.equal(lines.filter(line => line.kind === "title").map(line => line.text).join(""), "Verksamhetsplanering");
});

test("truncated names never surrender space to dates or other details", () => {
    const lines = labelLayout({ outer: 315, title: "En mycket lång händelse som inte kan få plats i den lilla rutan" });
    assert.ok(lines.some(line => line.text.includes("…")));
    assert.ok(lines.every(line => line.kind === "title"));
});

test("names are escaped both in label data and visible SVG text", () => {
    const html = buildDocument(options([event('<img src=x onerror="alert(1)">', "2026-01-01", "2026-04-01")]));
    assert.doesNotMatch(html, /<img src/);
    assert.match(html, /&lt;img/);
    assert.match(html, /context\.measureText/);
});
