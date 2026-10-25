const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "arshjul-recurrence.js"), "utf8"), context);
const recurrence = context.window.GTScoutYearWheelRecurrence;
const plain = value => JSON.parse(JSON.stringify(value));
const range = (from, to) => ({ start: new Date(`${from}T00:00:00Z`), end: new Date(`${to}T23:59:59Z`) });
const event = (rule, fields = {}) => ({
    id: "series", ring_id: "common", title: "Städdag", start_date: "2026-01-01", end_date: "2026-01-01",
    responsible: "Anna", location: "Stugan", notes: "", recurrence: rule, exceptions: {}, ...fields
});
const expand = (item, from = "2026-01-01", to = "2026-12-31") => plain(recurrence.expand([item], range(from, to)));
const starts = (...args) => expand(...args).map(item => item.start_date);

test("annual ISO-week series changes just one year and keeps a stable original identity", () => {
    const series = event({ type: "yearly_week", week: 46, weekday: 7 }, {
        exceptions: { "2027-11-21": { start_date: "2027-11-13", end_date: "2027-11-13", location: "Annan plats" } }
    });
    const occurrences = expand(series, "2026-01-01", "2028-12-31");
    assert.deepEqual(occurrences.map(item => item.start_date), ["2026-11-15", "2027-11-13", "2028-11-19"]);
    assert.equal(occurrences[1].id, "series@2027-11-21");
    assert.equal(occurrences[1].series_id, "series");
    assert.equal(occurrences[1].recurrence_id, "2027-11-21");
    assert.equal(occurrences[1].location, "Annan plats");
    assert.equal(occurrences[2].location, "Stugan");
    assert.equal(occurrences[1].is_exception, true);
});

test("weekly Tuesdays respect the anchor and inclusive last start date", () => {
    assert.deepEqual(starts(event({ type: "weekly", weekday: 2, until: "2026-03-31" }, {
        start_date: "2026-03-03", end_date: "2026-03-03"
    }), "2026-02-01", "2026-04-30"), ["2026-03-03", "2026-03-10", "2026-03-17", "2026-03-24", "2026-03-31"]);
});

test("monthly dates clamp to the month's last day without drifting in following months", () => {
    assert.deepEqual(starts(event({ type: "monthly_date", day: 31 }), "2026-01-01", "2026-04-30"),
        ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    assert.deepEqual(starts(event({ type: "monthly_date", day: 31 }), "2028-02-01", "2028-03-31"),
        ["2028-02-29", "2028-03-31"]);
});

test("annual leap day clamps to February's last day and returns to leap day", () => {
    assert.deepEqual(starts(event({ type: "yearly_date", month: 2, day: 29 }), "2026-01-01", "2028-12-31"),
        ["2026-02-28", "2027-02-28", "2028-02-29"]);
});

test("third Thursday supports both monthly and September-only patterns", () => {
    assert.deepEqual(starts(event({ type: "monthly_weekday", ordinal: 3, weekday: 4 }), "2026-08-01", "2026-10-31"),
        ["2026-08-20", "2026-09-17", "2026-10-15"]);
    assert.deepEqual(starts(event({ type: "yearly_weekday", month: 9, ordinal: 3, weekday: 4 }), "2026-01-01", "2028-12-31"),
        ["2026-09-17", "2027-09-16", "2028-09-21"]);
});

test("a missing fifth weekday or ISO week 53 is skipped rather than changed to another day", () => {
    assert.deepEqual(starts(event({ type: "monthly_weekday", ordinal: 5, weekday: 1 }), "2026-02-01", "2026-03-31"),
        ["2026-03-30"]);
    assert.deepEqual(starts(event({ type: "yearly_week", week: 53, weekday: 7 }), "2026-01-01", "2028-12-31"),
        ["2027-01-03"]);
});

test("ISO week one and operational-year ranges work across calendar-year boundaries", () => {
    const series = event({ type: "yearly_week", week: 1, weekday: 1 });
    assert.deepEqual(starts(series, "2026-08-01", "2027-07-31"), ["2027-01-04"]);
    assert.deepEqual(starts(series, "2029-01-01", "2029-12-31"), ["2029-01-01", "2029-12-31"]);
});

test("multi-day occurrences overlapping the range include their complete date span", () => {
    const series = event({ type: "yearly_date", month: 12, day: 30 }, {
        start_date: "2025-12-30", end_date: "2026-01-02"
    });
    const occurrences = expand(series);
    assert.deepEqual(occurrences.map(item => [item.start_date, item.end_date]),
        [["2025-12-30", "2026-01-02"], ["2026-12-30", "2027-01-02"]]);
});

test("moved exceptions enter and leave ranges, replace originals, and retain duration overrides", () => {
    const series = event({ type: "yearly_date", month: 11, day: 15 }, {
        exceptions: {
            "2026-11-15": { start_date: "2027-01-02", end_date: "2027-01-04" },
            "2027-11-15": { start_date: "2026-12-31", end_date: "2027-01-01" }
        }
    });
    assert.deepEqual(starts(series), ["2026-12-31"]);
    assert.deepEqual(starts(series, "2027-01-01", "2027-12-31"), ["2027-01-02", "2026-12-31"]);
    assert.equal(expand(series)[0].end_date, "2027-01-01");
});

test("cancelled occurrences can be restored and patches inherit untouched series fields", () => {
    const series = event({ type: "monthly_date", day: 15 }, {
        exceptions: { "2026-02-15": { cancelled: true }, "2026-03-15": { notes: "Ny anteckning", responsible: "" } }
    });
    assert.deepEqual(starts(series, "2026-01-01", "2026-03-31"), ["2026-01-15", "2026-03-15"]);
    const march = plain(recurrence.occurrence({ ...series, location: "Ny plats" }, "2026-03-15"));
    assert.equal(march.location, "Ny plats");
    assert.equal(march.responsible, "");
    assert.equal(recurrence.occurrence(series, "2026-02-15"), null);
    assert.equal(recurrence.occurrence(series, "2026-02-15", true).cancelled, true);
    delete series.exceptions["2026-02-15"];
    assert.equal(starts(series, "2026-01-01", "2026-03-31").length, 3);
    assert.equal(recurrence.occurrence(series, "2026-03-16"), null);
});

test("invalid rules and exceptions are rejected explicitly and normalized text is bounded", () => {
    for (const rule of [{ type: "daily" }, { type: "weekly", weekday: 0 },
        { type: "monthly_date", day: 32 }, { type: "yearly_date", month: 13, day: 1 },
        { type: "yearly_week", week: 54, weekday: 1 }, { type: "weekly", weekday: 1, until: "2026-02-30" }]) {
        assert.throws(() => recurrence.normalizeRule(rule), /upprepning|datum|vecko|månad/);
    }
    for (const exceptions of [[], { bad: {} }, { "2026-01-01": { start_date: "2026-01-02" } },
        { "2026-01-01": { start_date: "2026-01-03", end_date: "2026-01-02" } }, { "2026-01-01": { title: "" } }]) {
        assert.throws(() => recurrence.normalizeExceptions(exceptions));
    }
    const normalized = plain(recurrence.normalizeExceptions({ "2026-01-01": { location: ` ${"A".repeat(130)} `, notes: "" } }));
    assert.equal(normalized["2026-01-01"].location.length, 120);
    assert.equal(normalized["2026-01-01"].notes, "");
});

test("expansion never mutates stored series and leaves one-off events unchanged", () => {
    const series = event({ type: "weekly", weekday: 2 });
    const before = structuredClone(series);
    assert.equal(expand(series).length, 52);
    assert.deepEqual(series, before);
    const once = { ...series, recurrence: null };
    assert.deepEqual(expand(once), [once]);
});

const task = (id, fields = {}) => ({ id, text: "Skicka kallelse", responsible: "Anna", done: false, ...fields });

test("checklists inherit templates independently, without carrying completion to another year or mutating storage", () => {
    const series = event({ type: "yearly_date", month: 3, day: 15 }, { checklist: [task("invite", { done: true })] });
    const before = structuredClone(series);
    const occurrences = expand(series, "2026-01-01", "2027-12-31");
    assert.equal(occurrences[0].checklist[0].done, false);
    occurrences[0].checklist[0].done = true;
    occurrences[0].checklist[0].responsible = "Bo";
    assert.deepEqual(occurrences[1].checklist, [task("invite")]);
    assert.deepEqual(series, before);
});

test("saved full lists, empty lists and removed lists override only their original occurrence", () => {
    const series = event({ type: "yearly_date", month: 3, day: 15 }, {
        checklist: [task("new-template")],
        exceptions: { "2026-03-15": { start_date: "2026-04-01", end_date: "2026-04-01" } },
        occurrence_checklists: {
            "2026-03-15": [task("old", { text: "Ordna projektor", responsible: "Bo", done: true })],
            "2027-03-15": [],
            "2028-03-15": null
        }
    });
    const occurrences = expand(series, "2026-01-01", "2029-12-31");
    assert.equal(occurrences[0].start_date, "2026-04-01");
    assert.deepEqual(occurrences[0].checklist, series.occurrence_checklists["2026-03-15"]);
    assert.deepEqual(occurrences[1].checklist, []);
    assert.equal(occurrences[2].checklist, null);
    assert.deepEqual(occurrences[3].checklist, series.checklist);
    delete series.exceptions["2026-03-15"];
    assert.equal(expand(series)[0].checklist[0].done, true);
});

test("checklist normalization validates identities, bounds text and preserves explicit absence", () => {
    assert.equal(recurrence.normalizeChecklist(undefined), null);
    assert.deepEqual(plain(recurrence.normalizeChecklist([])), []);
    const bounded = plain(recurrence.normalizeChecklist([task("a", { text: "x".repeat(161), responsible: "A".repeat(101) })]));
    assert.equal(bounded[0].text.length, 160);
    assert.equal(bounded[0].responsible.length, 100);
    for (const invalid of [{}, [null], [task("")], [task("a"), task("a")], [task("a", { text: " " })], [task("a", { done: "true" })]]) {
        assert.throws(() => recurrence.normalizeChecklist(invalid), /Ogiltig/);
    }
    for (const invalid of [[], { bad: [] }, { "2026-02-30": [] }, { "2026-01-01": {} }]) {
        assert.throws(() => recurrence.normalizeOccurrenceChecklists(invalid), /Ogiltig/);
    }
});
