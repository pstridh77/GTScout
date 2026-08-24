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
        ('elda-01', 'Tanda eld med tandstickor', 'Scouting', 'Ova pa att tanda en liten och saker eld med tandstickor.', '20', array['Tandstickor', 'Ved', 'Vatten eller slackutrustning'], 'Ga igenom eldplatsen och sakerheten. Lat scouterna bygga en liten brasa, tanda den och slacka den under ledarens uppsikt.'),
        ('elda-02', 'Eldtriangeln', 'Scouting', 'Undersok vad som behovs for att en eld ska brinna och vad som hander nar en del saknas.', '25', array['Ljus', 'Tandstickor', 'Lock eller annan kvavningsyta'], 'Prata om syre, varme och bransle. Testa forsiktigt hur lagan paverkas nar en del av eldtriangeln tas bort.'),
        ('elda-03', 'Saker eldplats', 'Scouting', 'Planera, bygg och kontrollera en saker eldplats.', '30', array['Stenar', 'Ved', 'Vatten', 'Spade'], 'Valj plats, avgransa elden, forbered slackning och kontrollera tillsammans att eldplatsen inte kan sprida brand.'),
        ('sakerhet-01', 'Eld och sakerhet', 'Scouting', 'Ova pa risker med eld och vad man gor vid en mindre brannskada.', '20', array['Forsta hjalpen-material', 'Vatten', 'Bilder eller scenariekort'], 'Arbeta med korta scenarier om eld, klader som brinner och brannskador. Avsluta med att visa hur man kyler en skada och larmar en ledare.'),
        ('mat-eld-01', 'Laga mat over eld', 'Scouting', 'Anvand en saker eld for att tillaga en enkel maltid.', '60', array['Matvaror', 'Gryta eller stekpanna', 'Grytlappar', 'Ved'], 'Planera maten, fordela uppgifter, laga maten over elden och avsluta med att slacka och stada eldplatsen.'),
        ('Hajk-02', 'Hajk', 'Sova borta', '', '2 overnattningar', array[]::text[], ''),
        ('Hajk-01', 'Hajk', 'Sova borta', '', '1 overnattning', array[]::text[], ''),
        ('demokratimote', 'Demokratimote', 'Demokrati', 'Genomfor demokratimote for patrullen. Lat alla i patrullen vara med och bestamma vad som ska goras.', '1 traff', array[]::text[], 'Genomfor motet enligt mallar och instruktioner.'),
        ('arsstamma', 'Arsstamma', 'Demokrati', 'Deltag pa arsstamma och var med och paverka foreningens framtid.', '1 traff', array[]::text[], 'Enligt kallelse och stadgar.'),
        ('terminsavslutning', 'Terminsavslutning', 'Ovrigt', 'Genomfor terminsavslutning for avdelningen', '1 traff', array[]::text[], 'Markesutdelning, fika och gemenskap. Avsluta terminen med en rolig aktivitet.'),
        ('terminsuppstart', 'Terminsuppstart', 'Ovrigt', 'Genomfor terminsuppstart for avdelningen.', '1 traff', array[]::text[], 'Planera aktiviteter, informera medlemmar och genomfor terminsuppstarten. Valkomna nya medlemmar.'),
        ('HYX_traning', 'Trana infor Hallandsyxan', 'Scouting', 'Trana pa de olika momenten i Hallandsyxan.', '', array[]::text[], 'Beskriv momenten'),
        ('HYX_genomforande', 'Genomfor Hallandsyxan', 'Scouting', 'Delta pa Hallandsyxan.', '1 dag', array[]::text[], 'Genomfor momenten enligt instruktioner')
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
