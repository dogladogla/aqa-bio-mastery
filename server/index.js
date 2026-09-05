const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// The anon/publishable key is safe to expose client-side by design — Row Level
// Security on every table restricts it to read-only access to content tables.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hdtaalwwedqhlaoujvea.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_GYz_ihnNxAfz191lriGQ6w_fDR00pJb';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// All topics with subtopics, plus counts so the UI can show coverage progress
app.get('/api/topics', async (req, res) => {
  const { data: topics, error: topicsErr } = await supabase
    .from('topics')
    .select('*')
    .order('sort_order');
  if (topicsErr) return res.status(500).json({ error: topicsErr.message });

  const { data: subtopics, error: subErr } = await supabase
    .from('subtopics')
    .select('*')
    .order('sort_order');
  if (subErr) return res.status(500).json({ error: subErr.message });

  const { data: questionCounts, error: qcErr } = await supabase
    .from('questions')
    .select('subtopic_id');
  if (qcErr) return res.status(500).json({ error: qcErr.message });

  const { data: keywordCounts, error: kcErr } = await supabase
    .from('keywords')
    .select('subtopic_id');
  if (kcErr) return res.status(500).json({ error: kcErr.message });

  const qCountBySub = {};
  questionCounts.forEach(q => { qCountBySub[q.subtopic_id] = (qCountBySub[q.subtopic_id] || 0) + 1; });
  const kCountBySub = {};
  keywordCounts.forEach(k => { kCountBySub[k.subtopic_id] = (kCountBySub[k.subtopic_id] || 0) + 1; });

  const result = topics.map(t => ({
    ...t,
    subtopics: subtopics
      .filter(s => s.topic_id === t.id)
      .map(s => ({
        ...s,
        question_count: qCountBySub[s.id] || 0,
        keyword_count: kCountBySub[s.id] || 0
      }))
  }));

  res.json(result);
});

// Single subtopic: keywords + question list (no answers yet — kept for revision-first view)
app.get('/api/subtopics/:code', async (req, res) => {
  const { data: subtopic, error: subErr } = await supabase
    .from('subtopics')
    .select('*, topics(code, name)')
    .eq('code', req.params.code)
    .single();
  if (subErr) return res.status(404).json({ error: 'Subtopic not found' });

  const { data: keywords } = await supabase
    .from('keywords')
    .select('*')
    .eq('subtopic_id', subtopic.id)
    .order('sort_order');

  const { data: questions } = await supabase
    .from('questions')
    .select('id, command_word, question_text, marks, difficulty, question_type')
    .eq('subtopic_id', subtopic.id)
    .order('sort_order');

  res.json({ ...subtopic, keywords: keywords || [], questions: questions || [] });
});

// Full question detail: model answer, mark scheme points, common mistakes
app.get('/api/questions/:id', async (req, res) => {
  const { data: question, error } = await supabase
    .from('questions')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Question not found' });

  const { data: modelAnswers } = await supabase
    .from('model_answers')
    .select('*')
    .eq('question_id', question.id);

  const { data: markScheme } = await supabase
    .from('mark_scheme_points')
    .select('*')
    .eq('question_id', question.id)
    .order('sort_order');

  const { data: mistakes } = await supabase
    .from('common_mistakes')
    .select('*')
    .eq('question_id', question.id);

  res.json({
    ...question,
    model_answer: modelAnswers && modelAnswers[0] ? modelAnswers[0].answer_text : null,
    mark_scheme: markScheme || [],
    common_mistakes: mistakes || []
  });
});

// Required practicals (RP1-12)
app.get('/api/practicals', async (req, res) => {
  const { data, error } = await supabase
    .from('required_practicals')
    .select('*')
    .order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
module.exports = app;
