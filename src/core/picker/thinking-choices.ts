import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { Choice } from './state.js';

export const LEVEL_TEXT: Readonly<Record<string, string>> = {
  off: 'No reasoning',
  minimal: 'Very brief reasoning (~1k tokens)',
  low: 'Light reasoning (~2k tokens)',
  medium: 'Moderate reasoning (~8k tokens)',
  high: 'Deep reasoning (~16k tokens)',
  xhigh: 'Extra-high reasoning (~32k tokens)',
  max: 'Maximum reasoning',
};
const ALL_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

type ThinkingLevel = Parameters<ExtensionAPI['setThinkingLevel']>[0];

export const asLevel = (value: string | undefined): ThinkingLevel | undefined =>
  ALL_LEVELS.find((level) => level === value);

export function supportedLevels(model: {
  reasoning: boolean;
  thinkingLevelMap?: Readonly<Record<string, unknown>> | undefined;
}): string[] {
  if (!model.reasoning) return [];
  return ALL_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    return level === 'xhigh' || level === 'max' ? mapped !== undefined : true;
  });
}

export interface ThinkingChoice extends Choice {
  level: string;
  description: string;
  current: boolean;
  isDefault: boolean;
}

export function thinkingChoices(
  levels: readonly string[],
  current: string | undefined,
  defaultLevel: string | undefined,
): ThinkingChoice[] {
  return levels.map((level) => ({
    id: level,
    search: `${level} ${LEVEL_TEXT[level] ?? ''}`,
    level,
    description: LEVEL_TEXT[level] ?? '',
    current: level === current,
    isDefault: level === defaultLevel,
  }));
}
