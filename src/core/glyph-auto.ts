export function autoGlyphs(env: Readonly<Record<string, string | undefined>>): 'nerd' | 'portable' {
  if (env.TERM === 'linux' || env.TERM === 'dumb') return 'portable';
  const locale = [env.LC_ALL, env.LC_CTYPE, env.LANG].find((value) => value);
  const charset = locale?.split('.')[1]?.split('@')[0];
  return charset !== undefined && !/^utf-?8$/iu.test(charset) ? 'portable' : 'nerd';
}
