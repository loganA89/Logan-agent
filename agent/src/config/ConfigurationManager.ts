import * as vscode from 'vscode';

export type PricingPlan = 'economy' | 'pro';

export interface ModelOverrides {
  light: string;
  medium: string;
  heavy: string;
}

export type SupportedProviderType =
  | 'openai'
  | 'anthropic'
  | 'gapgpt'
  | 'deepseek'
  | 'alibaba'
  | 'xai'
  | 'suno'
  | 'ollama'
  | 'openrouter'
  | 'perchance'
  | 'custom';

export interface TierProviderConfig {
  providerType: SupportedProviderType;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

/**
 * Singleton configuration manager bridging VS Code user settings to Logan Agent runtime modules.
 */
export class ConfigurationManager {
  private static instance: ConfigurationManager | undefined;

  private constructor() {}

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  private getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('logan');
  }

  public getApiKey(): string {
    return this.getConfig().get<string>('apiKey', '').trim();
  }

  public getBaseUrl(): string | undefined {
    const url = this.getConfig().get<string>('baseUrl', '').trim();
    return url !== '' ? url : undefined;
  }

  public getActivePlan(): PricingPlan {
    const plan = this.getConfig().get<string>('activePlan', 'economy');
    return plan === 'pro' ? 'pro' : 'economy';
  }

  public getModelOverrides(): ModelOverrides {
    const config = this.getConfig();
    return {
      light: config.get<string>('models.light', 'gemini-2.5-flash-lite').trim() || 'gemini-2.5-flash-lite',
      medium: config.get<string>('models.medium', 'gapgpt-qwen-3.6').trim() || 'gapgpt-qwen-3.6',
      heavy: config.get<string>('models.heavy', 'gapgpt-qwen-3.6-thinking').trim() || 'gapgpt-qwen-3.6-thinking',
    };
  }

  /**
   * Resolves default Base URL based on selected vendor provider type.
   */
  public resolveDefaultBaseUrl(providerType: SupportedProviderType, customBaseUrl?: string): string | undefined {
    if (customBaseUrl && customBaseUrl.trim() !== '') {
      return customBaseUrl.trim();
    }
    switch (providerType) {
      case 'deepseek':
        return 'https://api.deepseek.com/v1';
      case 'alibaba':
        return 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
      case 'xai':
        return 'https://api.x.ai/v1';
      case 'suno':
        return 'https://api.suno.ai/v1';
      case 'gapgpt':
        return 'https://api.gapgpt.app/v1';
      case 'ollama':
        return 'http://localhost:11434/v1';
      case 'openrouter':
        return 'https://openrouter.ai/api/v1';
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'anthropic':
        return 'https://api.anthropic.com';
      default:
        return undefined;
    }
  }

  /**
   * Retrieves independent multi-vendor provider configuration specifically assigned to a task tier.
   */
  public getTierConfig(tier: 'light' | 'medium' | 'heavy' | 'embedding' | 'image' | 'audio'): TierProviderConfig {
    const config = this.getConfig();
    const tierObj = config.get<Record<string, string>>(`tiers.${tier}`, {});
    const globalApiKey = this.getApiKey();
    const globalBaseUrl = this.getBaseUrl();
    const plan = this.getActivePlan();
    const legacyOverrides = this.getModelOverrides();

    const customProvider = tierObj.providerType || tierObj.provider as SupportedProviderType | undefined;
    const customApiKey = tierObj.apiKey && tierObj.apiKey.trim() !== '' ? tierObj.apiKey.trim() : globalApiKey;
    const customBaseUrl = tierObj.baseUrl && tierObj.baseUrl.trim() !== '' ? tierObj.baseUrl.trim() : globalBaseUrl;
    const customModel = tierObj.model && tierObj.model.trim() !== '' ? tierObj.model.trim() : undefined;

    if (customModel || customProvider) {
      const providerType = (customProvider || 'openai') as SupportedProviderType;
      return {
        providerType,
        apiKey: customApiKey,
        baseUrl: this.resolveDefaultBaseUrl(providerType, customBaseUrl),
        model: customModel || (tier === 'embedding' ? 'text-embedding-3-small' : tier === 'image' ? 'z-image-v1' : tier === 'audio' ? 'suno-v3.5' : legacyOverrides[tier as 'light' | 'medium' | 'heavy']),
      };
    }

    if (plan === 'economy') {
      switch (tier) {
        case 'light':
          return { providerType: 'gapgpt', apiKey: customApiKey, baseUrl: this.resolveDefaultBaseUrl('gapgpt', customBaseUrl), model: legacyOverrides.light };
        case 'medium':
          return { providerType: 'gapgpt', apiKey: customApiKey, baseUrl: this.resolveDefaultBaseUrl('gapgpt', customBaseUrl), model: legacyOverrides.medium };
        case 'heavy':
          return { providerType: 'deepseek', apiKey: customApiKey, baseUrl: this.resolveDefaultBaseUrl('deepseek', customBaseUrl), model: 'deepseek-reasoner' };
        case 'embedding':
          return { providerType: 'openai', apiKey: customApiKey, baseUrl: this.resolveDefaultBaseUrl('openai', customBaseUrl), model: 'text-embedding-3-small' };
        case 'image':
          return { providerType: 'openai', apiKey: customApiKey, baseUrl: this.resolveDefaultBaseUrl('openai', customBaseUrl), model: 'z-image-v1' };
        case 'audio':
          return { providerType: 'suno', apiKey: customApiKey, baseUrl: this.resolveDefaultBaseUrl('suno', customBaseUrl), model: 'suno-v3.5' };
      }
    }

    // Default Pro Plan
    switch (tier) {
      case 'light':
        return { providerType: 'anthropic', apiKey: customApiKey, baseUrl: this.resolveDefaultBaseUrl('anthropic', customBaseUrl), model: 'claude-3-5-haiku-20241022' };
      case 'medium':
        return { providerType: 'alibaba', apiKey: customApiKey, baseUrl: this.resolveDefaultBaseUrl('alibaba', customBaseUrl), model: 'qwen-coder-plus' };
      case 'heavy':
        return { providerType: 'deepseek', apiKey: customApiKey, baseUrl: this.resolveDefaultBaseUrl('deepseek', customBaseUrl), model: 'deepseek-reasoner' };
      case 'embedding':
        return { providerType: 'openai', apiKey: customApiKey, baseUrl: this.resolveDefaultBaseUrl('openai', customBaseUrl), model: 'text-embedding-3-small' };
      case 'image':
        return { providerType: 'openai', apiKey: customApiKey, baseUrl: this.resolveDefaultBaseUrl('openai', customBaseUrl), model: 'z-image-v1' };
      case 'audio':
        return { providerType: 'suno', apiKey: customApiKey, baseUrl: this.resolveDefaultBaseUrl('suno', customBaseUrl), model: 'suno-v3.5' };
    }
  }

  public async updateSetting(section: string, value: unknown, global: boolean = true): Promise<void> {
    await this.getConfig().update(section, value, global);
  }
}
