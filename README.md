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

Under Deltagare anges antal scouter, ledare och medföljande föräldrar per vald avdelning samt övriga funktionärer, som ingår i ledarantalet. Föräldrar räknas separat och ingår i det totala deltagarantalet, exempelvis för Spårare. Föräldraantal börjar på noll, även för befintliga arrangemang. Avdelningen Ledare har endast ledarantal och kan användas för rena ledararrangemang. Varje person ska räknas en gång, antingen under sin avdelning, Ledare eller Övriga funktionärer. Tomma fält betyder att antalet inte är angivet; noll är ett angivet antal. Ofullständiga totaler markeras som preliminära.

Antalen visas på arrangemangskortet och i en fällbar deltagartabell. De kan ändras i arrangemangets formulär eller via pennknappen i deltagarsektionen när redigeringen är upplåst. Under Deltagare per dag anges dagsavvikelser per avdelning och funktionärer. Måltidens redigeringsdialog har Använd dagens antal och Eget antal för måltiden. Tomma fält ärver enligt Arrangemang → Dag → Måltid; noll är ett uttryckligt antal. Återställningsknappar tar bort avvikelserna. Dagarnas antal summeras inte till arrangemangets grundantal. Deltagarantal sparas i befintlig JSON-data utan databasändring. Deltagardialogen har intern scroll när dagsfördelningen blir längre än skärmen.

Klicka på ett länkat recept i måltidslistan för att öppna det i en modal på arrangemangssidan, med ingredienserna skalade till måltidens effektiva deltagarantal inklusive föräldrar och funktionärer. Varje recept i en måltid får en egen länk. Om deltagarantal saknas används receptets grundantal; ofullständiga antal markeras som preliminära i länkens verktygstips. Portionsantalet kan fortfarande ändras i receptvyn. Modalen stängs med krysset, ett klick på bakgrunden eller Escape. Måltider utan receptkoppling visas som vanlig text, eller som redigerbara poster när redigeringen är upplåst.

Ansvariga läggs till per roll med namn och beskrivning. Standardroller och grundbeskrivningar underhålls i [data/arrangemang-roller.json](data/arrangemang-roller.json); egna rollmallar sparas lokalt och roller som används följer med arrangemangets synkade data. En ansvarspost kan också vara enbart fritext.

Under Måltider öppnar Inköpslista en egen flik för arrangemangets alla måltider. Ingredienser skalas separat till varje måltids effektiva antal och lika ingrediensnamn med kompatibla enheter summeras. Måltider med uttryckligt nollantal bidrar inte till inköpsmängderna. Ett recept som används vid flera måltider räknas vid varje måltid. Listan går att bocka av och skriva ut. Manuell ändring av inköpsvyns deltagarantal använder ett tillfälligt gemensamt antal för alla måltider; Använd planerade antal återställer beräkningen utan att ändra arrangemanget. Måltider utan recept, saknade recept och oklara ingrediensmängder markeras under Kontrollera underlaget. Inga nya databastabeller behövs.

Visa måltidsfördelning expanderar inköpslistan åt höger med en kolumn per måltid i datum- och tidsordning. Kolumnrubrikerna visar veckodag, måltid och recept, utan datum, år eller tid. Varje ingrediensrad visar totalen och delmängderna från respektive måltid; flera recept inom samma måltid summeras i den kolumnen. Tabellen kan rullas horisontellt utan att hela sidan blir bredare. Avbockningar behålls när fördelningen öppnas och stängs. Utskrift använder den kompakta totalsammanställningen.

Arrangemang sparas alltid lokalt i webbläsaren. För synkning mellan kårens användare kör du `db/arrangemang.sql` i samma Supabase-projekt efter `db/schema.sql`. Läsning av kårens arrangemang kräver inloggning och kårtillhörighet; redigering och delning kräver ledar- eller administratörsroll. Delade arrangemang kan visas av alla med länken utan inloggning. Lokala ändringar synkas när användaren kan skriva och nätverket är tillgängligt.
