/** Minimal valid Responses SSE sequence; counters are fixture data, never a live account. */
export function emitResponses(frame: (body: object) => void): void {
  const item = {
    id: 'message-fixture',
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text: 'Integration response.', annotations: [] }],
  };
  frame({
    type: 'response.created',
    response: { id: 'response-fixture', status: 'in_progress', output: [] },
  });
  frame({
    type: 'response.output_item.added',
    output_index: 0,
    item: { ...item, status: 'in_progress', content: [] },
  });
  frame({
    type: 'response.output_text.delta',
    output_index: 0,
    item_id: item.id,
    content_index: 0,
    delta: 'Integration response.',
  });
  frame({ type: 'response.output_item.done', output_index: 0, item });
  frame({
    type: 'response.completed',
    response: {
      id: 'response-fixture',
      status: 'completed',
      output: [item],
      usage: {
        input_tokens: 1100,
        output_tokens: 25,
        total_tokens: 1125,
        input_tokens_details: { cached_tokens: 200 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    },
  });
}
