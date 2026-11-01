const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadSunTimes(authState = null) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "sun-times.js"), "utf8");
    const context = vm.createContext({
        window: {
            GTScoutAuth: authState ? { getState: () => authState } : undefined
        },
        console
    });
    vm.runInContext(source, context);
    return context.window.GTScoutSunTimes;
}

const GULLBRANDSTORP = { lat: 56.6994, lon: 12.7439 };

// Objekt från vm-kontexten har annan Object-prototyp – serialisera före deepEqual.
const roundTrip = value => JSON.parse(JSON.stringify(value));

test("calculate returns sunrise and sunset for a summer day", () => {
    const sun = loadSunTimes();
    const times = roundTrip(sun.calculate("2026-06-15", GULLBRANDSTORP.lat, GULLBRANDSTORP.lon));
    assert.deepEqual(times, { sunrise: "04:16", sunset: "22:03" });
});

test("calculate returns sunrise and sunset for a winter day", () => {
    const sun = loadSunTimes();
    const times = roundTrip(sun.calculate("2026-01-15", GULLBRANDSTORP.lat, GULLBRANDSTORP.lon));
    assert.deepEqual(times, { sunrise: "08:34", sunset: "16:04" });
});

test("calculate returns null for midnight sun and polar night", () => {
    const sun = loadSunTimes();
    assert.equal(sun.calculate("2026-06-15", 69.65, 18.96), null); // midnattssol i Tromsø
    assert.equal(sun.calculate("2026-12-15", 69.65, 18.96), null); // polarnatt i Tromsø
});

test("calculate returns null for missing or invalid dates", () => {
    const sun = loadSunTimes();
    assert.equal(sun.calculate(""), null);
    assert.equal(sun.calculate(null), null);
    assert.equal(sun.calculate("inte-ett-datum"), null);
});

test("location falls back to kar home location and then to default", () => {
    const sun = loadSunTimes({ karLatitude: 59.3293, karLongitude: 18.0686 });
    assert.deepEqual(roundTrip(sun.resolveLocation(56.1, 12.7)), { lat: 56.1, lon: 12.7, source: "arrangement" });
    assert.deepEqual(roundTrip(sun.resolveLocation(null, null)), { lat: 59.3293, lon: 18.0686, source: "kar" });
    assert.deepEqual(roundTrip(sun.resolveLocation(95, 12.7)), { lat: 59.3293, lon: 18.0686, source: "kar" });

    const sunWithoutKar = loadSunTimes();
    assert.deepEqual(roundTrip(sunWithoutKar.resolveLocation(null, null)), { lat: GULLBRANDSTORP.lat, lon: GULLBRANDSTORP.lon, source: "default" });
    assert.deepEqual(roundTrip(sunWithoutKar.resolveLocation(undefined, undefined)), { lat: GULLBRANDSTORP.lat, lon: GULLBRANDSTORP.lon, source: "default" });
});

test("sunriseTime and sunsetTime return formatted times or empty string", () => {
    const sun = loadSunTimes();
    assert.equal(sun.sunriseTime("2026-06-15", GULLBRANDSTORP.lat, GULLBRANDSTORP.lon), "04:16");
    assert.equal(sun.sunsetTime("2026-06-15", GULLBRANDSTORP.lat, GULLBRANDSTORP.lon), "22:03");
    assert.equal(sun.sunsetTime("2026-06-15", 69.65, 18.96), "");
    assert.equal(sun.sunsetTime(""), "");
});

test("parseCoordinates accepts common coordinate formats", () => {
    const sun = loadSunTimes();
    const expected = { lat: 56.6994, lon: 12.7439 };
    assert.deepEqual(roundTrip(sun.parseCoordinates("56.6994, 12.7439")), expected);
    assert.deepEqual(roundTrip(sun.parseCoordinates("56.6994,12.7439")), expected);
    assert.deepEqual(roundTrip(sun.parseCoordinates("56.6994 12.7439")), expected);
    assert.deepEqual(roundTrip(sun.parseCoordinates("56,6994, 12,7439")), expected);
    assert.deepEqual(roundTrip(sun.parseCoordinates("56,6994; 12,7439")), expected);
    assert.deepEqual(roundTrip(sun.parseCoordinates("56,6994 12,7439")), expected);
    assert.deepEqual(roundTrip(sun.parseCoordinates("-33.86, 151.21")), { lat: -33.86, lon: 151.21 });
});

test("parseCoordinates rejects invalid input", () => {
    const sun = loadSunTimes();
    assert.equal(sun.parseCoordinates(""), null);
    assert.equal(sun.parseCoordinates(null), null);
    assert.equal(sun.parseCoordinates("abc"), null);
    assert.equal(sun.parseCoordinates("56.6994"), null);
    assert.equal(sun.parseCoordinates("95, 200"), null);
    assert.equal(sun.parseCoordinates("56.6994, abc"), null);
});
