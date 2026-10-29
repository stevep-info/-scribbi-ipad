const { rateLimit, checkRobotsAllowed, httpGet, verifyPdfUrl } = require('./utils');

async function findMarkScheme(paperInfo) {
  const siteName = 'Physics & Maths Tutor';
  const baseUrl = 'https://www.physicsandmathstutor.com';

  if (!await checkRobotsAllowed(baseUrl)) return null;

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
    `https://pmt.pmt.education/physics-and-maths-tutor/pdf/${pdfName}`,
    `https://www.physicsandmathstutor.com/pdf/${pdfName}`
  ];

  for (const candidateUrl of candidateUrls) {
    if (await verifyPdfUrl(candidateUrl)) {
      return { source_url: candidateUrl, source_name: siteName };
    }
  }

  return null;
}

module.exports = { findMarkScheme };
