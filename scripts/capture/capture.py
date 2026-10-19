"""Drives a real Pi session and writes the README pictures. Called by make-screens.sh."""
import os, subprocess, sys, tempfile, pathlib
from terminal import Terminal

work, repo = os.environ['WORK'], os.environ['REPO']
pi = os.environ['PI_BIN']
out = pathlib.Path(repo, 'docs', 'images')
chromium = next((c for c in ('chromium-browser', 'chromium', 'google-chrome') if subprocess.run(['which', c], capture_output=True).returncode == 0), None)

env = dict(os.environ, HOME=f'{work}/home', PI_CODING_AGENT_DIR=f'{work}/agent', PI_OFFLINE='1', PI_SKIP_VERSION_CHECK='1',
           PI_TELEMETRY='0', TERM='xterm-256color', COLORTERM='truecolor')
for name in ('ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GITHUB_TOKEN'):
    env.pop(name, None)
ICON = {'changed': '\uf040', 'robot': '\U000f06a9'}


def start(cols=130, rows=34):
    return Terminal([pi, '-e', f'{repo}/src/index.ts', '--no-extensions', '--no-skills', '--no-prompt-templates',
                     '--no-context-files', '--model', 'example/example-coder', '--no-session'],
                    f'{work}/home/projects/my-app', env, cols, rows)


def shot(term, name):
    width, height, page = term.page()
    html_path = pathlib.Path(tempfile.gettempdir(), f'{name}.html')
    html_path.write_text(page)
    target = out / f'{name}.png'
    subprocess.run([chromium, '--headless=new', '--no-sandbox', '--hide-scrollbars', '--disable-gpu',
                    f'--screenshot={target}', f'--window-size={width},{height}',
                    '--force-device-scale-factor=2', f'file://{html_path}'], capture_output=True, check=True)
    print('wrote', target)


def ask(term, text):
    term.pump(2.5)
    term.type(text)
    term.key(b'\r', 0.5)
    term.wait_for('tok/s', 40)
    term.pump(1.5)


def click_on(term, needle):
    spot = term.find(needle)
    if not spot:
        raise SystemExit(f'cannot find {needle!r} on the screen:\n{term.text()}')
    term.click(spot[0], spot[1])


# Every picture comes from a fresh session, so nothing from an earlier screen is left behind.
def scene(name, action=None, cols=130, rows=34):
    term = start(cols, rows)
    try:
        ask(term, 'Add validation to the login form and cover it with tests')
        if action:
            action(term)
        shot(term, name)
    finally:
        term.close()


def command(text):
    def run(term):
        term.type(text)
        term.key(b'\r', 1.2)
    return run


def changed_files(term):
    click_on(term, ICON['changed'])


def diff(term):
    click_on(term, ICON['changed'])
    term.key(b'\r', 1.0)


def model_picker(term):
    click_on(term, ICON['robot'])


only = sys.argv[1:] or None
scenes = {
    'footer-wide': (None, 130, 30),
    'footer-narrow': (None, 66, 30),
    'explain-cache': (command('/dock-info cache'), 130, 34),
    'explain-limits': (command('/dock-info quota'), 130, 34),
    'explain-cost': (command('/dock-info cost'), 130, 34),
    'settings': (command('/dock-settings'), 130, 34),
    'changed-files': (changed_files, 130, 34),
    'diff': (diff, 130, 34),
    'model-picker': (model_picker, 130, 34),
}
for name, (action, cols, rows) in scenes.items():
    if only is None or name in only:
        scene(name, action, cols, rows)
