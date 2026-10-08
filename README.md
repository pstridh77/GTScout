# GTScout

Ett digitalt märkesbibliotek för Gullbrandstorps Scoutkår.

Projektet innehåller:

- Scoutmärken
- Sökning
- Filtrering
- Progression
- Ledarstöd
- Aktivitetsbibliotek
- Terminsplanering

Utvecklas med HTML, CSS och JavaScript.

## Inloggning och synkning

Inloggningen gäller hela applikationen på samma webbplats och återställs när du byter sida. Varje vy hämtar sin data från Supabase med användarens kår och behörigheter. Utan inloggning finns det lokala läget kvar.

Vid utloggning rensas lokal kårdata för planeringar, arrangemang, scouter, märkesanteckningar och aktivitetskopplingar. Vyinställningar och den publika receptcachen behålls. Pågående hämtningar får inte återställa kårdata efter utloggning.

Kör regressionstesterna med Node.js: `node --test tests/auth-sync.test.js`. Testerna använder en simulerad Supabase-klient och kräver inget konto eller databaskonfiguration.

## Aktiviteter

Aktivitetsbiblioteket finns på [aktiviteter.html](aktiviteter.html) och i huvudnavigeringen. Aktiviteter grupperas efter kategori med fällbara, sticky rubriker. Sökning omfattar namn, beskrivning, material och genomförande; kategorier och ägande kår kan filtreras separat. Informationsvyn visar även kopplade märken.

Sidan använder samma `GTScoutActivities`-modul och databas som märkesbiblioteket. Alla kan läsa aktiviteter. Ledare och admin kan skapa och redigera i sin egen kår, och kopiera en annan kårs aktivitet till en ny aktivitet i den egna kåren. Radering av databasaktiviteter kräver admin i den ägande kåren. Utan skrivbehörighet kan nya egna aktiviteter sparas lokalt; lokala aktiviteter kan redigeras och raderas i webbläsaren.

## Arrangemang

Arrangemang (till exempel hajker, övernattningar och läger) hanteras separat från terminsplaneringarna. De kan innehålla ett datumspann, en dagsagenda med måltider, aktiviteter och fria programpunkter, status, anteckningar och erfarenheter efteråt. Recept och aktiviteter väljs från respektive bibliotek; egna poster går också att skriva in.

Välj en eller flera avdelningar per arrangemang. Varje agendapost kan vara gemensam eller riktas till ett urval, och dagsvyn visar posterna i tidsrader med avdelningskolumner.

Ansvariga läggs till per roll med namn och beskrivning. Standardroller och grundbeskrivningar underhålls i [data/arrangemang-roller.json](data/arrangemang-roller.json); egna rollmallar sparas lokalt och roller som används följer med arrangemangets synkade data. En ansvarspost kan också vara enbart fritext.

Arrangemang sparas alltid lokalt i webbläsaren. För synkning mellan kårens användare kör du `db/arrangemang.sql` i samma Supabase-projekt efter `db/schema.sql`. Läsning av kårens arrangemang kräver inloggning och kårtillhörighet; redigering och delning kräver ledar- eller administratörsroll. Delade arrangemang kan visas av alla med länken utan inloggning. Lokala ändringar synkas när användaren kan skriva och nätverket är tillgängligt.
