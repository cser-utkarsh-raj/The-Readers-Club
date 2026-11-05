import test from 'node:test';
import assert from 'node:assert/strict';
import { hashSourceText } from '../../frontend/src/utils/fidelity/sourceIntegrity';
import { nextFidelityAttempt, verifySummaryEvidence } from '../../frontend/src/utils/fidelity/verification';

const sourceText = 'Mira opens the gate. The city is underwater.';
const sourceHash = hashSourceText(sourceText);
const coverage = { plot: 0.9, characters: 0.9, worldBuilding: 0.9, chronology: 0.9, themes: 0.9 };

test('exact source citation plus complete coverage can be marked verified', () => {
  const quote = 'Mira opens the gate.';
  const startOffset = sourceText.indexOf(quote);
  const result = verifySummaryEvidence({
    sourceText, sourceHash, pipelineVersion: '2.0.3', promptVersion: 'compact-v2',
    claims: [{ id: 'claim-1', text: 'Mira opens the gate.', evidence: [{ segmentId: 's1', sourceHash, startOffset, endOffset: startOffset + quote.length, quote }] }],
    criticalFactIds: ['event-1'], supportedCriticalFactIds: ['event-1'], evidenceCoverage: coverage,
  });
  assert.equal(result.metadata.status, 'verified');
  assert.equal(result.metadata.unsupportedClaims, 0);
});

test('wrong source range and omitted critical facts require review', () => {
  const result = verifySummaryEvidence({
    sourceText, sourceHash, pipelineVersion: '2.0.3', promptVersion: 'compact-v2',
    claims: [{ id: 'claim-1', text: 'The city is dry.', evidence: [{ segmentId: 's1', sourceHash, startOffset: 0, endOffset: 5, quote: 'wrong' }] }],
    criticalFactIds: ['event-1'], supportedCriticalFactIds: [], evidenceCoverage: coverage,
  });
  assert.equal(result.metadata.status, 'needs_review');
  assert.deepEqual(result.unsupportedClaimIds, ['claim-1']);
  assert.deepEqual(result.metadata.omittedCriticalItems, ['event-1']);
});

test('source hash mismatch fails closed and repair is bounded', () => {
  const result = verifySummaryEvidence({
    sourceText, sourceHash: 'wrong-hash', pipelineVersion: '2.0.3', promptVersion: 'compact-v2',
    claims: [{ id: 'claim-1', text: 'Claim', evidence: [] }],
    criticalFactIds: [], supportedCriticalFactIds: [], evidenceCoverage: coverage,
  });
  assert.equal(result.metadata.status, 'failed');
  assert.equal(nextFidelityAttempt(0), 'repair');
  assert.equal(nextFidelityAttempt(1), 'stop');
});
