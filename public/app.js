let selectedFile = null;
let currentPaperData = null;
let currentMarkScheme = null;
let currentQuestionIndex = null;
let isPlainTextMode = false;

const logoHomeBtn = document.getElementById('logoHomeBtn');
const uploadSection = document.getElementById('uploadSection');
const paperViewSection = document.getElementById('paperViewSection');
const answerSection = document.getElementById('answerSection');

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const manualDetailsBtn = document.getElementById('manualDetailsBtn');

const progressBox = document.getElementById('progressBox');
const stepText = document.getElementById('stepText');
const progressLineFill = document.getElementById('progressLineFill');

const paperMetaCard = document.getElementById('paperMetaCard');
const metaBoard = document.getElementById('metaBoard');
const metaTitle = document.getElementById('metaTitle');
const metaSub = document.getElementById('metaSub');
const editMetaBtn = document.getElementById('editMetaBtn');

const questionsContainer = document.getElementById('questionsContainer');
const qCount = document.getElementById('qCount');
const questionsGrid = document.getElementById('questionsGrid');

const backToQuestionsBtn = document.getElementById('backToQuestionsBtn');
const togglePlainTextBtn = document.getElementById('togglePlainTextBtn');
const ansQNumber = document.getElementById('ansQNumber');
const ansQSummary = document.getElementById('ansQSummary');
const ansQMarks = document.getElementById('ansQMarks');
const sourceBadgeContainer = document.getElementById('sourceBadgeContainer');

const notebookContainer = document.getElementById('notebookContainer');
const notebookContent = document.getElementById('notebookContent');
const diagramCard = document.getElementById('diagramCard');
const diagramSvgContainer = document.getElementById('diagramSvgContainer');
const redrawDiagramBtn = document.getElementById('redrawDiagramBtn');

const followupForm = document.getElementById('followupForm');
const followupInput = document.getElementById('followupInput');
const followupSubmitBtn = document.getElementById('followupSubmitBtn');
const followupResult = document.getElementById('followupResult');

const manualDetailsModal = document.getElementById('manualDetailsModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const manualDetailsForm = document.getElementById('manualDetailsForm');

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
});

function setupEventListeners() {
  logoHomeBtn.addEventListener('click', showUploadView);
  backToQuestionsBtn.addEventListener('click', showQuestionsView);

  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  manualDetailsBtn.addEventListener('click', () => openModal());
  editMetaBtn.addEventListener('click', () => openModal(currentPaperData));
  closeModalBtn.addEventListener('click', closeModal);
  cancelModalBtn.addEventListener('click', closeModal);

  manualDetailsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    closeModal();
    const board = document.getElementById('boardSelect').value;
    const syllabus_code = document.getElementById('syllabusInput').value;
    const paper_number = document.getElementById('paperNumInput').value;
    const session = document.getElementById('sessionInput').value;
    const year = parseInt(document.getElementById('yearInput').value, 10);

    currentPaperData = {
      ...(currentPaperData || {}),
      board,
      syllabus_code,
      paper_number,
      session,
      year,
      questions: currentPaperData?.questions || [
        { number: 'Q1', text: 'Question 1', marks: 5 },
        { number: 'Q2', text: 'Question 2', marks: 5 }
      ]
    };

    showPaperView();
    renderPaperMeta(currentPaperData);
    updateProgress(60, 'Finding mark scheme...');
    await fetchMarkScheme(currentPaperData);
  });

  togglePlainTextBtn.addEventListener('click', () => {
    isPlainTextMode = !isPlainTextMode;
    togglePlainTextBtn.textContent = isPlainTextMode ? 'Show handwriting font' : 'Show plain text';
    if (isPlainTextMode) {
      notebookContainer.classList.add('plain-text-mode');
    } else {
      notebookContainer.classList.remove('plain-text-mode');
    }
  });

  redrawDiagramBtn.addEventListener('click', handleRedrawDiagram);

  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.target.getAttribute('data-type');
      handleFollowup(type);
    });
  });

  followupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleFollowup('custom', followupInput.value);
  });
}

function showUploadView() {
  uploadSection.classList.add('active');
  paperViewSection.classList.remove('active');
  answerSection.classList.remove('active');
}

function showPaperView() {
  uploadSection.classList.remove('active');
  paperViewSection.classList.add('active');
  answerSection.classList.remove('active');
}

function showAnswerView() {
  uploadSection.classList.remove('active');
  paperViewSection.classList.remove('active');
  answerSection.classList.add('active');
}

function openModal(preset = null) {
  if (preset) {
    document.getElementById('boardSelect').value = preset.board || 'cambridge';
    document.getElementById('syllabusInput').value = preset.syllabus_code || '';
    document.getElementById('paperNumInput').value = preset.paper_number || '';
    document.getElementById('sessionInput').value = preset.session || 'May/June';
    document.getElementById('yearInput').value = preset.year || 2023;
  }
  manualDetailsModal.classList.remove('hidden');
}

function closeModal() {
  manualDetailsModal.classList.add('hidden');
}

function updateProgress(percent, text) {
  progressLineFill.style.width = percent + '%';
  stepText.textContent = text;
}

async function handleFileSelected(file) {
  selectedFile = file;
  showPaperView();
  updateProgress(20, 'Reading paper...');

  const formData = new FormData();
  formData.append('paper', file);

  try {
    const res = await fetch('/api/analyze-paper', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      throw new Error('Analysis failed');
    }

    currentPaperData = await res.json();
    renderPaperMeta(currentPaperData);

    updateProgress(60, 'Finding mark scheme...');
    await fetchMarkScheme(currentPaperData);
  } catch (e) {
    console.error(e);
    updateProgress(100, 'Paper analysis error. Please enter details manually.');
    openModal();
  }
}

async function fetchMarkScheme(paperData) {
  try {
    const res = await fetch('/api/find-markscheme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paperData)
    });

    if (res.ok) {
      currentMarkScheme = await res.json();
    } else {
      currentMarkScheme = { found: false, source_label: 'ai_generated', source_name: 'AI Generator' };
    }
  } catch (e) {
    currentMarkScheme = { found: false, source_label: 'ai_generated', source_name: 'AI Generator' };
  }

  updateProgress(100, 'Ready');
  renderQuestions(currentPaperData.questions || []);
}

function renderPaperMeta(data) {
  paperMetaCard.classList.remove('hidden');
  metaBoard.textContent = (data.board || 'IGCSE').toUpperCase();
  metaTitle.textContent = `${data.subject || 'Subject'} (${data.syllabus_code || ''}) Paper ${data.paper_number || ''}`;
  metaSub.textContent = `${data.session || ''} ${data.year || ''}`;
}

function renderQuestions(questions) {
  questionsContainer.classList.remove('hidden');
  qCount.textContent = `${questions.length} Questions`;
  questionsGrid.innerHTML = '';

  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'q-card';
    card.innerHTML = `
      <span class="q-num">${q.number || 'Q' + (idx + 1)}</span>
      <span class="q-marks">${q.marks ? q.marks + ' Marks' : ''}</span>
    `;
    card.addEventListener('click', () => loadQuestionAnswer(idx));
    questionsGrid.appendChild(card);
  });
}

function showQuestionsView() {
  showPaperView();
}

async function loadQuestionAnswer(qIndex) {
  currentQuestionIndex = qIndex;
  const question = currentPaperData.questions[qIndex];

  ansQNumber.textContent = question.number || `Q${qIndex + 1}`;
  ansQSummary.textContent = question.text || 'Question details';
  ansQMarks.textContent = question.marks ? `${question.marks} Marks` : '';

  notebookContent.innerHTML = '<p class="animated-write">Writing solution...</p>';
  diagramCard.classList.add('hidden');
  followupResult.classList.add('hidden');
  followupInput.value = '';

  showAnswerView();

  const formData = new FormData();
  if (selectedFile) {
    formData.append('paper', selectedFile);
  }
  formData.append('question_number', question.number || `Q${qIndex + 1}`);
  if (currentMarkScheme && currentMarkScheme.source_url) {
    formData.append('mark_scheme_url', currentMarkScheme.source_url);
    formData.append('source_name', currentMarkScheme.source_name);
  }

  try {
    const res = await fetch('/api/answer', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) throw new Error('Failed to generate answer');

    const ansData = await res.json();
    renderAnswer(ansData);
  } catch (e) {
    console.error(e);
    notebookContent.innerHTML = '<p style="color:red;">Error generating answer. Please try again.</p>';
  }
}

function renderAnswer(ansData) {
  sourceBadgeContainer.innerHTML = '';
  const badge = document.createElement('div');
  if (ansData.source_label === 'mirror_site' && ansData.source_url) {
    badge.className = 'source-badge source-badge-mirror';
    badge.innerHTML = `✅ Mark scheme from <a href="${ansData.source_url}" target="_blank" rel="noopener">${ansData.source_name || 'Official Source'}</a>`;
  } else {
    badge.className = 'source-badge source-badge-ai';
    badge.innerHTML = `🤖 AI answer, not an official mark scheme`;
  }
  sourceBadgeContainer.appendChild(badge);

  const keywords = ansData.keywords || [];
  let html = '';

  if (ansData.answer_steps && ansData.answer_steps.length > 0) {
    html += '<div class="steps-section">';
    ansData.answer_steps.forEach((step, i) => {
      let highlightedStep = escapeHtml(step);
      keywords.forEach(kw => {
        if (kw && kw.trim().length > 1) {
          const reg = new RegExp(`(${escapeRegExp(kw)})`, 'gi');
          highlightedStep = highlightedStep.replace(reg, '<span class="key-highlight">$1</span>');
        }
      });
      html += `<p class="step-item animated-write" style="animation-delay: ${i * 0.15}s;"><strong>${i + 1}.</strong> ${highlightedStep}</p>`;
    });
    html += '</div>';
  }

  if (ansData.marks_breakdown && ansData.marks_breakdown.length > 0) {
    html += '<div class="breakdown-section" style="margin-top: 16px; border-top: 1px dashed #ccc; padding-top: 12px;">';
    html += '<p><strong>Marks Breakdown:</strong></p>';
    ansData.marks_breakdown.forEach(mb => {
      html += `<p class="step-item animated-write" style="font-size: 0.9em; opacity: 0.9;">• ${escapeHtml(mb)}</p>`;
    });
    html += '</div>';
  }

  notebookContent.innerHTML = html;

  if (ansData.diagram_svg) {
    diagramCard.classList.remove('hidden');
    diagramSvgContainer.innerHTML = ansData.diagram_svg;
  } else {
    diagramCard.classList.add('hidden');
  }
}

async function handleRedrawDiagram() {
  const question = currentPaperData.questions[currentQuestionIndex];
  redrawDiagramBtn.disabled = true;
  redrawDiagramBtn.textContent = 'Redrawing...';

  try {
    const res = await fetch('/api/redraw-diagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question_number: question.number,
        question_text: question.text
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.diagram_svg) {
        diagramSvgContainer.innerHTML = data.diagram_svg;
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    redrawDiagramBtn.disabled = false;
    redrawDiagramBtn.textContent = '🔄 Redraw diagram';
  }
}

async function handleFollowup(type, customQuery = null) {
  const question = currentPaperData.questions[currentQuestionIndex];
  followupResult.classList.remove('hidden');
  followupResult.innerHTML = '<p class="animated-write">Thinking...</p>';

  try {
    const res = await fetch('/api/followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question_number: question.number,
        prompt_type: type,
        custom_prompt: customQuery
      })
    });

    if (res.ok) {
      const data = await res.json();
      let html = '<strong>Explanation:</strong>';
      if (data.explanation_steps) {
        html += '<ul>' + data.explanation_steps.map(s => `<li>${escapeHtml(s)}</li>`).join('') + '</ul>';
      }
      if (data.key_takeaway) {
        html += `<p style="margin-top: 8px;"><strong>Takeaway:</strong> ${escapeHtml(data.key_takeaway)}</p>`;
      }
      followupResult.innerHTML = html;
    }
  } catch (e) {
    followupResult.innerHTML = '<p style="color:red;">Failed to get follow-up explanation.</p>';
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
