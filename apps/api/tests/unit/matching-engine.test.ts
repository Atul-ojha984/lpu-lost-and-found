import { describe, it, expect } from 'vitest';
import { calculateItemMatchScore, extractSignificantTokens } from '../../src/services/matching.service';

describe('Deterministic Explainable Matching Engine', () => {
  it('should extract significant tokens and strip common stop words and punctuation', () => {
    const text = 'I lost my navy blue HP Pavilion laptop near the table on the 2nd floor of Block 34!';
    const tokens = extractSignificantTokens(text);

    expect(tokens).toContain('navy');
    expect(tokens).toContain('blue');
    expect(tokens).toContain('hp');
    expect(tokens).toContain('pavilion');
    expect(tokens).toContain('laptop');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('on');
    expect(tokens).not.toContain('of');
    expect(tokens).not.toContain('i');
    expect(tokens).not.toContain('lost');
  });

  it('should assign high confidence and score for items with matching keywords, exact category, same location, and close time delta', () => {
    const itemLost = {
      title: 'Apple iPad Air 5th Gen (Space Grey)',
      publicDescription: 'Grey tablet with magnetic stylus strip left on table in Central Library.',
      specificLocation: 'Central Library 2nd Floor Reading Room Desk 12',
      category: { code: 'ELECTRONICS', name: 'Electronics & Gadgets' },
      location: { code: 'CENTRAL_LIBRARY', name: 'Central Library' },
      eventDate: new Date('2026-10-18T10:00:00Z'),
    };

    const itemFound = {
      title: 'Found Apple iPad (Grey Case)',
      publicDescription: 'Space grey Apple iPad tablet found on study table with stylus.',
      specificLocation: 'Central Library 2nd Floor Reading Room Desk 12',
      category: { code: 'ELECTRONICS', name: 'Electronics & Gadgets' },
      location: { code: 'CENTRAL_LIBRARY', name: 'Central Library' },
      eventDate: new Date('2026-10-18T12:30:00Z'), // 2.5 hours later
    };

    const result = calculateItemMatchScore(itemLost, itemFound);

    expect(result.matchScore).toBeGreaterThanOrEqual(75);
    expect(result.confidence).toBe('HIGH');
    expect(result.explanation.categoryMatch).toContain('Exact category match');
    expect(result.explanation.locationProximity).toContain('Same campus location');
    expect(result.explanation.timeDelta).toContain('Within 6 hours');
    expect(result.explanation.matchingTokens.length).toBeGreaterThanOrEqual(2);

    // Verify individual breakdown weights
    expect(result.breakdown.categoryScore).toBe(25); // 25% max
    expect(result.breakdown.locationScore).toBe(20); // 20% max
    expect(result.breakdown.timeScore).toBe(15);     // 15% max
    expect(result.breakdown.keywordScore).toBeGreaterThanOrEqual(15); // out of 40%
  });

  it('should assign low confidence for items with mismatched category and distant campus zones', () => {
    const itemA = {
      title: 'Casio Scientific Calculator fx-991EX',
      publicDescription: 'Black scientific calculator',
      specificLocation: 'Block 34 Lab 3',
      category: { code: 'ELECTRONICS' },
      location: { code: 'BLOCK_30_38' },
      eventDate: new Date('2026-09-01T10:00:00Z'),
    };

    const itemB = {
      title: 'Brown Leather Men Wallet',
      publicDescription: 'Leather wallet with cash',
      specificLocation: 'Uni-Mall Food Court',
      category: { code: 'WALLETS_PURSE' },
      location: { code: 'UNI_MALL' },
      eventDate: new Date('2026-10-18T10:00:00Z'), // 47 days later
    };

    const result = calculateItemMatchScore(itemA, itemB);

    expect(result.matchScore).toBeLessThan(35);
    expect(result.confidence).toBe('LOW');
    expect(result.explanation.categoryMatch).toContain('Category mismatch');
  });

  it('should give partial credit for compatible categories and adjacent campus zones', () => {
    const itemA = {
      title: 'Nike Gym Backpack',
      publicDescription: 'Black duffle sports bag',
      specificLocation: 'Block 34 hallway',
      category: { code: 'BAGS_BACKPACKS' },
      location: { code: 'BLOCK_30_38' },
      eventDate: new Date('2026-10-17T12:00:00Z'),
    };

    const itemB = {
      title: 'Nike Sports Duffel Bag with Strap',
      publicDescription: 'Black sports accessories and bag',
      specificLocation: 'Central Library steps',
      category: { code: 'CLOTHING_ACCESSORIES' }, // Compatible category
      location: { code: 'CENTRAL_LIBRARY' },      // Adjacent zone
      eventDate: new Date('2026-10-18T12:00:00Z'), // 24 hours
    };

    const result = calculateItemMatchScore(itemA, itemB);

    expect(result.matchScore).toBeGreaterThanOrEqual(50);
    expect(result.confidence).toBe('MEDIUM');
    expect(result.explanation.categoryMatch).toContain('Compatible category overlap');
    expect(result.explanation.locationProximity).toContain('Adjacent campus zones');
  });
});
