require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { GoogleGenAI } = require('@google/genai');

const dynamicpapers = require('./sources/dynamicpapers');
const papacambridge = require('./sources/papacambridge');
const pmt = require('./sources/pmt');
const gceguide = require('./sources/gceguide');
const { getCachedMarkScheme, setCachedMarkScheme } = require('./cache/cache');

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*';
app.use(cors({
  origin: (origin, callback) => {
    if (allowedOrigins === '*' || !origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy restricted access'));
    }
  }
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please try again in an hour.' }
});

app.use('/api/', apiLimiter);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }
  return new GoogleGenAI({ apiKey });
}

const GEMINI_MODEL = 'gemini-2.5-flash';

app.post('/api/analyze-paper', upload.single('paper'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No paper file provided' });
    }

    const mimeType = req.file.mimetype || 'application/pdf';
    const base64Data = req.file.buffer.toString('base64');

    const prompt = `Analyze this IGCSE question paper document (cover page and pages). Extract metadata and a list of all main questions.
Return ONLY a raw JSON object with this exact structure:
{
  "board": "cambridge" or "edexcel",
  "subject": "Subject Name e.g. Biology, Mathematics",
  "syllabus_code": "e.g. 0610 or 4MA1",
  "paper_number": "e.g. 42 or 1H or 2",
  "session": "May/June" or "Oct/Nov" or "March",
  "year": 2023,
  "questions": [
    { "number": "Q1", "text": "Question text summary", "marks": 4 },
    { "number": "Q2", "text": "Question text summary", "marks": 6 }
  ]
}
Do not wrap in markdown syntax blocks if possible, or provide valid JSON. Read details carefully from the cover page.`;

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: prompt }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    let jsonText = response.text || '';
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(jsonText);

    return res.json(result);
  } catch (err) {
    console.error('Error in analyze-paper:', err.message);
    return res.status(500).json({ error: 'Failed to analyze paper: ' + err.message });
  }
});

app.post('/api/find-markscheme', async (req, res) => {
  try {
    const paperInfo = req.body;
    const { board, syllabus_code, paper_number, session, year } = paperInfo;

    if (!syllabus_code || !paper_number) {
      return res.status(400).json({ error: 'Missing required paper information (syllabus_code or paper_number)' });
    }

    const cached = getCachedMarkScheme(board, syllabus_code, paper_number, session, year);
    if (cached) {
      return res.json({
        found: true,
        source_label: 'mirror_site',
        source_name: cached.source_name,
        source_url: cached.source_url
      });
    }

    const sources = [
      dynamicpapers,
      papacambridge,
      pmt,
      gceguide
    ];

    for (const sourceModule of sources) {
      try {
        const result = await sourceModule.findMarkScheme(paperInfo);
        if (result && result.source_url) {
          setCachedMarkScheme(board, syllabus_code, paper_number, session, year, result);
          return res.json({
            found: true,
            source_label: 'mirror_site',
            source_name: result.source_name,
            source_url: result.source_url
          });
        }
      } catch (sourceErr) {
        console.error('Source error:', sourceErr.message);
      }
    }

    return res.json({
      found: false,
      source_label: 'ai_generated',
      source_name: 'AI Generator',
      source_url: null
    });
  } catch (err) {
    console.error('Error in find-markscheme:', err.message);
    return res.status(500).json({ error: 'Failed to find mark scheme: ' + err.message });
  }
});

function downloadPdf(urlStr) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const client = u.protocol === 'https:' ? https : http;
      const req = client.get(urlStr, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ScribbiBot/1.0' },
        timeout: 10000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, urlStr).toString();
          downloadPdf(nextUrl).then(resolve).catch(reject);
        } else if (res.statusCode === 200) {
          let chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        } else {
          reject(new Error(`Failed to download PDF, HTTP status ${res.statusCode}`));
        }
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
    } catch (e) {
      reject(e);
    }
  });
}

app.post('/api/answer', upload.single('paper'), async (req, res) => {
  try {
    const question_number = req.body.question_number || 'Q1';
    const mark_scheme_url = req.body.mark_scheme_url || null;
    const source_name = req.body.source_name || 'AI Answer';

    if (!req.file) {
      return res.status(400).json({ error: 'No question paper file provided' });
    }

    const paperMime = req.file.mimetype || 'application/pdf';
    const paperBase64 = req.file.buffer.toString('base64');

    const ai = getGeminiClient();
    const contents = [];

    contents.push({ inlineData: { mimeType: paperMime, data: paperBase64 } });

    let msDownloaded = false;
    if (mark_scheme_url) {
      try {
        const msBuffer = await downloadPdf(mark_scheme_url);
        contents.push({ inlineData: { mimeType: 'application/pdf', data: msBuffer.toString('base64') } });
        msDownloaded = true;
      } catch (e) {
        console.error('Failed to download mark scheme PDF:', e.message);
      }
    }

    let prompt = '';
    const config = { responseMimeType: 'application/json' };

    if (msDownloaded) {
      prompt = `You are provided with the Question Paper and its official Mark Scheme PDF.
Find question "${question_number}" in the Question Paper and provide the step-by-step solution following the official Mark Scheme's exact wording and criteria.

Return JSON in this format:
{
  "answer_steps": ["Step 1 explanation...", "Step 2 explanation..."],
  "marks_breakdown": ["1 mark for identifying...", "1 mark for calculation..."],
  "keywords": ["keyword1", "keyword2"],
  "diagram_svg": "<svg ...> ... </svg>" or null,
  "source_label": "mirror_site",
  "source_name": "${source_name}",
  "source_url": "${mark_scheme_url}"
}
Note:
- If a diagram or graph is helpful or requested in the question, generate valid, well-formed inline SVG code in "diagram_svg". Otherwise return null.
- "keywords" should list key terms/marking points highlighted in the mark scheme.`;
    } else {
      config.tools = [{ googleSearch: {} }];
      prompt = `You are answering question "${question_number}" from the provided Question Paper.
The official mark scheme was not available. Use Google Search grounding to find the exact mark scheme criteria or standard IGCSE answer.

Return JSON in this format:
{
  "answer_steps": ["Step 1 explanation...", "Step 2 explanation..."],
  "marks_breakdown": ["1 mark for identifying...", "1 mark for calculation..."],
  "keywords": ["keyword1", "keyword2"],
  "diagram_svg": "<svg ...> ... </svg>" or null,
  "source_label": "ai_generated",
  "source_name": "AI Answer (Not Official Mark Scheme)",
  "source_url": null
}`;
    }

    contents.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: contents }],
      config
    });

    let jsonText = response.text || '';
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(jsonText);

    return res.json(result);
  } catch (err) {
    console.error('Error in answer:', err.message);
    return res.status(500).json({ error: 'Failed to generate answer: ' + err.message });
  }
});

app.post('/api/followup', async (req, res) => {
  try {
    const { question_number, previous_answer, prompt_type, custom_prompt } = req.body;

    let userInstruction = custom_prompt || 'Explain this simpler';
    if (prompt_type === 'simpler') userInstruction = 'Explain this answer in much simpler, easier-to-understand terms for a student.';
    if (prompt_type === 'why') userInstruction = 'Explain WHY this is the correct answer step by step and the key concepts behind it.';

    const systemPrompt = `You are Scribbi, an encouraging IGCSE tutor explaining a solution to a student.
Question: ${question_number || 'Question'}
Previous Solution: ${JSON.stringify(previous_answer || {})}

User Query: ${userInstruction}

Return JSON in this format:
{
  "explanation_steps": ["Simpler point 1...", "Simpler point 2..."],
  "key_takeaway": "Summary takeaway sentence."
}`;

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: systemPrompt,
      config: { responseMimeType: 'application/json' }
    });

    let jsonText = response.text || '';
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(jsonText);

    return res.json(result);
  } catch (err) {
    console.error('Error in followup:', err.message);
    return res.status(500).json({ error: 'Failed to answer follow-up: ' + err.message });
  }
});

app.post('/api/redraw-diagram', async (req, res) => {
  try {
    const { question_number, question_text, previous_diagram_svg } = req.body;

    const prompt = `Generate an alternative, clean, well-formatted standalone SVG diagram for IGCSE question "${question_number}": ${question_text || ''}.
Return ONLY a raw JSON object:
{
  "diagram_svg": "<svg width=\\"300\\" height=\\"200\\" viewBox=\\"0 0 300 200\\" xmlns=\\"http://www.w3.org/2000/svg\\"> ... </svg>"
}`;

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    let jsonText = response.text || '';
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(jsonText);

    return res.json(result);
  } catch (err) {
    console.error('Error in redraw-diagram:', err.message);
    return res.status(500).json({ error: 'Failed to redraw diagram: ' + err.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Scribbi server running on port ${PORT}`);
});
