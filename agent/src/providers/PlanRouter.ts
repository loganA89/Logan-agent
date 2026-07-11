import { ConfigurationManager } from '../config';
import { AIProvider, ProviderConfig } from './types';
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { PerchanceProvider } from './PerchanceProvider';
import { LocalEmbeddingProvider } from './LocalEmbeddingProvider';

export type TaskComplexity = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'EMBEDDING' | 'IMAGE' | 'AUDIO';

export interface RoutedModelSelection {
  provider: AIProvider;
  model: string;
  isCachedProvider: boolean;
}

/**
 * Intelligent task router evaluating task complexity against active user plan selection
 * and custom multi-vendor tier provider configurations.
 */
export class PlanRouter {
  private static instance: PlanRouter | undefined;
  private activeProviders: Map<string, AIProvider> = new Map();

  private constructor() {}

  public static getInstance(): PlanRouter {
    if (!PlanRouter.instance) {
      PlanRouter.instance = new PlanRouter();
    }
    return PlanRouter.instance;
  }

  private mapComplexityToTier(complexity: TaskComplexity): 'light' | 'medium' | 'heavy' | 'embedding' | 'image' | 'audio' {
    switch (complexity) {
      case 'LIGHT':
        return 'light';
      case 'MEDIUM':
        return 'medium';
      case 'HEAVY':
        return 'heavy';
      case 'EMBEDDING':
        return 'embedding';
      case 'IMAGE':
        return 'image';
      case 'AUDIO':
        return 'audio';
    }
  }

  /**
   * Routes a task to the appropriate AI provider instance and model.
   *
   * @param complexity The classification complexity level of the task.
   */
  public routeTask(complexity: TaskComplexity): RoutedModelSelection {
    const tierKey = this.mapComplexityToTier(complexity);
    const tierConfig = ConfigurationManager.getInstance().getTierConfig(tierKey);

    const cacheKey = `${tierConfig.providerType}|${tierConfig.baseUrl || 'default'}|${tierConfig.model}`;

    // Debug logging for provider selection
    console.log(`[PlanRouter] Routing task complexity: ${complexity} -> Tier: ${tierKey}`);
    console.log(`[PlanRouter] Selected Config: Provider=${tierConfig.providerType}, Model=${tierConfig.model}, BaseUrl=${tierConfig.baseUrl || 'default'}, HasApiKey=${!!tierConfig.apiKey}`);

    let provider = this.activeProviders.get(cacheKey);
    if (!provider) {
      const providerConfig: ProviderConfig = {
        apiKey: tierConfig.apiKey || process.env.LOGAN_API_KEY || '',
        baseUrl: tierConfig.baseUrl,
        defaultModel: tierConfig.model,
      };

      if (tierConfig.providerType === 'local' || (complexity === 'EMBEDDING' && !providerConfig.apiKey)) {
        const modelName = tierConfig.model || 'Xenova/all-MiniLM-L6-v2';
        provider = new LocalEmbeddingProvider(modelName);
      } else if (tierConfig.providerType === 'perchance') {
        provider = new PerchanceProvider(providerConfig);
      } else if (tierConfig.providerType === 'anthropic' || tierConfig.model.toLowerCase().includes('claude')) {
        provider = new AnthropicProvider(providerConfig);
      } else {
        provider = new OpenAICompatibleProvider(providerConfig);
      }
      this.activeProviders.set(cacheKey, provider);
    }

    return {
      provider,
      model: tierConfig.model,
      isCachedProvider: tierConfig.providerType === 'anthropic' || tierConfig.model.toLowerCase().includes('claude'),
    };
  }

  /**
   * Clears cached provider instances. Should be called when configuration changes.
   */
  public resetRouterCache(): void {
    this.activeProviders.clear();
  }
}
