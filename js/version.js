(function () {
    const APP_VERSION = "v0.2.X";

    function getFormattedLastModified() {
        if (!document.lastModified) return "";
        const date = new Date(document.lastModified);
        if (isNaN(date.getTime())) return "";

        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    function updateVersionDisplay() {
        const buildDate = getFormattedLastModified();

        // Uppdatera byggdatum i sidfot
        document.querySelectorAll(".site-footer-build").forEach(function (el) {
            el.textContent = buildDate ? `Uppdaterad ${buildDate}` : "";
        });

        // Uppdatera version i sidfot
        document.querySelectorAll(".site-footer-version").forEach(function (el) {
            el.textContent = APP_VERSION;
        });

        // Uppdatera version i menyer
        document.querySelectorAll(".site-menu-version-note").forEach(function (el) {
            el.textContent = buildDate ? `${APP_VERSION} (${buildDate})` : APP_VERSION;
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", updateVersionDisplay);
    } else {
        updateVersionDisplay();
    }
})();
