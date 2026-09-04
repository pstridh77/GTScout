// Konfiguration för Supabase.
// Lämna fälten tomma för att köra applikationen helt mot localStorage (offline-läge).
// Värdena hittas i Supabase: Project Settings > API. Anon-nyckeln är publik och
// skyddas av Row Level Security – lägg aldrig in service_role-nyckeln här.
const GTSCOUT_ENVIRONMENTS = {
    production: {
        url: "https://nrwshourxjhlkmuxhkjz.supabase.co",
        anonKey: "sb_publishable_1bQ5lzmh87woQpHg1oH5DQ_MEyZT5FT",
        environmentName: "Produktion"
    },
    sandbox: {
        url: "https://njibfguoyjjzyyusqdje.supabase.co",
        anonKey: "sb_publishable_E8DY1QqLgeMYv35aRXqr2A_Jk7dDRmB",
        environmentName: "Sandbox"
    }
};

window.GTSCOUT_SUPABASE_CONFIG = GTSCOUT_ENVIRONMENTS.production;
