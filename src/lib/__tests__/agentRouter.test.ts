import { describe, it, expect } from 'vitest';
import { resolveAgent, RoutedAgent } from '../agentRouting';

const agent = (overrides: Partial<RoutedAgent> & { id: string; name: string }): RoutedAgent => ({
  description: null,
  system_prompt: null,
  is_default: false,
  active: true,
  ...overrides,
});

const sales = agent({ id: 'a1', name: 'Sales' });
const support = agent({ id: 'a2', name: 'Support' });
const billing = agent({ id: 'a3', name: 'Billing', is_default: true });

describe('resolveAgent', () => {
  it('returns null when there are no agents', () => {
    expect(resolveAgent({ agents: [], classifiedName: 'Sales', activeAgentId: null })).toBeNull();
  });

  it('returns null when all agents are inactive', () => {
    const inactive = agent({ id: 'a1', name: 'Sales', active: false });
    expect(resolveAgent({ agents: [inactive], classifiedName: 'Sales', activeAgentId: null })).toBeNull();
  });

  it('returns the only active agent without needing a classification', () => {
    expect(resolveAgent({ agents: [sales], classifiedName: null, activeAgentId: null })).toEqual(sales);
  });

  it('picks the agent matching the classified name', () => {
    const result = resolveAgent({
      agents: [sales, support, billing],
      classifiedName: 'Support',
      activeAgentId: null,
    });
    expect(result).toEqual(support);
  });

  it('matches classified name case-insensitively with extra whitespace', () => {
    const result = resolveAgent({
      agents: [sales, support, billing],
      classifiedName: '  sales ',
      activeAgentId: null,
    });
    expect(result).toEqual(sales);
  });

  it('never routes to an inactive agent even when classified', () => {
    const inactiveSupport = agent({ id: 'a2', name: 'Support', active: false });
    const result = resolveAgent({
      agents: [sales, inactiveSupport, billing],
      classifiedName: 'Support',
      activeAgentId: null,
    });
    // Falls through to default agent
    expect(result).toEqual(billing);
  });

  it('sticks to the conversation active agent when classification fails', () => {
    const result = resolveAgent({
      agents: [sales, support, billing],
      classifiedName: null,
      activeAgentId: 'a2',
    });
    expect(result).toEqual(support);
  });

  it('prefers classified agent over the sticky active agent', () => {
    const result = resolveAgent({
      agents: [sales, support, billing],
      classifiedName: 'Sales',
      activeAgentId: 'a2',
    });
    expect(result).toEqual(sales);
  });

  it('falls back to the default agent when classification fails and no active agent', () => {
    const result = resolveAgent({
      agents: [sales, support, billing],
      classifiedName: null,
      activeAgentId: null,
    });
    expect(result).toEqual(billing);
  });

  it('falls back to the default agent when the active agent was deactivated', () => {
    const result = resolveAgent({
      agents: [sales, support, billing],
      classifiedName: null,
      activeAgentId: 'a9-deleted',
    });
    expect(result).toEqual(billing);
  });

  it('falls back to the first agent when nothing matches and there is no default', () => {
    const result = resolveAgent({
      agents: [sales, support],
      classifiedName: 'Unknown',
      activeAgentId: null,
    });
    expect(result).toEqual(sales);
  });
});
