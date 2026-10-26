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

## Utvecklingstrappan

På skärmar upp till 600 px visas Detaljer som standard, även när skärmen växlar från bred till smal. Bredare skärmar startar i Översikt. Visningsläget kan ändras med knapparna i verktygsfältet. Verktygsfältet är dolt som standard på smala skärmar; ett manuellt val att visa eller dölja det sparas separat i webbläsaren.

## Årshjul

Växla mellan Översikt och Detaljer med knapparna till vänster under årshjulets rubrik och datum, i samma stil som utvecklingstrappan. Detaljer (standard) förstorar hjulet upp till 1 100 px för tydligare ringar och texter, med vanlig sidrullning. Översikt anpassar storleken efter tillgänglig bredd upp till 750 px, utan begränsning utifrån skärmhöjden. Mobilvyn begränsas alltid av tillgänglig bredd. Valet sparas som en personlig vyinställning i webbläsaren och ändrar inte kårens data.

Ringfiltren finns i dropdownen Visa ringar i verktygsfältet. Den är stängd från början och innehåller samma val för enskilda ringar och avdelningar. Listan öppnas under sitt filterfält utan att ändra verktygsfältets layout och kan rullas vid många ringar. Händelselistan använder samma layout i Översikt och Detaljer: datum först, sedan händelsenamn, ring och övrig information, med en vänsterkant i ringens färg. I Detaljer ligger listan under hjulet med vanlig sidrullning. I Översikt på skärmar från 1200 px ligger listan till höger, med samma höjd som hjulkortet och intern rullning; på mindre skärmar ligger den under.

På skärmar upp till 600 px finns Fäll ihop/Visa ovanför händelselistan, i samma stil som för märkeskategorierna. Knappen fäller ihop eller öppnar alla månader och är synkroniserad med motsvarande val i hamburgermenyn.

Årshjulets filterrad är dold som standard på skärmar upp till 600 px och synlig på bredare skärmar. Ett manuellt val att visa eller dölja raden sparas i webbläsaren och bevaras mellan sidbesök och byte av visningsläge. Detaljläget döljer alltid raden tillfälligt utan att ändra det sparade valet. Rubriken ovanför hjulet är också väljaren för årshjul, alltid synlig utanför filterraden, och visar vilket av kårens hjul som är valt samt dess position i listan.

I detaljläget döljs bannern, huvudnavigeringen, sidans introduktion och filterraden för att ge hjulet mer plats. Den blå översta raden med inloggning finns kvar. Växla till Översikt för att visa de dolda delarna igen; filtervalen bevaras.

Knappen + Händelse finns i sidans gröna banner, med samma placering som knappen för att skapa en aktivitet på aktivitetssidan. Under Funktioner i hamburgermenyn finns också + Händelse, som öppnar samma formulär och har samma behörighetskrav.

Klicka på årtalet i hjulets mitt för att ändra visningsår i en dialog, även i detaljläget. Årtalet kan också aktiveras med Enter eller mellanslag. För verksamhetsår ändras startåret. Valet sparas bara i den egna webbläsaren och kräver inte redigeringsbehörighet.

Klicka i en månadssektor för att lägga till en händelse med start- och slutdatum förifyllda till månadens första dag. Den klickade ringen förväljs, både i dess färgade yta och i den vita delen med ringnamnet. I en summerad ring förväljs ringen själv; valet kan ändras i formuläret om händelsen ska tillhöra en underring. Sektorerna kan även aktiveras med Enter eller mellanslag och kräver samma redigeringsbehörighet som + Händelse. Klick på en befintlig händelse öppnar fortfarande den händelsen.

Årshjulet finns på [arshjul.html](arshjul.html). En ring kan ha egna händelser och underringar på en nivå. I ringens inställningar väljer man om underringarnas händelser ska summeras i ringen eller visas i separata ringar. Ringfilter kan väljas enskilt eller för en hel grupp. Befintliga hjul med grupperade avdelningar konverteras automatiskt till ringen Avdelning, och avdelningarna blir dess underringar; händelser, färger och det tidigare visningsläget bevaras. Välj vilka ringar som ska ingå när ett hjul skapas och ändra urvalet senare i Inställningar. Ange även verksamhetsårets startmånad när hjulet skapas eller ändras senare. Synkning av arrangemang är aktiverad som standard för ringen Arrangemang och avstängd för övriga ringar, men kan ändras per ring. Befintliga hjul fortsätter att synka arrangemangsringen som tidigare. När synkning stängs av väljer man om redan synkade händelser ska behållas som vanliga händelser eller tas bort. Synkade fält är skrivskyddade i årshjulet; uppdatera källdata i arrangemanget medan synkningen är aktiv. Ett hjul kan ha valfritt antal färgkodade ringar, till exempel avdelningar, styrelse, kårgemensamt, arrangemang och den förvalda ringen Terminer för vårtermin, hösttermin, jullov och sommaruppehåll. Ringar med händelser kan inte tas bort förrän händelserna har flyttats eller tagits bort. En ring med underringar måste först göras tom på underringar. Avdelningsringarna använder scoutavdelningarnas standardfärger; varje sådan ring kan också välja en ljusare alternativfärg eller en egen färg. Händelser kan använda ringens färg, en ljusare eller mörkare nyans eller en egen färg, och kopieras från händelselistan till nästa kalenderår med kopieraknappen. Via hamburgermenyn kan alla eller valda händelser i aktuell period kopieras samlat; listan grupperas per månad och händelser som redan har en kopia hoppas över. Nya kopior markeras tills de redigeras eller markeras som kontrollerade. Äldre hjul får Terminer-ringen automatiskt och deras tidigare standardfärger för avdelningarna uppdateras varsamt. Övriga ringar kan visas och döljas oberoende av varandra. Händelser har datum eller datumintervall, ring, ansvarig, plats och anteckningar.

Välj kalenderår eller verksamhetsår. Verksamhetsåret har en valbar startmånad, och år, startmånad samt valda ringar styr den egna vyn. Årshjul sparas lokalt och kan synkas till Supabase; användare i kåren kan läsa, medan ledare och administratörer kan skapa och redigera delade hjul. En administratör väljer kårens standardårshjul via **Välj standardårshjul** i hamburgermenyn; valet gäller alla i kåren. Om inget standardhjul är valt öppnas det första hjulet alfabetiskt, och om det valda hjulet tas bort återgår valet automatiskt. För databaslagring kör du `db/arshjul.sql` efter `db/schema.sql` i samma Supabase-projekt, även för att lägga till standardhjulsinställningen i befintliga installationer. Utan inloggning kan årshjul skapas och redigeras lokalt i webbläsaren.

I ringens inställningar kan **Synka från annat årshjul** samla händelser från en eller flera valda ringar i ett annat årshjul inom samma kår. Exempelvis kan kårens Styrelse-ring hämta från Ordförande, Kassör och Sekreterare i styrelsens årshjul. Källringarna visas hierarkiskt med underringar indragna direkt under sin rotring. Varje vald källring på rotnivå har ett eget val **Ta med underringar** till höger på samma rad, oberoende av källhjulets visningsfilter. Valet visas inte för underringar. Nya ringar väljs inte automatiskt, men nya underringar följer med om deras förälder är vald och alternativet är aktiverat för just den rotringen. Befintliga kopplingar med det tidigare gemensamma valet behåller sitt urval. Målringen behåller sitt namn och sin färg och kan även ha egna händelser. Synkningen är enkelriktad: hämtade händelser är skrivskyddade och visar sin källa med länken **Öppna i källårshjulet**. Kedjade kopplingar stöds, men cirkulära kopplingar och kopplingar mellan olika kårer blockeras. Alla datum följer med; vald visningsperiod begränsar bara vad som visas.

I årshjulets inställningar visas en diskret text under namnet på ringar med aktiverad synkning: **Synkar från arrangemang**, **Synkar från avdelningsmöten** eller **Synkar från årshjul: [namn]**. Alla aktiverade källor visas om ringen har flera, även för underringar och ringar som ännu saknar händelser.

I det interaktiva hjulet har synkade händelser ett glest diagonalt ljust mönster ovanpå sin vanliga färg. Egna händelser är helfärgade. Mönstret används för alla tre källtyper: andra årshjul, arrangemang och avdelningsmöten. En teckenförklaring visas under hjulet när den valda perioden och ringurvalet innehåller synkade händelser. Vid hovring eller tangentbordsfokus visas rubrik, datum och källa under hjulet; tryck eller Enter öppnar händelsens dialog som tidigare.

Om ett källårshjul redan hämtar från målhjulet, direkt eller via andra årshjul, är det inaktivt i hjulväljaren och märkt **hämtar redan från det här årshjulet**. Hjälptexten förklarar att händelserna annars skulle skickas runt mellan hjulen. Skyddet gäller mellan hela årshjul. Om en sådan koppling redan finns sparad gråmarkeras och låses även dess källringar med en förklaring. Välj ett annat källårshjul eller ta bort den andra synkningen först. Samma kontroll görs även när inställningen sparas.

Underringar som inkluderas via en rotring visas ikryssade och låsta med texten **Ingår via [rotring]**. När **Ta med underringar** stängs av återställs underringarnas tidigare manuella val, även efter att inställningarna sparats. Sammanfattningen **Hämtas** visar det faktiska urvalet och förklarar att händelserna samlas i målringen utan att nya underringar skapas.

Ändringar och borttagningar av källhändelser uppdaterar de sparade kopiorna vid inläsning eller ändringar i samma webbläsarvy. När källan eller ringurvalet ändras, eller synkningen stängs av, väljer man om berörda kopior ska behållas som egna händelser eller tas bort. Saknas källhjulet eller en vald källring visas en varning och befintliga kopior behålls tills kopplingen ändras. Kopiering till nästa år skapar fristående händelser. Lokala årshjul utan kårtillhörighet kan också kopplas till varandra.

Synkningen sker i webbläsaren, inte på servern. Ledare och administratörer sparar uppdaterade kopior; övriga kårmedlemmar kan se uppdateringar utan att skriva till databasen. Publika delningslänkar och utskrift använder målhjulets innehåll. En publik länk visar senast sparade kopior och ger inte åtkomst till hela källhjulet. Allt innehåll från valda ringar, inklusive ansvarig, plats, anteckningar och att göra-listor med uppgiftsansvariga, blir därmed synligt om målhjulet delas. Omedelbara uppdateringar mellan webbläsare eller till delningslänkar kräver en framtida serverbaserad lösning. Funktionen använder befintlig JSON-lagring; se driftsättningsanvisningen nedan för formatskyddet.

Vid överföring från arrangemang begränsas årshjulets kopia till 120 tecken för titel, 100 för ansvarig, 120 för plats och 2 000 för anteckningar. Originaltexten i arrangemanget ändras inte. Samma normalisering används vid jämförelse och sparning, även när kapningen sker vid ett blanksteg. Automatisk synk för ringar där den är aktiverad körs vid inläsning och ändrade källdata, inte när en sparning kvitteras. Migrering och arrangemangsuppdatering samlas i samma sparning per hjul. Skrivningar för samma hjul utförs i ordning; gamla svar får inte skriva över senare lokala ändringar eller återställa data efter utloggning.

Ringar läggs till med knappen + Ring i Inställningar eller Nytt årshjul. Lägg till en underring via plusknappen vid en ring, eller välj ring i ringdialogens placeringslista. Underringar kan inte få egna underringar. Välj på varje ring om underringarnas händelser ska summeras eller visas separat. Ordningen ändras med upp/ner-knappar eller genom att dra ringar; ringar flyttas inom sin egen nivå och flytt av en ring flyttar hela gruppen. På smala skärmar ligger rotringens knappar direkt under dess namn, före underringarna, och finns kvar när gruppen fälls ihop. Redigera eller ta bort ringar via pennknappen; ringar med händelser kan inte tas bort. En ring kan inte tas bort medan den har underringar. När ringdialogen sparas eller stängs återgår du till årshjulets dialog med övriga inmatningar bevarade. Ringändringarna sparas först när årshjulet sparas; stäng årshjulets dialog för att avbryta. Förvalda ringar läggs till via samma dialogers ringurval.

Under **Utskrift → Skriv ut...** i årshjulets hamburgermeny finns två utskriftslayouter med förhandsvisning och webbläsarens utskriftsdialog:

- **Årshjul – A3 liggande** skriver ut ett hjul på ett blad för vald period, med aktuella ringfilter och varje rings valda visningsläge för underringarna. Om hjulet har en publik delningslänk läggs en QR-kod till länken nere till vänster på utskriften. Skapa eller kontrollera delningslänken innan utskrift; den som skannar kan visa det skrivskyddade hjulet. Hjulet har samma jämnbreda ringar, ljusa ringbakgrunder, ringnamn och färgade händelsebågar som skärmhjulet. Varje händelse visas en gång som en sammanhängande båge över hela datumintervallet, även över månadsgränser. Korta händelser förstoras till minst sju dagars bredd som på skärmen. Överlappande händelser får separata spår utan klickbara överflödesmarkeringar. Händelsens namn prioriteras, radbryts och får använda hela rutan. I smala sektorer vänds texten från hjulets mitt och utåt för att utnyttja utrymmet bättre. Textstorleken anpassas och faktisk textbredd mäts i webbläsaren. Datum visas bara om hela datumintervallet får plats efter namnet. Ringnamn, plats och ansvarig visas därefter om de ryms i sin helhet. Endast namn som ändå inte ryms kortas med ….
- **Alla händelser – A4 stående** listar samtliga händelser i vald period, även i dolda ringar, kronologiskt per månad. Varje händelse listas en gång med fullständig titel, datumintervall, ring, ansvarig, plats, anteckningar och eventuell kontrollmarkering. Listan kan fortsätta över flera blad.

Händelser utan överlapp använder hela ringens bredd även i summerade ringar. Spåren för överlappande händelser anpassas separat för varje sammanhängande grupp av överlapp, så att övriga händelser inte blir smalare.

A3-bladet har en färgkodad aktivitetslista bredvid hjulet i stället för ringförklaring och läsanvisningar. Den följer ringfiltren och visar varje händelse en gång i datumordning med månadsrubriker, fullständigt namn, datumintervall och ring. Händelser över flera månader listas under sin första synliga månad i perioden. Månadsrubriken hålls ihop med månadens första händelse. Listan börjar med 12 punkters text. Om den inte ryms döljs först ringnamnen på alla aktiviteter för att spara rader; färgmarkeringarna finns kvar. Därefter minskas vid behov textstorleken i steg om en halv punkt till minst 7 punkter. Om alla aktiviteter ändå inte ryms visas så många hela poster som möjligt och en tydlig uppgift om hur många som återstår. Alla valda händelser finns fortfarande i hjulet; välj den separata A4-listan för hela listan och fullständiga uppgifter.

Utskrift kräver inte redigeringsbehörighet och fungerar även i delade årshjul. Välj föreslaget pappersformat i utskriftsdialogen och stäng gärna av webbläsarens sidhuvud och sidfot. Förhandsvisningen kan stängas med Stäng eller Escape.

### Återkommande händelser

Hjälp- och infotexter i årshjulets dialoger visas med mindre text i diskreta ljusgrå rutor. Varningar, fel och statusmeddelanden har kvar sin tydligare utformning.

Flyttade tillfällen visar **Flyttad från [datum]** direkt under datumfälten. Tillfällen som följer seriens datum visar ingen sådan text, även om exempelvis plats eller anteckningar har ändrats.

I händelseformuläret kryssar du i **Återkommande** för att öppna en separat dialog med upprepningsregeln. Där väljer du **Upprepas**:

- Varje vecka, på vald veckodag.
- Varje månad, på ett datum eller den första–femte av en veckodag.
- Varje år, på ett datum, den första–femte av en veckodag i en månad, eller en veckodag i en ISO-vecka.

Välj **Använd regel** för att återgå till händelsen med en kort sammanfattning och knappen **Ändra regel**. Avbryt, krysset, Escape eller klick utanför regeldialogen behåller tidigare regel och alla inmatningar i händelsen. Om en ny upprepning avbryts förblir kryssrutan omarkerad. Avmarkera **Återkommande** för att ta bort upprepningen. Regeln sparas först när själva händelsen sparas.

Exempelvis kan städdagen ligga på söndag vecka 46 varje år och ett annat möte på tredje torsdagen i september. Startdatum är seriens tidigaste datum; slutdatum i det vanliga datumspannet bestämmer tillfällenas längd. Upprepningen har ett separat valfritt sista datum för tillfällenas start. Om den 29:e–31:a saknas används månadens sista dag, utan att följande månaders grunddatum ändras. Årligen den 29 februari blir alltså den 28 februari vanliga år. En femte veckodag som saknas i månaden eller vecka 53 som saknas i ISO-året hoppas över.

Klick på ett återkommande tillfälle i redigeringsläge visar först frågan **Vad vill du redigera?** Välj **Bara detta tillfälle** eller **Hela serien** innan redigeringsdialogen öppnas. Dialogens rubrik visar sedan **Redigera tillfälle** eller **Redigera serie**; inget omfattningsval finns i själva formuläret. Avbryt, krysset, Escape eller klick utanför frågan öppnar ingen redigering och ändrar inga data. I skrivskyddat läge öppnas tillfället direkt för visning. Via listan **Återkommande serier** öppnas hela serien direkt. Datum, rubrik, ansvarig, plats och anteckningar kan avvika för ett tillfälle utan att seriens grundmönster ändras. Ring och färg ändras för hela serien. Ändrade grunduppgifter ärvs av tillfällen där just det fältet inte har ett undantag.

**Ställ in tillfället** döljer bara det tillfället. **Återställ till seriens mönster** tar bort ett undantag. Under **Återkommande serier** i händelselistan finns alla serier i valda ringar, även när de saknar tillfällen i visningsperioden eller alla tillfällen har ställts in. Öppna serien där för att hantera och återställa även inställda tillfällen. Att ändra grundregeln eller seriens startdatum kräver bekräftelse om undantag finns: undantagen tas då bort, inklusive inställda tillfällen. Borttagning av hela serien tar även bort alla undantag. Redigering av ”detta och kommande tillfällen” ingår inte.

Återkommande händelser behöver inte kopieras till nästa år och ingår inte i kopieringsfunktionen. Befintliga fristående årskopior konverteras inte automatiskt; ta bort överflödiga kopior om en sådan händelse görs återkommande.

Serier och undantag följer med vid synkning från andra årshjul och redigeras i källhjulet. Händelser som hämtas från arrangemang eller avdelningsmöten får däremot inte ett separat återkomstmönster i årshjulet: deras datum styrs av respektive källa. Publik delning och båda utskriftslayouterna använder samma beräkning av tillfällen som skärmen, även för verksamhetsår, flerdagarshändelser och tillfällen som flyttats över en periodgräns.

### Att göra-listor

Egna händelser och serier saknar att göra-lista tills du aktivt väljer **Lägg till att göra-lista** i händelsedialogen. Listan har samma kompakta, hopfällbara layout som i arrangemang, med antal uppgifter i rubriken, kryssruta och borttagningskryss per rad. Varje uppgift har redigerbar text och en valfri ansvarig i fritext. Händelsens ansvarig påverkas inte. Skriv i **Ny uppgift** och välj **Lägg till** eller tryck Enter. Grundlistehämtning och borttagning av hela listan finns under **Inställningar för listan**. Ändringarna sparas först med **Spara**; stäng dialogen för att avbryta. En tillagd lista kan vara tom.

På en serie redigeras en **grundlista**, utan gemensamma avprickningar. Varje tillfälle börjar med grundlistan och alla uppgifter omarkerade. När ett tillfälle med lista sparas får det en egen fullständig lista med egna ansvariga, avprickningar och eventuella tillägg eller borttagningar. Ändringar av grundlistan påverkar bara tillfällen utan sparad lista, även tidigare sådana tillfällen. Sparade tillfälleslistor påverkas inte, inte heller om grundlistan tas bort. För att uppdatera en sparad lista väljer du **Hämta senaste grundlistan**; det ersätter tillfällets lista och nollställer dess avprickningar efter bekräftelse och sparning.

Välj **Aktivera sortering** under **Inställningar för listan** för att visa samma draghandtag och upp-/nedpilar som för ringarna. Sortering är avstängd varje gång händelsedialogen öppnas, för att undvika oavsiktliga flyttar. Det gäller både fristående händelser, seriers grundlistor och enskilda tillfällen. Text, ansvarig och avprickning följer med uppgiften. Ordningen sparas med **Spara** och följer med vid synkning och utskrift. Grundlistans ordning används för tillfällen utan egen sparad lista; redan sparade tillfälleslistor behåller sin ordning.

Tillfälleslistan följer det ursprungliga datumet även om händelsen flyttas. **Ställ in tillfället** och **Återställ till seriens mönster** behåller listan och dess avprickningar. Regel- och startdatumsändringar som skulle göra ett tillfälle med sparad lista ogiltigt blockeras: behåll seriens regel eller skapa en ny serie för det nya mönstret. Listor kan tas bort separat för ett tillfälle utan att grundlistan kommer tillbaka. Vid kopiering av fristående händelser till nästa år, även masskopiering, följer uppgifter och ansvariga med men får nya uppgifts-ID:n och omarkerade kryssrutor.

För synkade händelser visas bara källans lista, skrivskyddad; ingen separat lista kan skapas i årshjulet. Arrangemangens befintliga checklistor hämtas med sina avprickningar. Saknas lista i källan visas ingen lista eller knapp för att lägga till en. Listor från andra årshjul, inklusive seriernas grundlistor och tillfälleslistor, följer med även genom flera synkled och ändras i källårshjulet. Listorna visas även skrivskyddat för läsare och i publika delningslänkar. A4-utskriften tar med uppgifter, avprickningar och ansvariga; A3-hjulet behålls utan uppgiftslistor.

#### Lagring och driftsättning

Inga nya tabeller behövs. En serie lagras som en händelse med `recurrence` och `exceptions` i årshjulets befintliga JSON-data. Regeln har en av sex stödda typer, inte ett fritt RRULE-uttryck. Den begränsade datummotorn ligger i [js/arshjul-recurrence.js](js/arshjul-recurrence.js); den implementerar bland annat den valda regeln att använda månadens sista dag, vilket skiljer sig från vanlig RRULE-hantering av ogiltiga månadsdatum. Undantag nycklas med det ursprungliga startdatumet; flyttade tillfällen behåller därför sin identitet. Genererade tillfällen sparas inte.

Listor lagras i samma JSON som `checklist` (`null` betyder ingen lista, `[]` en aktiv tom lista). Seriens `checklist` är grundlistan; självständiga tillfälleslistor sparas i `occurrence_checklists`, nycklade med ursprungligt datum. Ett uttryckligt `null` för ett tillfälle betyder att listan tagits bort just där. Varje uppgift har `id`, `text`, `responsible` och `done`.

**Kör den uppdaterade [db/arshjul.sql](db/arshjul.sql) i varje Supabase-miljö före driftsättning.** Skriptet är omkörbart och skyddar mot äldre klienter som tappar okända JSON-fält. Årshjul utan listor behåller `recurrence_format: 1` och befintlig dataversion (6 för serier). Hjul med listor uppgraderas till `recurrence_format: 2` och dataversion 7; versionerna sänks inte när sista listan tas bort. Databasens trigger tillåter nu formatuppgradering men nekar nedgradering eller borttagen formatmarkör. En äldre klient får ett fel i stället för att kunna radera listor eller upprepningar. Ladda om sidan vid det felet. Detta databasskydd gäller inte lokal lagring utan databas: undvik äldre flikar och klientversioner även i lokalt läge. Nyare, ännu okända dataformat, ogiltiga regler och ogiltiga uppgiftslistor rapporteras som fel och öppnas inte för redigering.

Kör årshjulens regressionstester med `node --test tests/arshjul-recurrence.test.js tests/arshjul-sync.test.js tests/arshjul-print.test.js tests/auth-sync.test.js`. De använder simulerad databas och kräver ingen anslutning till Supabase.
