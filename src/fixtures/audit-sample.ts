/**
 * Sample paragraph for the Audit page. Every part of it is said out loud on the page:
 * - Bloom et al. (2015) and Noy & Zhang (2023) are real. The first and third sentences say what their abstracts say.
 * - The second sentence is the first one with 13% changed to 31% on purpose, to show a misquote being caught.
 * - Okonjo & Reyes (2022) is invented on purpose. Its DOI was typed from memory by an AI while this project was
 *   being planned, and no registry has it. The same reference is in the Check page's sample.
 */
export const AUDIT_SAMPLE = `Home working led to a 13% performance increase (Bloom et al., 2015). In short, home working led to a 31% performance increase (Bloom et al., 2015). With ChatGPT, the average time taken decreased by 40% and output quality rose by 18% (Noy & Zhang, 2023). Trust in automated tutoring falls over time (Okonjo & Reyes, 2022).

References

Bloom, N., Liang, J., Roberts, J., & Ying, Z. J. (2015). Does working from home work? Evidence from a Chinese experiment. The Quarterly Journal of Economics, 130(1), 165–218. https://doi.org/10.1093/qje/qju032

Noy, S., & Zhang, W. (2023). Experimental evidence on the productivity effects of generative artificial intelligence. Science, 381(6654), 187–192. https://doi.org/10.1126/science.adh2586

Okonjo, P., & Reyes, M. (2022). Trust decay in algorithmic tutoring: Evidence from 14 universities. PNAS, 119(4). https://doi.org/10.1073/pnas.1523821113`;

export const AUDIT_SAMPLE_NOTE = [
  'Bloom et al. (2015) and Noy & Zhang (2023) are real papers.',
  'The second sentence changes Bloom’s 13% to 31% on purpose.',
  'Okonjo & Reyes (2022) is invented on purpose: an AI typed its DOI from memory while we planned this project.',
  'The checks run live.',
].join(' ');
