
export const providers = {
    "OpenAI" : {
        key:"OPENAI_API_KEY",
        defaultModel: 'gpt-4o-mini',
        generationModel: 'gpt-4o-mini' // Excellent for JSON generation
    },
    "Google": {
        key:"GOOGLE_API_KEY",
        defaultModel: 'gemini-1.5-flash',
        generationModel: 'gemini-1.5-flash'
    },
    "DeepSeek": {
        key: "DEEPSEEK_API_KEY",
        defaultModel: 'deepseek-chat',
        // As per the error message, 'deepseek-v2-coder' is a good candidate for code/JSON generation
        generationModel: 'deepseek-coder'
    },
    "Anthropic": {
        key:"ANTHROPIC_API_KEY",
        defaultModel: 'claude-3-haiku-20240307',
        generationModel: 'claude-3-haiku-20240307' // Haiku is fast and good with JSON
    }
};