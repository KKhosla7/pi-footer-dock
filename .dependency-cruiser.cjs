module.exports = {
  forbidden: [
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    { name: 'no-unresolved', severity: 'error', from: {}, to: { couldNotResolve: true } },
    {
      name: 'no-runtime-test-fixtures',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^(tests|scripts)/' },
    },
    {
      name: 'no-core-ui-node-io',
      severity: 'error',
      from: { path: '^src/(core|ui)/' },
      to: { path: '^node:' },
    },
    {
      name: 'no-core-to-adapters',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(adapters|ui|runtime|index)' },
    },
    {
      name: 'no-ui-to-adapters',
      severity: 'error',
      from: { path: '^src/ui/' },
      to: { path: '^src/(adapters|runtime|index)' },
    },
    {
      name: 'quota-sources-are-independent',
      severity: 'error',
      from: {
        path: '^src/quota-sources/[^/]+\\.ts$',
        pathNot: '^src/quota-sources/(registry|contract)\\.ts$',
      },
      to: { path: '^src/quota-sources/[^/]+\\.ts$', pathNot: '^src/quota-sources/contract\\.ts$' },
    },
    {
      name: 'git-only-through-git-command',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/adapters/(git-command|git-inert|folder-opener)\\.ts$' },
      to: { path: '^(node:)?child_process$' },
    },
    {
      name: 'no-adapters-to-ui',
      severity: 'error',
      from: { path: '^src/adapters/' },
      to: { path: '^src/(ui|runtime|index)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
