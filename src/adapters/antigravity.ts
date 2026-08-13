import * as path from 'node:path';
import type {
  HarnessAdapter,
  AdapterEnv,
  SkillRoot,
  SkillLayout
} from '../core/types.js';
import {
  isDirectory,
  deduplicateRoots
} from './shared.js';

export class AntigravityAdapter implements HarnessAdapter {
  readonly id = 'antigravity';
  readonly displayName = 'Antigravity';
  readonly layout: SkillLayout = 'dir-skill-md';

  async detect(env: AdapterEnv): Promise<boolean> {
    const noopEnv: AdapterEnv = {
      ...env,
      warn() {}
    };
    const rootList = await this.roots(noopEnv);
    return rootList.length > 0;
  }

  async roots(env: AdapterEnv): Promise<SkillRoot[]> {
    const discoveredRoots: SkillRoot[] = [];
    const homeResolved = path.resolve(env.homeDir);

    // 1. User root: <home>/.gemini/config/skills (precedence 20)
    const userSkillsPath = path.join(homeResolved, '.gemini', 'config', 'skills');
    if (await isDirectory(userSkillsPath)) {
      discoveredRoots.push({
        path: userSkillsPath,
        scope: 'user',
        precedence: 20,
        readonly: false
      });
    }

    // 2. System/bundled root: <home>/.gemini/antigravity/builtin/skills (precedence 10)
    const builtinSkillsPath = path.join(homeResolved, '.gemini', 'antigravity', 'builtin', 'skills');
    if (await isDirectory(builtinSkillsPath)) {
      discoveredRoots.push({
        path: builtinSkillsPath,
        scope: 'system',
        precedence: 10,
        readonly: true
      });
    }

    return deduplicateRoots(discoveredRoots);
  }
}
