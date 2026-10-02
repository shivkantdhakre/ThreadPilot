/**
 * ThreadPilot Phase 4 — Complete Acceptance Test Suite Runner
 * Executes all 46 Acceptance Tests (Tests S through BL) across Steps 1–6
 * against the live Neon PostgreSQL database.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

interface TestSuite {
  name: string;
  script: string;
  scenarios: string[];
}

const suites: TestSuite[] = [
  {
    name: 'Step 1: Database Schema & Invariant Constraints',
    script: 'scripts/verify-phase4-schema.ts',
    scenarios: ['Database Schema & Composite Constraints Verification'],
  },
  {
    name: 'Step 2: Observation Scheduling & Ingestion Engine',
    script: 'scripts/verify-step2-ingestion.ts',
    scenarios: [
      'Test Y: Observation FSM Invalid Transition Rejection',
      'Test AD: PostMetric Immutability vs Authorized Purge Session',
      'Test AO: Analytics Request Telemetry Semantics',
      'Test AQ: Concurrent Observation Capture Fencing',
      'Test AS: Stale Observation Worker Fencing (CAS Lease Fencing)',
      'Test AT: Observation Lease Expiry & Strict Timeout Guard',
      'Test AY: Delayed Retry After Window Closure',
      'Test BA: Expired PROCESSING Recovery',
      'Test BE: Observation Capture vs Window-Close Race',
      'Test AB: Transactional Outbox Pre-Enqueue Crash Recovery',
      'Test AE: Outbox PROCESSING Crash Recovery with Lease Expiry',
      'Test AG: Outbox Concurrent Dispatcher Race & Queue Deduplication',
      'Test AH: Outbox Logical Deduplication',
      'Test AM: Outbox Post-Enqueue Crash Recovery & CAS Fencing',
      'Test BG: Outbox Replay with Delivery Generation',
    ],
  },
  {
    name: 'Step 3: Aggregation Engine & BH-FDR Multiple-Testing Correction',
    script: 'scripts/verify-step3-aggregation.ts',
    scenarios: [
      'Test S: NULL Metric Coercion (NULL != 0)',
      'Test T: Independent Group CTE Join & Zero Pseudoreplication',
      'Test U: Benjamini-Hochberg FDR Step-by-Step',
      'Test V: Cohort Assignment by publishedAt Timezone Arithmetic',
      'Test W: Welch\'s Test Degenerate Variance & Small Samples',
      'Test X: BH-FDR Gating with Complete 10-Candidate Family',
      'Test Z: Transaction-Scoped Advisory Locking Concurrency',
      'Test AA: Aggregation Lock Contention Recovery',
      'Test AI: FDR Family Concurrent Evaluation Lock',
      'Test AL: Job-ID Slot Isolation',
      'Test AN: Capture/Aggregation Concurrency Race',
      'Test AP: FDR Family Includes Statistically Undefined Candidates (|U| = m)',
      'Test AR: Multi-Generation Coalescing',
      'Test AZ: Atomic Revision Fence Race',
    ],
  },
  {
    name: 'Step 4: Insights & Profile Learning Producer Chain',
    script: 'scripts/verify-step4-insights-learning.ts',
    scenarios: [
      'Test AC: Longitudinal Profile Multi-Bucket Learning',
      'Test AF: Learning Granularity Isolation (MONTHLY only)',
      'Test AJ: Stale Learned-Weight Scoped Deactivation',
      'Test AK: Learning NULL Metric Protection',
      'Test AX: Insight Stale-Revision Commit Race',
      'Test AW: Stale Profile Learning Revision Guard',
      'Test BL: End-to-End asOf Propagation across Downstream Chain',
    ],
  },
  {
    name: 'Step 5: Recommendation Engine & Attribution Ledger',
    script: 'scripts/verify-step5-recommendations.ts',
    scenarios: [
      'Test BB: Stale Recommendation Revision Guard',
      'Test BC: RecommendationExposure FSM Illegal Transition Skips',
      'Test BD: Multi-Tenant Cross-Entity Isolation Enforcement',
      'Test BF: Explicit Recommendation Provenance Validation',
      'Test BH: Cross-Tenant LearnedDimensionWeight DB-Bypass & Relational Integrity',
      'Test BI: Concurrent Recommendation Budget Race',
      'Test BJ: Explicit Preference Score Ranking Differentiation',
      'Test BK: Deterministic Recommendation asOf & Missing-Config Fail-Closed',
    ],
  },
  {
    name: 'Step 6: Closed-Loop Intelligence Feedback Loop',
    script: 'scripts/verify-step6-closed-loop.ts',
    scenarios: [
      'Test AU: Complete Analytics -> Learning -> Recommendation Chain',
      'Test AV: Full Intelligence Feedback Loop (Attribution Lift KPI)',
    ],
  },
];

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   THREADPILOT PHASE 4 — DEFINITIVE v17 ACCEPTANCE SUITE EXECUTION        ║');
  console.log('║   46 Acceptance Scenarios (Tests S through BL) against Neon PostgreSQL    ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  let totalSuitesPassed = 0;
  let totalSuitesFailed = 0;
  const suiteResults: { name: string; status: 'PASSED' | 'FAILED'; durationMs: number }[] = [];

  const overallStartTime = Date.now();

  for (const suite of suites) {
    console.log(`\n▶ Running Suite: ${suite.name}`);
    console.log(`  Script: ${suite.script}`);
    console.log(`  Scenarios (${suite.scenarios.length}):\n${suite.scenarios.map(s => `    - ${s}`).join('\n')}\n`);

    const startTime = Date.now();
    const result = spawnSync('node', ['--experimental-strip-types', suite.script], {
      cwd: resolve('.'),
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });
    const durationMs = Date.now() - startTime;

    if (result.status === 0) {
      totalSuitesPassed++;
      suiteResults.push({ name: suite.name, status: 'PASSED', durationMs });
      console.log(`\n✔ Suite ${suite.name}: PASSED (${(durationMs / 1000).toFixed(2)}s)\n`);
    } else {
      totalSuitesFailed++;
      suiteResults.push({ name: suite.name, status: 'FAILED', durationMs });
      console.error(`\n✖ Suite ${suite.name}: FAILED (exit code ${result.status}) (${(durationMs / 1000).toFixed(2)}s)\n`);
      process.exit(1);
    }
  }

  const totalDurationSec = ((Date.now() - overallStartTime) / 1000).toFixed(2);

  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  PHASE 4 ACCEPTANCE SUITE FINAL REPORT                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  for (const res of suiteResults) {
    const symbol = res.status === 'PASSED' ? '✔' : '✖';
    console.log(`  ${symbol} ${res.name.padEnd(65)} [${res.status}] (${(res.durationMs / 1000).toFixed(2)}s)`);
  }

  console.log('\n-----------------------------------------------------------------------------');
  console.log(`  ALL 46 ACCEPTANCE SCENARIOS (Tests S through BL): 100% PASSED`);
  console.log(`  Total Test Suites: ${totalSuitesPassed} PASSED, ${totalSuitesFailed} FAILED`);
  console.log(`  Total Execution Time: ${totalDurationSec}s`);
  console.log('-----------------------------------------------------------------------------\n');
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
