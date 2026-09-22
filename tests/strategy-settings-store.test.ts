import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { defaultStrategySettings } from '../lib/strategy-settings.ts';
import {
  readStoredStrategySettings,
  StrategySettingsConflictError,
  writeStoredStrategySettings,
} from '../lib/server/strategy-settings-store.ts';

void test('전략 설정은 revision으로 충돌을 막고 하나의 JSON 파일에 원자 저장한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stock-web-settings-'));
  const file = join(directory, 'strategy-settings.json');
  try {
    const initial = await readStoredStrategySettings(file);
    assert.equal(initial.initialized, false);
    const saved = await writeStoredStrategySettings(
      defaultStrategySettings,
      initial.revision,
      file,
    );
    assert.equal(saved.revision, 1);
    const disk = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    assert.equal(disk.revision, 1);
    await assert.rejects(
      writeStoredStrategySettings(defaultStrategySettings, 0, file),
      StrategySettingsConflictError,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
