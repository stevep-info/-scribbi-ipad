const { rateLimit, checkRobotsAllowed, httpGet, verifyPdfUrl } = require('./utils');

async function findMarkScheme(paperInfo) {
  const siteName = 'PapaCambridge';

  const { syllabus_code, paper_number, session, year } = paperInfo;
  if (!syllabus_code || !paper_number) return null;

  const code = syllabus_code.replace(/\D/g, '');
  let sessCode = 's';
  const sessLower = (session || '').toLowerCase();
  if (sessLower.includes('oct') || sessLower.includes('nov') || sessLower.includes('winter')) sessCode = 'w';
  if (sessLower.includes('mar')) sessCode = 'm';

  const yr = String(year || '23').slice(-2);
  const pdfName = `${code}_${sessCode}${yr}_ms_${paper_number}.pdf`;

  const candidateUrls = [
    `https://pastpapers.co/caie/IGCSE/${code}/${pdfName}`,
    `https://pastpapers.co/caie/IGCSE/${syllabus_code}/${pdfName}`,
    `https://pastpapers.co/caie/IGCSE/Biology-${code}/${year}-May-June/${pdfName}`
  ];

  for (const candidateUrl of candidateUrls) {
    if (await verifyPdfUrl(candidateUrl)) {
      return { source_url: candidateUrl, source_name: siteName };
    }
  }

  return null;
}

module.exports = { findMarkScheme };
