import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import SegmentBuilder from '../SegmentBuilder.jsx';

describe('SegmentBuilder Component Property Tests', () => {
  // Feature: zera-crm, Property 20: Segment Builder disables submit for empty or whitespace-only input
  it('Property 20: Segment Builder disables submit for empty/whitespace input and has maxLength 500', async () => {
    const whitespaceOrEmptyArb = fc.string().filter((s) => s.trim().length === 0);

    const { unmount } = render(
      <BrowserRouter>
        <SegmentBuilder />
      </BrowserRouter>
    );

    // Assert that the textarea has maxLength = 500
    const textarea = screen.getByPlaceholderText(/e.g. Customers who/i);
    expect(textarea).toHaveAttribute('maxLength', '500');

    // Run property check on inputs
    await fc.assert(
      fc.property(
        whitespaceOrEmptyArb,
        (inputValue) => {
          // Type value in textarea
          fireEvent.change(textarea, { target: { value: inputValue } });

          // Find the submit button
          const button = screen.getByRole('button', { name: /Build Segment/i });
          
          // Must be disabled
          expect(button).toBeDisabled();
          return true;
        }
      ),
      { numRuns: 20 }
    );

    unmount();
  });
});
