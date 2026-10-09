(function () {
    function count(value) {
        if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
        const number = Number(value);
        return Number.isSafeInteger(number) && number >= 0 ? number : null;
    }

    function normalizeOverride(input, departments) {
        if (!input || typeof input !== "object") return null;
        const result = { departments: {}, officials: count(input.officials) };
        let specified = result.officials !== null;
        departments.forEach(department => {
            const row = input.departments?.[department];
            result.departments[department] = {
                scouts: department === "Ledare" ? null : count(row?.scouts),
                leaders: count(row?.leaders),
                parents: department === "Ledare" ? null : count(row?.parents)
            };
            if (Object.values(result.departments[department]).some(value => value !== null)) specified = true;
        });
        return specified ? result : null;
    }

    function totals(departments, participants) {
        const result = { scouts: 0, leaders: 0, parents: 0, total: 0, complete: true, hasCounts: false };
        const include = (value, category) => {
            if (value === null || value === undefined) result.complete = false;
            else {
                result.hasCounts = true;
                result[category] += value;
            }
        };
        departments.forEach(department => {
            const row = participants?.departments?.[department];
            if (department !== "Ledare") {
                include(row?.scouts, "scouts");
                const parents = row?.parents === undefined ? 0 : row.parents;
                if (parents !== 0) include(parents, "parents");
            }
            include(row?.leaders, "leaders");
        });
        include(participants?.officials, "leaders");
        result.total = result.scouts + result.leaders + result.parents;
        return result;
    }

    function resolve(arrangement, date, meal = null, base = arrangement.participants) {
        const departments = arrangement.departments || [];
        const day = normalizeOverride(arrangement.participant_days?.[date], departments);
        const override = normalizeOverride(meal?.participants_override, departments);
        const participants = {
            departments: Object.fromEntries(departments.map(department => {
                const row = {};
                ["scouts", "leaders", "parents"].forEach(field => {
                    const baseValue = base?.departments?.[department]?.[field];
                    row[field] = department === "Ledare" && field !== "leaders" ? null
                        : override?.departments[department]?.[field] ?? day?.departments[department]?.[field]
                            ?? (baseValue === undefined ? field === "parents" ? 0 : null : baseValue);
                });
                return [department, row];
            })),
            officials: override?.officials ?? day?.officials ?? base?.officials ?? null
        };
        return { participants, totals: totals(departments, participants), source: override ? "meal" : day ? "day" : "arrangement" };
    }

    window.GTScoutParticipants = { normalizeOverride, totals, resolve };
})();