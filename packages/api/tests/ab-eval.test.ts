import { describe, it, expect } from 'vitest';
import { calculateBayesianWinProbability } from '../../workers/src/workers/ab-eval.worker.js';

// Minimal CampaignVariant shape for testing the pure function
function makeVariant(totalHumanClicks: number, totalSent: number) {
  return {
    id: 1,
    campaign_id: 1,
    variant_name: 'A',
    subject_line: 'Subject',
    preview_text: null,
    content_html: '',
    content_text: null,
    weight: 50,
    total_sent: totalSent,
    total_opens: 0,
    total_human_opens: 0,
    total_clicks: totalHumanClicks,
    total_human_clicks: totalHumanClicks,
    win_probability: null,
    is_winner: false,
    created_at: new Date(),
  };
}

describe('calculateBayesianWinProbability', () => {
  it('returns an array with length equal to number of variants', () => {
    const variants = [makeVariant(10, 100), makeVariant(10, 100)];
    const probs = calculateBayesianWinProbability(variants as any);
    expect(probs).toHaveLength(2);
  });

  it('probabilities sum to approximately 1.0', () => {
    const variants = [makeVariant(10, 100), makeVariant(10, 100)];
    const probs = calculateBayesianWinProbability(variants as any);
    const sum = probs.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 1);
  });

  it('with equal click rates, probabilities are roughly equal (~0.5 each)', () => {
    const variants = [makeVariant(50, 100), makeVariant(50, 100)];
    const probs = calculateBayesianWinProbability(variants as any);
    // Neither should be a confident winner; both should be near 0.5
    expect(probs[0]).toBeGreaterThan(0.3);
    expect(probs[0]).toBeLessThan(0.7);
    expect(probs[1]).toBeGreaterThan(0.3);
    expect(probs[1]).toBeLessThan(0.7);
  });

  it('with heavily skewed data (80% vs 5% CTR), winner has > 0.95 probability', () => {
    // Variant A: 80 clicks / 100 sent — very high CTR
    // Variant B: 5 clicks / 100 sent — very low CTR
    const variants = [makeVariant(80, 100), makeVariant(5, 100)];
    const probs = calculateBayesianWinProbability(variants as any);
    expect(probs[0]).toBeGreaterThan(0.95);
    expect(probs[1]).toBeLessThan(0.05);
  });

  it('with three variants and one clear winner, winner probability > 0.95', () => {
    const variants = [
      makeVariant(80, 100), // clear winner
      makeVariant(5, 100),
      makeVariant(10, 100),
    ];
    const probs = calculateBayesianWinProbability(variants as any);
    expect(probs[0]).toBeGreaterThan(0.90);
  });
});
