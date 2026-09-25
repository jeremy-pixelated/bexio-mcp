/**
 * Regression tests for the "create invoice/order/delivery from quote/order"
 * endpoints (quote->invoice, quote->order, order->invoice, order->delivery).
 *
 * The bexio OpenAPI spec documents `positions` as optional on these endpoints
 * ("omit to take over all positions of the source document"), but the live
 * API rejects the resulting empty body with a 415 ("Could not parse the
 * data."). When `positions` is omitted, the client must instead fetch the
 * source document and send references to all of its positions.
 *
 * Only quote->invoice has been reproduced/fixed against the live bexio API
 * (25.09.2026); these tests (mocked HTTP, no live calls) cover all four
 * endpoints because they share the same `positionsToReferences` code path.
 */
import { describe, expect, it, vi } from 'vitest';
import { QuotesApi } from '../src/client/resources/quotes.js';
import { OrdersApi } from '../src/client/resources/orders.js';
import { BexioHttp } from '../src/client/http.js';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

/** A flat position list covering text, pagebreak, a subposition and its child article/custom positions. */
const sourcePositions = [
  { id: 1, type: 'KbPositionText', text: 'Intro' },
  { id: 2, type: 'KbPositionPagebreak' },
  { id: 3, type: 'KbPositionSubposition', text: 'Group A' },
  { id: 4, type: 'KbPositionArticle', article_id: 77, amount: '2.500000', parent_id: 3 },
  { id: 5, type: 'KbPositionCustom', amount: '1.000000', parent_id: 3 },
];

const expectedReferences = [
  { id: 1, type: 'KbPositionText' },
  { id: 2, type: 'KbPositionPagebreak' },
  { id: 3, type: 'KbPositionSubposition' },
  { id: 4, type: 'KbPositionArticle', amount: 2.5 },
  { id: 5, type: 'KbPositionCustom', amount: 1 },
];

describe('QuotesApi.createInvoice / createOrder', () => {
  it('fetches the quote and sends all positions as references when positions is omitted', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'GET') {
        return jsonResponse({ id: 42, positions: sourcePositions });
      }
      return jsonResponse({ id: 900 });
    });
    const quotes = new QuotesApi(new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch }));

    const result = await quotes.createInvoice(42);

    expect(result).toEqual({ id: 900 });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'https://api.bexio.com/2.0/kb_offer/42' });
    expect(calls[1]).toMatchObject({
      method: 'POST',
      url: 'https://api.bexio.com/2.0/kb_offer/42/invoice',
      body: { positions: expectedReferences },
    });
  });

  it('does the same for createOrder', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'GET') {
        return jsonResponse({ id: 42, positions: sourcePositions });
      }
      return jsonResponse({ id: 901 });
    });
    const quotes = new QuotesApi(new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch }));

    await quotes.createOrder(42);

    expect(calls).toHaveLength(2);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[1]).toMatchObject({
      method: 'POST',
      url: 'https://api.bexio.com/2.0/kb_offer/42/order',
      body: { positions: expectedReferences },
    });
  });

  it('passes explicit positions through unchanged, without fetching the quote', async () => {
    const calls: Array<{ method: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return jsonResponse({ id: 902 });
    });
    const quotes = new QuotesApi(new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch }));
    const explicitPositions = [{ id: 4, type: 'KbPositionArticle' as const, amount: 1 }];

    await quotes.createInvoice(42, { positions: explicitPositions });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', body: { positions: explicitPositions } });
  });

  it('passes an explicit empty positions array through unchanged', async () => {
    const calls: Array<{ method: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return jsonResponse({ id: 903 });
    });
    const quotes = new QuotesApi(new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch }));

    await quotes.createInvoice(42, { positions: [] });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', body: { positions: [] } });
  });
});

describe('OrdersApi.createInvoice', () => {
  it('fetches the order and sends all positions as references when positions is omitted', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'GET') {
        return jsonResponse({ id: 55, positions: sourcePositions });
      }
      return jsonResponse({ id: 910 });
    });
    const orders = new OrdersApi(new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch }));

    const result = await orders.createInvoice(55);

    expect(result).toEqual({ id: 910 });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'https://api.bexio.com/2.0/kb_order/55' });
    expect(calls[1]).toMatchObject({
      method: 'POST',
      url: 'https://api.bexio.com/2.0/kb_order/55/invoice',
      body: { positions: expectedReferences },
    });
  });

  it('passes explicit positions through unchanged, without fetching the order', async () => {
    const calls: Array<{ method: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return jsonResponse({ id: 911 });
    });
    const orders = new OrdersApi(new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch }));
    const explicitPositions = [{ id: 4, type: 'KbPositionArticle' as const, amount: 1 }];

    await orders.createInvoice(55, { positions: explicitPositions });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', body: { positions: explicitPositions } });
  });
});

describe('OrdersApi.createDelivery', () => {
  it('fetches the order and sends all positions as references when positions is omitted', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'GET') {
        return jsonResponse({ id: 55, positions: sourcePositions });
      }
      return jsonResponse({ id: 920 });
    });
    const orders = new OrdersApi(new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch }));

    const result = await orders.createDelivery(55);

    expect(result).toEqual({ id: 920 });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'https://api.bexio.com/2.0/kb_order/55' });
    expect(calls[1]).toMatchObject({
      method: 'POST',
      url: 'https://api.bexio.com/2.0/kb_order/55/delivery',
      body: { positions: expectedReferences },
    });
  });

  it('passes explicit positions through unchanged, without fetching the order', async () => {
    const calls: Array<{ method: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return jsonResponse({ id: 921 });
    });
    const orders = new OrdersApi(new BexioHttp({ token: 't', fetch: fetchMock as typeof fetch }));
    const explicitPositions = [{ id: 4, type: 'KbPositionArticle' as const, amount: 1 }];

    await orders.createDelivery(55, { positions: explicitPositions });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', body: { positions: explicitPositions } });
  });
});
