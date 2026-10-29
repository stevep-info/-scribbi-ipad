const http = require('http');

const PORT = 3099;

function postJson(pathUrl, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(`http://localhost:${PORT}${pathUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Scribbi Integration Flow Test ---');

  process.env.PORT = PORT;
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test_api_key';

  require('../server.js');
  await new Promise(r => setTimeout(r, 1000));

  try {
    console.log('\n[Test 1] Testing /api/find-markscheme...');
    const msResult = await postJson('/api/find-markscheme', {
      board: 'cambridge',
      subject: 'Biology',
      syllabus_code: '0610',
      paper_number: '42',
      session: 'May/June',
      year: 2023
    });
    console.log('Status:', msResult.status);
    console.log('Result:', msResult.body);
    if (msResult.status !== 200 || !msResult.body.source_label) {
      throw new Error('find-markscheme test failed');
    }

    console.log('\n[Test 2] Testing /api/followup...');
    const followupResult = await postJson('/api/followup', {
      question_number: 'Q1',
      prompt_type: 'simpler',
      previous_answer: { answer_steps: ['Step 1: Cell membrane'] }
    });
    console.log('Status:', followupResult.status);
    console.log('Result:', followupResult.body);

    console.log('\n[Test 3] Testing /api/redraw-diagram...');
    const redrawResult = await postJson('/api/redraw-diagram', {
      question_number: 'Q1',
      question_text: 'Draw a plant cell structure.'
    });
    console.log('Status:', redrawResult.status);
    console.log('Result:', redrawResult.body);

    console.log('\n✅ All integration flow tests completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Integration flow test failed:', err.message);
    process.exit(1);
  }
}

runTests();
