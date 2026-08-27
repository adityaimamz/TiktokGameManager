export { createCommentReader, isBlocked, stripUrls } from './reader.js'
export type { CommentReader, SpeechRequest } from './reader.js'
export {
  DEFAULT_READER,
  READER_BLOCKED_WORDS_MAX,
  READER_MAX_CHARS_RANGE,
  READER_RATE_RANGE,
  READER_VOLUME_RANGE,
  READER_WORD_MAX_LENGTH,
} from './settings.js'
export type { ReaderSettings } from './settings.js'
