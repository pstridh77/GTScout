const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const pad = value => String(value).padStart(2, "0");

function loadHome({ withRecurrence = true, stored = {} } = {}) {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) {
            elements.set(id, {
                innerHTML: "",
                textContent: "",
                value: "",
                classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
                addEventListener() {},
                querySelector: () => null,
                querySelectorAll: () => []
            });
        }
        return elements.get(id);
    };
    let yearWheelChange = null;
    const context = vm.createContext({
        window: {
            addEventListener() {},
            GTScoutYearWheelSync: { init: options => { yearWheelChange = options.onChange; } }
        },
        document: {
            getElementById: element,
            querySelectorAll: () => [],
            addEventListener() {}
        },
        localStorage: { getItem: key => (key in stored ? stored[key] : null), setItem() {}, removeItem() {} },
        console
    });
    if (withRecurrence) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "arshjul-recurrence.js"), "utf8"), context);
    }
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "hem.js"), "utf8"), context);
    return { element, showWheels: wheels => yearWheelChange(wheels) };
}

// Den 15:e i månaden ett givet antal månader framåt – alltid ett giltigt datum.
function futureDate(monthsAhead) {
    const now = new Date();
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsAhead, 15));
    return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-15`;
}

const wheel = events => [{ id: "wheel-1", name: "Kårens årshjul", events }];

test("recurring year wheel event from a past year appears within the next 12 months", () => {
    const { element, showWheels } = loadHome();
    const date = futureDate(6);
    const [year, month, day] = date.split("-").map(Number);
    const startDate = `${year - 2}-${pad(month)}-${pad(day)}`;
    showWheels(wheel([{
        id: "event-1", ring_id: "ring-1", title: "Vårmöte",
        start_date: startDate, end_date: startDate,
        recurrence: { type: "yearly_date", month, day }, exceptions: {}
    }]));
    const html = element("homeUpcoming").innerHTML;
    assert.ok(html.includes("Vårmöte"), "kommande tillfälle av återkommande händelse ska synas");
    assert.ok(!html.includes(String(year - 2)), "seriens gamla startdatum ska inte visas");
});

test("non-recurring events within 12 months are shown, later ones are not", () => {
    const { element, showWheels } = loadHome();
    const near = futureDate(6);
    const far = futureDate(13);
    showWheels(wheel([
        { id: "event-1", ring_id: "ring-1", title: "Vårläger", start_date: near, end_date: near },
        { id: "event-2", ring_id: "ring-1", title: "Avlägset läger", start_date: far, end_date: far }
    ]));
    const html = element("homeUpcoming").innerHTML;
    assert.ok(html.includes("Vårläger"));
    assert.ok(!html.includes("Avlägset läger"));
});

test("ongoing multi-day events are shown", () => {
    const { element, showWheels } = loadHome();
    const day = 86400000;
    const start = new Date(Date.now() - day).toISOString().slice(0, 10);
    const end = new Date(Date.now() + day).toISOString().slice(0, 10);
    showWheels(wheel([{ id: "event-1", ring_id: "ring-1", title: "Helgläger", start_date: start, end_date: end }]));
    assert.ok(element("homeUpcoming").innerHTML.includes("Helgläger"));
});

test("count setting applies across types without a per-type limit", () => {
    const { element, showWheels } = loadHome({ stored: { gtscout_home_upcoming_count: "5" } });
    const events = [1, 2, 3, 4, 5].map(months => {
        const date = futureDate(months);
        return { id: `event-${months}`, ring_id: "ring-1", title: `Händelse ${months}`, start_date: date, end_date: date };
    });
    showWheels(wheel(events));
    const html = element("homeUpcoming").innerHTML;
    const positions = [1, 2, 3, 4, 5].map(months => html.indexOf(`Händelse ${months}`));
    assert.ok(positions.every(position => position >= 0), "alla fem händelser ska synas");
    assert.deepEqual(positions, [...positions].sort((left, right) => left - right), "händelserna ska visas i datumordning");
});

test("without the recurrence module only future series start dates are shown", () => {
    const { element, showWheels } = loadHome({ withRecurrence: false });
    const date = futureDate(6);
    const [year, month, day] = date.split("-").map(Number);
    const startDate = `${year - 2}-${pad(month)}-${pad(day)}`;
    showWheels(wheel([{
        id: "event-1", ring_id: "ring-1", title: "Vårmöte",
        start_date: startDate, end_date: startDate,
        recurrence: { type: "yearly_date", month, day }, exceptions: {}
    }]));
    assert.ok(!element("homeUpcoming").innerHTML.includes("Vårmöte"));
});
