"""Proves the install and update path end to end with a real Pi, without touching npm or your own Pi folder.

A stand-in npm registry (this script) serves the packed package as 0.1.0. Pi installs it, starts and
shows no update notice. Then 0.1.1 is "published" to the registry; Pi starts again and must show
"Package Updates Available" naming the package; `pi update --extensions` must install 0.1.1; and Pi
must start again with the footer drawn and no notice. Usage: scripts/proof/update-flow.sh
"""
import hashlib, base64, http.server, json, os, pathlib, re, shutil, subprocess, sys, tarfile, tempfile, threading

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / 'capture'))
from terminal import Terminal  # noqa: E402

repo = pathlib.Path(os.environ['REPO'])
pi = os.environ['PI_BIN']
work = pathlib.Path(tempfile.mkdtemp(prefix='dock-update-'))
registry_dir = work / 'registry'
registry_dir.mkdir()
NAME = 'pi-footer-dock'
results = []


def check(ok, what):
    results.append((ok, what))
    print(('PASS  ' if ok else 'FAIL  ') + what, flush=True)


def tarball(version):
    """Pack the package as `version` (the working copy's own files, only the version differs)."""
    src = work / f'pack-{version}'
    src.mkdir()
    packed = subprocess.run(['npm', 'pack', '--silent', '--pack-destination', str(src)], cwd=repo,
                            capture_output=True, text=True, check=True).stdout.strip().splitlines()[-1]
    with tarfile.open(src / packed) as archive:
        archive.extractall(src / 'x', filter='data')
    manifest = json.loads((src / 'x/package/package.json').read_text())
    manifest['version'] = version
    (src / 'x/package/package.json').write_text(json.dumps(manifest, indent=2))
    out = subprocess.run(['npm', 'pack', '--silent', '--pack-destination', str(src)], cwd=src / 'x/package',
                         capture_output=True, text=True, check=True).stdout.strip().splitlines()[-1]
    return src / out, manifest


class Registry(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == f'/{NAME}':
            versions, tags = {}, {}
            for file in sorted(registry_dir.glob('*.json')):
                meta = json.loads(file.read_text())
                versions[meta['version']] = meta
                tags['latest'] = meta['version']
            body = json.dumps({'name': NAME, 'dist-tags': tags, 'versions': versions}).encode()
            return self.reply(200, body, 'application/json')
        match = re.fullmatch(rf'/{NAME}/-/{NAME}-(.+)\.tgz', path)
        if match and (registry_dir / f'{match[1]}.tgz').exists():
            return self.reply(200, (registry_dir / f'{match[1]}.tgz').read_bytes(), 'application/octet-stream')
        self.reply(404, b'{"error":"not found"}', 'application/json')

    def do_POST(self):
        self.reply(200, b'{}', 'application/json')

    def reply(self, status, body, kind):
        self.send_response(status)
        self.send_header('content-type', kind)
        self.send_header('content-length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Registry)
threading.Thread(target=server.serve_forever, daemon=True).start()
registry = f'http://127.0.0.1:{server.server_address[1]}/'


def publish(version):
    path, manifest = tarball(version)
    data = path.read_bytes()
    shutil.copy(path, registry_dir / f'{version}.tgz')
    manifest['dist'] = {
        'tarball': f'{registry}{NAME}/-/{NAME}-{version}.tgz',
        'shasum': hashlib.sha1(data).hexdigest(),
        'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode(),
    }
    (registry_dir / f'{version}.json').write_text(json.dumps(manifest))


home, agent, project = work / 'home', work / 'agent', work / 'home/projects/my-app'
project.mkdir(parents=True)
agent.mkdir()
subprocess.run(['git', 'init', '-q'], cwd=project, check=True)
env = dict(os.environ, HOME=str(home), PI_CODING_AGENT_DIR=str(agent), NPM_CONFIG_REGISTRY=registry,
           npm_config_registry=registry, PI_SKIP_VERSION_CHECK='1', PI_TELEMETRY='0', TERM='xterm-256color',
           COLORTERM='truecolor', NPM_CONFIG_CACHE=str(work / 'npm-cache'), NPM_CONFIG_AUDIT='false', NPM_CONFIG_FUND='false')
env.pop('PI_OFFLINE', None)


def installed_version():
    for found in agent.rglob(f'node_modules/{NAME}/package.json'):
        return json.loads(found.read_text())['version']
    return None


def run_pi(*args):
    return subprocess.run([pi, *args], cwd=project, env=env, capture_output=True, text=True, timeout=180)


def start_and_look(seconds=12):
    term = Terminal([pi, '--no-session', '--no-context-files'], str(project), env, 130, 34)
    try:
        term.pump(seconds)
        return term.text()
    finally:
        term.close()


try:
    publish('0.1.0')
    done = run_pi('install', f'npm:{NAME}')
    check(done.returncode == 0 and installed_version() == '0.1.0', f'pi install npm:{NAME} installs 0.1.0 (got {installed_version()})')
    if done.returncode != 0:
        print(done.stdout, done.stderr)
    screen = start_and_look()
    check('Package Updates Available' not in screen, 'no update notice while 0.1.0 is the latest')
    check('cache pending' in screen, 'the footer is Footer Dock\'s (its own text is on the screen), drawn by the installed package')

    publish('0.1.1')
    screen = start_and_look()
    check('Package Updates Available' in screen and NAME in screen, 'Pi announces the update at start-up and names the package')
    check('pi update --extensions' in screen.replace('\n', ' '), 'the notice tells the user which command to run')

    done = run_pi('update', '--extensions')
    check(done.returncode == 0 and installed_version() == '0.1.1', f'pi update --extensions installs 0.1.1 (got {installed_version()})')
    if installed_version() != '0.1.1':
        print(done.stdout, done.stderr)
    screen = start_and_look()
    check('Package Updates Available' not in screen, 'no notice after updating')
    check('cache pending' in screen, 'Footer Dock\'s footer still draws after the update')
finally:
    server.shutdown()
    shutil.rmtree(work, ignore_errors=True)

failed = [what for ok, what in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
