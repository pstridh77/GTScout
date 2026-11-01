/**
 * Beräkning av soluppgång och solnedgång (NOAA-baserad algoritm).
 * Delas av planering (möten) och arrangemang.
 *
 * Platsen väljs i ordningen: explicita koordinater, kårens hemmaplats
 * (admin → kår, hämtas via GTScoutAuth) och sist Gullbrandstorp som reserv.
 * Tiderna anges alltid i svensk tid (Europe/Stockholm).
 */
(function () {
    // Ungefärlig position för Styrdal/Gullbrandstorp, Halmstads kommun.
    const DEFAULT_LAT = 56.6994;
    const DEFAULT_LON = 12.7439;

    const SUNSET_ICON_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3,12H7A5,5 0 0,1 12,7A5,5 0 0,1 17,12H21A1,1 0 0,1 22,13A1,1 0 0,1 21,14H3A1,1 0 0,1 2,13A1,1 0 0,1 3,12M15,12A3,3 0 0,0 12,9A3,3 0 0,0 9,12H15M12,2L14.39,5.42C13.65,5.15 12.84,5 12,5C11.16,5 10.35,5.15 9.61,5.42L12,2M3.34,7L7.5,6.65C6.9,7.16 6.36,7.78 5.94,8.5C5.5,9.24 5.25,10 5.11,10.79L3.34,7M20.65,7L18.88,10.79C18.74,10 18.47,9.23 18.05,8.5C17.63,7.78 17.1,7.15 16.5,6.64L20.65,7M12.71,20.71L15.82,17.6C16.21,17.21 16.21,16.57 15.82,16.18C15.43,15.79 14.8,15.79 14.41,16.18L12,18.59L9.59,16.18C9.2,15.79 8.57,15.79 8.18,16.18C7.79,16.57 7.79,17.21 8.18,17.6L11.29,20.71C11.5,20.9 11.74,21 12,21C12.26,21 12.5,20.9 12.71,20.71Z" /></svg>';
    // Samma sol som SUNSET_ICON_SVG men med pilen vänd uppåt.
    const SUNRISE_ICON_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3,12H7A5,5 0 0,1 12,7A5,5 0 0,1 17,12H21A1,1 0 0,1 22,13A1,1 0 0,1 21,14H3A1,1 0 0,1 2,13A1,1 0 0,1 3,12M15,12A3,3 0 0,0 12,9A3,3 0 0,0 9,12H15M12,2L14.39,5.42C13.65,5.15 12.84,5 12,5C11.16,5 10.35,5.15 9.61,5.42L12,2M3.34,7L7.5,6.65C6.9,7.16 6.36,7.78 5.94,8.5C5.5,9.24 5.25,10 5.11,10.79L3.34,7M20.65,7L18.88,10.79C18.74,10 18.47,9.23 18.05,8.5C17.63,7.78 17.1,7.15 16.5,6.64L20.65,7" /><path fill="currentColor" transform="rotate(180 12 18.4)" d="M12.71,20.71L15.82,17.6C16.21,17.21 16.21,16.57 15.82,16.18C15.43,15.79 14.8,15.79 14.41,16.18L12,18.59L9.59,16.18C9.2,15.79 8.57,15.79 8.18,16.18C7.79,16.57 7.79,17.21 8.18,17.6L11.29,20.71C11.5,20.9 11.74,21 12,21C12.26,21 12.5,20.9 12.71,20.71Z" /></svg>';

    function isValidCoordinate(lat, lon) {
        return typeof lat === "number" && typeof lon === "number"
            && Number.isFinite(lat) && Number.isFinite(lon)
            && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    }

    // Kårens hemmaplats från inloggningen, om admin angett koordinater.
    function karLocation() {
        const state = window.GTScoutAuth?.getState?.();
        return isValidCoordinate(state?.karLatitude, state?.karLongitude)
            ? { lat: state.karLatitude, lon: state.karLongitude }
            : null;
    }

    function getHomeLocation() {
        return karLocation() || { lat: DEFAULT_LAT, lon: DEFAULT_LON };
    }

    // Returnerar platsen att räkna på och var den kom ifrån ("arrangement", "kar" eller "default").
    function resolveLocation(lat, lon) {
        const parsedLat = Number(lat);
        const parsedLon = Number(lon);
        if (lat !== null && lat !== undefined && lat !== "" && lon !== null && lon !== undefined && lon !== "" && isValidCoordinate(parsedLat, parsedLon)) {
            return { lat: parsedLat, lon: parsedLon, source: "arrangement" };
        }
        const kar = karLocation();
        if (kar) return { ...kar, source: "kar" };
        return { lat: DEFAULT_LAT, lon: DEFAULT_LON, source: "default" };
    }

    // Tolkar fritext som "56.6994, 12.7439", "56,6994; 12,7439" eller "56.6994 12.7439".
    function parseCoordinates(text) {
        const value = String(text || "").trim();
        if (!value) return null;
        const parsePart = part => {
            const number = Number(part.trim().replace(",", "."));
            return Number.isFinite(number) ? number : null;
        };
        for (const parts of [value.split(";"), value.split(","), value.split(/\s+/).filter(Boolean)]) {
            let lat = null;
            let lon = null;
            if (parts.length === 2) {
                lat = parsePart(parts[0]);
                lon = parsePart(parts[1]);
            } else if (parts.length === 4 && parts.every(part => /^\s*-?\d+\s*$/.test(part))) {
                // Svenskt format med decimalkomma: "56,6994, 12,7439".
                lat = parsePart(`${parts[0]}.${parts[1]}`);
                lon = parsePart(`${parts[2]}.${parts[3]}`);
            }
            if (isValidCoordinate(lat, lon)) return { lat, lon };
        }
        return null;
    }

    function calculate(dateStr, lat, lon) {
        if (!dateStr) return null;
        const [year, month, day] = String(dateStr).split("-").map(Number);
        if (!year || !month || !day) return null;
        const location = resolveLocation(lat, lon);

        const toRad = value => value * Math.PI / 180;
        const toDeg = value => value * 180 / Math.PI;

        const a = Math.floor((14 - month) / 12);
        const y = year + 4800 - a;
        const m = month + 12 * a - 3;
        const julianDay = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045 + 0.5;

        const t = (julianDay - 2451545.0) / 36525.0;
        const meanLong = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
        const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
        const eccent = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
        const eqOfCenter = Math.sin(toRad(meanAnomaly)) * (1.914602 - t * (0.004817 + 0.000014 * t))
            + Math.sin(toRad(2 * meanAnomaly)) * (0.019993 - 0.000101 * t)
            + Math.sin(toRad(3 * meanAnomaly)) * 0.000289;
        const trueLong = meanLong + eqOfCenter;
        const omega = 125.04 - 1934.136 * t;
        const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(toRad(omega));
        const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
        const obliqCorr = meanObliq + 0.00256 * Math.cos(toRad(omega));
        const solarDec = toDeg(Math.asin(Math.sin(toRad(obliqCorr)) * Math.sin(toRad(appLong))));

        const varY = Math.tan(toRad(obliqCorr / 2)) * Math.tan(toRad(obliqCorr / 2));
        const eqTime = 4 * toDeg(
            varY * Math.sin(2 * toRad(meanLong))
            - 2 * eccent * Math.sin(toRad(meanAnomaly))
            + 4 * eccent * varY * Math.sin(toRad(meanAnomaly)) * Math.cos(2 * toRad(meanLong))
            - 0.5 * varY * varY * Math.sin(4 * toRad(meanLong))
            - 1.25 * eccent * eccent * Math.sin(2 * toRad(meanAnomaly))
        );

        const cosHourAngle = Math.cos(toRad(90.833)) / (Math.cos(toRad(location.lat)) * Math.cos(toRad(solarDec))) - Math.tan(toRad(location.lat)) * Math.tan(toRad(solarDec));
        if (cosHourAngle < -1 || cosHourAngle > 1) return null; // midnattssol eller polarnatt
        const hourAngle = toDeg(Math.acos(cosHourAngle));

        const solarNoonMinutesUTC = 720 - 4 * location.lon - eqTime;
        const format = minutesUTC => {
            const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
            date.setUTCMinutes(date.getUTCMinutes() + Math.round(minutesUTC));
            return date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
        };

        return {
            sunrise: format(solarNoonMinutesUTC - hourAngle * 4),
            sunset: format(solarNoonMinutesUTC + hourAngle * 4)
        };
    }

    function sunriseTime(dateStr, lat, lon) {
        return calculate(dateStr, lat, lon)?.sunrise || "";
    }

    function sunsetTime(dateStr, lat, lon) {
        return calculate(dateStr, lat, lon)?.sunset || "";
    }

    window.GTScoutSunTimes = {
        DEFAULT_LAT,
        DEFAULT_LON,
        SUNRISE_ICON_SVG,
        SUNSET_ICON_SVG,
        calculate,
        sunriseTime,
        sunsetTime,
        karLocation,
        getHomeLocation,
        resolveLocation,
        parseCoordinates
    };
})();
