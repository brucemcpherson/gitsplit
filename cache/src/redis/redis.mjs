import Redis from "ioredis";
import { proxyUtils } from "../utils/proxyutils.mjs";
import { cacheSettings } from "../../configs/cachesettings.mjs";

/**
 * Proxy for Redis client
 * Intercepts selected calls
 * - those with key as the 1st arg will accept an object as the key and make a digest
 * - set data is turned into an object, stringified, and compressed (if it's worth it)
 * - a default expiry is applied
 * - get data will unpack back to its original state and return
 * {value: original data, timestamp: when it was written, hashedKey: the digest for the key}
 * - if the compressed data is bigger a maximum,spread the data over multiple cache items
 * - delete handles removing those extra records too
 * - long data that spreads over multiple items are not supported (because results are unknown till exec() happens)
 */

/**
 *
 * @param {object} p
 * @param {object} redisConfigs settings to support various database aliases
 * @param {string} database name to index into redisConfigs object
 * @param {boolean} useProxy whether to create a proxy or a vanilla redis connection
 * @param {string} extraConfig specific to the platform
 * @returns {cacheproxy}
 */

const getcProxy = async ({
  cConfigs: redisConfigs,
  database,
  useProxy = true,
  testConnectivity = true,
  extraConfig = "redis",
}) => {
  // we can have different configs for databases/or partitions of the same database
  // i get my parameters elsewhere from secret manager via env
  const config = {
    ...redisConfigs.databases[database],
    ...cacheSettings[extraConfig],
  };

  // to support multiple platforms/harmonize the prop names
  const { propMap, hashProps, prefix } = config;

  // so this is the vanilla client
  const client = locals.getClient({ config });

  // if we dont need a proxy, just return the vanilla client
  if (!useProxy)
    return testConnectivity ? testConnect({ client, useProxy }) : client;

  // just some local closures to fiddle with keys and data
  const makeKey = (key) => config.makeKey({ prefix, key });
  const payPack = async (value) => proxyUtils.payPack({ config, value });
  const delPack = async (hashedKey, deleter, getter) =>
    proxyUtils.delPack({ hashedKey, getter, deleter, config });
  const payUnpack = async (value) => proxyUtils.payUnpack({ value, config });
  const setPack = async (hashedKey, value, setter) =>
    proxyUtils.setPack({ hashedKey, value, config, setter });
  const unsetPack = async (hashedKey, getter) =>
    proxyUtils.unsetPack({ hashedKey, config, getter });
  const { fixupArgs } = locals;

  // these function can be exported as part of the proxy so more complex redis commands are avail
  const proxyExports = {
    proxyKey: makeKey,
    proxyUnpack: payUnpack,
    proxyPack: payPack,
    proxySetPack: setPack,
    proxyUnsetPack: unsetPack,
    fetchConfig: () => config,
  };

  // generates a proxy with an apply handler
  const makeApplyHandler = (handler, target, prop) => {
    return new Proxy(target[prop], {
      apply(func, thisArgs, args) {
        return handler(target, prop, func, thisArgs, args);
      },
    });
  };

  /**
   * A client proxy handler needs to
   * - handle the digesting of keys and packing/unpacking data for set/get etc...
   * - return a proxy for a multi()
   */
  const clientApplyHandler = async (target, prop, func, thisArg, args) => {

    // if there are no args, we'll just apply the function as is
    if (!args.length) return func.apply(thisArg, args);

    // patch up the args to take count of the hashedkey
    const { hashedKey, value, commit } = fixupArgs({
      args,
      prop,
      func,
      makeKey,
      config,
      thisArg,
    });

    // special handling for packing/unpacking
    switch (propMap[prop]) {
      case "set":
        // this will pack/zip/chunk etc as required
        return setPack(hashedKey, value, commit);

      // in this case we potentially need to get multiple items
      case "get":
        return unsetPack(hashedKey, commit);

      /// delete may actually have to delete multiple recs so it needs a getter
      case "del":
        const getProp = Reflect.ownKeys(propMap).find(
          (f) => propMap[f] === "get"
        );
        if (!getProp) throw `couldnt find get prop for get in propMap`;
        const getter = async (hashedKey) =>
          client[getProp](hashedKey, ...args.slice(1));
        return delPack(hashedKey, commit, getter);

      // everything else is vanilla
      default:
        return commit(hashedKey, value);
    }
  };


  /**
   * this creates a proxy for the redis client
   */
  const createClientProxy = (targetObject) =>
    new Proxy(targetObject, {
      // we'll be called here on every get to the client
      get(target, prop, receiver) {


        // the caller is after some of the proxy functions to use them independently
        if (Reflect.has(proxyExports, prop)) return proxyExports[prop];

        // if we get a fetch call, we'd like to send it back with the endpoint encapsulated
        // so that when it's applied, it will execute my version of the function
        if (
          typeof target[prop] === "function" &&
          hashProps.has(propMap[prop])
        ) {
          return makeApplyHandler(clientApplyHandler, target, prop);
        } else {
          // not a function we want to intercept
          return Reflect.get(target, prop, receiver);
        }
      },
    });

  // the redis proxy
  const proxy = createClientProxy(client);

  return testConnectivity ? testConnect({ client: proxy, useProxy }) : proxy;
};

const multiGet = async ({ cacheKeys, cProxy }) => {
  // the idea here is to do a massive cache get
  // and stick the results in a map
  const cacheMap = new Map(cacheKeys.map((k) => [k, null]));
  const multi = cProxy.multi();

  // we can use the proxies own mechanism for generating valid hashed keys
  cacheKeys.forEach((key) => multi.get(key));

  // the results are of the format [ [err, value],...]
  const results = await multi.exec();

  // use the proxies method of unpacking data
  let index = 0;
  for await (const result of results) {
    const [error, v] = await result;

    if (error) {
      console.log(
        `...unexpected pipeline error for ${cacheKeys[index]}`,
        error
      );
    } else {
      const value = v === null ? null : await cProxy.proxyUnpack(v);
      cacheMap.set(cacheKeys[index], value);
    }
    index++;
  }
  return cacheMap;
};

const cacheAge = (timestamp) =>
  timestamp ? 0 : new Date().getTime() - timestamp;

// test connecttivity and return client
const testConnect = async ({ client, useProxy }) => {
  // use an object if useProxy, otherwise a string
  const key = useProxy ? { key: "bar" } : "s" + new Date().getTime();
  const data = useProxy ? { data: "foo is bar" } : "foo is bar";

  const addData = await client.set(key, data);
  const getData = await client.get(key);
  const delData = await client.del(key);

  const passed =
    addData === "OK" &&
    getData &&
    ((useProxy && JSON.stringify(getData.value) === JSON.stringify(data)) ||
      (!useProxy && getData === data)) &&
    delData === 1;
  if (!passed) {
    console.error(
      "...failed redis connectivity test",
      useProxy,
      addData,
      getData,
      delData
    );
  } else {
    console.log("...passed redis connectivity tests with useProxy", useProxy);
  }
  return client;
};

const locals = {
  getClient: ({ config }) =>
    new Redis({
      password: config.password,
      host: config.host,
      port: config.port,
    }),
  getExArgs:
    // construct default expiration
    // if there's already an EX arg we dont need to specify it again
    ({ prop, otherArgs, config }) =>
      config.propMap[prop] !== "set" ||
      otherArgs.find((f) =>
        ["ex", "exat", "px", "pxat"].some((g) => g === f.toLowerCase())
      ) ||
      !config.expiration ||
      config.expiration === Infinity
        ? []
        : ["EX", config.expiration],
  makeKey: ({ config, key }) => config.makeKey({ prefix, key }),
  fixupArgs: ({ args, prop, func, makeKey, config, thisArg }) => {
    // the first arg for handled functions will always be the key
    // so we'll hash that to a b64 value
    const [key] = args;
    const hashedKey = makeKey(key);
    // the rest of the args will start with the value if we're doing a set
    const [value] = args.slice(1);
    const otherArgs = args.slice(2);

    // construct default expiration
    // if there's already an EX arg we dont need to specify it again
    const exArgs = locals.getExArgs({ prop, otherArgs, config });
    return {
      value,
      hashedKey,
      commit: async (hashedKey, packedValue) => {
        const fargs = [hashedKey]
          .concat(packedValue ? [packedValue] : [], exArgs, otherArgs)
          .slice(0, args.length + exArgs.length);
        return func.apply(thisArg, fargs);
      },
    };
  },
};
export default {
  cacheAge,
  multiGet,
  getcProxy,
};
