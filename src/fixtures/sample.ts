/**
 * Sample text for demos. Two of these references are invented on purpose and the page says so.
 * The fifth DOI was typed from memory by an AI while this project was being planned. It does not exist.
 */
export const SAMPLE_TEXT = `Generative AI made professional writers faster and improved their output (Noy & Zhang, 2023). Flexible work shows a similar pattern (Bloom et al., 2015). Business schools report the same benefits in class (Leelavathi & Surendhranatha, 2024), although the effect fades for stronger students (Hargrove, 2024) and trust in automated tutoring falls over time (Okonjo & Reyes, 2022).

References

Noy, S., & Zhang, W. (2023). Experimental evidence on the productivity effects of generative artificial intelligence. Science, 381(6654), 187–192. https://doi.org/10.1126/science.adh2586

Bloom, N., Liang, J., Roberts, J., & Ying, Z. J. (2015). Does working from home work? Evidence from a Chinese experiment. The Quarterly Journal of Economics, 130(1), 165–218. https://doi.org/10.1093/qje/qju032

Leelavathi, R., & Surendhranatha, R. C. (2024). ChatGPT in the classroom: Navigating the generative AI wave in management education. Journal of Research in Innovative Teaching & Learning. https://doi.org/10.1108/JRIT-01-2024-0017

Hargrove, L. (2024). Generative AI and the student performance paradox. American Economic Review, 114(2). https://doi.org/10.1257/aer.20160696

Okonjo, P., & Reyes, M. (2022). Trust decay in algorithmic tutoring: Evidence from 14 universities. PNAS, 119(4). https://doi.org/10.1073/pnas.1523821113`;

export const SAMPLE_NOTE = 'Sample text. Hargrove (2024) and Okonjo & Reyes (2022) are invented on purpose. The checks below run live.';

export const EXAMPLES = [
  { key: 'real', label: 'A real paper', text: '10.1126/science.adh2586' },
  { key: 'fake', label: 'An invented DOI', text: '10.1073/pnas.1523821113' },
  { key: 'retracted', label: 'A retracted paper', text: '10.1108/jrit-01-2024-0017' },
  { key: 'hijacked', label: 'A hijacked DOI', text: 'Hargrove, L. (2024). Generative AI and the student performance paradox. American Economic Review, 114(2). https://doi.org/10.1257/aer.20160696' },
] as const;
