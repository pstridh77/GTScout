(function () {
    const DAY = 86400000;
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
    const dateKey = date => date.toISOString().slice(0, 10);
    const formatDate = (value, options = { day: "numeric", month: "short", year: "numeric" }) =>
        new Intl.DateTimeFormat("sv-SE", { ...options, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
    const dateSpan = (event, options) => formatDate(event.start_date, options)
        + (event.end_date !== event.start_date ? ` – ${formatDate(event.end_date, options)}` : "");
    const eventCount = count => `${count} ${count === 1 ? "händelse" : "händelser"}`;

    function qrCodeSvg(value) {
        const bytes = Array.from(new TextEncoder().encode(value));
        const version = 6;
        const size = version * 4 + 17;
        const dataCodewords = 136;
        const errorCodewordsPerBlock = 18;
        const blockCount = 2;
        const blockDataLength = dataCodewords / blockCount;
        if (bytes.length > 134) throw new Error("Delningslänken är för lång för QR-koden.");

        const bits = [];
        const appendBits = (number, count) => {
            for (let index = count - 1; index >= 0; index--) bits.push((number >>> index) & 1);
        };
        appendBits(0b0100, 4);
        appendBits(bytes.length, 8);
        bytes.forEach(byte => appendBits(byte, 8));
        appendBits(0, Math.min(4, dataCodewords * 8 - bits.length));
        while (bits.length % 8) bits.push(0);
        const data = [];
        for (let index = 0; index < bits.length; index += 8) {
            data.push(bits.slice(index, index + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
        }
        for (let pad = 0; data.length < dataCodewords; pad++) data.push(pad % 2 ? 0x11 : 0xec);

        const multiply = (left, right) => {
            let product = 0;
            for (let index = 7; index >= 0; index--) {
                product = (product << 1) ^ ((product >>> 7) * 0x11d);
                product ^= ((right >>> index) & 1) * left;
            }
            return product;
        };
        const generator = [1];
        let root = 1;
        for (let index = 0; index < errorCodewordsPerBlock; index++) {
            const next = Array(generator.length + 1).fill(0);
            generator.forEach((coefficient, position) => {
                next[position] ^= coefficient;
                next[position + 1] ^= multiply(coefficient, root);
            });
            generator.splice(0, generator.length, ...next);
            root = multiply(root, 2);
        }
        const blocks = Array.from({ length: blockCount }, (_, index) => {
            const block = data.slice(index * blockDataLength, (index + 1) * blockDataLength);
            const remainder = [...block, ...Array(errorCodewordsPerBlock).fill(0)];
            for (let position = 0; position < block.length; position++) {
                const factor = remainder[position];
                generator.forEach((coefficient, offset) => {
                    remainder[position + offset] ^= multiply(coefficient, factor);
                });
            }
            return { data: block, error: remainder.slice(-errorCodewordsPerBlock) };
        });
        const codewords = [];
        for (let index = 0; index < blockDataLength; index++) blocks.forEach(block => codewords.push(block.data[index]));
        for (let index = 0; index < errorCodewordsPerBlock; index++) blocks.forEach(block => codewords.push(block.error[index]));

        const modules = Array.from({ length: size }, () => Array(size).fill(null));
        const set = (x, y, dark) => {
            if (x >= 0 && x < size && y >= 0 && y < size) modules[y][x] = Boolean(dark);
        };
        const finder = (left, top) => {
            for (let y = -1; y <= 7; y++) {
                for (let x = -1; x <= 7; x++) {
                    const distance = Math.max(Math.abs(x - 3), Math.abs(y - 3));
                    set(left + x, top + y, distance !== 2 && distance !== 4);
                }
            }
        };
        finder(0, 0);
        finder(size - 7, 0);
        finder(0, size - 7);
        for (let y = -2; y <= 2; y++) {
            for (let x = -2; x <= 2; x++) {
                set(34 + x, 34 + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
            }
        }
        for (let index = 8; index < size - 8; index++) {
            if (modules[6][index] === null) set(index, 6, index % 2 === 0);
            if (modules[index][6] === null) set(6, index, index % 2 === 0);
        }

        let format = 0b01 << 3;
        let remainder = format << 10;
        for (let bit = 14; bit >= 10; bit--) {
            if ((remainder >>> bit) & 1) remainder ^= 0x537 << (bit - 10);
        }
        format = ((format << 10) | remainder) ^ 0x5412;
        for (let bit = 0; bit <= 5; bit++) set(8, bit, ((format >>> bit) & 1) !== 0);
        set(8, 7, ((format >>> 6) & 1) !== 0);
        set(8, 8, ((format >>> 7) & 1) !== 0);
        set(7, 8, ((format >>> 8) & 1) !== 0);
        for (let bit = 9; bit < 15; bit++) set(14 - bit, 8, ((format >>> bit) & 1) !== 0);
        for (let bit = 0; bit < 8; bit++) set(size - 1 - bit, 8, ((format >>> bit) & 1) !== 0);
        for (let bit = 8; bit < 15; bit++) set(8, size - 15 + bit, ((format >>> bit) & 1) !== 0);
        set(8, size - 8, true);

        let bitIndex = 0;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right--;
            for (let vertical = 0; vertical < size; vertical++) {
                const y = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical;
                for (let offset = 0; offset < 2; offset++) {
                    const x = right - offset;
                    if (modules[y][x] !== null) continue;
                    const dark = bitIndex < codewords.length * 8
                        ? ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0
                        : false;
                    set(x, y, dark !== ((x + y) % 2 === 0));
                    bitIndex++;
                }
            }
        }

        const path = [];
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (modules[y][x]) path.push(`M${x + 4} ${y + 4}h1v1h-1z`);
            }
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size + 8} ${size + 8}" role="img" aria-label="QR-kod till årshjulets delningslänk" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${size + 8}v${size + 8}H0z"/><path fill="#000" d="${path.join("")}"/></svg>`;
    }

    function getMonths(range) {
        return Array.from({ length: 12 }, (_, index) => {
            const start = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth() + index, 1));
            const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
            return { start: dateKey(start), end: dateKey(new Date(end.getTime() - DAY)), next: dateKey(end) };
        });
    }

    function point(radius, fraction) {
        const angle = fraction * Math.PI * 2 - Math.PI / 2;
        return { x: 600 + radius * Math.cos(angle), y: 600 + radius * Math.sin(angle) };
    }

    function curve(radius, from, to, reverse = false) {
        const start = point(radius, reverse ? to : from);
        const end = point(radius, reverse ? from : to);
        return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${to - from > 0.5 ? 1 : 0} ${reverse ? 0 : 1} ${end.x} ${end.y}`;
    }

    function sector(outer, inner, from, to) {
        if (to - from >= 0.999999) {
            const mid = (from + to) / 2;
            return `${sector(outer, inner, from, mid)} ${sector(outer, inner, mid, to)}`;
        }
        const end = point(inner, to);
        return `${curve(outer, from, to)} L ${end.x} ${end.y} ${curve(inner, from, to, true).replace(/^M [^A]+/, "")} Z`;
    }

    function fitText(text, length, fontSize) {
        const characters = Array.from(text);
        const max = Math.max(1, Math.floor(length / (fontSize * 0.58)));
        return characters.length > max ? `${characters.slice(0, Math.max(0, max - 1)).join("")}…` : text;
    }

    function layoutEventLabel(input, measure = (text, size) => Array.from(text).length * size * 0.6) {
        const { inner, outer, from, to, title, dates, details } = input;
        const thickness = outer - inner;
        const padding = Math.min(1.5, thickness * 0.05);
        const mid = (from + to) / 2;
        const angle = (to - from) * Math.PI * 2;
        const reverse = mid > 0.25 && mid < 0.75;
        const radial = angle < Math.PI / 2 && thickness > (inner + padding) * angle;
        const halfHeight = radial ? Math.max(0.1, (inner + padding) * Math.sin(angle / 2) - padding) : 0;
        const radialEnd = radial ? Math.sqrt(Math.max(0, (outer - padding) ** 2 - halfHeight ** 2)) : 0;
        const availableHeight = radial ? halfHeight * 2 : thickness - padding * 2;
        const maxFontSize = Math.min(18, availableHeight / 1.15);
        const minFontSize = Math.min(6, maxFontSize);

        function slotsFor(size) {
            const count = Math.max(1, Math.floor(availableHeight / (size * 1.15)));
            return Array.from({ length: count }, (_, index) => {
                const radius = reverse
                    ? inner + padding + (index + 0.8) * size * 1.15
                    : outer - padding - (index + 0.8) * size * 1.15;
                return { radius, length: radial ? radialEnd - inner - padding : radius * angle - padding * 2 };
            });
        }

        function wrap(text, slots, size, bold) {
            let remaining = String(text).trim().replace(/\s+/g, " ");
            const lines = [];
            let splits = 0;
            for (const slot of slots) {
                if (!remaining) break;
                const characters = Array.from(remaining);
                let count = 0;
                while (count < characters.length && measure(characters.slice(0, count + 1).join(""), size, bold) <= slot.length) count++;
                if (!count) break;
                let end = count;
                if (count < characters.length) {
                    const space = characters.slice(0, count + 1).lastIndexOf(" ");
                    if (space > 0) end = space;
                    else splits++;
                }
                lines.push(characters.slice(0, end).join("").trimEnd());
                remaining = characters.slice(end).join("").trimStart();
            }
            return { lines, remaining, splits };
        }

        let size = maxFontSize;
        let slots = slotsFor(size);
        let name = wrap(title, slots, size, true);
        let complete = name.remaining ? null : { name, slots, size };
        while ((name.remaining || name.splits) && size > minFontSize) {
            size = Math.max(minFontSize, size - 1);
            slots = slotsFor(size);
            name = wrap(title, slots, size, true);
            if (!name.remaining && (!complete || name.splits < complete.name.splits)) complete = { name, slots, size };
        }
        if (complete) ({ name, slots, size } = complete);
        if (name.remaining) {
            if (!name.lines.length) name.lines.push("…");
            else {
                const last = name.lines.length - 1;
                let text = Array.from(name.lines[last]);
                while (text.length && measure(`${text.join("")}…`, size, true) > slots[last].length) text.pop();
                name.lines[last] = `${text.join("")}…`;
            }
        }
        const lines = name.lines.map(text => ({ text, kind: "title", size }));
        if (!name.remaining) {
            for (const [kind, text] of [["date", dates], ...details.map(detail => ["detail", detail])]) {
                if (!text) continue;
                const extra = wrap(text, slots.slice(lines.length), size * 0.85, false);
                if (!extra.remaining && !extra.splits) lines.push(...extra.lines.map(text => ({ text, kind, size: size * 0.85 })));
            }
        }
        return lines.map((line, index) => {
            if (!radial) return { ...line, radius: slots[index].radius, from, to, reverse, padding };
            const center = point((inner + padding + radialEnd) / 2, mid);
            let rotation = mid * 360 - 90;
            if (rotation > 90 && rotation < 270) rotation -= 180;
            return { ...line, x: center.x, y: center.y, rotation, offset: (index - (lines.length - 1) / 2) * size * 1.15 };
        });
    }

    function renderEventLabel(input, prefix, color, measure) {
        return layoutEventLabel(input, measure).map((line, index) => {
            const attributes = `data-label-kind="${line.kind}" font-size="${line.size}" font-weight="${line.kind === "title" ? 700 : 400}" fill="${color}"`;
            if (line.radius !== undefined) {
                const id = `${prefix}-${index}`;
                const gap = line.padding / (line.radius * Math.PI * 2);
                return `<defs><path id="${id}" d="${curve(line.radius, line.from + gap, line.to - gap, line.reverse)}"/></defs><text ${attributes}><textPath href="#${id}" startOffset="50%" text-anchor="middle">${escapeHtml(line.text)}</textPath></text>`;
            }
            return `<text ${attributes} text-anchor="middle" dominant-baseline="central" transform="translate(${line.x} ${line.y}) rotate(${line.rotation})" x="0" y="${line.offset}">${escapeHtml(line.text)}</text>`;
        }).join("");
    }

    function renderWheel(rings, events, months, range, eventColors, eventTextColors, ringBackgroundColors) {
        if (!rings.length) return '<p class="empty">Inga ringar valda. Välj ringar i årshjulets filter för att skriva ut hjulet.</p>';
        const days = (range.endExclusive - range.start) / DAY;
        const fraction = value => (new Date(`${value}T00:00:00Z`) - range.start) / DAY / days;
        const parts = ['<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Årshjul med alla valda händelser">'];
        const width = 398 / rings.length;
        const gap = Math.min(26, width * 0.3);
        rings.forEach((ring, ringIndex) => {
            const outer = 540 - ringIndex * width;
            const inner = outer - width;
            parts.push(`<path class="print-ring-background" d="${sector(outer, inner, 0, 1)}" fill="${ringBackgroundColors[ring.id] || ring.color}"${ringBackgroundColors[ring.id] ? "" : ' fill-opacity=".16"'}/>`);
            parts.push(`<circle cx="600" cy="600" r="${outer}" fill="none" stroke="#fff" stroke-width="${gap}"/>`);
        });
        months.forEach(month => {
            const start = point(142, fraction(month.start));
            const end = point(542, fraction(month.start));
            parts.push(`<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#fff" stroke-width="3"/>`);
        });
        rings.forEach((ring, ringIndex) => {
            const outer = 540 - ringIndex * width - gap / 2;
            const inner = 540 - (ringIndex + 1) * width + gap / 2;
            const sources = ring.sourceRings || [ring];
            const ids = new Set(sources.map(source => source.id));
            const positioned = events.filter(event => ids.has(event.ring_id)).map(event => {
                let from = Math.max(0, fraction(event.start_date));
                let to = Math.min(1, fraction(event.end_date) + 1 / days);
                const minimum = 7 / days;
                if (to - from < minimum) {
                    from = Math.max(0, Math.min((from + to - minimum) / 2, 1 - minimum));
                    to = from + minimum;
                }
                return { event, from, to };
            }).sort((left, right) => left.from - right.from || right.to - left.to
                || left.event.title.localeCompare(right.event.title, "sv"));
            let laneEnds = [];
            let group = [];
            let groupEnd = -1;
            const finishGroup = () => {
                group.forEach(item => { item.laneCount = laneEnds.length; });
            };
            positioned.forEach(item => {
                if (item.from >= groupEnd) {
                    finishGroup();
                    laneEnds = [];
                    group = [];
                    groupEnd = -1;
                }
                let lane = laneEnds.findIndex(end => end <= item.from);
                if (lane < 0) lane = laneEnds.length;
                laneEnds[lane] = item.to;
                item.lane = lane;
                group.push(item);
                groupEnd = Math.max(item.to, groupEnd);
            });
            finishGroup();
            positioned.forEach(({ event, from, to, lane, laneCount }, eventIndex) => {
                const laneHeight = (outer - inner) / laneCount;
                const laneOuter = outer - lane * laneHeight;
                const laneInner = laneOuter - laneHeight;
                const color = eventColors[event.id] || sources.find(source => source.id === event.ring_id).color;
                const inset = Math.min(1.5, laneHeight * 0.06);
                parts.push(`<g role="group" aria-label="${escapeHtml(`${event.title} · ${dateSpan(event)}`)}"><path class="print-event-arc" data-from="${from}" data-to="${to}" data-lane="${lane}" d="${sector(laneOuter - inset, laneInner + inset, from, to)}" fill="${color}"/>`);
                const input = {
                    inner: laneInner + inset, outer: laneOuter - inset, from, to, title: event.title,
                    dates: dateSpan(event, { day: "numeric", month: "short" }),
                    details: [
                        ring.sourceRings ? sources.find(source => source.id === event.ring_id).name : "",
                        event.location, event.responsible ? `Ansv: ${event.responsible}` : ""
                    ].filter(Boolean)
                };
                const prefix = `print-text-${ringIndex}-${eventIndex}`;
                const textColor = eventTextColors[event.id] || "#ffffff";
                parts.push(`<g data-print-label="${escapeHtml(JSON.stringify(input))}" data-label-prefix="${prefix}" data-label-color="${textColor}">${renderEventLabel(input, prefix, textColor)}</g>`);
                parts.push("</g>");
            });
        });
        rings.forEach((ring, ringIndex) => {
            const pathId = `print-ring-label-${ringIndex}`;
            const radius = 540 - ringIndex * width;
            const fontSize = Math.min(20, gap * 0.85);
            parts.push(`<defs><path id="${pathId}" d="${curve(radius, 0.94, 1.06)}"/></defs><text font-size="${fontSize}" font-weight="700" dominant-baseline="central" fill="#46545f"><textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${escapeHtml(fitText(ring.name, radius * Math.PI * 2 * 0.12, fontSize))}</textPath></text>`);
        });
        months.forEach(month => {
            const from = fraction(month.start);
            const to = fraction(month.next);
            const label = point(575, (from + to) / 2);
            parts.push(`<text x="${label.x}" y="${label.y}" text-anchor="middle" dominant-baseline="middle" font-size="19" font-weight="700" fill="#164a4d">${escapeHtml(formatDate(month.start, { month: "long" }))}</text>`);
        });
        const startYear = range.start.getUTCFullYear();
        const endYear = range.end.getUTCFullYear();
        parts.push(`<circle cx="600" cy="600" r="140" fill="#fff"/><text x="600" y="595" text-anchor="middle" font-size="38" font-weight="700" fill="#164a4d">${startYear === endYear ? startYear : `${startYear}–${endYear}`}</text><text x="600" y="635" text-anchor="middle" font-size="20" fill="#52686d">${eventCount(events.length)}</text></svg>`);
        return parts.join("");
    }

    function renderList(wheel, events, months) {
        const ringById = new Map(wheel.rings.map(ring => [ring.id, ring]));
        return months.map(month => {
            const items = events.filter(event => {
                const firstVisibleDate = event.start_date < months[0].start ? months[0].start : event.start_date;
                return firstVisibleDate >= month.start && firstVisibleDate <= month.end;
            });
            if (!items.length) return "";
            return `<section class="month"><h2>${escapeHtml(formatDate(month.start, { month: "long", year: "numeric" }))}</h2>${items.map(event => {
                const ring = ringById.get(event.ring_id);
                return `<article class="event" style="--ring-color:${ring.color}"><div class="event-date">${escapeHtml(dateSpan(event))}<small>${escapeHtml(ring.name)}</small></div><div><h3>${escapeHtml(event.title)}</h3>${event.responsible ? `<p><strong>Ansvarig:</strong> ${escapeHtml(event.responsible)}</p>` : ""}${event.location ? `<p><strong>Plats:</strong> ${escapeHtml(event.location)}</p>` : ""}${event.notes ? `<p class="notes">${escapeHtml(event.notes)}</p>` : ""}${event.needs_review ? '<p class="review">Kopierad händelse – behöver kontrolleras</p>' : ""}</div></article>`;
            }).join("")}</section>`;
        }).join("") || '<p class="empty">Inga händelser i den valda perioden.</p>';
    }

    function renderActivitySummary(wheel, events, eventColors, range) {
        const ringById = new Map(wheel.rings.map(ring => [ring.id, ring]));
        let previousMonth = "";
        return `<aside class="activity-summary" aria-labelledby="activity-summary-title">
            <div class="activity-summary-heading"><h2 id="activity-summary-title">Aktiviteter i perioden</h2></div>
            <ol class="activity-summary-list">${events.map(event => {
                const ring = ringById.get(event.ring_id);
                const parent = ringById.get(ring.parent_id);
                const ringLabel = parent ? `${parent.name} · ${ring.name}` : ring.name;
                const visibleStart = event.start_date < dateKey(range.start) ? dateKey(range.start) : event.start_date;
                const month = visibleStart.slice(0, 7);
                const heading = month !== previousMonth
                    ? `<h3 class="activity-summary-month">${escapeHtml(formatDate(`${month}-01`, { month: "long", year: "numeric" }))}</h3>` : "";
                previousMonth = month;
                return `<li class="activity-summary-item">${heading}<div class="activity-summary-row" style="--activity-color:${eventColors[event.id] || ring.color}"><p class="activity-summary-date">${escapeHtml(dateSpan(event, { day: "numeric", month: "short" }))}</p><div><h3>${escapeHtml(event.title)}</h3><p class="activity-summary-meta">${escapeHtml(ringLabel)}</p></div></div></li>`;
            }).join("")}</ol>
            ${events.length ? "" : '<p class="empty">Inga händelser i valda ringar under perioden.</p>'}
            <p class="activity-summary-overflow" role="status" hidden></p>
        </aside>`;
    }

    function fitActivitySummary() {
        const summary = document.querySelector(".activity-summary");
        if (!summary) return;
        const list = summary.querySelector(".activity-summary-list");
        const notice = summary.querySelector(".activity-summary-overflow");
        const items = [...list.children];
        items.forEach(item => { item.hidden = false; });
        summary.classList.remove("activity-summary--without-rings");
        notice.hidden = true;
        const fits = () => list.scrollHeight <= list.clientHeight + 1;
        summary.style.setProperty("--summary-font-size", "12pt");
        if (fits()) return;
        summary.classList.add("activity-summary--without-rings");
        for (const size of [12, 11.5, 11, 10.5, 10, 9.5, 9, 8.5, 8, 7.5, 7]) {
            summary.style.setProperty("--summary-font-size", `${size}pt`);
            if (fits()) return;
        }
        notice.hidden = false;
        for (let index = items.length - 1; index >= 0; index--) {
            items[index].hidden = true;
            notice.textContent = `${index} av ${items.length} aktiviteter visas. ${items.length - index} till finns i hjulet. Välj A4-listan för hela listan.`;
            if (fits()) break;
        }
    }

    function buildDocument({ wheel, rings, range, mode, eventColors = {}, eventTextColors = {}, ringBackgroundColors = {}, qrUrl = "" }) {
        if (!["wheel", "list"].includes(mode)) throw new Error("Okänd utskriftslayout för årshjulet.");
        const isWheel = mode === "wheel";
        const selectedIds = new Set(rings.flatMap(ring => (ring.sourceRings || [ring]).map(source => source.id)));
        const events = wheel.events.filter(event => (!isWheel || selectedIds.has(event.ring_id))
            && event.start_date <= dateKey(range.end) && event.end_date >= dateKey(range.start))
            .sort((left, right) => left.start_date.localeCompare(right.start_date)
                || left.title.localeCompare(right.title, "sv") || left.id.localeCompare(right.id));
        const months = getMonths(range);
        const subtitle = `${formatDate(dateKey(range.start))} – ${formatDate(dateKey(range.end))} · ${eventCount(events.length)}`;
        const header = `<header><p class="eyebrow">GTScout · ${isWheel ? "Årshjul" : "Händelselista"}</p><h1>${escapeHtml(wheel.name)}</h1><p>${escapeHtml(subtitle)}</p></header>`;
        const content = isWheel
            ? `<div class="wheel-layout"><div class="wheel">${renderWheel(rings, events, months, range, eventColors, eventTextColors, ringBackgroundColors)}</div>${renderActivitySummary(wheel, events, eventColors, range)}</div>`
            : renderList(wheel, events, months);
        const qrMarkup = isWheel
            ? qrUrl
                ? `<footer class="print-footer"><div class="print-qr">${qrCodeSvg(qrUrl)}</div><p>Skanna för att öppna årshjulet</p></footer>`
                : `<footer class="print-footer print-footer--no-qr"><p>Skapa en delningslänk för att lägga till en QR-kod till årshjulet.</p></footer>`
            : "";
        const styles = `
            @page{size:${isWheel ? "A3 landscape" : "A4 portrait"};margin:${isWheel ? "10mm" : "13mm"}}
            *{box-sizing:border-box}body{margin:0;background:#fff;color:#142c34;font:10pt/1.4 Arial,sans-serif}
            h1,h2,h3,p{margin:0}header{border-bottom:1px solid #9cafad;padding-bottom:3mm;margin-bottom:4mm}
            h1{font-size:22pt;line-height:1.15;overflow-wrap:anywhere}header p{color:#52686d;margin-top:1mm}
            .eyebrow{font-size:8pt;font-weight:bold;text-transform:uppercase;color:#286d60}
            h2{font-size:13pt;color:#164a4d;margin:4mm 0 2mm}h3{font-size:11pt;margin-bottom:1mm;overflow-wrap:anywhere}
            .sheet{${isWheel ? "position:relative;height:276mm;display:flex;flex-direction:column" : ""}}
            .wheel-layout{display:flex;gap:6mm;flex:1;min-height:0}.wheel{flex:1;min-width:0;display:flex;align-items:center}
            .wheel svg{display:block;width:100%;height:100%;font-family:Arial,sans-serif}
            .print-footer{display:flex;align-items:center;gap:3mm;flex:none;min-height:22mm;color:#52686d;font-size:7pt}
            .print-qr{width:22mm;height:22mm;flex:none}.print-qr svg{display:block;width:100%;height:100%}
            .print-footer--no-qr{font-size:7pt}
            .activity-summary{flex:0 0 105mm;min-height:0;display:flex;flex-direction:column;font-size:var(--summary-font-size,12pt);line-height:1.25;border-left:1px solid #d9e2df;padding-left:4mm}
            .activity-summary-heading{flex:none;padding-bottom:2mm;margin-bottom:1mm;border-bottom:1px solid #9cafad}
            .activity-summary-heading h2{margin:0;font-size:13pt}
            .activity-summary-list{flex:1;min-height:0;overflow:hidden;list-style:none;margin:0;padding:0}
            .activity-summary-item{break-inside:avoid}
            .activity-summary-row{display:grid;grid-template-columns:34mm minmax(0,1fr);gap:2mm;border-left:1mm solid var(--activity-color);border-bottom:1px solid #e4ebe8;padding:.25mm 0 .25mm 1.5mm}
            .activity-summary-item[hidden]{display:none}.activity-summary-item h3{font-size:1em;line-height:1.2;margin:0;font-weight:700}
            .activity-summary-item .activity-summary-month{text-transform:capitalize;background:#eef4f2;color:#164a4d;padding:.7mm 1mm;margin:.8mm 0 .3mm}
            .activity-summary-date{font-size:.9em;font-weight:700;color:#286d60;margin:0 0 .4mm;white-space:nowrap}
            .activity-summary-meta{font-size:.85em;color:#52686d;margin:.4mm 0 0}
            .activity-summary--without-rings .activity-summary-meta{display:none}
            .activity-summary-overflow{flex:none;margin:2mm 0 0;padding:2mm;background:#eef4f2;border:1px solid #b6cdc5;font-size:8pt;color:#164a4d}
            small{display:block;font-size:8pt;color:#52686d}strong,small,p{overflow-wrap:anywhere}
            .month h2{text-transform:capitalize;break-after:avoid}
            .event{display:grid;grid-template-columns:38mm minmax(0,1fr);gap:4mm;padding:3mm 2mm;border-bottom:1px solid #d9e2df;border-left:1mm solid var(--ring-color);break-inside:avoid}
            .event-date{font-size:9pt;font-weight:bold;color:#286d60}.event-date small{margin-top:1mm}
            .event p{margin:1mm 0}.notes{white-space:pre-wrap}.review{font-size:8pt;color:#735012}
            .empty,.muted{color:#52686d}.empty{font-style:italic}
            @media screen{body{padding:4mm}.sheet{width:${isWheel ? "400mm" : "184mm"};margin:auto;zoom:var(--preview-scale,1)}}
            @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
        `;
        const fitLabels = isWheel ? `<script>
            const escapeHtml = ${escapeHtml.toString()};
            ${point.toString()}
            ${curve.toString()}
            ${layoutEventLabel.toString()}
            ${renderEventLabel.toString()}
            const context = document.createElement("canvas").getContext("2d");
            const measure = (text, size, bold) => {
                context.font = (bold ? "700 " : "400 ") + size + "px Arial";
                return context.measureText(text).width;
            };
            for (const group of document.querySelectorAll("[data-print-label]")) {
                group.innerHTML = renderEventLabel(JSON.parse(group.dataset.printLabel), group.dataset.labelPrefix, group.dataset.labelColor, measure);
            }
            for (const label of document.querySelectorAll("textPath")) {
                const length = document.querySelector(label.getAttribute("href")).getTotalLength();
                if (label.getComputedTextLength() > length) {
                    label.parentElement.setAttribute("textLength", String(length));
                    label.parentElement.setAttribute("lengthAdjust", "spacingAndGlyphs");
                }
            }
            ${fitActivitySummary.toString()}
            fitActivitySummary();
            new ResizeObserver(fitActivitySummary).observe(document.querySelector(".activity-summary"));
            window.addEventListener("resize", fitActivitySummary);
            window.addEventListener("beforeprint", fitActivitySummary);
            window.addEventListener("afterprint", fitActivitySummary);
        </script>` : "";
        return `<!DOCTYPE html><html lang="sv"><head><meta charset="UTF-8"><title>${escapeHtml(wheel.name)} – ${isWheel ? "Årshjul" : "Händelselista"}</title><style>${styles}</style></head><body><main class="sheet">${header}${content}${qrMarkup}</main>${fitLabels}</body></html>`;
    }

    function openDocument(options) {
        const markup = buildDocument(options);
        document.getElementById("yearWheelPrintPreview")?.remove();
        const previousFocus = document.getElementById("planningActionsBtn");
        const preview = document.createElement("div");
        preview.id = "yearWheelPrintPreview";
        preview.className = "arrangement-print-preview";
        preview.setAttribute("role", "dialog");
        preview.setAttribute("aria-modal", "true");
        preview.setAttribute("aria-label", "Förhandsvisning av årshjulets utskrift");
        preview.innerHTML = `<div class="arrangement-print-preview-toolbar"><div class="arrangement-print-preview-toolbar-heading"><strong>${options.mode === "wheel" ? "Årshjul · A3 liggande" : "Alla händelser · A4 stående"}</strong><div class="arrangement-print-preview-toolbar-actions"><button class="btn-secondary" type="button" data-close-print-preview>Stäng</button><button class="btn-primary" type="button" data-print-preview disabled>Skriv ut</button></div></div></div>`;
        const frame = document.createElement("iframe");
        frame.title = "Förhandsvisning av utskrift";
        frame.tabIndex = -1;
        const printButton = preview.querySelector("[data-print-preview]");
        const scalePreview = () => {
            const root = frame.contentDocument?.documentElement;
            if (!root) return;
            const pageWidth = (options.mode === "wheel" ? 400 : 184) * 96 / 25.4;
            const padding = 8 * 96 / 25.4;
            root.style.setProperty("--preview-scale", String(Math.min(1, Math.max(0.1, (root.clientWidth - padding) / pageWidth))));
        };
        const resizeObserver = new ResizeObserver(scalePreview);
        frame.addEventListener("load", () => {
            scalePreview();
            frame.contentDocument.addEventListener("keydown", handleKey);
            printButton.disabled = false;
        });
        frame.srcdoc = markup;
        preview.append(frame);
        document.body.append(preview);
        resizeObserver.observe(frame);
        document.body.classList.add("year-wheel-print-preview-open");
        const close = () => {
            preview.remove();
            resizeObserver.disconnect();
            document.body.classList.remove("year-wheel-print-preview-open");
            document.removeEventListener("keydown", handleKey);
            previousFocus?.focus();
        };
        const handleKey = event => {
            if (event.key === "Escape") {
                event.preventDefault();
                close();
            }
            if (event.key === "Tab") {
                const buttons = [...preview.querySelectorAll("button:not(:disabled)")];
                const first = buttons[0];
                const last = buttons[buttons.length - 1];
                if (event.currentTarget === frame.contentDocument) {
                    event.preventDefault();
                    (event.shiftKey ? last : first).focus();
                } else if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        preview.querySelector("[data-close-print-preview]").addEventListener("click", close);
        printButton.addEventListener("click", () => {
            frame.contentWindow.focus();
            frame.contentWindow.print();
        });
        document.addEventListener("keydown", handleKey);
        preview.querySelector("[data-close-print-preview]").focus();
    }

    window.GTScoutYearWheelPrint = { openDocument, buildDocument, qrCodeSvg };
})();
