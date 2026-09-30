DELETE FROM messages;
DELETE FROM notifications;
DELETE FROM attempts;
DELETE FROM steps;
DELETE FROM game;

INSERT INTO game (
  id, title, birthday_at, duration_seconds, entry_question, entry_answer_hash
) VALUES (
  1,
  'La caccia di compleanno',
  '2026-09-13T00:00:00+02:00',
  172800,
  'Qual è la parola che uso quando voglio indicare proprio te?',
  '21abccf62714179cea7fa7d8b9b9b03624a027f8afaf6d052263b8d62af8c7a3'
);

INSERT INTO steps (position, question, answer_hash, reward_title, reward_text, latitude, longitude, locker_code)
VALUES
(1, 'In quale città abbiamo detto una delle cose che ricordiamo di più?', 'b0c27fca74fa91934900c9ffcb3dcca5b807a3c059a3b516cdd0788807b5ff49', 'Regalo #1', 'Vai alle coordinate. Lì troverai il primo regalo.', 40.8518, 14.2681, NULL),
(2, 'Una parola che per noi sa di estate?', '074af2bf8e84854902eead553819b4517c2bac61c5d367a45831b05bf7789a81', 'Regalo #2 · Locker', 'Quando sei davanti al locker, premi il pulsante per rivelare il codice. Verrà mostrato una sola volta.', 40.8399, 14.2525, '482731'),
(3, 'Che cosa gira e suona?', '58917f999e32d158baffd00790ce777ed6be6c433e77cb2f6ad2867bd074e141', 'Regalo finale', 'L’ultimo regalo ti aspetta qui.', 40.8359, 14.2488, NULL);
