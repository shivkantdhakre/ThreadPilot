import fs from 'fs';
import path from 'path';
import { GeminiProvider } from '../packages/ai/dist/index.js';

// Helper: Cosine similarity
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Read API key from .env
function getApiKey() {
  if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('your_')) {
    return process.env.GEMINI_API_KEY.trim();
  }
  const envContent = fs.readFileSync('.env', 'utf8');
  const match = envContent.match(/GEMINI_API_KEY=(.+)/);
  if (match) {
    return match[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('GEMINI_API_KEY not found');
}

// 1. True Duplicates (near identical content, paraphrased, reordered, synonym tweaks)
const trueDuplicates = [
  ['Building in public changed my engineering career completely.', 'Building in public has changed my entire engineering career.'],
  ['Stop using console.log for production debugging in Node.js.', 'Stop using console.log for production Node.js debugging.'],
  ['PostgreSQL + pgvector is all the vector database you need.', 'PostgreSQL + pgvector is honestly all the vector DB you will need.'],
  ['The biggest mistake junior engineers make is avoiding documentation.', 'The biggest mistake early engineers make is avoiding documentation.'],
  ['AI will not replace engineers, but engineers who use AI will replace those who do not.', 'AI won’t replace engineers, but engineers using AI will replace those who don’t.'],
  ['Never deploy on Friday afternoon without an automated rollback plan.', 'Do not deploy on Friday afternoon unless you have automated rollbacks.'],
  ['Why SQLite in production is more scalable than you think.', 'Why using SQLite in production can scale much further than you think.'],
  ['Every senior engineer should learn how to write compelling design docs.', 'Every senior engineer needs to learn to write clear technical design docs.'],
  ['Clean code isn’t about fewer lines; it’s about clarity and maintainability.', 'Writing clean code is about readability and ease of maintenance, not fewer lines.'],
  ['Microservices before product-market fit is the fastest way to kill your startup.', 'Adopting microservices before finding product-market fit kills startups rapidly.'],
  ['The best engineers I know spend more time reading code than writing it.', 'Top engineers often spend significantly more time reading code than authoring new lines.'],
  ['If you don’t write tests today, you will spend tomorrow debugging production.', 'Skipping tests today means you will spend all day tomorrow fixing production bugs.'],
  ['Remote work demands asynchronous communication and thorough documentation.', 'Successful remote engineering teams rely on async communication and deep documentation.'],
  ['Premature optimization remains the root of all software complexity.', 'Optimizing code prematurely is the single biggest source of unnecessary complexity.'],
  ['Refactoring code without automated tests is just making changes and praying.', 'Refactoring without a solid test suite is pure guesswork and hoping nothing breaks.'],
  ['Consistency beats talent every single day in software development.', 'Daily consistency in programming always outpaces raw talent in the long term.'],
  ['The best feature you can ship is the one you decide to delete.', 'Deleting unnecessary features is often the highest-impact code you can ship.'],
  ['Database migrations should always be backwards-compatible for zero-downtime releases.', 'Zero-downtime deployments require backwards-compatible database migrations every time.'],
  ['A 15-minute sync that could have been an email is why engineering morale drops.', 'Unnecessary 15-minute meetings that should be emails destroy engineering productivity.'],
  ['Simplicity in system design is the hardest engineering discipline to master.', 'Designing simple, elegant software architectures is the most challenging skill in tech.']
];

// 2. Related-But-Distinct (same topic, same domain keywords, but DIFFERENT claims/ideas)
// CRITICAL: This is where naive models trigger false positives!
const relatedDistinct = [
  ['PostgreSQL + pgvector is great for simple semantic search.', 'MongoDB Atlas vector search has improved latency under high concurrent writes.'],
  ['Building in public creates high accountability for solo founders.', 'Private stealth development allows teams to iterate without premature customer scrutiny.'],
  ['Why we decided to migrate our backend from Node.js to Go.', 'Why our team chose TypeScript and NestJS for rapid enterprise iteration.'],
  ['Junior engineers should focus on foundational algorithms before frameworks.', 'Junior engineers accelerate their careers by shipping full-stack production features early.'],
  ['Automating social media posting saves founders 10 hours every week.', 'Direct authentic community engagement cannot be delegated to automation.'],
  ['Never deploy on Friday afternoon without an automated rollback plan.', 'Why continuous deployment on weekends reduces release anxiety.'],
  ['Why SQLite in production is more scalable than you think.', 'Why enterprise scale demands multi-region distributed databases like CockroachDB.'],
  ['Every senior engineer should learn how to write compelling design docs.', 'Why senior engineers should spend more time reviewing PRs than writing specs.'],
  ['Clean code isn’t about fewer lines; it’s about clarity and maintainability.', 'Performance-critical systems often require sacrificing clean code patterns for cache locality.'],
  ['Microservices before product-market fit is the fastest way to kill your startup.', 'Why domain-driven design leads naturally to early microservice boundaries.'],
  ['The best engineers I know spend more time reading code than writing it.', 'Pair programming and live mob debugging produce better software than solitary code reviews.'],
  ['If you don’t write tests today, you will spend tomorrow debugging production.', 'TDD slows down zero-to-one prototyping when product requirements change hourly.'],
  ['Remote work demands asynchronous communication and thorough documentation.', 'In-person colocation accelerates creative architectural breakthroughs during early ideation.'],
  ['Premature optimization remains the root of all software complexity.', 'Designing for scale on day one prevents catastrophic multi-month database rewrites later.'],
  ['Refactoring code without automated tests is just making changes and praying.', 'Sometimes rewriting a legacy module from scratch is faster than incremental refactoring.'],
  ['Consistency beats talent every single day in software development.', 'Deep specialized technical brilliance is what solves unsolvable distributed systems bugs.'],
  ['The best feature you can ship is the one you decide to delete.', 'Customer retention in B2B SaaS is driven by shipping high-frequency product enhancements.'],
  ['Database migrations should always be backwards-compatible for zero-downtime releases.', 'Why schema-less document databases eliminate relational migration overhead entirely.'],
  ['A 15-minute sync that could have been an email is why engineering morale drops.', 'Weekly open-mic engineering standups foster team psychological safety and camaraderie.'],
  ['Simplicity in system design is the hardest engineering discipline to master.', 'Advanced event-driven CQRS architectures are essential for financial transaction auditing.']
];

// 3. Completely Unrelated Posts
const completelyUnrelated = [
  ['Why we decided to migrate our backend from Node.js to Go.', 'The secret to brewing perfect pour-over Ethiopian coffee at home.'],
  ['PostgreSQL + pgvector is all the vector database you need.', 'Morning running routines improved my cardiovascular endurance by 20%.'],
  ['Building in public changed my engineering career completely.', 'Best budget mechanical keyboards under $100 in 2026.'],
  ['AI agent evaluation requires deterministic validation gates.', 'Hiking in the Dolomites during autumn is a breathtaking experience.'],
  ['The new Threads API publishing limit endpoint provides live quota states.', 'How to prune bonsai ficus trees during early spring dormancy.'],
  ['Never deploy on Friday afternoon without an automated rollback plan.', 'Sourdough starter feeding schedules for high-hydration loaves.'],
  ['Why SQLite in production is more scalable than you think.', 'Top 10 scenic train routes through the Swiss Alps in winter.'],
  ['Every senior engineer should learn how to write compelling design docs.', 'The physics behind aerodynamic bicycle wheel design.'],
  ['Clean code isn’t about fewer lines; it’s about clarity and maintainability.', 'Ancient Roman aqueduct engineering and hydraulic concrete.'],
  ['Microservices before product-market fit is the fastest way to kill your startup.', 'Beginner guide to watercolor landscape painting.'],
  ['The best engineers I know spend more time reading code than writing it.', 'How to care for monstera deliciosa houseplants in winter.'],
  ['If you don’t write tests today, you will spend tomorrow debugging production.', 'The history of mechanical pocket watches in 18th century Geneva.'],
  ['Remote work demands asynchronous communication and thorough documentation.', 'Essential spices for authentic southern Indian sambar.'],
  ['Premature optimization remains the root of all software complexity.', 'How telescope optical collimation works for stargazing.'],
  ['Refactoring code without automated tests is just making changes and praying.', 'Learning classical acoustic guitar fingerpicking patterns.'],
  ['Consistency beats talent every single day in software development.', 'Training for your first Olympic distance triathlon.'],
  ['The best feature you can ship is the one you decide to delete.', 'Wild mushroom foraging rules for Pacific Northwest chanterelles.'],
  ['Database migrations should always be backwards-compatible for zero-downtime releases.', 'Restoring mid-century modern teak furniture with tung oil.'],
  ['A 15-minute sync that could have been an email is why engineering morale drops.', 'How honeybees communicate flower patch distances using the waggle dance.'],
  ['Simplicity in system design is the hardest engineering discipline to master.', 'French pastry technique for creating 72-layer laminated croissants.']
];

async function runCalibration() {
  const apiKey = getApiKey();
  console.log('Using real Gemini API Key for Gemini Embedding 2 calibration...');

  const provider = new GeminiProvider(apiKey, 'gemini-embedding-2', 3, 30000, 768, []);

  // Collect all unique texts to embed in batch
  const allTextsSet = new Set();
  for (const [a, b] of [...trueDuplicates, ...relatedDistinct, ...completelyUnrelated]) {
    allTextsSet.add(a);
    allTextsSet.add(b);
  }
  const uniqueTexts = Array.from(allTextsSet);
  console.log(`Total unique texts to embed with SIMILARITY formatting: ${uniqueTexts.length}`);

  // Embed with taskType: 'SIMILARITY'
  const startTime = Date.now();
  const embedResponse = await provider.embed({
    texts: uniqueTexts,
    taskType: 'SIMILARITY',
  });
  console.log(`Embedding completed in ${(Date.now() - startTime) / 1000}s. Vectors: ${embedResponse.embeddings.length}`);

  // Create text -> vector map
  const vectorMap = new Map();
  uniqueTexts.forEach((text, i) => {
    vectorMap.set(text, embedResponse.embeddings[i]);
  });

  // Calculate real pairwise similarities
  const dupeScores = trueDuplicates.map(([a, b]) => cosineSimilarity(vectorMap.get(a), vectorMap.get(b)));
  const relatedScores = relatedDistinct.map(([a, b]) => cosineSimilarity(vectorMap.get(a), vectorMap.get(b)));
  const unrelatedScores = completelyUnrelated.map(([a, b]) => cosineSimilarity(vectorMap.get(a), vectorMap.get(b)));

  console.log('\n--- Real Gemini Embedding 2 Score Distributions ---');
  console.log('True Duplicates (min, avg, max):',
    Math.min(...dupeScores).toFixed(4),
    (dupeScores.reduce((a, b) => a + b, 0) / dupeScores.length).toFixed(4),
    Math.max(...dupeScores).toFixed(4)
  );
  console.log('Related-But-Distinct (min, avg, max):',
    Math.min(...relatedScores).toFixed(4),
    (relatedScores.reduce((a, b) => a + b, 0) / relatedScores.length).toFixed(4),
    Math.max(...relatedScores).toFixed(4)
  );
  console.log('Completely Unrelated (min, avg, max):',
    Math.min(...unrelatedScores).toFixed(4),
    (unrelatedScores.reduce((a, b) => a + b, 0) / unrelatedScores.length).toFixed(4),
    Math.max(...unrelatedScores).toFixed(4)
  );

  console.log('\n--- Real Gemini Embedding 2 Threshold Sweep ---');
  const thresholds = [0.70, 0.75, 0.78, 0.80, 0.82, 0.84, 0.85, 0.86, 0.88, 0.90, 0.92, 0.95];
  const results = [];

  for (const t of thresholds) {
    const tp = dupeScores.filter((s) => s >= t).length;
    const fn = dupeScores.filter((s) => s < t).length;
    const fpRelated = relatedScores.filter((s) => s >= t).length;
    const fpUnrelated = unrelatedScores.filter((s) => s >= t).length;
    const fp = fpRelated + fpUnrelated;
    const tn = (relatedScores.length + unrelatedScores.length) - fp;

    const precision = tp + fp > 0 ? tp / (tp + fp) : 1.0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0.0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0.0;
    const fpRate = fp / (relatedScores.length + unrelatedScores.length);

    results.push({
      threshold: t,
      tp,
      fp,
      fpRelated,
      fpUnrelated,
      fn,
      tn,
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1: Number(f1.toFixed(4)),
      fpRate: Number(fpRate.toFixed(4)),
    });

    console.log(
      `Threshold ${t.toFixed(2)}: TP=${tp}/${trueDuplicates.length}, FP=${fp}/${relatedScores.length + unrelatedScores.length} (related=${fpRelated}, unrelated=${fpUnrelated}), FN=${fn}, Precision=${precision.toFixed(3)}, Recall=${recall.toFixed(3)}, F1=${f1.toFixed(3)}, FPR=${fpRate.toFixed(3)}`
    );
  }

  // Save the full calibration artifact to JSON fixture
  const outputData = {
    calibratedAt: new Date().toISOString(),
    embeddingModel: 'gemini-embedding-2',
    embeddingDimensions: 768,
    embeddingPipelineVersion: 'v2',
    taskType: 'SIMILARITY',
    datasetSize: {
      trueDuplicates: trueDuplicates.length,
      relatedDistinct: relatedDistinct.length,
      completelyUnrelated: completelyUnrelated.length,
      totalPairs: trueDuplicates.length + relatedDistinct.length + completelyUnrelated.length,
    },
    scores: {
      trueDuplicates: trueDuplicates.map(([a, b], idx) => ({ a, b, similarity: dupeScores[idx] })),
      relatedDistinct: relatedDistinct.map(([a, b], idx) => ({ a, b, similarity: relatedScores[idx] })),
      completelyUnrelated: completelyUnrelated.map(([a, b], idx) => ({ a, b, similarity: unrelatedScores[idx] })),
    },
    sweep: results,
  };

  const fixtureDir = path.resolve('packages/agents/test/fixtures');
  if (!fs.existsSync(fixtureDir)) {
    fs.mkdirSync(fixtureDir, { recursive: true });
  }
  const fixturePath = path.join(fixtureDir, 'gemini-embedding-2-calibration.json');
  fs.writeFileSync(fixturePath, JSON.stringify(outputData, null, 2));
  console.log(`\nCalibration results written to: ${fixturePath}`);
}

runCalibration().catch(console.error);
