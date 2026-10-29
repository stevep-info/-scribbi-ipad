const { rateLimit, checkRobotsAllowed, httpGet, verifyPdfUrl } = require('./utils');

async function findMarkScheme(paperInfo) {
  const siteName = 'Dynamic Papers';
  const baseUrl = 'https://dynamicpapers.com';

  if (!await checkRobotsAllowed(baseUrl)) return null;

  const { board, syllabus_code, paper_number, session, year } = paperInfo;
  if (!syllabus_code || !paper_number) return null;

  const code = syllabus_code.replace(/\D/g, '');
  let sessCode = 's';
  const sessLower = (session || '').toLowerCase();
  if (sessLower.includes('oct') || sessLower.includes('nov') || sessLower.includes('winter')) sessCode = 'w';
  if (sessLower.includes('mar')) sessCode = 'm';

  const yr = String(year || '23').slice(-2);
  const pdfName = `${code}_${sessCode}${yr}_ms_${paper_number}.pdf`;

  const searchUrl = `${baseUrl}/?s=${encodeURIComponent(`${code}_${sessCode}${yr}_ms`)}`;
  await rateLimit('dynamicpapers.com');
  const res = await httpGet(searchUrl);

  if (res.status === 200 && typeof res.data === 'string') {
    const pdfRegex = new RegExp(`href=["']([^"']*${code}[^"']*ms[^"']*\\.pdf)["']`, 'gi');
    let match;
    while ((match = pdfRegex.exec(res.data)) !== null) {
      const candidateUrl = match[1];
      if (await verifyPdfUrl(candidateUrl)) {
        return { source_url: candidateUrl, source_name: siteName };
      }
    }
  }

  const directUrl = `${baseUrl}/wp-content/uploads/${pdfName}`;
  if (await verifyPdfUrl(directUrl)) {
    return { source_url: directUrl, source_name: siteName };
  }

  return null;
}

module.exports = { findMarkScheme };
