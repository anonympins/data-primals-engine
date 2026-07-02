import { Config } from "../../config.js";
import {assistantConfig} from "../../constants.js";
import { Logger } from "../../gameObject.js";
import { getCollectionForUser } from "../mongodb.js";
import { providers } from "./constants.js";
import process from "node:process";

const logger = new Logger("AssistantProviders");

/**
 * Finds the first available AI provider based on configured API keys for a given user.
 * It checks the user's specific environment variables first, then falls back to the machine's process.env.
 * @param {object} user - The user object.
 * @param {string|null} [preferredProvider=null] - If specified, will only check for this provider.
 * @returns {Promise<{provider: string, apiKey: string}|null>} An object with the provider name and API key, or null if none are found.
 */
export async function findFirstAvailableProvider(user, preferredProvider = null) {
    const envCollection = await getCollectionForUser(user);
    const providerNames = preferredProvider ? [preferredProvider] : Object.keys(providers);

    for (const pName of providerNames) {
        const providerInfo = providers[pName];
        if (!providerInfo) continue;

        const envKeyName = providerInfo.key;
        const userEnvVar = await envCollection.findOne({ _model: 'env', name: envKeyName, _user: user.username });
        const key = userEnvVar?.value || process.env[envKeyName];

        if (key) {
            return { provider: pName, apiKey: key };
        }
    }
    return null;
}

export const getAIProvider = async (aiProvider, aiModel, apiKey, isJsonMode = false) => {
    const maxTokens = Config.Get('assistant.maxTokens', assistantConfig.maxTokens);
    const modelOptions = {
        apiKey,
        model: aiModel,
        temperature: 0.7,
        maxTokens
    };

    if (isJsonMode) {
        modelOptions.response_format = { type: "json_object" };
    }

    try {
        switch (aiProvider) {
            case 'OpenAI': {
                const { ChatOpenAI } = await import("@langchain/openai");
                return new ChatOpenAI(modelOptions);
            }
            case 'Google': {
                const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");
                return new ChatGoogleGenerativeAI(modelOptions);
            }
            case 'DeepSeek': {
                const { ChatDeepSeek } = await import("@langchain/deepseek");
                return new ChatDeepSeek(modelOptions);
            }
            case 'Anthropic': {
                const { ChatAnthropic } = await import("@langchain/anthropic");
                return new ChatAnthropic(modelOptions);
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