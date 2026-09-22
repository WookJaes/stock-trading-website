import { join } from 'node:path';

export function strategyDataDirectory() {
  return process.env.STRATEGY_DATA_DIR?.trim() || join(process.cwd(), '.data');
}

export function strategyDataPath(fileName: string) {
  return join(strategyDataDirectory(), fileName);
}
