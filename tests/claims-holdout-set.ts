import { ABSTRACT } from './claims-set';

/**
 * Claims about papers the guards were not written against. Written before the first run.
 * First run, 25 November 2026: 0 of 38 false claims were Verified without AI; 7 of 38 got past the guards when the support model
 * was forced to say yes to everything. Those 7 became rules, so this set is now a regression test, not a measurement.
 */
const A = ABSTRACT;
const OSC = A['10.1126/science.aac4716']!;
const LIKES = A['10.1073/pnas.1218772110']!;
const GOOGLE = A['10.1126/science.1207745']!;
const NEWS = A['10.1126/science.aap9559']!;

export const HOLD_FALSE: [string, string][] = [
  ['Thirty-six percent of original studies had statistically significant results', OSC],
  ['Ninety-seven percent of replications had statistically significant results', OSC],
  ['Replications of 1,000 studies were conducted', OSC],
  ['Replication effects were twice the magnitude of original effects', OSC],
  ['Replication effects represented a substantial increase', OSC],
  ['39% of original effect sizes were in the 95% confidence interval of the replication effect size', OSC],
  ['Studies from five psychology journals were replicated', OSC],
  ['Replication success was better predicted by characteristics of the teams than by the strength of original evidence', OSC],
  ['All original studies had statistically significant results', OSC],
  ['68% of effects were subjectively rated to have replicated the original result', OSC],
  ['Reproducibility is not a defining feature of science', OSC],
  ['The replications prove that psychology is unreliable', OSC],
  ['The model correctly discriminates between homosexual and heterosexual men in 95% of cases', LIKES],
  ['The model discriminates between Democrat and Republican in 88% of cases', LIKES],
  ['African Americans and Caucasian Americans are discriminated in 85% of cases', LIKES],
  ['The dataset covers 5,800 volunteers', LIKES],
  ['Twitter likes can accurately predict sensitive personal attributes', LIKES],
  ['Facebook Likes cannot be used to predict personal attributes', LIKES],
  ['Facebook Likes always predict personality perfectly', LIKES],
  ['For the trait Openness, prediction accuracy is far from the test-retest accuracy of a standard personality test', LIKES],
  ['Search engines cause lower intelligence', GOOGLE],
  ['People have higher rates of recall of the information itself', GOOGLE],
  ['People have lower recall for where to access information', GOOGLE],
  ['The results of nine studies suggest people are primed to think about computers', GOOGLE],
  ['The Internet is never a form of external memory', GOOGLE],
  ['The Internet proves that memory is stored only outside ourselves', GOOGLE],
  ['Truth diffused significantly farther, faster, deeper, and more broadly than falsehood', NEWS],
  ['False news was less novel than true news', NEWS],
  ['True news was more novel than false news', NEWS],
  ['Robots accelerated the spread of false news more than true news', NEWS],
  ['False stories inspired anticipation, sadness, joy, and trust', NEWS],
  ['True stories inspired fear, disgust, and surprise', NEWS],
  ['The data comprise 126 stories', NEWS],
  ['Stories distributed on Facebook from 2006 to 2017 were investigated', NEWS],
  ['Fact-checking organizations exhibited 59 to 89% agreement', NEWS],
  ['Humans, not robots, are less likely to spread false news', NEWS],
  ['The effects were less pronounced for false political news', NEWS],
  ['The effects were more pronounced for false news about science than for false political news', NEWS],
];
export const HOLD_TRUE: [string, string][] = [
  ['Ninety-seven percent of original studies had statistically significant results', OSC],
  ['36% of replications had statistically significant results', OSC],
  ['Replication effects were half the magnitude of original effects', OSC],
  ['The model correctly discriminates between homosexual and heterosexual men in 88% of cases', LIKES],
  ['Easily accessible digital records of behavior, Facebook Likes, can be used to automatically and accurately predict a range of highly sensitive personal attributes', LIKES],
  ['The Internet has become a primary form of external or transactive memory', GOOGLE],
  ['False news was more novel than true news', NEWS],
  ['Robots accelerated the spread of true and false news at the same rate', NEWS],
  ['Falsehood diffused significantly farther, faster, deeper, and more broadly than the truth in all categories of information', NEWS],
  ['The data comprise about 126,000 stories tweeted by about 3 million people', NEWS],
];

