import process from 'node:process';
import { SessionManager } from '@earendil-works/pi-coding-agent';

// Persist only synthetic history to obtain a reopenable CLI session, without inference.
const session = SessionManager.create(process.cwd(), process.argv[2]);
session.appendMessage({ role: 'user', content: 'Offline quota UI fixture', timestamp: 1 });
const assistant = session.appendMessage({
  role: 'assistant',
  api: 'openai-codex-responses',
  provider: 'openai-codex',
  model: 'gpt-5.6-sol',
  content: [{ type: 'text', text: 'Synthetic fixture; no model request.' }],
  usage: {
    input: 1500,
    output: 250,
    cacheRead: 500,
    cacheWrite: 0,
    totalTokens: 2250,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: 'stop',
  timestamp: 2,
});
// Reproduce the live-session reload regression: summaries have usage but no model identity.
for (let index = 0; index < 5; index += 1) {
  session.appendCompaction(
    'Synthetic compaction metadata fixture.',
    assistant,
    100,
    undefined,
    false,
    {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  );
}
process.stdout.write(session.getSessionFile() + '\n');
