(function () {
    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    }

    function formatDate(value, options = { weekday: "long", day: "numeric", month: "long", year: "numeric" }) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "";
        return new Intl.DateTimeFormat("sv-SE", options).format(new Date(`${value}T12:00:00`));
    }

    function getTargetDepartments(entry, arrangement) {
        const activeDepartments = arrangement.departments || [];
        return entry.shared === false
            ? activeDepartments.filter(department => (entry.departments || []).includes(department))
            : activeDepartments.filter(department => !(entry.excluded_departments || []).includes(department));
    }

    function renderList(items, emptyText) {
        return items.length
            ? `<ul>${items.map(item => `<li>${item}</li>`).join("")}</ul>`
            : `<p class="empty">${escapeHtml(emptyText)}</p>`;
    }

    function renderSummary(arrangement) {
        const totals = window.GTScoutParticipants?.totals(arrangement.departments || [], arrangement.participants || {});
        const participantText = totals?.hasCounts
            ? `${totals.total} deltagare${totals.complete ? "" : " (preliminärt)"}`
            : "Deltagarantal saknas";
        const dates = [formatDate(arrangement.start_date, { day: "numeric", month: "long", year: "numeric" }), formatDate(arrangement.end_date, { day: "numeric", month: "long", year: "numeric" })].filter(Boolean);
        const dateText = dates.length > 1 && arrangement.start_date !== arrangement.end_date ? `${dates[0]}–${dates[1]}` : dates[0] || "Datum saknas";
        return `<header class="document-header"><p class="eyebrow">GTScout · Arrangemang</p><h1>${escapeHtml(arrangement.title)}</h1><p>${escapeHtml(dateText)}${arrangement.location ? ` · ${escapeHtml(arrangement.location)}` : ""}</p><p>${escapeHtml(arrangement.type || "")}${arrangement.type ? " · " : ""}${escapeHtml(participantText)}</p>${arrangement.description ? `<p class="description">${escapeHtml(arrangement.description)}</p>` : ""}</header>`;
    }

    function renderOverviewHeader(arrangement, includeDescription) {
        const type = String(arrangement.type || "").trim().toLocaleUpperCase("sv-SE");
        const typeLabel = type ? ` · ${escapeHtml(type)}` : "";
        const location = String(arrangement.location || "").trim();
        return `<header class="document-header overview-document-header"><p class="eyebrow">GTScout · Arrangemang${typeLabel}</p><div class="overview-title-line"><h1>${escapeHtml(arrangement.title)}</h1>${location ? `<span class="overview-location"><span aria-hidden="true">·</span> ${escapeHtml(location)}</span>` : ""}</div>${includeDescription && arrangement.description ? `<p class="description">${escapeHtml(arrangement.description)}</p>` : ""}</header>`;
    }

    function getDepartmentColor(department, departmentColors) {
        const departmentOrder = ["Familjescouter", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover", "Ledare"];
        const colorIndex = departmentOrder.indexOf(department);
        return departmentColors[colorIndex >= 0 ? colorIndex : 0];
    }

    function renderParticipantLegend(arrangement, departmentColors) {
        const departments = arrangement.departments || [];
        const participants = arrangement.participants || {};
        const totals = window.GTScoutParticipants?.totals(departments, participants);
        if (!totals?.hasCounts) return "";
        const countLabel = value => Number.isSafeInteger(value) && value >= 0 ? String(value) : "?";
        const departmentItems = departments.map(department => {
            const row = participants.departments?.[department] || {};
            const counts = department === "Ledare"
                ? [`${countLabel(row.leaders)} ledare`]
                : [`${countLabel(row.scouts)} scouter`, `${countLabel(row.leaders)} ledare`];
            if (department !== "Ledare" && row.parents !== undefined && (row.parents === null || row.parents > 0)) {
                counts.push(`${countLabel(row.parents)} ${row.parents === 1 ? "förälder" : "föräldrar"}`);
            }
            const color = getDepartmentColor(department, departmentColors);
            return `<span class="overview-team" style="--team-color:${color.background};--team-text:${color.color}">${escapeHtml(department)}: ${counts.join(" · ")}</span>`;
        }).join("");
        const officials = Number.isSafeInteger(participants.officials) && participants.officials > 0
            ? `<span class="overview-team" style="--team-color:#eef2f3;--team-text:#263238">Övriga ledare: ${participants.officials}</span>` : "";
        const preliminary = totals.complete ? "" : " · preliminärt";
        return `${departmentItems}${officials}<strong class="overview-participant-total" style="padding:1mm 2mm;color:#123f60;font-size:8pt;white-space:nowrap">Totalt: ${totals.total} deltagare${preliminary}</strong>`;
    }

    function renderResponsibilities(arrangement) {
        const rows = (arrangement.responsibilities || []).map(entry => {
            const title = [entry.role, entry.person].filter(Boolean).map(escapeHtml).join(" · ");
            const details = [entry.role_description, entry.description].filter(Boolean).map(escapeHtml).join(" — ");
            return `<li><strong>${title || "Ansvarig"}</strong>${details ? `<small>${details}</small>` : ""}</li>`;
        });
        return `<section><h2>Ansvariga och roller</h2>${renderList(rows, "Inga ansvariga angivna.")}</section>`;
    }

    function getRecipeNames(entry, recipes) {
        const ids = Array.isArray(entry.recipe_ids)
            ? [...new Set(entry.recipe_ids.map(String))]
            : entry.source_type === "recipe" && entry.source_id ? [String(entry.source_id)] : [];
        return ids.map(id => recipes.find(recipe => String(recipe.id) === id)?.namn).filter(Boolean);
    }

    function renderAgendaEntry(entry, arrangement, recipes) {
        const kindNames = { meal: "Måltid", activity: "Aktivitet", program: "Program" };
        const time = entry.time ? `${escapeHtml(entry.time)}${entry.end_time ? `–${escapeHtml(entry.end_time)}` : ""}` : "Heldag";
        const targetDepartments = getTargetDepartments(entry, arrangement);
        const recipesForMeal = entry.kind === "meal" ? getRecipeNames(entry, recipes) : [];
        const recipeText = recipesForMeal.length ? `<p>Recept: ${recipesForMeal.map(escapeHtml).join(", ")}</p>` : "";
        const materials = Array.isArray(entry.materials) && entry.materials.length
            ? `<p>Material: ${entry.materials.map(escapeHtml).join(", ")}</p>` : "";
        return `<article class="agenda-entry"><div class="agenda-time">${time}</div><div><h3>${escapeHtml(entry.title || kindNames[entry.kind] || "Programpunkt")}</h3><p class="agenda-meta">${escapeHtml(kindNames[entry.kind] || "Programpunkt")}${targetDepartments.length ? ` · ${targetDepartments.map(escapeHtml).join(", ")}` : ""}${entry.responsible ? ` · Ansvarig: ${escapeHtml(entry.responsible)}` : ""}${entry.leaders_only ? " · Endast ledare" : ""}</p>${recipeText}${entry.notes ? `<p>${escapeHtml(entry.notes)}</p>` : ""}${materials}</div></article>`;
    }

    function renderAgendaDays(arrangement, recipes) {
        const byDate = new Map();
        [...(arrangement.agenda || [])]
            .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")) || String(left.time || "").localeCompare(String(right.time || "")))
            .forEach(entry => {
                const date = entry.date || "";
                if (!byDate.has(date)) byDate.set(date, []);
                byDate.get(date).push(entry);
            });
        if (!byDate.size) return `<p class="empty">Inga programpunkter planerade.</p>`;
        return [...byDate].map(([date, entries], index) => `<section class="day-section${index ? " page-break" : ""}"><h2>${escapeHtml(formatDate(date) || "Datum saknas")}</h2>${entries.map(entry => renderAgendaEntry(entry, arrangement, recipes)).join("")}</section>`).join("");
    }

    function renderPacking(arrangement, activities) {
        const departments = arrangement.departments || [];
        const equipment = arrangement.equipment || {};
        const rowsByDepartment = new Map(departments.map(department => [department, []]));
        const generalRows = (equipment.items || []).filter(entry => entry.scope === "general").map(entry => escapeHtml(entry.name));
        (equipment.items || []).filter(entry => entry.scope === "department").forEach(entry => rowsByDepartment.get(entry.department)?.push(escapeHtml(entry.name)));
        (arrangement.agenda || []).forEach(entry => {
            const entryMaterials = [...(entry.materials || [])];
            if (entry.kind === "activity" && entry.source_type === "activity") {
                const activity = activities.find(candidate => String(candidate.id) === String(entry.source_id));
                entryMaterials.push(...(activity?.material || []));
            }
            const targets = getTargetDepartments(entry, arrangement);
            entryMaterials.filter(Boolean).forEach(material => {
                const row = `${escapeHtml(material)} <small>(${escapeHtml(entry.title || "Program")})</small>`;
                if (departments.length && targets.length === departments.length) generalRows.push(row);
                else targets.forEach(department => rowsByDepartment.get(department)?.push(row));
            });
        });
        const materialSections = [
            `<section><h3>Gemensamt</h3>${renderList(generalRows, "Inget gemensamt material angivet.")}</section>`,
            ...departments.map(department => `<section><h3>${escapeHtml(department)}</h3>${renderList(rowsByDepartment.get(department) || [], "Inget avdelningsspecifikt material angivet.")}</section>`)
        ].join("");
        const tents = equipment.tents_by_department || {};
        const tentTypes = ["3-manna", "4-manna", "Y-Tält", "Militärtält"];
        const tentRows = departments.map(department => {
            const counts = tentTypes.map(type => ({ type, count: Number(tents[department]?.[type] || 0) })).filter(item => item.count > 0);
            return counts.length ? `<li><strong>${escapeHtml(department)}:</strong> ${counts.map(item => `${item.count} × ${escapeHtml(item.type)}`).join(", ")}</li>` : "";
        }).filter(Boolean);
        const checklist = (arrangement.checklist || []).map(task => `<li class="checklist-item"><span class="checkbox" aria-hidden="true"></span>${escapeHtml(task.text)}${task.done ? " · Klar" : ""}</li>`);
        const notes = String(arrangement.notes || "").trim();
        return `<section class="packing-section page-break"><h2>Packning och förberedelser</h2><div class="packing-grid">${materialSections}</div><section><h3>Tält</h3>${renderList(tentRows, "Ingen tältfördelning angiven.")}</section><section><h3>Checklista</h3>${renderList(checklist, "Ingen checklista angiven.")}</section>${notes ? `<section><h3>Anteckningar</h3><p class="notes">${escapeHtml(notes)}</p></section>` : ""}</section>`;
    }

    function renderPlanningDocument(arrangement, recipes, activities) {
        return `${renderSummary(arrangement)}<div class="intro-grid">${renderResponsibilities(arrangement)}${arrangement.notes ? `<section><h2>Anteckningar</h2><p>${escapeHtml(arrangement.notes)}</p></section>` : ""}</div><section class="schedule-section"><h2>Schema</h2>${renderAgendaDays(arrangement, recipes)}</section>${renderPacking(arrangement, activities)}`;
    }

    function getOverviewDates(arrangement) {
        const agendaDates = [...new Set((arrangement.agenda || []).map(entry => entry.date).filter(Boolean))];
        const startDate = /^\d{4}-\d{2}-\d{2}$/.test(arrangement.start_date || "") ? new Date(`${arrangement.start_date}T12:00:00Z`) : null;
        const endDate = /^\d{4}-\d{2}-\d{2}$/.test(arrangement.end_date || "") ? new Date(`${arrangement.end_date}T12:00:00Z`) : null;
        const datesInRange = [];
        if (startDate && endDate && startDate <= endDate) {
            const currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                datesInRange.push(currentDate.toISOString().slice(0, 10));
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            }
        }
        return [...new Set([...datesInRange, ...agendaDates])].sort();
    }

    function renderOverviewPages(arrangement, recipes, selectedDates = null) {
        const allDates = getOverviewDates(arrangement);
        const dates = selectedDates === null ? allDates : allDates.filter(date => selectedDates.includes(date));
        const pages = [];
        for (let index = 0; index < dates.length; index += 5) pages.push(dates.slice(index, index + 5));
        if (!pages.length) pages.push([]);
        const departmentColors = [
            { background: "#713f91", color: "#fff" },
            { background: "#267532", color: "#fff" },
            { background: "#0876a8", color: "#fff" },
            { background: "#c84c08", color: "#fff" },
            { background: "#ca0753", color: "#fff" },
            { background: "#e1bd23", color: "#1f251b" },
            { background: "#455a64", color: "#fff" }
        ];
        const sharedColor = { background: "#123f60", color: "#fff" };
        const leadersOnlyColor = { background: "#c4cbcd", color: "#263238" };
        const mealColor = { background: "#d94c79", color: "#fff" };
        return pages.map((pageDates, pageIndex) => {
            const pageEntries = (arrangement.agenda || []).filter(entry => pageDates.includes(entry.date));
            const scheduleStartMinutes = 6 * 60;
            const scheduleEndMinutes = 23 * 60;
            const timedEntries = pageEntries.filter(entry => /^\d{2}:\d{2}$/.test(entry.time || "")).flatMap(entry => {
                const [hours, minutes] = entry.time.split(":").map(Number);
                const startMinutes = hours * 60 + minutes;
                const parsedEnd = /^\d{2}:\d{2}$/.test(entry.end_time || "")
                    ? Number(entry.end_time.slice(0, 2)) * 60 + Number(entry.end_time.slice(3))
                    : null;
                const endMinutes = parsedEnd !== null && parsedEnd > startMinutes ? parsedEnd : Math.min(1440, startMinutes + 60);
                if (endMinutes <= scheduleStartMinutes || startMinutes >= scheduleEndMinutes) return [];
                const visibleStartMinutes = Math.max(startMinutes, scheduleStartMinutes);
                const visibleEndMinutes = Math.min(endMinutes, scheduleEndMinutes);
                const targets = entry.leaders_only
                    ? [{ department: "Ledare", ...leadersOnlyColor }]
                    : entry.shared === false
                    ? getTargetDepartments(entry, arrangement).map(department => {
                        const color = getDepartmentColor(department, departmentColors);
                        return { department, ...color };
                    })
                    : [{ department: "Gemensamt", ...sharedColor }];
                return targets.map(target => ({ entry, startMinutes: visibleStartMinutes, endMinutes: visibleEndMinutes, ...target }));
            });
            const mealGroups = new Map();
            if (pageDates.length > 1) {
                pageEntries.filter(entry => entry.kind === "meal" && entry.shared !== false && !entry.leaders_only && /^\d{2}:\d{2}$/.test(entry.time || "")).forEach(entry => {
                    const recipeNames = getRecipeNames(entry, recipes).sort((left, right) => left.localeCompare(right, "sv"));
                    const key = JSON.stringify([entry.title || "", entry.meal_type || "", entry.time, entry.end_time || "", recipeNames]);
                    if (!mealGroups.has(key)) mealGroups.set(key, []);
                    mealGroups.get(key).push(entry);
                });
            }
            const recurringMeals = [...mealGroups.values()].filter(entries =>
                entries.length === pageDates.length && new Set(entries.map(entry => entry.date)).size === pageDates.length
            );
            const recurringMealEntries = new Set(recurringMeals.flat());
            const startMinutes = scheduleStartMinutes;
            const endMinutes = scheduleEndMinutes;
            const timePoints = new Set([startMinutes, endMinutes]);
            timedEntries.forEach(event => {
                timePoints.add(event.startMinutes);
                timePoints.add(event.endMinutes);
            });
            for (let minute = Math.floor(startMinutes / 60) * 60 + 60; minute < endMinutes; minute += 60) timePoints.add(minute);
            const times = [...timePoints].sort((left, right) => left - right);
            const formatTime = minute => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
            const rowHeights = times.map((minute, index) => {
                const nextMinute = times[index + 1];
                return `${nextMinute === undefined ? 24 : nextMinute - minute}fr`;
            });
            const timeLabels = times.map((minute, index) => `<div class="overview-time-cell" style="grid-column:1;grid-row:${index + 3}">${minute % 60 === 0 || index === 0 ? escapeHtml(formatTime(minute)) : ""}</div>`).join("");
            const hourLines = times.map((minute, index) => minute % 60 === 0 && minute !== startMinutes
                ? `<div class="overview-hour-line" aria-hidden="true" style="grid-column:2/-1;grid-row:${index + 3}"></div>`
                : "").join("");
            const dayLines = pageDates.map((date, index) => index
                ? `<div class="overview-day-line" aria-hidden="true" style="grid-column:${index + 2};grid-row:2/-1"></div>`
                : "").join("");
            const allDayEntries = pageDates.map((date, index) => {
                const entries = pageEntries.filter(entry => entry.date === date && !/^\d{2}:\d{2}$/.test(entry.time || ""));
                return `<div class="overview-time-slot overview-all-day" style="grid-column:${index + 2};grid-row:2">${entries.map(entry => {
                    const targets = entry.leaders_only ? ["Ledare"] : entry.shared === false ? getTargetDepartments(entry, arrangement) : ["Gemensamt"];
                    const color = entry.leaders_only
                        ? leadersOnlyColor
                        : entry.shared === false && targets.length
                        ? getDepartmentColor(targets[0], departmentColors)
                        : sharedColor;
                    return `<article class="overview-entry" style="--event-color:${color.background};--event-text:${color.color}"><strong>${escapeHtml(entry.title || "Programpunkt")}</strong>${targets.map(escapeHtml).join(", ")}</article>`;
                }).join("") || `<span class="overview-empty-slot" aria-hidden="true"></span>`}</div>`;
            }).join("");
            const dayHeaders = pageDates.map((date, index) => `<div class="overview-day-heading" style="grid-column:${index + 2};grid-row:1"><span>${escapeHtml(formatDate(date, { weekday: "long" }) || "")}</span><strong>${escapeHtml(formatDate(date, { day: "numeric", month: "short" }) || "Datum saknas")}</strong></div>`).join("");
            const eventMarkup = pageDates.flatMap((date, dateIndex) => {
                const events = timedEntries.filter(event => event.entry.date === date && !recurringMealEntries.has(event.entry)).sort((left, right) => left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes);
                let cluster = [];
                let clusterEnd = -1;
                const assignLanes = () => {
                    const laneEnds = [];
                    cluster.forEach(event => {
                        let laneIndex = laneEnds.findIndex(end => end <= event.startMinutes);
                        if (laneIndex < 0) {
                            laneIndex = laneEnds.length;
                            laneEnds.push(event.endMinutes);
                        } else {
                            laneEnds[laneIndex] = event.endMinutes;
                        }
                        event.laneIndex = laneIndex;
                    });
                    cluster.forEach(event => { event.laneCount = laneEnds.length; });
                    cluster = [];
                };
                events.forEach(event => {
                    if (cluster.length && event.startMinutes >= clusterEnd) assignLanes();
                    cluster.push(event);
                    clusterEnd = Math.max(clusterEnd, event.endMinutes);
                });
                if (cluster.length) assignLanes();
                return events.map(event => {
                    const recipeNames = event.entry.kind === "meal" ? getRecipeNames(event.entry, recipes) : [];
                    const startTime = event.entry.time ? ` · Start ${event.entry.time}` : "";
                    const leaderOnlyLabel = event.entry.leaders_only ? "Ledare · " : "";
                    const title = `${leaderOnlyLabel}${event.entry.title || "Programpunkt"}${recipeNames.length ? ` · ${recipeNames.join(", ")}` : ""}${startTime}`;
                    const startRow = times.indexOf(event.startMinutes) + 3;
                    const endRow = times.indexOf(event.endMinutes) + 3;
                    const color = event;
                    const laneOffset = (100 * event.laneIndex / event.laneCount).toFixed(3);
                    const laneWidth = (100 / event.laneCount).toFixed(3);
                    const responsible = event.endMinutes - event.startMinutes >= 90 && event.entry.responsible
                        ? `<small>Ansvarig: ${escapeHtml(event.entry.responsible)}</small>` : "";
                    return `<article class="overview-entry overview-timed-entry" style="grid-column:${dateIndex + 2};grid-row:${startRow}/${endRow};--lane-offset:${laneOffset}%;--lane-width:calc(${laneWidth}% - 1mm);--event-color:${color.background};--event-text:${color.color}"><strong class="overview-entry-label">${escapeHtml(title)}</strong>${responsible}</article>`;
                });
            }).join("");
            const mealBandMarkup = recurringMeals.map(entries => {
                const meal = entries[0];
                const [hours, minutes] = meal.time.split(":").map(Number);
                const start = hours * 60 + minutes;
                const end = /^\d{2}:\d{2}$/.test(meal.end_time || "")
                    ? Number(meal.end_time.slice(0, 2)) * 60 + Number(meal.end_time.slice(3))
                    : Math.min(1440, start + 60);
                const recipeNames = getRecipeNames(meal, recipes);
                const title = `${meal.meal_type || meal.title || "Måltid"}${recipeNames.length ? ` · ${recipeNames.join(", ")}` : ""}`;
                return `<article class="overview-entry overview-timed-entry overview-entry--meal overview-wide-meal" style="grid-column:2/${pageDates.length + 2};grid-row:${times.indexOf(start) + 3}/${times.indexOf(end) + 3};--event-color:${mealColor.background};--event-text:${mealColor.color}"><strong class="overview-entry-label">${escapeHtml(title)}</strong></article>`;
            }).join("");
            const emptyState = pageDates.length ? "" : `<p class="empty">Inga programpunkter planerade.</p>`;
            const hasLeadersOnly = pageEntries.some(entry => entry.leaders_only);
            const includesLeaderDepartment = (arrangement.departments || []).includes("Ledare");
            const legendDepartmentColors = [...departmentColors];
            if (hasLeadersOnly && includesLeaderDepartment) legendDepartmentColors[6] = leadersOnlyColor;
            const participantLegend = renderParticipantLegend(arrangement, legendDepartmentColors);
            const teams = participantLegend || `<span class="overview-team" style="--team-color:${sharedColor.background};--team-text:${sharedColor.color}">Gemensamt</span>${(arrangement.departments || []).map(department => { const color = getDepartmentColor(department, legendDepartmentColors); return `<span class="overview-team" style="--team-color:${color.background};--team-text:${color.color}">${escapeHtml(department)}</span>`; }).join("")}`;
            const legend = `<div class="overview-legend-row"><strong>Avdelningar</strong><div class="overview-legend">${teams}</div></div>`;
            const pageHeader = renderOverviewHeader(arrangement, pageIndex === 0);
            return `<section class="overview-page${pageIndex ? " page-break" : ""}">${pageHeader}${emptyState}${legend}<div class="overview-grid" style="--overview-day-count:${pageDates.length || 1};--overview-rows:${rowHeights.join(" ")}"><div class="overview-time-heading" style="grid-column:1;grid-row:1 / 2">Tid</div>${dayHeaders}<div class="overview-time-cell overview-all-day-label" style="grid-column:1;grid-row:2">Heldag</div>${allDayEntries}${timeLabels}${hourLines}${dayLines}${eventMarkup}${mealBandMarkup}</div></section>`;
        }).join("");
    }

    function documentStyles(mode) {
        const isOverview = mode === "overview";
        return `@page{size:${isOverview ? "A3 landscape" : "A4 portrait"};margin:${isOverview ? "9mm" : "13mm"}}*{box-sizing:border-box}body{margin:0;color:#142c34;background:#fff;font:10pt/1.4 Arial,sans-serif}h1,h2,h3,p{margin-top:0}h1{margin-bottom:3mm;font-size:${isOverview ? "24pt" : "21pt"}}h2{margin:0 0 4mm;font-size:14pt;color:#164a4d}h3{margin:0 0 2mm;font-size:11pt}p{margin-bottom:2mm}.print-toolbar{display:flex;justify-content:flex-end;margin:0 0 5mm}.print-toolbar button{padding:8px 14px;border:1px solid #a9bcb8;border-radius:4px;background:#f3f7f6;color:#153c4a;font:inherit;font-weight:700;cursor:pointer}.document-header{padding-bottom:4mm;margin-bottom:5mm;border-bottom:1px solid #9cafad}.document-header p{margin:1mm 0;color:#465d62}.document-header .eyebrow{font-size:8pt;font-weight:bold;text-transform:uppercase;color:#286d60}.document-header .description{margin-top:3mm}.intro-grid{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin-bottom:6mm}.intro-grid section,.packing-section section{break-inside:avoid}.schedule-section>h2{margin-bottom:2mm}.day-section{break-inside:auto}.day-section.page-break{break-before:page}.day-section h2{padding-bottom:2mm;border-bottom:1px solid #a9bcb8}.agenda-entry{display:grid;grid-template-columns:24mm 1fr;gap:4mm;padding:3mm 1mm;border-bottom:1px solid #d9e2df;break-inside:avoid}.agenda-time{font-size:11pt;font-weight:700;color:#286d60}.agenda-entry h3{margin-bottom:1mm}.agenda-entry p{margin:1mm 0}.agenda-meta,.agenda-entry small{color:#52686d}.agenda-meta{font-size:8.5pt}.packing-section{margin-top:5mm}.packing-section.page-break{break-before:page}.packing-grid{display:grid;grid-template-columns:1fr 1fr;gap:2mm 8mm}.packing-grid section{break-inside:avoid}.packing-section h3{margin-top:4mm;color:#286d60}.packing-section ul{margin:0;padding-left:5mm}.packing-section li{padding:1mm 0;break-inside:avoid}.packing-section li small{color:#64777b}.checklist-item{display:flex;align-items:center;gap:2mm;list-style:none}.checkbox{width:4mm;height:4mm;border:1px solid #53686b;flex:0 0 4mm}.notes{white-space:pre-wrap}.empty{color:#64777b;font-style:italic}.overview-page{min-height:255mm}.overview-page.page-break{break-before:page}.overview-page .document-header{margin-bottom:7mm}.overview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7mm}.overview-day{min-width:0;padding:4mm;border:1px solid #cbd9d6;border-top:3px solid #286d60;border-radius:2mm}.overview-day h2{padding-bottom:3mm;border-bottom:1px solid #d9e2df}.overview-entry{display:grid;grid-template-columns:22mm 1fr;gap:1mm 3mm;padding:3mm 1mm;border-bottom:1px solid #d9e2df;break-inside:avoid}.overview-entry>strong{grid-row:span 2;color:#286d60;font-size:11pt}.overview-entry>span{font-weight:700}.overview-entry small{grid-column:2;color:#52686d}.overview-page footer{margin-top:6mm;padding-top:3mm;border-top:1px solid #cbd9d6;color:#52686d;font-size:8pt}.page-break{break-before:page}@media print{.print-toolbar{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
    }

    function overviewStyles() {
        return `.overview-page{display:flex;flex-direction:column;min-height:0;break-inside:avoid-page}.overview-grid{position:relative;display:grid;grid-template-columns:15mm repeat(var(--overview-day-count),minmax(0,1fr));grid-template-rows:14mm minmax(30px,auto) var(--overview-rows);gap:0;border-top:1px solid #aebfbc;border-left:1px solid #aebfbc;break-inside:avoid-page}.overview-legend-row{display:flex;align-items:center;flex-wrap:wrap;gap:2mm 3mm;margin:0 0 3mm;color:#52686d;font-size:8pt;break-after:avoid-page}.overview-legend-row>strong{flex:0 0 auto;color:#164a4d}.overview-time-heading,.overview-day-heading,.overview-time-cell,.overview-time-slot{min-width:0;box-sizing:border-box;border-right:1px solid #aebfbc;border-bottom:1px solid #aebfbc}.overview-time-heading,.overview-day-heading{display:flex;align-items:center;justify-content:center;padding:1.5mm;background:#eaf1ef;font-weight:700}.overview-day-heading{flex-direction:column;gap:1mm;font-size:9pt;color:#164a4d;text-align:center}.overview-day-heading strong{font-size:11pt}.overview-time-heading{font-size:8pt}.overview-time-cell{padding:1mm 1.5mm;background:#f5f8f7;color:#52636a;font-size:7.5pt;font-weight:700;text-align:right}.overview-all-day-label{display:flex;align-items:center;justify-content:center;text-align:center}.overview-time-slot{display:grid;align-content:start;gap:1mm;min-height:0;padding:1mm;background:#fff}.overview-timed-entry{position:relative;z-index:2;align-self:stretch;width:var(--lane-width);min-width:0;height:100%;margin-left:var(--lane-offset);padding:1.5mm;overflow:hidden;border:0;border-left:1.5mm solid rgba(255,255,255,.75);border-radius:2mm;background:var(--event-color);color:var(--event-text);line-height:1.15}.overview-entry>strong{display:block;margin:0;font-size:8pt;overflow-wrap:anywhere}.overview-entry>small{display:block;margin-top:1mm;color:inherit;font-size:7pt;overflow-wrap:anywhere}.overview-entry--meal{background:#d94c79!important;color:#fff!important}.overview-all-day .overview-entry{padding:1.5mm;border:0;border-radius:2mm;background:var(--event-color);color:var(--event-text)}.overview-legend{display:flex;flex-wrap:wrap;gap:1mm 2mm;margin-top:1mm}.overview-team{display:inline-flex;align-items:center;gap:1mm;padding:.5mm 1.5mm;border:1px solid #c4d1ce;border-radius:1mm;background:var(--team-color);color:var(--team-text);font-size:7pt;font-weight:700}@media print{.overview-grid,.overview-entry{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
    }

    function openDocument(item, mode, recipes = [], activities = []) {
        const title = mode === "overview" ? `${item.title} - schemaöversikt` : `${item.title} - planering och packning`;
        const overviewDates = mode === "overview" ? getOverviewDates(item) : [];
        const selectedDates = new Set(overviewDates);
        document.getElementById("arrangementPrintPreview")?.remove();
        const preview = document.createElement("section");
        preview.id = "arrangementPrintPreview";
        preview.className = "arrangement-print-preview";
        preview.setAttribute("role", "dialog");
        preview.setAttribute("aria-modal", "true");
        preview.setAttribute("aria-label", `Utskriftsförhandsvisning: ${title}`);
        const dayPicker = mode === "overview"
            ? `<fieldset class="arrangement-print-days"><legend data-print-days-count>Dagar som skrivs ut (${overviewDates.length}/${overviewDates.length})</legend><div class="arrangement-print-days-options">${overviewDates.map(date => `<label><input type="checkbox" data-print-date="${escapeHtml(date)}" checked><span>${escapeHtml(formatDate(date, { weekday: "short", day: "numeric", month: "short" }))}</span></label>`).join("")}</div></fieldset>`
            : "";
        const toolbarActions = `<div class="arrangement-print-preview-toolbar-actions"><button class="btn-secondary" type="button" data-close-print-preview>Stäng</button><button class="btn-primary" type="button" data-print-preview disabled>Skriv ut</button></div>`;
        preview.innerHTML = `<div class="arrangement-print-preview-toolbar${mode === "overview" ? " arrangement-print-preview-toolbar--overview" : ""}"><div class="arrangement-print-preview-toolbar-heading"><strong>${escapeHtml(title)}</strong>${toolbarActions}</div>${dayPicker}</div>`;
        const frame = document.createElement("iframe");
        frame.title = `Förhandsvisning: ${title}`;
        const extraStyles = mode === "overview" ? `${overviewStyles()}.overview-grid .overview-timed-entry{display:block}.overview-grid .overview-wide-meal{display:flex;align-items:center;justify-content:center;width:auto;margin-left:0;text-align:center;z-index:1}.overview-timed-entry>strong,.overview-timed-entry>small{color:inherit}.overview-timed-entry .overview-entry-label{width:fit-content;max-width:100%;margin:0 auto 1mm;padding:1mm 1.5mm;border-radius:2mm;background:#fff;color:#123f60!important;font-size:7.5pt;line-height:1.1;text-align:center;white-space:normal;overflow-wrap:anywhere}.overview-wide-meal .overview-entry-label{background:transparent;color:#fff!important;font-size:11pt}.overview-page>.document-header h1{text-align:center;color:#123f60;font-size:22pt}.overview-page>.document-header{margin-bottom:2mm;padding-bottom:2mm}.overview-page>.document-header .eyebrow{text-align:center}.overview-legend-row{margin-bottom:2mm}` : "";
        const guideStyles = mode === "overview" ? `.overview-page{height:279mm}.overview-grid{flex:1 1 auto;min-height:0;grid-template-rows:14mm minmax(30px,auto) var(--overview-rows);border-right:1px solid #aebfbc}.overview-grid .overview-time-cell:not(.overview-all-day-label),.overview-grid .overview-time-slot{border-bottom:0}.overview-grid .overview-all-day{border-bottom:1px solid #aebfbc}.overview-grid .overview-day-heading,.overview-grid .overview-time-slot{border-right:0}.overview-grid .overview-hour-line{height:0!important;border-top:1px solid #aebfbc!important;background:none!important;z-index:1}.overview-grid .overview-day-line{width:0!important;border-left:1px solid #aebfbc!important;background:none!important;z-index:1}` : "";
        const headerStyles = mode === "overview" ? `.overview-document-header{text-align:center;margin-bottom:2mm;padding-bottom:2mm}.overview-document-header>.eyebrow{margin-bottom:2mm;text-align:center}.overview-title-line{display:flex;align-items:baseline;justify-content:center;flex-wrap:wrap;gap:1mm 7mm;margin:0}.overview-page>.overview-document-header .overview-title-line h1{margin:0;color:#123f60;font-size:22pt}.overview-location{display:inline-flex;align-items:center;gap:2mm;color:#52636a;font-size:12pt;font-weight:600}.overview-location>span{color:#93a7a7}.overview-document-header>.description{margin-top:2mm}` : "";
        const renderFrame = () => {
            const content = mode === "overview"
                ? renderOverviewPages(item, recipes, [...selectedDates])
                : renderPlanningDocument(item, recipes, activities);
            preview.querySelector("[data-print-preview]").disabled = true;
            frame.srcdoc = `<!DOCTYPE html><html lang="sv"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${documentStyles(mode)}${extraStyles}${headerStyles}${guideStyles}</style></head><body>${content}</body></html>`;
        };
        preview.append(frame);
        document.body.append(preview);
        document.body.classList.add("arrangement-print-preview-open");
        frame.addEventListener("load", () => { preview.querySelector("[data-print-preview]").disabled = false; });
        renderFrame();
        const close = () => {
            preview.remove();
            document.body.classList.remove("arrangement-print-preview-open");
            document.removeEventListener("keydown", handleEscape);
        };
        const handleEscape = event => { if (event.key === "Escape") close(); };
        preview.querySelector("[data-close-print-preview]").addEventListener("click", close);
        preview.querySelector("[data-print-preview]").addEventListener("click", () => frame.contentWindow.print());
        if (mode === "overview") {
            const dayInputs = [...preview.querySelectorAll("[data-print-date]")];
            const updateDaySelection = () => {
                const checkedInputs = dayInputs.filter(input => input.checked);
                if (!checkedInputs.length) return;
                checkedInputs.forEach(input => selectedDates.add(input.dataset.printDate));
                dayInputs.filter(input => !input.checked).forEach(input => selectedDates.delete(input.dataset.printDate));
                preview.querySelector("[data-print-days-count]").textContent = `Dagar som skrivs ut (${checkedInputs.length}/${overviewDates.length})`;
                dayInputs.forEach(input => { input.disabled = input.checked && checkedInputs.length === 1; });
                renderFrame();
            };
            dayInputs.forEach(input => input.addEventListener("change", updateDaySelection));
            updateDaySelection();
        }
        document.addEventListener("keydown", handleEscape);
        preview.querySelector("[data-close-print-preview]").focus();
        return true;
    }

    window.GTScoutArrangementPrint = { openDocument };
})();