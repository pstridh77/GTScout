(function () {
    const DAY = 86400000;
    const TYPES = ["weekly", "monthly_date", "monthly_weekday", "yearly_date", "yearly_weekday", "yearly_week"];
    const WEEKDAYS = ["måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"];
    const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
    const TEXT_FIELDS = { title: 120, responsible: 100, location: 120, notes: 2000 };
    const key = date => date.toISOString().slice(0, 10);
    const parse = value => new Date(`${value}T12:00:00Z`);
    const addDays = (value, days) => key(new Date(parse(value).getTime() + days * DAY));
    const weekday = date => (date.getUTCDay() + 6) % 7 + 1;

    function isDate(value) {
        return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
            && Number.isFinite(parse(value).getTime()) && key(parse(value)) === value;
    }

    function integer(value, min, max, label) {
        if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Ogiltigt ${label} i upprepningen.`);
        return value;
    }

    function normalizeRule(input) {
        if (input == null) return null;
        if (!input || !TYPES.includes(input.type)) throw new Error("Okänd typ av upprepning.");
        const rule = { type: input.type };
        if (input.type.includes("weekday") || input.type === "weekly" || input.type === "yearly_week") {
            rule.weekday = integer(input.weekday, 1, 7, "veckodag");
        }
        if (input.type.includes("weekday")) rule.ordinal = integer(input.ordinal, 1, 5, "ordningsnummer");
        if (input.type === "monthly_date" || input.type === "yearly_date") {
            rule.day = integer(input.day, 1, 31, "datum");
        }
        if (input.type === "yearly_date" || input.type === "yearly_weekday") {
            rule.month = integer(input.month, 1, 12, "månad");
        }
        if (input.type === "yearly_week") rule.week = integer(input.week, 1, 53, "veckonummer");
        if (input.until) {
            if (!isDate(input.until)) throw new Error("Ogiltigt slutdatum för upprepningen.");
            rule.until = input.until;
        }
        return rule;
    }

    function normalizeExceptions(input) {
        if (input == null) return {};
        if (typeof input !== "object" || Array.isArray(input)) throw new Error("Ogiltiga undantag för upprepningen.");
        return Object.fromEntries(Object.entries(input).map(([originalDate, value]) => {
            if (!isDate(originalDate) || !value || typeof value !== "object" || Array.isArray(value)) {
                throw new Error("Ogiltigt tillfälle i upprepningens undantag.");
            }
            if (value.cancelled === true) return [originalDate, { cancelled: true }];
            const result = {};
            for (const field of ["start_date", "end_date"]) {
                if (value[field] !== undefined) {
                    if (!isDate(value[field])) throw new Error("Ogiltigt datum i ett ändrat tillfälle.");
                    result[field] = value[field];
                }
            }
            if ((result.start_date === undefined) !== (result.end_date === undefined)
                || result.end_date < result.start_date) throw new Error("Ogiltigt datumintervall i ett ändrat tillfälle.");
            for (const [field, limit] of Object.entries(TEXT_FIELDS)) {
                if (value[field] !== undefined) {
                    result[field] = String(value[field]).trim().slice(0, limit).trimEnd();
                    if (field === "title" && !result[field]) throw new Error("Ett ändrat tillfälle måste ha en rubrik.");
                }
            }
            return [originalDate, result];
        }));
    }

    function monthDate(year, month, day) {
        const first = parse(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`);
        const next = new Date(first);
        next.setUTCMonth(next.getUTCMonth() + 1);
        const lastDay = new Date(next.getTime() - DAY).getUTCDate();
        first.setUTCDate(Math.min(day, lastDay));
        return key(first);
    }

    function nthWeekday(year, month, ordinal, day) {
        const first = monthDate(year, month, 1);
        const candidate = addDays(first, (day - weekday(parse(first)) + 7) % 7 + (ordinal - 1) * 7);
        // A fifth weekday that does not exist is not a different weekday on the month's last day.
        return candidate.slice(0, 7) === first.slice(0, 7) ? candidate : null;
    }

    function isoWeekDate(year, week, day) {
        const jan4 = `${String(year).padStart(4, "0")}-01-04`;
        const monday = parse(jan4).getTime() + (1 - weekday(parse(jan4))) * DAY;
        const result = new Date(monday + ((week - 1) * 7 + day - 1) * DAY);
        const thursday = new Date(result.getTime() + (4 - day) * DAY);
        return thursday.getUTCFullYear() === year && isDate(key(result)) ? key(result) : null;
    }

    function dates(event, from, to) {
        const rule = normalizeRule(event.recurrence);
        const start = from > event.start_date ? from : event.start_date;
        const end = rule.until && rule.until < to ? rule.until : to;
        if (start > end) return [];
        const result = [];
        const include = value => { if (value && value >= start && value <= end) result.push(value); };
        if (rule.type === "weekly") {
            let value = addDays(start, (rule.weekday - weekday(parse(start)) + 7) % 7);
            while (value <= end) {
                include(value);
                if (value >= "9999-12-25") break;
                value = addDays(value, 7);
            }
        } else {
            const firstYear = Math.max(1, Number(start.slice(0, 4)) - (rule.type === "yearly_week" ? 1 : 0));
            const lastYear = Math.min(9999, Number(end.slice(0, 4)) + (rule.type === "yearly_week" ? 1 : 0));
            for (let year = firstYear; year <= lastYear; year++) {
                if (rule.type === "yearly_week") include(isoWeekDate(year, rule.week, rule.weekday));
                else if (rule.type === "yearly_date") include(monthDate(year, rule.month, rule.day));
                else if (rule.type === "yearly_weekday") include(nthWeekday(year, rule.month, rule.ordinal, rule.weekday));
                else {
                    for (let month = 1; month <= 12; month++) {
                        include(rule.type === "monthly_date"
                            ? monthDate(year, month, rule.day) : nthWeekday(year, month, rule.ordinal, rule.weekday));
                    }
                }
            }
        }
        return result;
    }

    function occurrence(event, originalDate, includeCancelled = false) {
        if (!isDate(originalDate) || !dates(event, originalDate, originalDate).includes(originalDate)) return null;
        const override = normalizeExceptions(event.exceptions)[originalDate];
        if (override?.cancelled && !includeCancelled) return null;
        const duration = Math.round((parse(event.end_date) - parse(event.start_date)) / DAY);
        const endDate = addDays(originalDate, duration);
        if (!isDate(endDate)) throw new Error("Händelsens slutdatum ligger utanför kalenderintervallet.");
        return {
            ...event, start_date: originalDate, end_date: endDate, ...override,
            id: `${event.id}@${originalDate}`, series_id: event.id, recurrence_id: originalDate,
            is_exception: Boolean(override), cancelled: Boolean(override?.cancelled)
        };
    }

    function expand(events, range) {
        const from = key(range.start);
        const to = key(range.end);
        const overlaps = event => event.start_date <= to && event.end_date >= from;
        return events.flatMap(event => {
            if (!event.recurrence) return overlaps(event) ? [event] : [];
            const duration = Math.round((parse(event.end_date) - parse(event.start_date)) / DAY);
            const earliest = new Date(Math.max(parse("0001-01-01").getTime(), parse(from).getTime() - duration * DAY));
            const originals = new Set(dates(event, key(earliest), to));
            // Moved exceptions can enter the range even when their original date is outside it.
            Object.keys(normalizeExceptions(event.exceptions)).forEach(value => originals.add(value));
            return [...originals].sort().map(value => occurrence(event, value)).filter(value => value && overlaps(value));
        });
    }

    function describe(input) {
        const rule = normalizeRule(input);
        if (!rule) return "Upprepas inte";
        const day = WEEKDAYS[rule.weekday - 1];
        const ordinal = ["första", "andra", "tredje", "fjärde", "femte"][rule.ordinal - 1];
        const labels = {
            weekly: `Varje ${day}`,
            monthly_date: `Varje månad den ${rule.day}`,
            monthly_weekday: `Den ${ordinal} ${day}en varje månad`,
            yearly_date: `Varje år den ${rule.day} ${MONTHS[rule.month - 1]}`,
            yearly_weekday: `Varje år den ${ordinal} ${day}en i ${MONTHS[rule.month - 1]}`,
            yearly_week: `Varje år ${day} vecka ${rule.week}`
        };
        return labels[rule.type] + (rule.until ? `, till och med ${rule.until}` : "");
    }

    window.GTScoutYearWheelRecurrence = { normalizeRule, normalizeExceptions, expand, occurrence, describe };
})();
