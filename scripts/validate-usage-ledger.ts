import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { sessionUsage } from '../src/core/usage-ledger.js';
import { SessionSnapshotReader } from '../src/adapters/session-usage.js';

const models = ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-5.6-sol', 'gpt-6-luna'];
const entries = Array.from({ length: 100_000 }, (_, index) => {
  const response = {
    provider: 'openai-codex',
    model: models[index % models.length],
    usage: {
      input: (index * 7919) % 500_000,
      cacheRead: (index * 701) % 250_000,
      cacheWrite: (index * 31) % 100_000,
      output: (index * 17) % 20_000,
      cost: { total: 0 },
    },
  };
  const base = { id: String(index), parentId: index === 0 ? null : String(index - 1) };
  return index % 2
    ? { ...base, type: 'usage', ...response }
    : { ...base, type: 'message', message: { role: 'assistant', ...response } };
});
const metadata = entries.map((entry) => ('message' in entry ? entry.message : entry));
// Independent Decimal implementation and independently transcribed reference rates.
const decimal = execFileSync(
  'python3',
  [
    '-c',
    `
import sys,json
from decimal import Decimal
rates={'gpt-6-astra':['10','1','12.5','50'],'gpt-6.1-sol':['2','.1','2.5','10'],
'gpt-5.6-sol':['4','.4','5','20'],'gpt-6-luna':['.1','.01','.125','.5']}
keys=['input','cacheRead','cacheWrite','output']
total=sum((sum(Decimal(row['usage'][k])*Decimal(rate) for k,rate in zip(keys,rates[row['model']]))/Decimal(1000000) for row in json.load(sys.stdin)),Decimal(0))
print(json.dumps({'amount':str(total),'formatted':str(total.quantize(Decimal('.01')))}))
`,
  ],
  { input: JSON.stringify(metadata), encoding: 'utf8', maxBuffer: 1024 * 1024 },
);
const independent = JSON.parse(decimal) as { amount: string; formatted: string };
const result = sessionUsage(entries);
const amount = result.apiCostEstimate.amount;
assert.ok(amount !== null);
assert.ok(Math.abs(amount - Number(independent.amount)) < 1e-7);
assert.equal(amount.toFixed(2), independent.formatted);
assert.equal(result.apiCostEstimate.responses, entries.length);
const byId = new Map(entries.map((entry) => [entry.id, entry]));
let copies = 0;
const manager = {
  getEntries: () => {
    copies += 1;
    return entries.slice();
  },
  getSessionId: () => 'synthetic-benchmark',
  getLeafId: () => entries.at(-1)?.id ?? null,
  getEntry: (id: string) => byId.get(id),
} as unknown as ExtensionContext['sessionManager'];
const reader = new SessionSnapshotReader();
let began = performance.now();
reader.read(manager);
const rebuildMs = performance.now() - began;
began = performance.now();
for (let index = 0; index < 1000; index += 1) reader.read(manager);
const cachedReads1000Ms = performance.now() - began;
assert.equal(copies, 1);
assert.deepEqual(reader.read(manager), result);
process.stdout.write(
  JSON.stringify(
    {
      status: 'PASS',
      metadataOnly: true,
      contributions: entries.length,
      independentDecimalUSD: independent.amount,
      jsUSD: amount,
      absoluteDifference: Math.abs(amount - Number(independent.amount)),
      rebuildMs,
      cachedReads1000Ms,
      historyCopiesIncludingRebuild: copies,
      openaiRequests: 0,
    },
    null,
    2,
  ) + '\n',
);
