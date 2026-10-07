DELETE FROM messages;
DELETE FROM notifications;
DELETE FROM attempts;
DELETE FROM steps;
DELETE FROM game;

INSERT INTO game (
  id, title, birthday_at, duration_seconds, entry_question, entry_answer_hash
) VALUES (
  1,
  '48 ore',
  '2026-09-13T00:00:00+02:00',
  172800,
  'Qual è la parola che uso quando voglio indicare proprio te?',
  '21abccf62714179cea7fa7d8b9b9b03624a027f8afaf6d052263b8d62af8c7a3'
);

INSERT INTO steps (
  position, question, answer_hash, points,
  reward_title, reward_text, latitude, longitude, locker_code,
  unlock_word_hash
) VALUES
(1, 'In quale città abbiamo detto una delle cose che ricordiamo di più?',
 'b0c27fca74fa91934900c9ffcb3dcca5b807a3c059a3b516cdd0788807b5ff49', 10,
 'Primo posto', 'Hai preso i primi punti. Il regalo contiene anche la parola che apre la prossima domanda.',
 40.8518, 14.2681, NULL,
 '6d453df2843720dbb50fd282e6e39d4e2512165c29406936b59a1a7523081f32'),
(2, 'Una parola che per noi sa di estate?',
 '074af2bf8e84854902eead553819b4517c2bac61c5d367a45831b05bf7789a81', 10,
 'Secondo posto', 'Trova il regalo e conserva il bigliettino: la parola serve per continuare.',
 40.8399, 14.2525, '482731',
 '2abb4638f5d222217d4600c9f83496ce4e6ec992622129885601d27c6b3c71c7'),
(3, 'Che cosa gira e suona?',
 '58917f999e32d158baffd00790ce777ed6be6c433e77cb2f6ad2867bd074e141', 10,
 'Ultimo posto', 'Qui c’è l’ultimo regalo. La parola nel bigliettino chiude il percorso.',
 40.8359, 14.2488, NULL,
 '3f4aba76661a2088d9f97598515cfc9350da9005fc3c6e2a179e18f6c0c19751');
