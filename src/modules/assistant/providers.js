import { Config } from "../../config.js";
import { assistantConfig } from "../../constants.js";
import { Logger } from "../../gameObject.js";

const logger = new Logger("AssistantProviders");

export const getAIProvider = async (aiProvider, aiModel, apiKey) => {
    const maxTokens = Config.Get('assistant.maxTokens', assistantConfig.maxTokens);
    try {
        switch (aiProvider) {
            case 'OpenAI': {
                const { ChatOpenAI } = await import("@langchain/openai");
                return new ChatOpenAI({ apiKey, model: aiModel, temperature: 0.7, maxTokens });
            }
            case 'Google': {
                const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");
                return new ChatGoogleGenerativeAI({ apiKey, model: aiModel, temperature: 0.7, maxTokens });
            }
            case 'DeepSeek': {
                const { ChatDeepSeek } = await import("@langchain/deepseek");
                return new ChatDeepSeek({ apiKey, model: aiModel, temperature: 0.7, maxTokens });
            }
            case 'Anthropic': {
                const { ChatAnthropic } = await import("@langchain/anthropic");
                return new ChatAnthropic({ apiKey, model: aiModel, temperature: 0.7, maxTokens });
            }
            default:
                throw new Error(`Unsupported AI provider: ${aiProvider}`);
        }
    } catch (e) {
        if (e.code === 'ERR_MODULE_NOT_FOUND') {
            logger.error(`[Assistant] The package for the '${aiProvider}' provider is not installed. Please run 'npm install @langchain/${aiProvider.toLowerCase()}' to use this provider.`);
            throw new Error(`The AI provider '${aiProvider}' is not installed. Please ask the administrator to install the corresponding package.`);
        }
        logger.error(`[Assistant] Error initializing AI provider '${aiProvider}': ${e.message}`);
        throw e; // Re-throw other errors
    }
}