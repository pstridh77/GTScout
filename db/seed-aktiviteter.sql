-- GTScout - seed av aktiviteter till databasen
--
-- 1) Satt karnamn till den kar som ska aga befintliga aktiviteter.
-- 2) Kor filen i Supabase SQL Editor efter db/schema.sql.

with selected_kar as (
    select id
    from public.kar
    where namn = 'Gullbrandstorps Scoutkår'
    limit 1
)
insert into public.aktiviteter (
    id, kar_id, namn, kategori, beskrivning, tid, material, genomforande
)
select
    data.id,
    selected_kar.id,
    data.namn,
    data.kategori,
    data.beskrivning,
    data.tid,
    data.material,
    data.genomforande
from selected_kar
cross join (
    values
        ('elda-01', 'Tända eld med tändstickor', 'Scouting', 'öva på att tända en liten och säker eld med tändstickor.', '20', array['Tandstickor', 'Ved', 'Vatten eller slackutrustning'], 'Gå igenom eldplatsen och säkerheten. Låt scouterna bygga en liten brasa, tända den och släcka den under ledarens uppsikt.'),
        ('elda-02', 'Eldtriangeln', 'Scouting', 'Undersök vad som behövs för att en eld ska brinna och vad som händer när en del saknas.', '25', array['Ljus', 'Tändstickor', 'Lock eller annan kvävningsyta'], 'Prata om syre, värme och bränsle. Testa försiktigt hur lågan påverkas när en del av eldtriangeln tas bort.'),
        ('elda-03', 'Säker eldplats', 'Scouting', 'Planera, bygg och kontrollera en säker eldplats.', '30', array['Stenar', 'Ved', 'Vatten', 'Spade'], 'Välj plats, avgränsa elden, förbered släckning och kontrollera tillsammans att eldplatsen inte kan sprida brand.'),
        ('sakerhet-01', 'Eld och säkerhet', 'Scouting', 'Öva på risker med eld och vad man gör vid en mindre brännskada.', '20', array['Första hjälpen-material', 'Vatten', 'Bilder eller scenariekort'], 'Arbeta med korta scenarier om eld, kläder som brinner och brännskador. Avsluta med att visa hur man kyler en skada och larmar en ledare.'),
        ('mat-eld-01', 'Laga mat över eld', 'Scouting', 'Använd en säker eld för att tillaga en enkel måltid.', '60', array['Matvaror', 'Gryta eller stekpanna', 'Grytlappar', 'Ved'], 'Planera maten, fördela uppgifter, laga maten över elden och avsluta med att släcka och städa eldplatsen.'),
        ('Hajk-02', 'Hajk', 'Sova borta', '', '2 overnattningar', array[]::text[], ''),
        ('Hajk-01', 'Hajk', 'Sova borta', '', '1 overnattning', array[]::text[], ''),
        ('demokratimote', 'Demokratimote', 'Demokrati', 'Genomför demokratimöte för patrullen. åt alla i patrullen vara med och bestämma vad som ska göras.', '1 träff', array[]::text[], 'Genomför mötet enligt mallar och instruktioner.'),
        ('arsstamma', 'Årsstämma', 'Demokrati', 'Deltag på årsstämma och var med och påverka föreningens framtid.', '1 träff', array[]::text[], 'Enligt kallelse och stadgar.'),
        ('terminsavslutning', 'Terminsavslutning', 'Övrigt', 'Genomför terminsavslutning för avdelningen', '1 träff', array[]::text[], 'Märkesutdelning, fika och gemenskap. Avsluta terminen med en rolig aktivitet.'),
        ('terminsuppstart', 'Terminsuppstart', 'Övrigt', 'Genomför terminsuppstart för avdelningen.', '1 träff', array[]::text[], 'Planera aktiviteter, informera medlemmar och genomför terminsuppstarten. älkomna nya medlemmar.'),
        ('HYX_traning', 'Träna inför Hallandsyxan', 'Scouting', 'Träna på de olika momenten i Hallandsyxan.', '', array[]::text[], 'Beskriv momenten'),
        ('HYX_genomforande', 'Genomför Hallandsyxan', 'Scouting', 'Delta på Hallandsyxan.', '1 dag', array[]::text[], 'Genomför momenten enligt instruktioner'),
        ('aktivitetsbanken_baka_brod', 'Baka bröd över öppen eld', 'Matlagning', 'För att scouterna ska få testa på saker i en ny miljö. Det finns många enkla sätt att baka, även utan ugn.', '', array[]::text[], 'Genomför momenten enligt instruktioner. https://www.aktivitetsbanken.se/baka-brod-over-oppen-eld')
) as data(id, namn, kategori, beskrivning, tid, material, genomforande)
on conflict (id) do update
set
    kar_id = excluded.kar_id,
    namn = excluded.namn,
    kategori = excluded.kategori,
    beskrivning = excluded.beskrivning,
    tid = excluded.tid,
    material = excluded.material,
    genomforande = excluded.genomforande;
