import {redisSettings} from './redissettings.mjs'
import {platformSettings} from './platformsettings.mjs'

export const cacheSettings = {

  redis: {
    expiration: 28 * 24 * 60 * 60,
    prefix: 'prod',
    maxChunk: Infinity,
    ...redisSettings,
    ...platformSettings
  },

  test: {
    expiration: 2 * 60 * 60,
    prefix: 'test',
    maxChunk: 999,
    ...redisSettings,
    ...platformSettings
  }

}

