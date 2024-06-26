import { DATABASE, ENV, CONST } from './env.js'
import logger from './logger.js'

export const USER_CONFIG = {
  SYSTEM_INIT_MESSAGE: ENV.SYSTEM_INIT_MESSAGE,
  OPENAI_API_EXTRA_PARAMS: {},
}

export const USER_DEFINE = {
  ROLE: {},
}

export const CURRENT_CHAT_CONTEXT = {
  chat_id: null,
  reply_to_message_id: null,
  parse_mode: 'Markdown',
}

export const SHARE_CONTEXT = {
  currentBotId: null,
  currentBotToken: null,
  currentBotName: null,
  chatHistoryKey: null, // history:chat_id:bot_id:(from_id)
  configStoreKey: null, // user_config:chat_id:bot_id:(from_id)
  userStoreKey: null, // user:from_id:bot_id
  groupAdminKey: null, // group_admin:group_id
  usageKey: null, // usage:bot_id
  chatType: null,
  chatId: null,
  speakerId: null,
}

function initChatContext(chatId, replyToMessageId) {
  CURRENT_CHAT_CONTEXT.chat_id = chatId
  CURRENT_CHAT_CONTEXT.reply_to_message_id = replyToMessageId
  if (replyToMessageId) {
    CURRENT_CHAT_CONTEXT.allow_sending_without_reply = true
  }
}

async function initUserConfig(storeKey) {
  try {
    const userConfig = JSON.parse(await DATABASE.get(storeKey))
    for (const k in userConfig) {
      if (k === 'USER_DEFINE' && typeof USER_DEFINE === typeof userConfig[k]) {
        initUserDefine(userConfig[k])
      } else {
        if (Object.hasOwn(USER_CONFIG, k) && typeof USER_CONFIG[k] === typeof userConfig[k]) {
          USER_CONFIG[k] = userConfig[k]
        }
      }
    }
  } catch (e) {
    logger('error', e)
  }
}

function initUserDefine(userDefine) {
  for (const k in userDefine) {
    if (Object.hasOwn(USER_DEFINE, k) && typeof USER_DEFINE[k] === typeof userDefine[k]) {
      USER_DEFINE[k] = userDefine[k]
    }
  }
}

const regexOfTokenPath = /^\/telegram\/(bot)?(\d+:[A-Za-z0-9_-]+)\/webhook/
export function initTelegramContext(request) {
  const { pathname } = new URL(request.url)
  const match = pathname.match(regexOfTokenPath)
  if (!match) throw new Error('Token not found in the request path')

  const token = match[2]
  const tgIndex = ENV.TELEGRAM_AVAILABLE_TOKENS.indexOf(token)
  if (tgIndex === -1) throw new Error('The bot token is not allowed')

  SHARE_CONTEXT.currentBotToken = token
  SHARE_CONTEXT.currentBotId = token.split(':')[0]
  if (ENV.TELEGRAM_BOT_NAME.length > tgIndex) {
    SHARE_CONTEXT.currentBotName = ENV.TELEGRAM_BOT_NAME[tgIndex]
  }
}

async function initShareContext(message) {
  SHARE_CONTEXT.usageKey = `usage:${SHARE_CONTEXT.currentBotId}`
  const id = message?.chat?.id
  if (!id) throw new Error('Chat ID not found')

  const userId = message?.from?.id
  if (!userId) throw new Error('User ID not found')

  const botId = SHARE_CONTEXT.currentBotId
  let historyKey = `history:${id}`
  let configStoreKey = `user_config:${id}`
  let userStoreKey = `user:${userId}`
  let groupAdminKey = null

  if (botId) {
    historyKey += `:${botId}`
    configStoreKey += `:${botId}`
    userStoreKey += `:${botId}`
  }

  // Mark group messages
  if (CONST.GROUP_TYPES.includes(message.chat?.type)) {
    if (!ENV.GROUP_CHAT_BOT_SHARE_MODE && message.from.id) {
      historyKey += `:${message.from.id}`
      configStoreKey += `:${message.from.id}`
    }
    groupAdminKey = `group_admin:${id}`
  }

  SHARE_CONTEXT.chatHistoryKey = historyKey
  SHARE_CONTEXT.configStoreKey = configStoreKey
  SHARE_CONTEXT.userStoreKey = userStoreKey
  SHARE_CONTEXT.groupAdminKey = groupAdminKey

  SHARE_CONTEXT.chatType = message.chat?.type
  SHARE_CONTEXT.chatId = message.chat.id
  SHARE_CONTEXT.speakerId = message.from.id || message.chat.id
}

export async function initContext(message) {
  const chatId = message?.chat?.id
  const replyId = CONST.GROUP_TYPES.includes(message.chat?.type) ? message.message_id : null
  initChatContext(chatId, replyId)
  await initShareContext(message)
  await initUserConfig(SHARE_CONTEXT.configStoreKey)
}
