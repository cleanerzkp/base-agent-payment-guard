import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';

afterEach(cleanup);

describe('Base Agent Payment Guard demo', () => {
  it('is truthful about its local-only state', () => {
    render(<App />);
    expect(screen.getByText(/Local simulation/)).toHaveTextContent('Not deployed · Unaudited');
    expect(screen.getByText(/Local proof of concept. Never paste a private key/)).toBeInTheDocument();
    expect(screen.getByText('Evidence')).toBeInTheDocument();
  });

  it('denies a payment over its limit without a wallet', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.clear(screen.getByLabelText('Payment amount'));
    await user.type(screen.getByLabelText('Payment amount'), '75');
    await user.click(screen.getByRole('button', { name: 'Run preflight' }));
    expect(screen.getByRole('heading', { name: 'Denied' })).toBeInTheDocument();
    expect(screen.getByText('The policy would stop this payment.')).toBeInTheDocument();
  });

  it('handles malformed values as a fail-closed result', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'not-an-address' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run preflight' }));
    expect(screen.getByRole('heading', { name: 'Denied' })).toBeInTheDocument();
    expect(screen.getByText(/valid nonzero EVM addresses/)).toBeInTheDocument();
  });

  it('keeps the decision and evidence bound to the last submitted snapshot', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Allowed' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Merchant'), { target: { value: '0x4444444444444444444444444444444444444444' } });
    expect(screen.getByLabelText('Simulation evidence')).toHaveTextContent('0x3333333333333333333333333333333333333333');
    fireEvent.click(screen.getByRole('button', { name: 'Run preflight' }));
    expect(screen.getByLabelText('Simulation evidence')).toHaveTextContent('0x4444444444444444444444444444444444444444');
  });

  it('fails closed for a blank reference and invalid expiry without crashing evidence', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Reference'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Policy expiry'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run preflight' }));
    expect(screen.getByRole('heading', { name: 'Denied' })).toBeInTheDocument();
  });
});
