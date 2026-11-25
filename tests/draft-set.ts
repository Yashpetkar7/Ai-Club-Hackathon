/**
 * Cases for the draft checks, written before the rules were first run on them.
 * Sentences are ours, about the eight real abstracts in tests/unit/fixtures/abstracts.json.
 */
export const BLOOM = '10.1093/qje/qju032';
export const NOY = '10.1126/science.adh2586';
export const WALTERS = '10.1038/s41598-023-41032-5';
export const BAUMEISTER = '10.1037/0033-2909.117.3.497';
export const OSC = '10.1126/science.aac4716';
export const VOSOUGHI = '10.1126/science.aap9559';
export const SPARROW = '10.1126/science.1207745';

/** Words lifted straight from the abstract, with no quotation marks. */
export const COPIED: [string, string][] = [
  [BLOOM, 'Home working led to a 13% performance increase, of which 9% was from working more minutes per shift.'],
  [BLOOM, 'Researchers know that a rising share of employees now regularly engage in working from home.'],
  [BLOOM, 'Their attrition rate halved, but their promotion rate conditional on performance fell (Bloom et al., 2015).'],
  [NOY, 'The average time taken decreased by 40% and output quality rose by 18%.'],
  [NOY, 'The authors assigned occupation-specific, incentivized writing tasks to 453 college-educated professionals.'],
  [WALTERS, 'Factually incorrect responses limit their utility because chatbots such as ChatGPT can facilitate cost-effective text generation and editing.'],
  [BAUMEISTER, 'People form social attachments readily under most conditions and resist the dissolution of existing bonds.'],
  [OSC, 'In other words, replication effects were half the magnitude of original effects, representing a substantial decline.'],
  [VOSOUGHI, 'On Twitter, falsehood diffused significantly farther, faster, deeper, and more broadly than the truth.'],
  [SPARROW, 'The Internet has become a primary form of external or transactive memory.'],
];

/** The source's sentence with a few words swapped. */
export const CLOSE: [string, string][] = [
  [BLOOM, 'Working at home produced a 13% performance increase, of which 9% came from more minutes worked per shift and 4% from more calls each minute.'],
  [BLOOM, 'Call centre staff who volunteered were assigned randomly to work from home or in the office for nine months (Bloom et al., 2015).'],
  [NOY, 'Inequality among workers decreased, while concern and excitement around AI rose temporarily.'],
  [WALTERS, 'Within the documents, 55% of GPT-3.5 citations but only 18% of GPT-4 citations were fabricated.'],
  [BAUMEISTER, 'A lack of attachment is linked with many ill effects on health, adjustment and well-being.'],
  [OSC, 'Replication success was predicted better by the strength of the original evidence than by characteristics of the teams that did the original and the replication.'],
  [VOSOUGHI, 'False news was more novel than the true news, suggesting people were more likely to share information that was novel.'],
  [SPARROW, 'When people expect to have access to information in future, they show lower recall of the information itself and better recall for where to access it.'],
];

/** Honest sentences in the student's own words about the same findings. None of these may be flagged. */
export const OWN: [string, string][] = [
  [BLOOM, 'In one Chinese travel firm, staff allowed to stay at home did about an eighth more work than those in the office (Bloom et al., 2015).'],
  [BLOOM, 'Bloom et al. (2015) ran a nine-month trial with call centre staff and saw output climb by 13%, mainly because people took fewer breaks.'],
  [BLOOM, 'Fewer people quit, yet those at home were promoted less often than their results deserved (Bloom et al., 2015).'],
  [NOY, 'Professionals who could use ChatGPT finished writing tasks in far less time, and judges rated the texts higher (Noy & Zhang, 2023).'],
  [NOY, 'Noy and Zhang (2023) gave half of 453 graduates a chatbot and found that weaker writers caught up with stronger ones.'],
  [WALTERS, 'Nearly one reference in five from GPT-4 did not exist, and the older model was much worse (Walters & Wilder, 2023).'],
  [WALTERS, 'Even when a paper was real, a chatbot often got some detail of it wrong (Walters & Wilder, 2023).'],
  [BAUMEISTER, 'Baumeister and Leary (1995) argue that wanting close, lasting ties is a basic drive, and that its absence harms us.'],
  [OSC, 'When psychologists repeated a hundred published experiments, the new effects were about half as large as the first ones (Open Science Collaboration, 2015).'],
  [OSC, 'Most of the first studies reported significance; only about a third of the repeats did (Open Science Collaboration, 2015).'],
  [VOSOUGHI, 'Lies travelled further and quicker on Twitter than facts did, and people rather than bots drove this (Vosoughi et al., 2018).'],
  [SPARROW, 'If we know we can look something up later, we tend to remember the place and forget the fact (Sparrow et al., 2011).'],
  [BLOOM, 'The results of this study suggest that there is a significant positive relationship between the two variables.'],
  [NOY, 'This essay asks whether generative artificial intelligence raises productivity in office work, and for whom.'],
];

/** A draft with one slip, and the text after the student's click. */
export const SLIPS: [rule: string, before: string, after: string][] = [
  ['Word typed twice', 'The effect of the the policy was small.', 'The effect of the policy was small.'],
  ['Word typed twice', 'It was was clear from the data.', 'It was clear from the data.'],
  ['Spelling', 'The goverment changed the rule last year.', 'The government changed the rule last year.'],
  ['Spelling', 'Seperate teams were asked to reply.', 'Separate teams were asked to reply.'],
  ['Spelling', 'This is definately a limit of the survey.', 'This is definitely a limit of the survey.'],
  ['A or an', 'It had a effect on output.', 'It had an effect on output.'],
  ['A or an', 'She is an university lecturer in Dubai.', 'She is a university lecturer in Dubai.'],
  ['A or an', 'They waited a hour for the answer.', 'They waited an hour for the answer.'],
  ['Spacing', 'The sample was small , and the results vary.', 'The sample was small, and the results vary.'],
  ['Spacing', 'The sample  was small and the results vary.', 'The sample was small and the results vary.'],
  ['Spacing', 'The sample was small,and the results vary.', 'The sample was small, and the results vary.'],
  ['Capital letter', 'The sample was small. the results vary a lot.', 'The sample was small. The results vary a lot.'],
  ['Capital letter', 'In this essay i argue that rules matter.', 'In this essay I argue that rules matter.'],
  ['Easily confused words', 'The firm could of measured it sooner.', 'The firm could have measured it sooner.'],
  ['Easily confused words', 'Output was higher then before the trial.', 'Output was higher than before the trial.'],
  ['Easily confused words', 'It had a positive affect on morale.', 'It had a positive effect on morale.'],
  ['Easily confused words', 'Morale was effected by the change.', 'Morale was affected by the change.'],
  ['Easily confused words', 'This studies agree on the main point.', 'These studies agree on the main point.'],
  ['Easily confused words', 'These study agrees on the main point.', 'This study agrees on the main point.'],
  ['Easily confused words', 'A large amount of people answered the survey.', 'A large number of people answered the survey.'],
  ['Easily confused words', 'Researches show that breaks matter.', 'Research shows that breaks matter.'],
  ['Agreement', 'The results shows a small gain.', 'The results show a small gain.'],
  ['Agreement', 'Several authors argues against this view.', 'Several authors argue against this view.'],
  ['Agreement', 'They was asked to work from home.', 'They were asked to work from home.'],
  ['Agreement', 'In the end it have no effect.', 'In the end it has no effect.'],
  ['Contraction', 'The data don’t support this claim.', 'The data do not support this claim.'],
  ['Contraction', "The survey didn't ask about pay.", 'The survey did not ask about pay.'],
];

/** Sentences with nothing wrong. Any slip reported here is a false alarm. */
export const CLEAN: string[] = [
  'The analysis of the results shows a small gain.',
  'A review by three authors finds no effect.',
  'He had had enough time, and he knew that that was true.',
  'An MBA student and a UK firm took part.',
  'It is a one-off event, a unique case and a European project.',
  'An honest answer takes an hour, and a user may not give it.',
  'Bloom et al. found a gain of 13% (Bloom et al., 2015).',
  'The firm (see e.g. Krugman, 1991) grew by 1,000 people.',
  'Prices rose, e.g. in Dubai, and fell elsewhere, i.e. abroad.',
  'Vitamin A is needed, and group A has more of it.',
  'The U.S. economy grew. J. K. Smith wrote about it.',
  '“The results was clear”, one manager said (Okafor, 2020, p. 3).',
  'See https://doi.org/10.1093/qje/qju032 for the full text.',
  'Each of the results is shown in Table 1.',
  'None of the studies was random, which is a limit.',
  'If it were true, the two groups would differ.',
  'Does it have an effect? We cannot say.',
  'This result and these results agree with that view.',
  'Fewer people left, and less money was spent.',
  'The effect of pay on effort is not clear.',
  'Pay may affect effort, and effort may affect pay.',
  'Other than that, the two reports are the same.',
  'The trial ended, then the firm changed its rule.',
  'More then followed, as the next section explains.',
  'The behaviour of users, their colour choices and the centre they visit all matter.',
  'We analyse the data and recognise three limits.',
  'It is the students’ own work, and the teacher’s notes are brief.',
  '(1) The plan; (2) the search; (3) the choice.',
  'a) The first reason is cost. b) The second is time.',
  'The number of participants was 453, and their average age was 36.8.',
  'The authors’ claim is strong, but their data are thin.',
  'An increase of 5.5% was seen in Q3.',
];
