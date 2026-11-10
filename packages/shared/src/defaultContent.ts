import type { Localized, Milestone, SiteContent, Station } from './content.js';

const L = (so: string, en: string): Localized => ({ so, en });

/**
 * Station summaries describe the proposed themes from the project brief in one or two short sentences.
 * They are drafts: every station and milestone stays `placeholder: true` until the candidate signs it off.
 */
const station = (id: string, name: [string, string], sub: [string, string], body: [string, string]): Station => ({
  id,
  name: L(...name),
  subtitle: L(...sub),
  body: L(...body),
  placeholder: true,
});

const milestone = (
  order: number,
  world: Milestone['world'],
  stationId: string,
  title: [string, string],
  summary: [string, string],
  timelineEn: string,
  status: 'proposed' | 'requires_approval',
  approval?: [string, string],
): Milestone => ({
  id: `m-${String(order).padStart(2, '0')}`,
  order,
  world,
  station: stationId,
  title: L(...title),
  summary: L(...summary),
  objective: L(...summary),
  activity: L(...summary),
  responsible: L('Musharaxa iyo kooxdiisa', 'The candidate and team'),
  dependencies: approval ? [L(...approval)] : [],
  timeline: L(timelineEn.replace(/^From Month (\d+)$/, 'Laga bilaabo Bisha $1').replace('Month', 'Bisha'), timelineEn),
  outcome: L(...summary),
  status,
  ...(status === 'requires_approval' && approval ? { approvalBody: L(...approval) } : {}),
  placeholder: true,
});

/**
 * Starting content. Nothing here is a verified claim about the candidate:
 * every candidate fact is `verified: false`, every station and milestone is `placeholder: true`,
 * and launch stays blocked until the listed approvals exist.
 */
export const defaultContent: SiteContent = {
  schemaVersion: 1,
  candidate: {
    name: 'Zakariye Mohamed Omar',
    roleLine: L('Musharax · Kulliyadda Sayniska Kombiyuutarka & IT', 'Candidate · Faculty of Computer Science & IT'),
    photo: { approved: false, alt: L('Sawirka musharaxa (la sugayo oggolaansho)', 'Candidate photo (awaiting approval)') },
    sections: {
      biography: [{ text: L('[Taariikh nololeed la xaqiijiyay, 80–150 eray]', '[Verified biography, 80–150 words]'), verified: false }],
      academics: [{ text: L('[Barnaamijka iyo heerka waxbarasho]', '[Programme and level of study]'), verified: false }],
      experience: [{ text: L('[Doorka, taariikhda, hay’adda]', '[Role, dates, organisation]'), verified: false }],
      philosophy: [{ text: L('[Mabaadi’da hoggaaminta ee musharaxa]', '[Leadership principles in the candidate’s words]'), verified: false }],
      activities: [{ text: L('[Hawlaha la xaqiijiyay ee horey loo qabtay]', '[Publicly confirmed past activities]'), verified: false }],
    },
  },
  worlds: [
    {
      id: 'waxbarasho',
      name: 'Waxbarasho',
      theme: L('Waxbarasho', 'Education'),
      tagline: L('Xirfado dhab ah, ilo la wadaago, mashaariic gacan-ku-qabad.', 'Real skills, shared resources, hands-on projects.'),
      stations: [
        station('code-lab', ['Code Lab', 'Code Lab'], ['Tababarro koodh', 'Coding workshops'], [
          'Kulammo koodh oo gacan-ku-qabad ah oo bil kasta ah, laga bilaabo heerka bilowga.',
          'Monthly hands-on coding sessions, open to every level from beginner up.',
        ]),
        station('resource-vault', ['Kaydka Ilaha', 'Resource Vault'], ['Ilo la wadaago', 'Shared resources'], [
          'Hal meel oo ardaydu ka helaan qoraalo, casharro iyo koorsooyin bilaash ah.',
          'One place for notes, past materials and free courses students recommend.',
        ]),
        station('project-forge', ['Warshadda Mashaariicda', 'Project Forge'], ['Mashaariic dhab ah', 'Real projects'], [
          'Kooxo yaryar oo dhisa apps iyo qalab dhab ah, kadibna soo bandhiga.',
          'Small teams build real apps and tools, then show them to the faculty.',
        ]),
        station('skills-path', ['Jidka Xirfadaha', 'Skills Path'], ['Bilow → Dhise → Hage', 'Beginner → Builder → Mentor'], [
          'Jid cad oo laga bilaabo bilow ilaa hage, si qof walba u ogaado tallaabadiisa xigta.',
          'A clear path from beginner to mentor, so everyone knows their next step.',
        ]),
      ],
    },
    {
      id: 'midnimo',
      name: 'Midnimo',
      theme: L('Midnimo', 'Unity'),
      tagline: L('Cod kasta waa la maqlaa. Arday kasta waa ka mid.', 'Every voice heard. Every student included.'),
      stations: [
        station('student-voice', ['Codka Ardayda', 'Student Voice'], ['Fagaare furan', 'Open forum'], [
          'Fagaare furan bil kasta, halkaas oo ardaydu toos ugu sheegaan fikradahooda.',
          'A monthly open forum where students raise ideas and concerns directly.',
        ]),
        station('peer-mentoring', ['Hagidda Asxaabta', 'Peer Mentoring'], ['Arday caawinaya arday', 'Students helping students'], [
          'Ardayda sare waxay lammaane la noqdaan ardayda cusub si ay u caawiyaan.',
          'Senior students pair with newcomers to help them settle in and succeed.',
        ]),
        station('inclusion', ['Ka-mid-noqosho', 'Inclusion'], ['Gelitaan siman', 'Equal access'], [
          'Hubinta in fursad kasta ay u furan tahay arday walba, si siman.',
          'Making sure every opportunity is open to every student, equally.',
        ]),
        station('clubs', ['Ururada', 'Clubs & Societies'], ['Kooxaha ardayda', 'Student groups'], [
          'Taageero ururada ardayda si ay u kobcaan oo ay u abaabulaan hawlo.',
          'Support for student clubs to grow and run their own activities.',
        ]),
        station('inter-year', ['Iskaashi Fasallo', 'Inter-year'], ['Sanad-sanad', 'Across years'], [
          'Isku xidhka fasallada kala duwan si aqoon iyo khibrad loo wadaago.',
          'Connecting year groups so knowledge and experience flow between them.',
        ]),
        station('channels', ['Kanaalada Xidhiidhka', 'Channels'], ['Sida loola xidhiidho', 'How to reach us'], [
          'Kanaalo cad oo ardaydu ugu soo gudbin karaan arrimahooda.',
          'Clear channels for students to reach their representatives.',
        ]),
        station('events', ['Munaasabadaha', 'Events'], ['Kulammo wadaag', 'Shared events'], [
          'Munaasabado isu keena kulliyadda oo dhan, wax barasho iyo madadaalo.',
          'Events that bring the whole faculty together to learn and connect.',
        ]),
      ],
    },
    {
      id: 'hoggaan',
      name: 'Hoggaan',
      theme: L('Hoggaan', 'Leadership'),
      tagline: L('Masuuliyad, hufnaan iyo jid cad oo la wadaago.', 'Responsibility, transparency and a shared roadmap.'),
      stations: [
        station('responsibilities', ['Masuuliyadaha', 'Responsibilities'], ['Doorka', 'The role'], [
          'Matalidda ardayda iyo gudbinta codkooda kulliyadda, sida doorku dhigayo.',
          'Represent students and carry their voice to the faculty, as the role defines.',
        ]),
        station('governance', ['Maamulka', 'Governance'], ['Go’aanno furan', 'Open decisions'], [
          'Go’aanno si furan loo gaadho, kadibna loo daabaco natiijadooda.',
          'Decisions made openly, with a short public summary after each meeting.',
        ]),
        station('ledger', ['Diiwaanka Hufnaanta', 'Transparency Ledger'], ['Ballanqaadyo la raadraaco', 'Tracked commitments'], [
          'Ballanqaad kasta wuxuu yeelan lahaa xaalad muuqata. Raadraacu wuxuu bilaaban lahaa haddii la doorto.',
          'Every commitment gets a visible status. Tracking would begin only if elected.',
        ]),
        station('feedback-channels', ['Kanaalada Ra’yiga', 'Feedback Channels'], ['Codkaaga', 'Your voice'], [
          'Sanduuq talo oo qarsoodi ah iyo kulammo furan si ra’yigaagu u gaadho.',
          'An anonymous suggestion box and open sessions so your input is heard.',
        ]),
      ],
    },
  ],
  milestones: [
    milestone(1, 'waxbarasho', 'code-lab', ['Tababar koodh bille ah', 'Monthly coding workshop'], [
      'Kulan koodh oo gacan-ku-qabad ah bil kasta.',
      'A hands-on coding session every month.',
    ], 'Month 1–2', 'requires_approval', ['Xafiiska kulliyadda: qol', 'Faculty office: room booking']),
    milestone(2, 'midnimo', 'student-voice', ['Fagaare arday oo furan', 'Open student forum'], [
      'Meel ardaydu ku sheegaan fikradahooda.',
      'A regular space for students to speak up.',
    ], 'Month 1', 'proposed'),
    milestone(3, 'hoggaan', 'governance', ['Warbixinnada golaha', 'Council summaries'], [
      'Soo koobid gaaban kadib kulan kasta.',
      'A short public summary after every meeting.',
    ], 'From Month 1', 'proposed'),
    milestone(4, 'waxbarasho', 'resource-vault', ['Maktabad ilo la wadaago', 'Shared resource library'], [
      'Qoraalo iyo casharro hal meel ku jira.',
      'Notes and materials, all in one place.',
    ], 'Month 2', 'proposed'),
    milestone(5, 'midnimo', 'peer-mentoring', ['Lammaanayaal hagid', 'Peer mentoring pairs'], [
      'Arday sare oo caawiya arday cusub.',
      'Seniors guiding newcomers, one to one.',
    ], 'Month 2–3', 'requires_approval', ['Oggolaanshaha kulliyadda', 'Faculty sign-off']),
    milestone(6, 'waxbarasho', 'project-forge', ['Bandhig mashaariic', 'Project showcase'], [
      'Ardaydu waxay soo bandhigaan waxa ay dhiseen.',
      'Students present what they have built.',
    ], 'Month 3–4', 'proposed'),
    milestone(7, 'hoggaan', 'feedback-channels', ['Sanduuq talo qarsoodi ah', 'Anonymous suggestion box'], [
      'Hab ammaan ah oo talo loogu soo gudbiyo.',
      'A safe way to send ideas and concerns.',
    ], 'Month 2', 'requires_approval', ['Xafiiska arrimaha ardayda', 'Student affairs office']),
    milestone(8, 'midnimo', 'events', ['Kulan fasallada dhexdooda', 'Inter-year meetup'], [
      'Fasallada oo dhan oo hal mar is arka.',
      'All year groups together in one room.',
    ], 'Month 4', 'proposed'),
  ],
  manifesto: { available: false },
  faq: [
    {
      q: L('Ma tani waa codbixin?', 'Is this a vote?'),
      a: L('Maya. Su’aasha dhammaadka waxay qiimeysaa sida bogga u caddeeyay barnaamijka oo kaliya.', 'No. The closing question only rates how clearly this site explains the program.'),
    },
    {
      q: L('Ma xog shakhsi ah ayaa la ururiyaa?', 'Is personal data collected?'),
      a: L('Maya. Kaliya tirooyin guud oo aan qofna lagu aqoonsan karin.', 'No. Only anonymous totals that cannot identify anyone.'),
    },
  ],
  disclosure: {
    notOfficial: L('Kani waa mashruuca musharaxa, ma aha kanaal rasmi ah oo jaamacadda.', 'This is the candidate’s own project, not an official university channel.'),
    fictionalEnvironments: L('Deegaannada 3D waa fan khayaali ah, ma aha dhismayaasha Jaamacadda Hormuud.', 'The 3D environments are artistic fiction, not Hormuud University facilities.'),
    feedbackNotVote: L('Ra’yigu wuxuu qiimeeyaa caddaanta bogga. Ma aha cod, lagumana xidho adiga.', 'Feedback rates the website’s clarity. It is not a vote and is not linked to you.'),
    privacy: [
      L('Waxaan ururinnaa dhacdooyin aan magac lahayn oo ku saabsan qaybaha la furay iyo xawaaraha bogga.', 'We collect anonymous events about which parts were opened and how fast the site loaded.'),
      L('Ma ururinno magacaaga, lambarkaaga, goobtaada, IP-gaaga ama sida aad u codeyn doonto.', 'We do not collect your name, number, location, IP address or how you intend to vote.'),
      L('Dhacdooyinka ceeriin 14 maalmood ayaa la hayaa; wadarta ilaa 6 bilood doorashada kadib.', 'Raw events are kept 14 days; totals until 6 months after the election.'),
    ],
    correctionsContact: '[project email — to be confirmed]',
  },
  launch: {
    status: 'blocked',
    blockers: [
      L('Oggolaanshaha magaca iyo astaanta jaamacadda', 'University name and logo permission'),
      L('Xaqiijinta guddiga doorashada', 'Election committee confirmation'),
      L('Sawir la oggolaaday iyo nuxur la xaqiijiyay', 'Approved photo and verified content'),
    ],
  },
};
