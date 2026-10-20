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
- Kårens årshjul

Utvecklas med HTML, CSS och JavaScript.

## Inloggning och synkning

Inloggningen gäller hela applikationen på samma webbplats och återställs när du byter sida. Varje vy hämtar sin data från Supabase med användarens kår och behörigheter. Utan inloggning finns det lokala läget kvar.

Vid utloggning rensas lokal kårdata för planeringar, arrangemang, årshjul, scouter, märkesanteckningar och aktivitetskopplingar. Vyinställningar och den publika receptcachen behålls. Pågående hämtningar får inte återställa kårdata efter utloggning.

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

## Årshjul

Växla mellan Översikt och Detaljer med knapparna till vänster under årshjulets rubrik och datum, i samma stil som utvecklingstrappan. Detaljer (standard) förstorar hjulet upp till 1 100 px för tydligare ringar och texter, med vanlig sidrullning. Översikt anpassar storleken efter tillgänglig bredd upp till 750 px, utan begränsning utifrån skärmhöjden. Mobilvyn begränsas alltid av tillgänglig bredd. Valet sparas som en personlig vyinställning i webbläsaren och ändrar inte kårens data.

Ringfiltren finns i dropdownen Visa ringar i verktygsfältet. Den är stängd från början och innehåller samma val för enskilda ringar och avdelningar. Listan öppnas under sitt filterfält utan att ändra verktygsfältets layout och kan rullas vid många ringar. Årshjulet och händelselistan använder hela innehållsbredden utan sidopanel.

I detaljläget döljs bannern, huvudnavigeringen, sidans introduktion och filterraden för att ge hjulet mer plats. Den blå översta raden med inloggning finns kvar. Växla till Översikt för att visa de dolda delarna igen; filtervalen bevaras.

Knappen + Händelse finns i sidans gröna banner, med samma placering som knappen för att skapa en aktivitet på aktivitetssidan. Under Funktioner i hamburgermenyn finns också + Händelse, som öppnar samma formulär och har samma behörighetskrav.

Klicka på årtalet i hjulets mitt för att ändra visningsår i en dialog, även i detaljläget. Årtalet kan också aktiveras med Enter eller mellanslag. För verksamhetsår ändras startåret. Valet sparas bara i den egna webbläsaren och kräver inte redigeringsbehörighet.

Klicka i en månadssektor för att lägga till en händelse med start- och slutdatum förifyllda till månadens första dag. Den klickade ringen förväljs, både i dess färgade yta och i den vita delen med ringnamnet. För den samlade ringen Avdelning förväljs den första synliga avdelningen; valet kan ändras i formuläret. Sektorerna kan även aktiveras med Enter eller mellanslag och kräver samma redigeringsbehörighet som + Händelse. Klick på en befintlig händelse öppnar fortfarande den händelsen.

Årshjulet finns på [arshjul.html](arshjul.html). Välj vilka ringar som ska ingå när ett hjul skapas och ändra urvalet senare i Inställningar. Ange även verksamhetsårets startmånad när hjulet skapas eller ändras senare. Avdelningarna kan samlas under en gemensam ring med separata avdelningsfilter eller visas som egna ringar; gruppering är standard och kan väljas vid skapande eller ändras i filterfältet utan att ändra andras vy. Arrangemang med datum läggs automatiskt in i ringen Arrangemang när den finns, och titel, datum samt ifyllda ansvariga, plats och anteckningar synkas från arrangemanget. Synkade fält är skrivskyddade i årshjulet; uppdatera källdata i arrangemanget. Ett hjul kan ha valfritt antal färgkodade ringar, till exempel avdelningar, styrelse, kårgemensamt, arrangemang och den förvalda ringen Terminer för vårtermin, hösttermin, jullov och sommaruppehåll. En ring med händelser kan inte tas bort förrän händelserna har flyttats eller tagits bort. Avdelningsringarna använder scoutavdelningarnas standardfärger; varje sådan ring kan också välja en ljusare alternativfärg eller en egen färg. Händelser kan använda ringens färg, en ljusare eller mörkare nyans eller en egen färg, och kopieras från händelselistan till nästa kalenderår med kopieraknappen. Via hamburgermenyn kan alla eller valda händelser i aktuell period kopieras samlat; listan grupperas per månad och händelser som redan har en kopia hoppas över. Nya kopior markeras tills de redigeras eller markeras som kontrollerade. Äldre hjul får Terminer-ringen automatiskt och deras tidigare standardfärger för avdelningarna uppdateras varsamt. Övriga ringar kan visas och döljas oberoende av varandra. Händelser har datum eller datumintervall, ring, ansvarig, plats och anteckningar.

Välj kalenderår eller verksamhetsår. Verksamhetsåret har en valbar startmånad, och år, startmånad samt valda ringar styr den egna vyn. Årshjul sparas lokalt och kan synkas till Supabase; användare i kåren kan läsa, medan ledare och administratörer kan skapa och redigera delade hjul. För databaslagring kör du `db/arshjul.sql` efter `db/schema.sql` i samma Supabase-projekt. Utan inloggning kan årshjul skapas och redigeras lokalt i webbläsaren.

Vid överföring från arrangemang begränsas årshjulets kopia till 120 tecken för titel, 100 för ansvarig, 120 för plats och 2 000 för anteckningar. Originaltexten i arrangemanget ändras inte. Samma normalisering används vid jämförelse och sparning, även när kapningen sker vid ett blanksteg. Automatisk synk körs vid inläsning och ändrade källdata, inte när en sparning kvitteras. Migrering och arrangemangsuppdatering samlas i samma sparning per hjul. Skrivningar för samma hjul utförs i ordning; gamla svar får inte skriva över senare lokala ändringar eller återställa data efter utloggning.

Egna ringar skapas med knappen + Ring under Inställningar eller Nytt årshjul. Knappen öppnar ringdialogen för namn och färg. Vid varje befintlig ring finns en liten Redigera-text som öppnar ringdialogen, där ringen även kan tas bort. Ringar med händelser kan redigeras men inte tas bort. När ringdialogen sparas eller stängs återgår du till årshjulets dialog med övriga inmatningar bevarade. Ringändringarna sparas först när årshjulet sparas; stäng årshjulets dialog för att avbryta. Förvalda ringar läggs till via samma dialogers ringurval. Befintliga ringar kan fortfarande redigeras direkt från ringlistan.

Kör årshjulens regressionstester med `node --test tests/arshjul-sync.test.js`. De använder simulerad databas och kräver ingen anslutning till Supabase.
