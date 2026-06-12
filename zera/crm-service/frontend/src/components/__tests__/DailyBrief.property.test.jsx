import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import DailyBrief from '../DailyBrief.jsx';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DailyBrief Component Property Tests', () => {
  // Feature: zera-crm, Property 19: Daily Brief is sorted high -> medium -> low urgency
  it('Property 19: Daily Brief is sorted high -> medium -> low urgency', async () => {
    // fast-check Arbitrary for brief list
    const urgencyArb = fc.constantFrom('high', 'medium', 'low');
    const briefArb = fc.record({
      segment_label: fc.string({ minLength: 5, maxLength: 20 }),
      rationale: fc.string(),
      audience_size: fc.nat(),
      suggested_message: fc.string({ maxLength: 320 }),
      estimated_revenue: fc.nat(),
      urgency: urgencyArb,
      channel: fc.constantFrom('email', 'sms', 'whatsapp'),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(briefArb, { minLength: 2, maxLength: 6 }),
        async (briefs) => {
          // Setup mock fetch response
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ briefs }),
          });

          const { unmount } = render(
            <BrowserRouter>
              <DailyBrief />
            </BrowserRouter>
          );

          // Wait for load to finish
          await screen.findByText('AI Daily Campaign Briefs');

          // Find all cards by checking card headers/labels
          const renderedUrgencyBadges = screen.getAllByText(/high|medium|low/i);
          const urgencies = renderedUrgencyBadges.map((badge) => badge.textContent.toLowerCase());

          // Verify that urgencies are sorted high -> medium -> low
          const order = { high: 0, medium: 1, low: 2 };
          for (let i = 0; i < urgencies.length - 1; i++) {
            const currentOrder = order[urgencies[i]];
            const nextOrder = order[urgencies[i + 1]];
            expect(currentOrder).toBeLessThanOrEqual(nextOrder);
          }

          unmount();
          return true;
        }
      ),
      { numRuns: 10 } // fewer runs in React render testing to keep speed fast
    );
  });
});
