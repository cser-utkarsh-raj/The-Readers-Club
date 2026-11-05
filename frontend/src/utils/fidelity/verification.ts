import { SummaryFidelityMetadata } from '../../types/book';
import { hashSourceText } from './sourceIntegrity';

export interface ClaimEvidence {
  segmentId: string;
  sourceHash: string;
  startOffset: number;
  endOffset: number;
  quote: string;
}

export interface SummaryClaim {
  id: string;
  text: string;
  evidence: ClaimEvidence[];
}

export interface FidelityVerificationInput {
  sourceText: string;
  sourceHash: string;
  claims: SummaryClaim[];
  criticalFactIds: string[];
  supportedCriticalFactIds: string[];
  evidenceCoverage: SummaryFidelityMetadata['evidenceCoverage'];
  pipelineVersion: string;
  promptVersion: string;
  verificationModel?: string;
  minimumCoverage?: number;
}

export interface FidelityVerificationResult {
  metadata: SummaryFidelityMetadata;
  invalidEvidenceClaimIds: string[];
  unsupportedClaimIds: string[];
}

/**
 * Deterministic citation verification. A claim is supported only when at least
 * one cited source range exactly matches the immutable manuscript and its hash.
 * This does not decide whether a paraphrase is semantically entailed; that
 * requires a separate model/human review and must not be represented as proven.
 */
export function verifySummaryEvidence(input: FidelityVerificationInput): FidelityVerificationResult {
  const invalidEvidenceClaimIds: string[] = [];
  const unsupportedClaimIds: string[] = [];

  const sourceHashMatches = hashSourceText(input.sourceText) === input.sourceHash;
  for (const claim of input.claims) {
    const hasValidEvidence = sourceHashMatches && claim.evidence.some((evidence) => {
      if (evidence.sourceHash !== input.sourceHash) return false;
      if (evidence.startOffset < 0 || evidence.endOffset <= evidence.startOffset || evidence.endOffset > input.sourceText.length) return false;
      return input.sourceText.slice(evidence.startOffset, evidence.endOffset) === evidence.quote;
    });
    if (!hasValidEvidence) {
      invalidEvidenceClaimIds.push(claim.id);
      unsupportedClaimIds.push(claim.id);
    }
  }

  const omittedCriticalItems = input.criticalFactIds.filter((id) => !input.supportedCriticalFactIds.includes(id));
  const coverageValues = Object.values(input.evidenceCoverage);
  const coverageValid = coverageValues.every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
  const coverageFloor = input.minimumCoverage ?? 0.7;
  const lowCoverage = coverageValid && coverageValues.some((value) => value < coverageFloor);
  const reviewReasons: string[] = [];
  if (!sourceHashMatches) reviewReasons.push('Source hash does not match the manuscript.');
  if (invalidEvidenceClaimIds.length) reviewReasons.push('One or more claims lack a valid exact source citation.');
  if (omittedCriticalItems.length) reviewReasons.push('Critical story facts are not represented in the summary.');
  if (!coverageValid) reviewReasons.push('Coverage values must be between 0 and 1.');
  else if (lowCoverage) reviewReasons.push('One or more evidence coverage dimensions are below the configured threshold.');

  const status: SummaryFidelityMetadata['status'] =
    !sourceHashMatches || !coverageValid || input.claims.length === 0
      ? 'failed'
      : reviewReasons.length
        ? 'needs_review'
        : 'verified';

  const metadata: SummaryFidelityMetadata = {
    pipelineVersion: input.pipelineVersion,
    promptVersion: input.promptVersion,
    status,
    sourceHash: input.sourceHash,
    evidenceCoverage: input.evidenceCoverage,
    unsupportedClaims: unsupportedClaimIds.length,
    omittedCriticalItems,
    verificationModel: input.verificationModel,
    verifiedAt: status === 'verified' ? new Date().toISOString() : undefined,
    reviewReasons,
  };

  return { metadata, invalidEvidenceClaimIds, unsupportedClaimIds };
}

/** Retry policy is intentionally bounded to a single repair attempt. */
export function nextFidelityAttempt(attemptsAlreadyMade: number): 'repair' | 'stop' {
  return attemptsAlreadyMade < 1 ? 'repair' : 'stop';
}
