/**
 * A second set, written after the rules were tuned on tests/draft-set.ts and before they were run on these.
 * The first result on this set is the honest one and is written in the test that uses it.
 */
const KOSINSKI = '10.1073/pnas.1218772110';
const NOY = '10.1126/science.adh2586';
const WALTERS = '10.1038/s41598-023-41032-5';
const BAUMEISTER = '10.1037/0033-2909.117.3.497';
const OSC = '10.1126/science.aac4716';
const VOSOUGHI = '10.1126/science.aap9559';
const SPARROW = '10.1126/science.1207745';
const BLOOM = '10.1093/qje/qju032';

export const COPIED2: [string, string][] = [
  [KOSINSKI, 'Records of what we like online can be used to automatically and accurately predict a range of highly sensitive personal attributes.'],
  [NOY, 'Workers exposed to ChatGPT during the experiment were 2 times as likely to report using it.'],
  [WALTERS, 'I learned that 43% of the real (non-fabricated) GPT-3.5 citations but just 24% of the real GPT-4 citations include substantive citation errors.'],
  [BAUMEISTER, 'Several seeming counterexamples turned out not to disconfirm the hypothesis (Baumeister & Leary, 1995).'],
  [OSC, 'Reproducibility is a defining feature of science, but the extent to which it characterizes current research is unknown.'],
  [VOSOUGHI, 'This matters because humans, not robots, are more likely to spread it than anything else on the site, and robots accelerated the spread of true and false news at the same rate.'],
  [SPARROW, 'The advent of the Internet, with sophisticated algorithmic search engines, has made accessing information as easy as it gets.'],
  [BLOOM, 'Ctrip rolled out the option to WFH to the whole firm and allowed the experimental employees to reselect.'],
];

export const CLOSE2: [string, string][] = [
  [KOSINSKI, 'The model discriminates correctly between homosexual and heterosexual men in 88% of the cases and between African and Caucasian Americans in 95% of them.'],
  [NOY, 'In an online experiment that was preregistered, they assigned writing tasks to 453 professionals with college education and exposed half of them randomly to ChatGPT.'],
  [WALTERS, 'This study looks at one type of hallucination: bibliographic citations that are fabricated and do not represent real scholarly works.'],
  [OSC, 'Ninety-seven per cent of the original studies had results that were statistically significant, against thirty-six per cent of the replications.'],
  [VOSOUGHI, 'False stories inspired disgust, fear and surprise in the replies, whereas the true stories inspired sadness, anticipation, joy and trust.'],
  [BLOOM, 'More than half of them then switched, and this led to gains from home work almost doubling, to 22%.'],
];

export const OWN2: [string, string][] = [
  [KOSINSKI, 'Kosinski et al. (2013) warn that a list of things you clicked can give away your politics, faith or sexuality.'],
  [KOSINSKI, 'From nothing but Facebook Likes, a simple model guessed party loyalty right in most cases (Kosinski et al., 2013).'],
  [NOY, 'Two months on, people who had tried the chatbot in the trial were still more likely to use it at work (Noy & Zhang, 2023).'],
  [NOY, 'The tool cut the time a task took by two fifths, while graders scored the work 18% higher (Noy & Zhang, 2023).'],
  [WALTERS, 'The newer model made up fewer sources, but a quarter of its real ones still carried mistakes (Walters & Wilder, 2023).'],
  [BAUMEISTER, 'They treat belonging as a need like hunger: once met it quietens, and without it health suffers (Baumeister & Leary, 1995).'],
  [OSC, 'How strong the first evidence was told us more about whether a finding would hold than who ran the test (Open Science Collaboration, 2015).'],
  [VOSOUGHI, 'Novelty seems to be the reason: readers pass on what surprises them, and lies surprise more (Vosoughi et al., 2018).'],
  [SPARROW, 'Searching has become a kind of shared memory that we lean on instead of our own heads (Sparrow et al., 2011).'],
  [BLOOM, 'Given the choice afterwards, more than half changed their minds about where to work, and the benefit nearly doubled (Bloom et al., 2015).'],
];

export const SLIPS2: [rule: string, before: string, after: string][] = [
  ['Word typed twice', 'The survey asked about about pay.', 'The survey asked about pay.'],
  ['Spelling', 'It was a succesful trial for the firm.', 'It was a successful trial for the firm.'],
  ['Spelling', 'The begining of the year was slow.', 'The beginning of the year was slow.'],
  ['A or an', 'The firm is an useful example here.', 'The firm is a useful example here.'],
  ['A or an', 'He gave a honest reply to the question.', 'He gave an honest reply to the question.'],
  ['Spacing', 'We know the reason .', 'We know the reason.'],
  ['Capital letter', 'We know the reason. it is cost and time.', 'We know the reason. It is cost and time.'],
  ['Easily confused words', 'They should of told the staff sooner.', 'They should have told the staff sooner.'],
  ['Easily confused words', 'Less students came to the office this year.', 'Fewer students came to the office this year.'],
  ['Easily confused words', 'Those finding was not expected by anyone.', 'That finding was not expected by anyone.'],
  ['Agreement', 'Most studies suggests that breaks help.', 'Most studies suggest that breaks help.'],
  ['Agreement', 'Managers was asked to keep notes.', 'Managers were asked to keep notes.'],
  ['Contraction', 'The firm can’t know this in advance.', 'The firm cannot know this in advance.'],
];

export const CLEAN2: string[] = [
  'The size of the sample of students was small.',
  'One of the authors has a post at a university in Europe.',
  'Neither of the sources is open to the public.',
  'The committee that checks companies has three members.',
  'A use case, a one-year plan and an eight-week trial were set.',
  'An NHS ward, a US bank and an FBI file were named.',
  'It took an hour-long talk, an heir and a historian.',
  'Rather than wait, they asked; then they left.',
  'Those studies and this study do not agree.',
  'She has had that that paper in mind for years.',
  'They are more careful then, after the warning.',
  'Their effect on trust was clear, and it did not affect pay.',
  'The journal (Vol. 3, no. 2, pp. 4–9) was used.',
  'Smith et al. argue otherwise, cf. the next part.',
  'In 2020, 3.5% of firms, i.e. about 1,200, closed.',
  'Does she have it, or did they have it before?',
  'I think, as many do, that rules help.',
  'The programme ran at the centre, and colour was not used.',
  'What the data show is that the gap is closing.',
  'The participants in the first group were told the rule.',
];
