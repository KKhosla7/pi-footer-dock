"""Runs a program in a pseudo-terminal, keeps the screen with pyte, and draws it as a picture."""
import fcntl, os, pty, select, struct, subprocess, termios, time, html
import pyte

# A dark palette for the 16 ANSI colours (the programme may use truecolour instead).
ANSI = {
    'black': '#1e2127', 'red': '#e06c75', 'green': '#98c379', 'brown': '#e5c07b',
    'blue': '#61afef', 'magenta': '#c678dd', 'cyan': '#56b6c2', 'white': '#abb2bf',
    'brightblack': '#5c6370', 'brightred': '#e06c75', 'brightgreen': '#98c379',
    'brightbrown': '#e5c07b', 'brightyellow': '#e5c07b', 'brightblue': '#61afef',
    'brightmagenta': '#c678dd', 'brightcyan': '#56b6c2', 'brightwhite': '#ffffff',
}
BACKGROUND, FOREGROUND = '#1b1e24', '#d7dae0'
CELL_W, CELL_H, FONT = 9, 20, 15


class Terminal:
    def __init__(self, argv, cwd, env, cols=140, rows=38):
        self.cols, self.rows = cols, rows
        self.screen = pyte.Screen(cols, rows)
        self.stream = pyte.ByteStream(self.screen)
        pid, fd = pty.fork()
        if pid == 0:
            os.chdir(cwd)
            os.execvpe(argv[0], argv, env)
        self.pid, self.fd = pid, fd
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))

    def pump(self, seconds):
        end = time.time() + seconds
        while time.time() < end:
            ready, _, _ = select.select([self.fd], [], [], 0.05)
            if not ready:
                continue
            try:
                data = os.read(self.fd, 65536)
            except OSError:
                return
            if not data:
                return
            self.answer_queries(data)
            self.stream.feed(data)

    def answer_queries(self, data):
        # Terminal capability questions some programmes ask at start-up.
        if b'\x1b[c' in data or b'\x1b[0c' in data:
            os.write(self.fd, b'\x1b[?62;c')
        if b'\x1b[6n' in data:
            os.write(self.fd, b'\x1b[1;1R')

    def text(self):
        return '\n'.join(self.screen.display)

    def wait_for(self, needle, timeout=30):
        end = time.time() + timeout
        while time.time() < end:
            self.pump(0.2)
            if needle in self.text():
                return True
        return False

    def type(self, text, delay=0.01):
        for ch in text:
            os.write(self.fd, ch.encode())
            self.pump(delay)

    def key(self, data, wait=0.4):
        os.write(self.fd, data)
        self.pump(wait)

    def click(self, col, row, wait=0.6):
        """A left click at a 1-based cell, as an SGR mouse report."""
        for final in ('M', 'm'):
            os.write(self.fd, f'\x1b[<0;{col};{row}{final}'.encode())
            self.pump(0.05)
        self.pump(wait)

    def find(self, needle):
        for y, line in enumerate(self.screen.display):
            x = line.find(needle)
            if x >= 0:
                return x + 1, y + 1
        return None

    def resize(self, cols, rows):
        self.cols, self.rows = cols, rows
        self.screen.resize(rows, cols)
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
        os.kill(self.pid, 28)  # SIGWINCH
        self.pump(1.2)

    def close(self):
        try:
            os.kill(self.pid, 15)
        except OSError:
            pass

    def page(self, title=None):
        def colour(value, default):
            if value == 'default':
                return default
            if value in ANSI:
                return ANSI[value]
            return '#' + value if len(value) == 6 else default
        rows = []
        for y in range(self.rows):
            cells = []
            for x in range(self.cols):
                c = self.screen.buffer[y][x]
                fg, bg = colour(c.fg, FOREGROUND), colour(c.bg, BACKGROUND)
                if c.reverse:
                    fg, bg = bg, fg
                style = f'color:{fg};background:{bg};'
                if c.bold:
                    style += 'font-weight:700;'
                if c.italics:
                    style += 'font-style:italic;'
                if c.underscore:
                    style += 'text-decoration:underline;'
                cells.append(f'<i style="{style}">{html.escape(c.data) if c.data.strip() else "&nbsp;"}</i>')
            rows.append('<div>' + ''.join(cells) + '</div>')
        width, height = self.cols * CELL_W + 40, self.rows * CELL_H + 40
        return width, height, f"""<!doctype html><meta charset="utf-8"><style>
html,body{{margin:0;background:{BACKGROUND}}}
body{{padding:20px;width:{self.cols * CELL_W}px;font:{FONT}px/{CELL_H}px 'JetBrainsMono Nerd Font Mono','JetBrainsMono Nerd Font','Hack Nerd Font Mono',monospace;color:{FOREGROUND}}}
div{{height:{CELL_H}px;white-space:pre;overflow:hidden}}
i{{font-style:normal;display:inline-block;width:{CELL_W}px;height:{CELL_H}px;overflow:visible;vertical-align:top}}
</style><body>{''.join(rows)}</body>"""
