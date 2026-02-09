/**
 * @typedef {'system'|'user'|'assistant'} LLMRole
 */

/**
 * @typedef {{ role: LLMRole; content: string }} LLMMessage
 */

/**
 * @typedef {Object} LLMRequest
 * @property {LLMMessage[]} messages
 * @property {number=} maxTokens
 * @property {number=} temperature
 * @property {number=} topP
 * @property {string[]=} stop
 * @property {string=} requestId
 */

/**
 * @typedef {'stop'|'length'|'error'|'cancelled'} LLMFinishReason
 */

/**
 * @typedef {Object} LLMUsage
 * @property {number} promptTokens
 * @property {number} completionTokens
 * @property {number} totalTokens
 */

/**
 * @typedef {Object} LLMTiming
 * @property {number} startMs
 * @property {number=} ttftMs
 * @property {number} endMs
 */

/**
 * @typedef {Object} LLMResponse
 * @property {string} text
 * @property {LLMFinishReason} finishReason
 * @property {LLMUsage=} usage
 * @property {LLMTiming=} timing
 * @property {string=} requestId
 */

/**
 * @typedef {Object} StreamCallbacks
 * @property {(token: string) => void} onToken
 * @property {(response: LLMResponse) => void=} onComplete
 * @property {(error: Error) => void=} onError
 */

/**
 * @typedef {Object} AbortableStream
 * @property {() => void} abort
 * @property {Promise<LLMResponse>} done
 */

/**
 * @typedef {Object} LLMProvider
 * @property {string} name
 * @property {(request: LLMRequest) => Promise<LLMResponse>} generateText
 * @property {(request: LLMRequest, callbacks: StreamCallbacks) => AbortableStream} streamText
 * @property {(text: string) => number=} estimateTokens
 */

export const LLM_ROLES = ['system', 'user', 'assistant'];
