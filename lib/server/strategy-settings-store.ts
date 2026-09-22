import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  defaultStrategySettings,
  parseStrategySettings,
  serializeStrategySettings,
  type StrategySettings,
} from '../strategy-settings.ts';
import { strategyDataPath } from './data-path.ts';

export type StoredStrategySettings = {
  revision: number;
  settings: StrategySettings;
  initialized: boolean;
};

type StrategySettingsFile = {
  revision: number;
  settings: StrategySettings;
};

export class StrategySettingsConflictError extends Error {
  readonly currentRevision: number;

  constructor(currentRevision: number) {
    super('STRATEGY_SETTINGS_CONFLICT');
    this.currentRevision = currentRevision;
  }
}

let writeQueue = Promise.resolve();

function cloneDefaults() {
  return parseStrategySettings(serializeStrategySettings(defaultStrategySettings))!;
}

function parseFile(text: string): StrategySettingsFile | null {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0)
      return null;
    const settings = parseStrategySettings(JSON.stringify(value.settings));
    return settings ? { revision: Number(value.revision), settings } : null;
  } catch {
    return null;
  }
}

export async function readStoredStrategySettings(
  filePath = strategyDataPath('strategy-settings.json'),
): Promise<StoredStrategySettings> {
  try {
    const parsed = parseFile(await readFile(filePath, 'utf8'));
    if (!parsed) throw new Error('INVALID_STRATEGY_SETTINGS_FILE');
    return { ...parsed, initialized: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { revision: 0, settings: cloneDefaults(), initialized: false };
    }
    throw error;
  }
}

export async function writeStoredStrategySettings(
  settings: StrategySettings,
  expectedRevision: number,
  filePath = strategyDataPath('strategy-settings.json'),
) {
  const parsed = parseStrategySettings(serializeStrategySettings(settings));
  if (!parsed) throw new Error('INVALID_STRATEGY_SETTINGS');

  let result: StoredStrategySettings | undefined;
  let failure: unknown;
  writeQueue = writeQueue.then(async () => {
    try {
      const current = await readStoredStrategySettings(filePath);
      if (current.revision !== expectedRevision)
        throw new StrategySettingsConflictError(current.revision);
      const next: StrategySettingsFile = {
        revision: current.revision + 1,
        settings: parsed,
      };
      await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
      const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await rename(temporaryPath, filePath);
      result = { ...next, initialized: true };
    } catch (error) {
      failure = error;
    }
  });
  await writeQueue;
  if (failure) throw failure;
  return result!;
}
