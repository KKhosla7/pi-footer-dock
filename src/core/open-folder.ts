import { boundedText } from './validation.js';

export interface Launch {
  command: string;
  args: string[];
}
const PLACEHOLDER = '{path}';
const MAX_ARGS = 8;

const defaults = new Map<string, string>([
  ['darwin', 'open'],
  ['win32', 'explorer.exe'],
]);
export const defaultOpener = (platform: string): string => defaults.get(platform) ?? 'xdg-open';

export function launchFor(
  directory: string,
  openWith: readonly string[] | undefined,
  platform: string,
): Launch {
  const [command, ...rest] = openWith?.length ? openWith : [defaultOpener(platform)];
  const args = rest.some((arg) => arg.includes(PLACEHOLDER))
    ? rest.map((arg) => arg.split(PLACEHOLDER).join(directory))
    : [...rest, directory];
  return { command: command ?? defaultOpener(platform), args };
}

export function parseOpenWith(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ARGS)
    throw new Error(`openWith must be a list of 1 to ${MAX_ARGS} arguments`);
  const args = value.map((arg) => boundedText(arg, 256));
  if (args[0] === '') throw new Error('openWith needs a program as its first argument');
  return args;
}

export function splitCommand(text: string): string[] {
  return text.split(/\s+/u).filter((part) => part.length > 0);
}
