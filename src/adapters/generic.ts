import type {
  HarnessAdapter,
  AdapterEnv,
  SkillRoot,
  CustomHarnessConfig,
  SkillLayout
} from '../core/types.js';

export class GenericHarnessAdapter implements HarnessAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly layout: SkillLayout;
  private readonly configuredRoots: SkillRoot[];

  constructor(config: CustomHarnessConfig, roots: SkillRoot[]) {
    this.id = config.id;
    this.displayName = config.id;
    this.layout = config.layout;
    this.configuredRoots = roots;
  }

  async detect(_env: AdapterEnv): Promise<boolean> {
    return true;
  }

  async roots(_env: AdapterEnv): Promise<SkillRoot[]> {
    return this.configuredRoots;
  }
}
