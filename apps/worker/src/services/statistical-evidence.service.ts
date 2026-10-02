import {
  AggregationDimension,
  AggregationGranularity,
  EvidenceGrade,
  ObservationSlot,
  Prisma,
} from '@threadpilot/database';
import { createHash } from 'node:crypto';

export interface WelchTTestResult {
  tStat: number | null;
  df: number | null;
  pValue: number | null;
  ci95Lower: number | null;
  ci95Upper: number | null;
}

export interface FDRCandidate {
  candidateId: string;
  dimensionValue: string;
  pValue: number; // 0.0 to 1.0 (with 1.0 assigned for undefined candidates during FDR ranking)
  hasRealPValue: boolean;
}

export interface FDRResult {
  candidateId: string;
  rank: number; // 1-indexed (1 .. m)
  pValue: number;
  criticalValue: number; // (rank / m) * qThreshold
  qValue: number; // adjusted p-value (monotonic step-up)
  passesFDR: boolean;
}

export interface HypothesisFamilyParams {
  socialAccountId: string;
  observationSlot: ObservationSlot;
  dimension: AggregationDimension;
  granularity: AggregationGranularity;
  bucketDate: Date;
  aggregationVersion?: string | undefined;
}

export interface EvidenceGradeInput {
  sampleSize: number;
  complementSize: number;
  cohensD: number | null;
  pValue: number | null;
  ci95Lower: number | null;
  ci95Upper: number | null;
  passesFDR: boolean;
}

/**
 * 64-bit signed integer hash for PostgreSQL advisory locks (bigint).
 */
export function hashToInt64(str: string): bigint {
  const hash = createHash('sha256').update(str).digest();
  return hash.readBigInt64BE(0);
}

/**
 * Lanczos approximation for ln(Gamma(z))
 */
function logGamma(z: number): number {
  const g = 7;
  const C: number[] = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  const base = z + g + 0.5;
  let sum = C[0]!;
  for (let i = 1; i < C.length; i++) {
    const coeff = C[i]!;
    sum += coeff / (z + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(base) - base + Math.log(sum);
}

/**
 * Continued fraction evaluation for regularized incomplete beta function (Betacf)
 */
function betacf(a: number, b: number, x: number): number {
  const maxIter = 100;
  const eps = 3e-7;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1.0;
  let d = 1.0 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1.0 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1.0 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1.0 / d;
    h *= d * c;
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1.0 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1.0 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1.0) <= eps) break;
  }
  return h;
}

/**
 * Regularized incomplete beta function I_x(a, b)
 */
function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  } else {
    return 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
}

/**
 * Student's t two-tailed p-value
 */
export function studentTPValue(t: number, df: number): number | null {
  if (df <= 0 || isNaN(df) || isNaN(t)) return null;
  const x = df / (df + t * t);
  const p = regularizedBeta(x, df / 2, 0.5);
  return Math.max(0, Math.min(1, p));
}

/**
 * Two-tailed critical t-value for 95% confidence (alpha = 0.05)
 */
export function criticalT95(df: number): number {
  if (df <= 0 || isNaN(df)) return 1.96;
  if (df >= 1000) return 1.95996;
  let low = 0;
  let high = 50;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    const p = studentTPValue(mid, df);
    if (p == null || p > 0.05) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Welch's t-test with Welch-Satterthwaite degrees of freedom and 95% CI.
 * Degenerate variance (s1 = 0 and s2 = 0) and small sample guards (n1 < 2 or n2 < 2) return nulls (Test W).
 */
export function welchTTest(
  mean1: number | null | undefined,
  stdDev1: number | null | undefined,
  n1: number,
  mean2: number | null | undefined,
  stdDev2: number | null | undefined,
  n2: number,
): WelchTTestResult {
  const nullResult: WelchTTestResult = {
    tStat: null,
    df: null,
    pValue: null,
    ci95Lower: null,
    ci95Upper: null,
  };

  if (mean1 == null || mean2 == null || stdDev1 == null || stdDev2 == null) {
    return nullResult;
  }
  if (n1 < 2 || n2 < 2) {
    return nullResult;
  }
  if (stdDev1 === 0 && stdDev2 === 0) {
    // Degenerate variance: zero variance in both groups makes t undefined
    return nullResult;
  }

  const v1 = (stdDev1 * stdDev1) / n1;
  const v2 = (stdDev2 * stdDev2) / n2;
  const varSum = v1 + v2;

  if (varSum <= 0 || isNaN(varSum)) {
    return nullResult;
  }

  const se = Math.sqrt(varSum);
  const diff = mean1 - mean2;
  const tStat = diff / se;

  // Welch-Satterthwaite equation
  const dfNumerator = varSum * varSum;
  const dfDenominator = (v1 * v1) / (n1 - 1) + (v2 * v2) / (n2 - 1);

  if (dfDenominator <= 0 || isNaN(dfDenominator)) {
    return nullResult;
  }

  const df = dfNumerator / dfDenominator;
  if (df < 1 || isNaN(df)) {
    return nullResult;
  }

  const pValue = studentTPValue(tStat, df);
  if (pValue == null) {
    return nullResult;
  }

  const tCrit = criticalT95(df);
  const marginOfError = tCrit * se;

  return {
    tStat,
    df,
    pValue,
    ci95Lower: diff - marginOfError,
    ci95Upper: diff + marginOfError,
  };
}

/**
 * Cohen's d for independent groups with pooled standard deviation weighting.
 * Degenerate variance or n < 2 returns null (Test W).
 */
export function safeCohensD(
  mean1: number | null | undefined,
  stdDev1: number | null | undefined,
  n1: number,
  mean2: number | null | undefined,
  stdDev2: number | null | undefined,
  n2: number,
): number | null {
  if (mean1 == null || mean2 == null || stdDev1 == null || stdDev2 == null) {
    return null;
  }
  if (n1 < 2 || n2 < 2) {
    return null;
  }
  if (stdDev1 === 0 && stdDev2 === 0) {
    return null;
  }

  const dof = n1 + n2 - 2;
  if (dof <= 0) return null;

  const pooledVariance = ((n1 - 1) * stdDev1 * stdDev1 + (n2 - 1) * stdDev2 * stdDev2) / dof;
  if (pooledVariance <= 0 || isNaN(pooledVariance)) {
    return null;
  }

  const pooledStdDev = Math.sqrt(pooledVariance);
  const d = (mean1 - mean2) / pooledStdDev;
  return isNaN(d) ? null : d;
}

/**
 * Percentage delta: ((mean1 - mean2) / |mean2|) * 100.
 * Example: mean1=3.0, mean2=2.0 -> +50.0% (Test W).
 */
export function safePercentDelta(
  mean1: number | null | undefined,
  mean2: number | null | undefined,
): number | null {
  if (mean1 == null || mean2 == null) return null;
  if (mean2 === 0) {
    if (mean1 === 0) return 0;
    return null;
  }
  const delta = ((mean1 - mean2) / Math.abs(mean2)) * 100;
  return isNaN(delta) ? null : delta;
}

/**
 * Benjamini-Hochberg (BH-FDR) Multiple-Testing Correction:
 * Operates over the COMPLETE hypothesis family universe U (size m = |U|).
 * Statistically undefined hypotheses are assigned p = 1.0 for ranking purposes.
 * Monotonic step-up adjustment: q_(k) = min(q_(k+1), (m / k) * p_(k)).
 */
export function applyBenjaminiHochberg(
  candidates: FDRCandidate[],
  qThreshold = 0.1,
): Map<string, FDRResult> {
  const m = candidates.length; // Complete family size |U|
  const results = new Map<string, FDRResult>();
  if (m === 0) return results;

  // 1. Sort ascending by p-value.
  // Secondary sort by dimensionValue for 100% deterministic tie-breaking
  const sorted = [...candidates].sort((a, b) => {
    if (a.pValue !== b.pValue) return a.pValue - b.pValue;
    return a.dimensionValue.localeCompare(b.dimensionValue);
  });

  // 2. Compute critical values and find largest passing rank:
  // k_max = max { k in [1, m] : p_(k) <= (k / m) * qThreshold AND hasRealPValue }
  let maxPassingRank = 0;
  for (let i = 0; i < m; i++) {
    const candidate = sorted[i]!;
    const rank = i + 1;
    const criticalValue = (rank / m) * qThreshold;
    if (candidate.hasRealPValue && candidate.pValue <= criticalValue) {
      maxPassingRank = rank;
    }
  }

  // 3. Compute monotonic adjusted q-values via backward induction:
  // q_(m) = p_(m)
  // q_(k) = min(q_(k+1), (m / k) * p_(k))
  const qValues = new Array<number>(m);
  let minNextQ = 1.0;
  for (let i = m - 1; i >= 0; i--) {
    const candidate = sorted[i]!;
    const rank = i + 1;
    const rawQ = (m / rank) * candidate.pValue;
    minNextQ = Math.min(minNextQ, rawQ);
    qValues[i] = Math.min(1.0, Math.max(0.0, minNextQ));
  }

  for (let i = 0; i < m; i++) {
    const item = sorted[i]!;
    const rank = i + 1;
    const criticalValue = (rank / m) * qThreshold;
    // An undefined candidate NEVER passes FDR and gets qValue = 1.0
    const passes = item.hasRealPValue && rank <= maxPassingRank;
    const qVal = qValues[i] ?? 1.0;
    const qValue = item.hasRealPValue ? qVal : 1.0;

    results.set(item.candidateId, {
      candidateId: item.candidateId,
      rank,
      pValue: item.pValue,
      criticalValue,
      qValue,
      passesFDR: passes,
    });
  }

  return results;
}

export function buildHypothesisFamilyKey(params: HypothesisFamilyParams): string {
  return `${params.socialAccountId}:${params.observationSlot}:${params.dimension}:${params.granularity}:${params.bucketDate.toISOString()}:${params.aggregationVersion ?? 'v1'}`;
}

/**
 * Derive EvidenceGrade strictly respecting Invariants 21 & 22 (Test W & Test X):
 * - INSUFFICIENT_DATA: Degenerate, null, or small sample (sampleSize < 3 or complementSize < 3 or missing stats).
 * - HIGH_SIGNAL: Robust across all criteria AND passesFDR === true.
 * - DIRECTIONAL: Meaningful effect + adequate sample, OR robust candidate that fails FDR (capped at DIRECTIONAL).
 * - LOW_SIGNAL: Minimal sample size without meeting effect/significance thresholds.
 */
export function deriveEvidenceGrade(input: EvidenceGradeInput): EvidenceGrade {
  const { sampleSize, complementSize, cohensD, pValue, ci95Lower, ci95Upper, passesFDR } = input;

  if (
    sampleSize < 3 ||
    complementSize < 3 ||
    cohensD == null ||
    pValue == null ||
    isNaN(cohensD) ||
    isNaN(pValue)
  ) {
    return EvidenceGrade.INSUFFICIENT_DATA;
  }

  const ciExcludesZero =
    ci95Lower != null &&
    ci95Upper != null &&
    ((ci95Lower > 0 && ci95Upper > 0) || (ci95Lower < 0 && ci95Upper < 0));
  const absD = Math.abs(cohensD);

  // Robust criteria for High Signal candidacy
  const meetsRobustCriteria = sampleSize >= 5 && complementSize >= 5 && absD >= 0.3 && pValue <= 0.05 && ciExcludesZero;

  if (meetsRobustCriteria) {
    // Invariant 22 (Test X): HIGH_SIGNAL strictly requires passesFDR === true.
    // Failing FDR caps grade at DIRECTIONAL.
    if (passesFDR) {
      return EvidenceGrade.HIGH_SIGNAL;
    }
    return EvidenceGrade.DIRECTIONAL;
  }

  // Directional criteria: adequate sample, meaningful effect size, suggestive significance
  if (sampleSize >= 3 && complementSize >= 3 && absD >= 0.15 && pValue <= 0.15) {
    return EvidenceGrade.DIRECTIONAL;
  }

  // Low signal / exploratory: minimal sample size
  if (sampleSize >= 3 && complementSize >= 3) {
    return EvidenceGrade.LOW_SIGNAL;
  }

  return EvidenceGrade.INSUFFICIENT_DATA;
}

export type PrismaTransactionClient = Prisma.TransactionClient;

/**
 * Evaluate hypothesis family over the COMPLETE candidate universe U (|U| = m).
 * Undefined hypotheses are assigned p = 1.0 for FDR ranking, preserving m = |U| (Test AP).
 * Uses transaction-scoped advisory lock (Test AI).
 */
export async function evaluateHypothesisFamily(
  tx: PrismaTransactionClient,
  params: HypothesisFamilyParams,
): Promise<void> {
  const familyKey = buildHypothesisFamilyKey(params);

  // 1. Transaction-scoped advisory lock on familyKey (Test AI)
  const lockKey = hashToInt64(`fdr_family:${familyKey}`);
  const [locked] = await tx.$queryRaw<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_xact_lock(${lockKey}) AS acquired;
  `;
  if (!locked?.acquired) {
    throw new Error(`Hypothesis family ${familyKey} is currently locked by another worker.`);
  }

  // 2. Query complete candidate universe U matching exact parameters (NO sample size filter in WHERE clause)
  const candidates = await tx.performanceAggregate.findMany({
    where: {
      socialAccountId: params.socialAccountId,
      observationSlot: params.observationSlot,
      dimension: params.dimension,
      granularity: params.granularity,
      bucketDate: params.bucketDate,
    },
  });

  const m = candidates.length; // Complete family universe size |U|
  if (m === 0) return;

  // 3. Absolute NULL-safety: undefined statistical evidence yields null metrics (no metric manufacturing!)
  const evaluated = candidates.map((cand) => {
    const isStatisticallyUndefined =
      cand.sampleSize < 2 ||
      cand.complementSize < 2 ||
      cand.subjectAvgEngagementByViews == null ||
      cand.complementAvgEngagement == null;

    if (isStatisticallyUndefined) {
      return {
        ...cand,
        welchT: null,
        welchDf: null,
        welchPValue: null,
        ci95Lower: null,
        ci95Upper: null,
        cohensD: null,
        percentDelta: null,
        absoluteDelta: null,
        hasRealPValue: false,
      };
    }

    const subjectAvg = cand.subjectAvgEngagementByViews!;
    const complementAvg = cand.complementAvgEngagement!;

    const welch = welchTTest(
      subjectAvg,
      cand.subjectStdDevEngagement,
      cand.sampleSize,
      complementAvg,
      cand.complementStdDevEngagement,
      cand.complementSize,
    );
    const cohensD = safeCohensD(
      subjectAvg,
      cand.subjectStdDevEngagement,
      cand.sampleSize,
      complementAvg,
      cand.complementStdDevEngagement,
      cand.complementSize,
    );
    const percentDelta = safePercentDelta(subjectAvg, complementAvg);
    const absoluteDelta = subjectAvg - complementAvg;

    return {
      ...cand,
      welchT: welch.tStat,
      welchDf: welch.df,
      welchPValue: welch.pValue,
      ci95Lower: welch.ci95Lower,
      ci95Upper: welch.ci95Upper,
      cohensD,
      percentDelta,
      absoluteDelta,
      hasRealPValue: welch.pValue != null,
    };
  });

  // P0 FIX: Complete hypothesis family accounting in BH-FDR
  // Candidates with undefined statistical evidence are assigned p = 1.0 for FDR ranking so m = |U|
  const fdrCandidates: FDRCandidate[] = evaluated.map((e) => ({
    candidateId: e.id,
    dimensionValue: e.dimensionValue,
    pValue: e.hasRealPValue && e.welchPValue != null ? e.welchPValue : 1.0,
    hasRealPValue: e.hasRealPValue && e.welchPValue != null,
  }));

  const fdrResults = applyBenjaminiHochberg(fdrCandidates, 0.1);

  // 4. Read and increment family revision (Test AI)
  const latestAgg = await tx.performanceAggregate.findFirst({
    where: { hypothesisFamilyKey: familyKey },
    orderBy: { hypothesisFamilyRevision: 'desc' },
    select: { hypothesisFamilyRevision: true },
  });
  const newFamilyRevision = (latestAgg?.hypothesisFamilyRevision ?? 0) + 1;

  // 5. Persist updates by exact primary key (aggregateId)
  for (const item of evaluated) {
    const fdr = fdrResults.get(item.id);
    const passesFDR = item.hasRealPValue ? (fdr?.passesFDR ?? false) : false;
    const qValue = item.hasRealPValue ? (fdr?.qValue ?? null) : 1.0;

    await tx.performanceAggregate.update({
      where: { id: item.id },
      data: {
        hypothesisFamilyKey: familyKey,
        hypothesisFamilyRevision: newFamilyRevision,
        hypothesisFamilySize: m,
        qValue,
        passesFDR,
        welchTStatistic: item.welchT,
        degreesOfFreedom: item.welchDf,
        welchPValue: item.welchPValue, // REMAINS NULL in DB — never manufactured!
        ci95Lower: item.ci95Lower,
        ci95Upper: item.ci95Upper,
        cohensD: item.cohensD,
        absoluteDelta: item.absoluteDelta,
        percentDelta: item.percentDelta,
      },
    });
  }
}
