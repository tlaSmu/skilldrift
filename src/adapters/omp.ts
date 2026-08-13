import * as path from 'node:path';
import type {
  HarnessAdapter,
  AdapterEnv,
  SkillRoot,
  SkillLayout
} from '../core/types.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import {
  isDirectory,
  deduplicateRoots,
  resolveEnvironmentDir
} from './shared.js';

export class OmpAdapter implements HarnessAdapter {
  readonly id = 'omp';
  readonly displayName = 'OMP';
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

    const agentDir = resolveEnvironmentDir(
      env.environment.PI_CODING_AGENT_DIR,
      path.join(homeResolved, '.omp', 'agent'),
      homeResolved
    );

    // 1. Native OMP user skills: <agentDir>/skills (precedence 100)
    const nativeSkillsPath = path.join(agentDir, 'skills');
    if (await isDirectory(nativeSkillsPath)) {
      discoveredRoots.push({
        path: nativeSkillsPath,
        scope: 'user',
        precedence: 100,
        readonly: false
      });
    }

    // 2. Non-project Claude roots remapped
    const claudeAdapter = new ClaudeCodeAdapter();
    const claudeRoots = await claudeAdapter.roots(env);
    for (const cRoot of claudeRoots) {
      if (cRoot.scope === 'project') {
        continue;
      }
      if (cRoot.scope === 'user') {
        discoveredRoots.push({
          path: cRoot.path,
          scope: 'user',
          precedence: 80,
          readonly: false
        });
      } else {
        discoveredRoots.push({
          path: cRoot.path,
          scope: cRoot.scope,
          precedence: 70,
          readonly: true
        });
      }
    }

    // 3. ~/.agent/skills (precedence 70)
    const agentSkillsPath = path.join(homeResolved, '.agent', 'skills');
    if (await isDirectory(agentSkillsPath)) {
      discoveredRoots.push({
        path: agentSkillsPath,
        scope: 'user',
        precedence: 70,
        readonly: false
      });
    }

    // 4. ~/.agents/skills (precedence 70)
    const agentsSkillsPath = path.join(homeResolved, '.agents', 'skills');
    if (await isDirectory(agentsSkillsPath)) {
      discoveredRoots.push({
        path: agentsSkillsPath,
        scope: 'user',
        precedence: 70,
        readonly: false
      });
    }

    // 5. ~/.codex/skills (precedence 70)
    const codexSkillsPath = path.join(homeResolved, '.codex', 'skills');
    if (await isDirectory(codexSkillsPath)) {
      discoveredRoots.push({
        path: codexSkillsPath,
        scope: 'user',
        precedence: 70,
        readonly: false
      });
    }

    // 6. Managed skills: <agentDir>/managed-skills (precedence 5)
    const managedSkillsPath = path.join(agentDir, 'managed-skills');
    if (await isDirectory(managedSkillsPath)) {
      discoveredRoots.push({
        path: managedSkillsPath,
        scope: 'user',
        precedence: 5,
        readonly: false
      });
    }

    return deduplicateRoots(discoveredRoots);
  }
}
