import type { Choice } from './state.js';

/** The part of a model the picker needs. */
export interface ModelEntry {
  provider: string;
  id: string;
  name: string;
}
export interface ModelChoice extends Choice {
  provider: string;
  modelId: string;
  name: string;
  current: boolean;
  isDefault: boolean;
}
export const modelKey = (model: Pick<ModelEntry, 'provider' | 'id'>): string =>
  `${model.provider}/${model.id}`;

/**
 * What `/model` lists, in its order: the current model first, the default second, then by provider.
 * Searching matches the id, the provider and the name, and the word `default` finds the default.
 */
export function modelChoices(
  models: readonly ModelEntry[],
  current: Pick<ModelEntry, 'provider' | 'id'> | undefined,
  defaults: { provider?: string | undefined; model?: string | undefined } = {},
): ModelChoice[] {
  const choices = models.map((model) => {
    const isCurrent = current !== undefined && modelKey(current) === modelKey(model);
    const isDefault = defaults.provider === model.provider && defaults.model === model.id;
    return {
      id: modelKey(model),
      search: `${model.id} ${model.provider} ${model.name}${isDefault ? ' default' : ''}`,
      provider: model.provider,
      modelId: model.id,
      name: model.name,
      current: isCurrent,
      isDefault,
    };
  });
  const rank = (choice: ModelChoice): number => (choice.current ? 0 : choice.isDefault ? 1 : 2);
  return choices.sort(
    (a, b) => rank(a) - rank(b) || (rank(a) === 2 ? a.provider.localeCompare(b.provider) : 0),
  );
}
