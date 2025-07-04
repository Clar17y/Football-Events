import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MatchProvider } from '../../src/contexts/MatchContext';
import { ToastProvider } from '../../src/contexts/ToastContext';

// Custom render function with providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <ToastProvider>
      <MatchProvider>
        {children}
      </MatchProvider>
    </ToastProvider>
  );
};

const customRender = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };