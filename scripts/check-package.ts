/**
 * What a user would get from npm, checked before anything is published: the tarball holds what it
 * should and nothing else, the manifest is complete, and Pi can load the packed extension.
 * Run with `npm run pack:check`; the release workflow runs it too.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { discoverAndLoadExtensions } from '@earendil-works/pi-coding-agent';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<
  string,
  unknown
>;

// 1. The manifest.
assert.equal(manifest.private, undefined, 'package.json must not be private');
assert.match(String(manifest.name), /^pi-footer-dock$/u);
assert.equal(manifest.license, 'Apache-2.0');
assert.ok(
  manifest.repository && manifest.bugs && manifest.homepage,
  'repository, bugs and homepage are set',
);
assert.ok(
  (manifest.keywords as string[]).includes('pi-package'),
  'the pi-package keyword lists it on pi.dev',
);
assert.deepEqual((manifest.pi as { extensions: string[] }).extensions, ['./src/index.ts']);
const peers = manifest.peerDependencies as Record<string, string>;
assert.equal(
  peers['@earendil-works/pi-coding-agent'],
  '*',
  'host packages are peers with a * range',
);
assert.equal(manifest.dependencies, undefined, 'nothing the host provides is a dependency');

// 2. The tarball.
const packed = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf8',
  }),
) as {
  files: { path: string }[];
  size: number;
}[];
const files = (packed[0]?.files ?? []).map((file) => file.path);
for (const required of [
  'src/index.ts',
  'package.json',
  'README.md',
  'SETUP.md',
  'LICENSE',
  'NOTICE',
  'CHANGELOG.md',
  'SECURITY.md',
  'docs/extending-footer-dock.md',
])
  assert.ok(files.includes(required), `missing from the package: ${required}`);
const forbidden = [
  /^tests\//u,
  /^scripts\//u,
  /^\.github\//u,
  /^AGENTS\.md$/u,
  /^MVP1-/u,
  /^\.task_logs/u,
  /\.test\.ts$/u,
  /^docs\/(?!extending-footer-dock\.md$|images\/)/u,
  /node_modules/u,
];
for (const path of files)
  for (const pattern of forbidden) assert.ok(!pattern.test(path), `must not be published: ${path}`);
assert.ok((packed[0]?.size ?? 0) < 400_000, `package is ${packed[0]?.size} bytes`);

// 3. Pi loads what was packed.
const scratch = mkdtempSync(join(tmpdir(), 'dock-pack-'));
try {
  execFileSync('npm', ['pack', '--pack-destination', scratch, '--ignore-scripts', '--silent'], {
    cwd: root,
  });
  execFileSync('tar', [
    '-xzf',
    join(scratch, `pi-footer-dock-${String(manifest.version)}.tgz`),
    '-C',
    scratch,
  ]);
  // The host provides Pi's packages; give the extracted copy the same ones.
  symlinkSync(join(root, 'node_modules'), join(scratch, 'package', 'node_modules'));
  const loaded = await discoverAndLoadExtensions(
    [join(scratch, 'package', 'src', 'index.ts')],
    scratch,
    scratch,
  );
  assert.deepEqual(loaded.errors, []);
  const extension = loaded.extensions[0];
  assert.ok(extension, 'the packed extension loads');
  assert.ok(extension.commands.has('dock-settings'), 'and registers its commands');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
process.stdout.write(`package ok: ${files.length} files, ${packed[0]?.size} bytes\n`);
