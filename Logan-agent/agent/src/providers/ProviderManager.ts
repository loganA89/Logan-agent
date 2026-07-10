import { AIProvider, ProviderConfig } from './types';
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { PerchanceProvider } from './PerchanceProvider';
import { ConfigurationManager } from '../config';

export type TaskTier = 'light' | 'medium' | 'heavy' | 'embedding' | 'image' | 'audio';

/**
 * Manages provider instantiations and model selection routing based on user multi-vendor settings
 * and task complexity tiers.
 */
export class ProviderManager {
  private static instance: ProviderManager | undefined;
  private activeProviders: Map<string, AIProvider> = new Map();

  private constructor() {}

  public static getInstance(): ProviderManager {
    if (!ProviderManager.instance) {
      ProviderManager.instance = new ProviderManager();
    }
    return ProviderManager.instance;
  }

  /**
   * Resolves and returns the appropriate AI provider adapter for the requested tier.
   *
   * @param tier The task complexity tier.
   */
  public getProviderForTier(tier: TaskTier): { provider: AIProvider; model: string } {
    const tierConfig = ConfigurationManager.getInstance().getTierConfig(tier);
    const cacheKey = `${tierConfig.providerType}|${tierConfig.baseUrl || 'default'}|${tierConfig.model}`;

    let provider = this.activeProviders.get(cacheKey);
    if (!provider) {
      const providerConfig: ProviderConfig = {
        apiKey: tierConfig.apiKey || process.env.LOGAN_API_KEY || '',
        baseUrl: tierConfig.baseUrl,
        defaultModel: tierConfig.model,
      };

      if (tierConfig.providerType === 'perchance') {
        provider = new PerchanceProvider(providerConfig);
      } else if (tierConfig.providerType === 'anthropic' || tierConfig.model.toLowerCase().includes('claude')) {
        provider = new AnthropicProvider(providerConfig);
      } else {
        provider = new OpenAICompatibleProvider(providerConfig);
      }

      this.activeProviders.set(cacheKey, provider);
    }

    return { provider, model: tierConfig.model };
  }

  /**
   * Clears cached provider adapter instances. Useful when user updates configuration.
   */
  public clearCache(): void {
    this.activeProviders.clear();
  }
}
