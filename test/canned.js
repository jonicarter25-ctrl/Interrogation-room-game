// Canned model output for the Interrogation Room mock.
const truth = {
  title: 'The Haldane Court Affair',
  house: 'Haldane Court, a cold Palladian house above the village of Little Shiplake, Wiltshire.',
  victim: { name: 'Sir Rupert Calloway', age: 64, role: 'master of Haldane Court', sketch: 'A shrewd, tight-fisted landowner who had lately been rewriting his will. He kept the study locked and the key on his watch chain.' },
  night: { start: '19:30', end: '02:00', discovered: '00:50', discoveredBy: 'Albert Pruett', where: 'the study' },
  weather: 'Sleet from nine o\'clock; the lane to the village iced over by midnight.',
  publicFacts: [
    'Sir Rupert Calloway was found dead in his study at ten to one in the morning by the butler, Albert Pruett.',
    'He had a wound to the back of the head; the bronze bookend from the mantel lay on the hearth rug.',
    'Dinner was served at eight; all four guests and family were at table.',
    'The village constable was telephoned at five past one and Scotland Yard was sent for at dawn.',
    'Sleet fell all night and nobody left the house by the lane.',
    'Staying in the house: Major Gerald Lusk, Mrs Constance Varley, and Miss Iris Dunmore.',
  ],
  suspects: [
    { name: 'Major Gerald Lusk', age: 52, role: 'Sir Rupert\'s brother-in-law, retired Indian Army, heavily in debt', sketch: 'Clipped moustache, regimental tie, smells of cue chalk and bay rum. Keeps a hand in his jacket pocket.', part: 'killer' },
    { name: 'Mrs Constance Varley', age: 38, role: 'a widowed guest and old friend of the family', sketch: 'Elegant, pale, and watchful. Twists a garnet ring when she is thinking.', part: 'liar' },
    { name: 'Albert Pruett', age: 61, role: 'butler at Haldane Court for thirty years', sketch: 'Stooped, precise, proud of his silver. Wears spectacles he pretends not to need.', part: 'mistaken' },
    { name: 'Miss Iris Dunmore', age: 24, role: 'Sir Rupert\'s niece and typist', sketch: 'Ink on her fingers, quick to answer, quicker to blush. Fond of her uncle in spite of him.', part: 'honest' },
  ],
  killer: 'Major Gerald Lusk',
  motive: 'Sir Rupert had told Lusk he would cut him out of the will and call in a loan of two thousand pounds on Monday. Lusk could not pay and faced ruin and disgrace.',
  method: 'At about 23:05 Lusk went from the billiard room to the study by the back passage, struck Sir Rupert from behind with the bronze bookend, and wiped it on his handkerchief. He overturned the decanter to suggest a drunken fall and was back at the billiard table by 23:20.',
  alibiGap: { from: '23:00', to: '23:20', killerClaims: 'that he was playing billiards alone from half past ten until half past eleven', actually: 'he left the billiard room at 23:03 and killed Sir Rupert in the study' },
  timeline: [
    { time: '19:30', place: 'drawing room', present: ['Sir Rupert Calloway', 'Major Gerald Lusk', 'Mrs Constance Varley', 'Miss Iris Dunmore'], event: 'Sherry before dinner. Sir Rupert is short with Lusk.', witnesses: ['Albert Pruett'] },
    { time: '20:00', place: 'dining room', present: ['Sir Rupert Calloway', 'Major Gerald Lusk', 'Mrs Constance Varley', 'Miss Iris Dunmore'], event: 'Dinner is served by Pruett.', witnesses: ['Albert Pruett'] },
    { time: '21:20', place: 'dining room', present: ['Sir Rupert Calloway', 'Major Gerald Lusk'], event: 'The ladies withdraw. Sir Rupert tells Lusk he will call in the loan on Monday and change his will.', witnesses: [] },
    { time: '21:45', place: 'study', present: ['Sir Rupert Calloway', 'Miss Iris Dunmore'], event: 'Iris types a letter to the solicitor at her uncle\'s dictation.', witnesses: [] },
    { time: '22:15', place: 'study', present: ['Sir Rupert Calloway', 'Albert Pruett'], event: 'Pruett brings the whisky tray; Sir Rupert is alive and irritable.', witnesses: [] },
    { time: '22:30', place: 'billiard room', present: ['Major Gerald Lusk'], event: 'Lusk begins knocking the balls about alone.', witnesses: ['Miss Iris Dunmore'] },
    { time: '22:48', place: 'hall', present: ['Mrs Constance Varley'], event: 'Constance places a trunk call to a London moneylender from the hall telephone.', witnesses: [] },
    { time: '23:03', place: 'back passage', present: ['Major Gerald Lusk'], event: 'Lusk leaves the billiard room by the back passage toward the study.', witnesses: [] },
    { time: '23:08', place: 'study', present: ['Major Gerald Lusk', 'Sir Rupert Calloway'], event: 'Lusk strikes Sir Rupert with the bronze bookend and overturns the decanter.', witnesses: [] },
    { time: '23:12', place: 'hall', present: ['Mrs Constance Varley'], event: 'Constance ends her trunk call and goes up to bed.', witnesses: [] },
    { time: '23:20', place: 'billiard room', present: ['Major Gerald Lusk'], event: 'Lusk is back at the table, chalking his cue.', witnesses: [] },
    { time: '23:40', place: 'servants\' hall', present: ['Albert Pruett'], event: 'Pruett locks up and signs the key register.', witnesses: [] },
    { time: '00:50', place: 'study', present: ['Albert Pruett', 'Sir Rupert Calloway'], event: 'Pruett finds the study door ajar and Sir Rupert dead on the hearth rug.', witnesses: [] },
    { time: '01:05', place: 'hall', present: ['Albert Pruett', 'Miss Iris Dunmore', 'Major Gerald Lusk'], event: 'Pruett telephones the village constable; the household gathers in the hall.', witnesses: ['Mrs Constance Varley'] },
  ],
  evidence: [
    { id: 'ev1', name: 'Bronze bookend', where: 'hearth rug, study', detail: 'Heavy bronze horse, wiped clean, a hair caught at the base.', proves: 'The blow was struck deliberately and the weapon wiped.', atScene: true },
    { id: 'ev2', name: 'Overturned decanter', where: 'study desk', detail: 'Whisky decanter on its side, a clear thumbprint on the stopper.', proves: 'Someone handled the decanter after Pruett\'s tray was set down.', atScene: true },
    { id: 'ev3', name: 'Blue chalk smear', where: 'study carpet by the door', detail: 'A smudge of blue billiard chalk on the pale carpet.', proves: 'Someone came from the billiard room into the study.', atScene: true },
    { id: 'ev4', name: 'Billiard scoreboard', where: 'billiard room', detail: 'Score pegs unmoved since 22:40 by the marker\'s pencil note.', proves: 'Nobody was scoring between 22:40 and 23:20.', atScene: false },
    { id: 'ev5', name: 'Letter from a London moneylender', where: 'Mrs Varley\'s writing case', detail: 'Demands repayment of three hundred pounds by Friday.', proves: 'Constance had a reason to telephone London privately.', atScene: false },
  ],
  forensics: {
    tod: 'Death occurred between 22:50 and 23:30, most likely shortly after eleven. The blow came from behind and slightly above.',
    prints: 'The thumbprint on the decanter stopper is Major Lusk\'s. No prints on the bookend, which was wiped.',
    exchange: 'A trunk call from Haldane Court to a London number was connected 22:48 and cleared 23:12. The operator recalls a woman\'s voice.',
    tox: 'Sir Rupert had taken a moderate amount of whisky. No poison or sedative was present.',
    staff: 'The footman passed the billiard room at 23:10 and saw it dark. The study key was on Sir Rupert\'s chain; the back passage door was unbolted.',
  },
  redHerring: 'Constance\'s secret trunk call looks like an alibi being arranged, but the exchange log shows she was on the line throughout the murder.',
  solutionPath: [
    'Note the blue chalk in the study and ask who was playing billiards.',
    'Hear Lusk claim he played alone from 22:30 to 23:30.',
    'Order the staff report: the billiard room was dark at 23:10.',
    'Order fingerprints: Lusk\'s thumb on the decanter he says he never touched.',
    'Order the exchange log to clear Mrs Varley, whose lie hides a debt.',
    'Correct Pruett\'s mistaken time of the whisky tray with Iris\'s account.',
  ],
};

const briefs = {
  briefs: [
    { name: 'Major Gerald Lusk', part: 'killer', personality: 'Brusque, bluff and quick to take offence. Speaks in clipped sentences with old regimental slang. Grows icy and formal when pressed.', voiceSample: 'Look here, Inspector, I have told you once already.', relationship: 'He resented Rupert for years and feared him lately.', movements: [{ from: '22:30', to: '23:03', where: 'billiard room', doing: 'knocking balls about', seenBy: ['Miss Iris Dunmore'] }, { from: '23:03', to: '23:20', where: 'study', doing: 'killing Sir Rupert', seenBy: [] }], knows: ['He killed Rupert with the bookend (did).'], doesNotKnow: ['That the footman passed the billiard room.'], secret: 'He killed Sir Rupert over the loan.', lies: [{ claim: 'I played billiards alone from half past ten until half past eleven.', truth: 'He left the billiard room at 23:03.', when: 'asked about his evening', crack: 'the staff report that the billiard room was dark at 23:10' }, { claim: 'I never went near the study after dinner.', truth: 'He was in the study at 23:08.', when: 'asked about the study', crack: 'his thumbprint on the decanter' }], honestMistake: null, tells: ['Touches his moustache'], pressure: { baseline: 20, breakPoint: 55, lawyerPoint: 85, style: 'lawyer' }, opening: 'Inspector. Bad business. Ask what you like, but be quick about it.' },
    { name: 'Mrs Constance Varley', part: 'liar', personality: 'Composed and careful, with a dry wit. Answers questions with questions. Goes very still when frightened.', voiceSample: 'I hardly think that is your concern, Inspector.', relationship: 'Fond of Rupert, a little afraid of his tongue.', movements: [{ from: '22:48', to: '23:12', where: 'hall telephone', doing: 'trunk call to a moneylender', seenBy: [] }], knows: ['She telephoned London (did).'], doesNotKnow: ['Who killed Rupert.'], secret: 'She owes a moneylender three hundred pounds.', lies: [{ claim: 'I went up to bed at half past ten and read until I slept.', truth: 'She was on the hall telephone until 23:12.', when: 'asked where she was', crack: 'the exchange log' }], honestMistake: null, tells: ['Twists her ring'], pressure: { baseline: 15, breakPoint: 60, lawyerPoint: 90, style: 'shutdown' }, opening: 'Good morning, Inspector. I am afraid I slept through all of it.' },
    { name: 'Albert Pruett', part: 'mistaken', personality: 'Formal, deferential, and proud. Uses long sentences and sir at every turn. Becomes tearful about the master.', voiceSample: 'If I may say so, sir, the master was most particular.', relationship: 'Loyal to the old man for thirty years.', movements: [{ from: '22:15', to: '22:20', where: 'study', doing: 'bringing the whisky tray', seenBy: [] }], knows: ['He found the body at 00:50 (did).'], doesNotKnow: ['Who killed Rupert.'], secret: null, lies: [], honestMistake: { claim: 'I took the whisky tray in at a quarter to eleven.', truth: 'It was a quarter past ten.', why: 'The hall clock had stopped and he read it wrongly.' }, tells: ['Polishes his spectacles'], pressure: { baseline: 10, breakPoint: 70, lawyerPoint: 90, style: 'tears' }, opening: 'Sir. Thirty years I served the master. Thirty years.' },
    { name: 'Miss Iris Dunmore', part: 'honest', personality: 'Bright, nervous, and truthful. Speaks quickly and corrects herself. Flares up if accused.', voiceSample: 'Oh, I am sorry, I am rattling on.', relationship: 'Fond of her uncle despite his temper.', movements: [{ from: '21:45', to: '22:10', where: 'study', doing: 'typing a letter', seenBy: [] }], knows: ['She saw Lusk in the billiard room at 22:30 (saw).'], doesNotKnow: ['Who killed Rupert.'], secret: null, lies: [], honestMistake: null, tells: ['Blushes'], pressure: { baseline: 12, breakPoint: 75, lawyerPoint: 92, style: 'anger' }, opening: 'Inspector, please, you must find who did this to him.' },
  ],
};

module.exports = { truth, briefs };
