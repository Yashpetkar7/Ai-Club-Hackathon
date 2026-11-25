import { readFileSync } from 'node:fs';

/** Real abstracts as OpenAlex served them on 25 November 2026 (open metadata). */
export const ABSTRACT: Record<string, string> = JSON.parse(readFileSync('tests/unit/fixtures/abstracts.json', 'utf8'));
export const BLOOM = ABSTRACT['10.1093/qje/qju032']!;
export const NOY = ABSTRACT['10.1126/science.adh2586']!;
export const WALTERS = ABSTRACT['10.1038/s41598-023-41032-5']!;

// The support model is set to say yes to everything here, so only the guards stand between a wrong claim and Verified.
export const FALSE_CLAIMS: [string, string][] = [
  ['Home working led to a 31% performance increase', BLOOM],
  ['Home working led to a 13% performance decrease', BLOOM],
  ['Home working led to no performance increase', BLOOM],
  ['Home working always led to a 13% performance increase', BLOOM],
  ['Home working led to a 9% performance increase', BLOOM],
  ['Home working led to a 22% performance increase', BLOOM],
  ['The study proves home working led to a 13% performance increase', BLOOM],
  ['Home workers reported worse work satisfaction', BLOOM],
  ['Home workers’ attrition rate doubled', BLOOM],
  ['Home workers’ promotion rate conditional on performance rose', BLOOM],
  ['Over half of all employees switched', BLOOM],
  ['Call center employees were assigned for nineteen months', BLOOM],
  ['Ctrip is a 160,000-employee travel agency', BLOOM],
  ['Microsoft rolled out the option to WFH to the whole firm', BLOOM],
  ['Gains from WFH fell to 22%', BLOOM],
  ['Gains from WFH almost doubled to 13%', BLOOM],
  ['ChatGPT cut the average time taken by 18%', NOY],
  ['ChatGPT raised output quality by 40%', NOY],
  ['The average time taken increased by 40%', NOY],
  ['Output quality fell by 18%', NOY],
  ['ChatGPT substantially lowered productivity', NOY],
  ['ChatGPT did not raise productivity', NOY],
  ['Inequality between workers increased', NOY],
  ['Concern and excitement about AI permanently fell', NOY],
  ['All professionals were exposed to ChatGPT', NOY],
  ['The experiment covered 4,530 college-educated professionals', NOY],
  ['Workers exposed to ChatGPT were 3 times as likely to report using it in their real job 2 weeks after', NOY],
  ['Workers exposed to ChatGPT were 2 times as likely to report using it 2 months after the experiment', NOY],
  ['Claude substantially raised productivity', NOY],
  ['All GPT-4 citations were real', WALTERS],
  ['55% of the GPT-4 citations are fabricated', WALTERS],
  ['18% of the GPT-3.5 citations are fabricated', WALTERS],
  ['43% of the GPT-3.5 citations are fabricated', WALTERS],
  ['24% of the real GPT-3.5 citations include substantive citation errors', WALTERS],
  ['None of the GPT-4 citations are fabricated', WALTERS],
  ['GPT-4 is a major improvement over GPT-3.5 and no problems remain', WALTERS],
  ['GPT-3.5 is a major improvement over GPT-4', WALTERS],
  ['The authors found 636 bibliographic citations in 48 papers', WALTERS],
  ['ChatGPT-3.5 and ChatGPT-4 were used on 24 multidisciplinary topics', WALTERS],
  ['Chatbots never facilitate cost-effective text generation', WALTERS],
  ['People resist the dissolution of existing bonds under all conditions', ABSTRACT['10.1037/0033-2909.117.3.497']!],
  ['Lack of attachments is not linked to ill effects on health', ABSTRACT['10.1037/0033-2909.117.3.497']!],
];

export const TRUE_CLAIMS: [string, string][] = [
  ['Home working led to a 13% performance increase', BLOOM],
  ['Working from home increased performance by 13%', BLOOM],
  ['Home workers reported improved work satisfaction', BLOOM],
  ['Their attrition rate halved', BLOOM],
  ['The promotion rate of home workers conditional on performance fell', BLOOM],
  ['Gains from WFH almost doubled to 22%', BLOOM],
  ['ChatGPT substantially raised productivity', NOY],
  ['The average time taken decreased by 40%', NOY],
  ['Output quality rose by 18%', NOY],
  ['Inequality between workers decreased', NOY],
  ['55% of the GPT-3.5 citations are fabricated', WALTERS],
  ['18% of the GPT-4 citations are fabricated', WALTERS],
  ['GPT-4 is a major improvement over GPT-3.5', WALTERS],
  ['The authors found 636 bibliographic citations in the 84 papers', WALTERS],
];
