-- Remove implementation/demo wording from public seeded concert biographies.
-- This keeps existing local databases aligned without changing applied migrations.
UPDATE concerts
SET artist_bio = CASE event_code
    WHEN 'ATSH-HCM-2026' THEN $$Anh Trai Say Hi gathers beloved performers from the hit music reality format for a polished concert built around vocal stages, dance moments, and fan-favorite collaborations. The stadium program moves from intimate solo moments to full-cast performances, giving fans a complete live version of the show's most memorable energy.$$
    WHEN 'ATVNCG-HN-2026' THEN $$Anh Trai Vượt Ngàn Chông Gai turns the competition show's strongest performances into a live stadium experience, pairing familiar anthems with new arrangements and group stages. The concert highlights mature vocals, band-driven arrangements, and the camaraderie that made the cast a fan favorite.$$
    WHEN 'EXSH-HCM-2026' THEN $$Em Xinh Say Hi brings a colorful pop-forward show to the arena, highlighting group chemistry, solo stages, and a production style designed for close fan engagement. Expect bright choreography, playful arrangements, and moments built for fans to sing along from the first section to the encore.$$
    WHEN 'CDDG-HN-2026' THEN $$Chị Đẹp Đạp Gió Rẽ Sóng presents a refined live program built around standout vocalists, dance crews, and polished ensemble performances. The night balances elegant ballad stages with confident group numbers, celebrating the artists' range and the audience connection behind the show.$$
    ELSE artist_bio
END,
    updated_at = now()
WHERE event_code IN (
    'ATSH-HCM-2026',
    'ATVNCG-HN-2026',
    'EXSH-HCM-2026',
    'CDDG-HN-2026'
);
