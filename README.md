# GTScout

Ett digitalt märkesbibliotek för Gullbrandstorps Scoutkår.

Projektet innehåller:

- Scoutmärken
- Sökning
- Filtrering
- Progression
- Ledarstöd
- Terminsplanering

Utvecklas med HTML, CSS och JavaScript.

## Arrangemang

Arrangemang (till exempel hajker, övernattningar och läger) hanteras separat från terminsplaneringarna. De kan innehålla ett datumspann, en dagsagenda med måltider, aktiviteter och fria programpunkter, samt status och efteranteckning. Recept och aktiviteter väljs från respektive bibliotek; egna poster går också att skriva in.

Välj en eller flera avdelningar per arrangemang. Varje agendapost kan vara gemensam eller riktas till ett urval, och dagsvyn visar posterna i tidsrader med avdelningskolumner.

Arrangemang sparas alltid lokalt i webbläsaren. För synkning mellan kårens användare kör du `db/arrangemang.sql` i samma Supabase-projekt efter `db/schema.sql`. Läsning kräver inloggning och kårtillhörighet; redigering kräver ledar- eller administratörsroll. Lokala ändringar synkas när användaren kan skriva och nätverket är tillgängligt.
