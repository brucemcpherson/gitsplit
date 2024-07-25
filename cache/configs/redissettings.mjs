// this could vary depending on platform
const redisPropMap = {
  set: 'set',
  get: 'get',
  del: 'del'
}
// we don't hash every property - just these for now
const redisHashProps = new Set([
  "set",
  "get",
  "exists",
  "expire",
  "ttl",
  "persist",
  "del",
]);

// configs specific to redis
export const redisSettings = {
  hashProps: redisHashProps,
  propMap: redisPropMap,
  gzip: true,
  gzipThreshold: 800
}

