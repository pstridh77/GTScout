/**
 * Delad hjälpfunktion för att köra databasskrivningar med ett omförsök vid
 * transienta nätverksfel (t.ex. "Load failed" / "Failed to fetch").
 *
 * Konceptet kommer från kokbok-sync.js: gör om skrivningen en gång efter en
 * kort paus, men bara om en kontextvakt (guard) fortfarande tillåter det –
 * användaren kan ha loggat ut, bytt kår eller laddat om datan under pausen.
 *
 * Alla skrivningar som använder detta ska vara idempotenta (upsert/delete på
 * primärnyckel) så att ett omförsök är ofarligt om det första anropet faktiskt
 * nådde servern.
 */
(function () {
    const RETRY_DELAY_MS = 500;

    const NETWORK_ERROR_PATTERN = /^(TypeError:\s*)?(Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.?)$/i;

    function isNetworkError(error) {
        return !error?.code && NETWORK_ERROR_PATTERN.test(error?.message || "");
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Kör operation med ett omförsök vid nätverksfel.
     * @param {() => Promise<*>} operation Skrivningen som ska köras.
     * @param {() => boolean} [guard] Valfri kontextvakt; returnerar den false
     *   efter pausen avbryts omförsöket och felet kastas vidare.
     */
    async function withRetry(operation, guard) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                return await operation();
            } catch (error) {
                if (attempt > 0 || !isNetworkError(error)) throw error;
                await delay(RETRY_DELAY_MS);
                if (guard && !guard()) throw error;
            }
        }
    }

    window.GTScoutSyncRetry = { withRetry, isNetworkError };
})();
