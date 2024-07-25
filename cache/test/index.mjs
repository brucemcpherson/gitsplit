import test from "ava";
import delay from "delay";

import { default as cache } from "../index.mjs";
const { getcProxy } = cache;
import { getRedisConfigs } from "./helpers/redisconfig.mjs";

const getData = async () => {
  const cProxy = await getcProxy({
    database: "local",
    extraConfig: "test",
    testConnectivity: false,
    cConfigs: getRedisConfigs(),
  });

  const vanilla = await getcProxy({
    database: "local",
    extraConfig: "test",
    testConnectivity: true,
    useProxy: false,
    cConfigs: getRedisConfigs(),
  });

  const config = cProxy.fetchConfig();

  const text = Array.from({ length: 100 })
    .map((_, i) => Math.random().toString())
    .join("-");

  const small = Array.from({
    length: 20,
  }).map((_, i) => ({ i, t: Math.random().toString() }));

  const hugeChunk = Array.from({
    length: config.maxChunk * 10,
  }).map(() => Math.random().toString());

  const smallChunk = Array.from({
    length: config.maxChunk,
  }).map(() => Math.random().toString());

  return {
    text,
    small,
    cProxy,
    config,
    hugeChunk,
    smallChunk,
    vanilla,
    baseKey: {
      proxyTest: new Date().getTime().toString() + "-" + Math.random(),
    },
  };
};

test.before("setup test data and client", async (t) => {
  const y = await getData();
  t.context = y;
  t.not(t.context, null);
});
/*
test("vanilla", async (t) => {
  const {vanilla, text} = t.context
  const ok = await vanilla.set (t.title, text)
  t.is(ok, "OK");

  const value = await vanilla.get(t.title)
  t.is(value,text)

  const del = await vanilla.del(t.title)
  t.is(del,1)

  const gone = await vanilla.get(t.title)
  t.is(gone,null)


});

test("vanilla multi", async (t) => {
  const { vanilla, text } = t.context;
  const key = t.title
  const fixes = [text, text].map ((f,i)=>({
    key: key+i,
    value: f + i
  }))

  const multi = vanilla.multi()

  // queue up a batch of set values

  fixes.forEach((f) => multi.set(f.key, f.value))
  const results = await multi.exec()
  results.forEach((f, i) => t.is(f[1],"OK") && t.is(f[0],null))

  const getMulti = vanilla.multi()
  fixes.forEach((f) => getMulti.get(f.key))
  const gets = await getMulti.exec()
  
  let index = 0
  for await (const result of gets) {
    const [error, v] = await result;
    t.is (v, fixes[index].value)
    index++
  }
});
*/
test("multi", async (t) => {
  const { cProxy, small, baseKey } = t.context;
  const key = { ...baseKey, title: t.title };

  const fixes = ["x"].map((value, i) => ({
    key: key+i, //{ ...key, i },
    value,
  }));

  const multi = cProxy.multi()

  // queue up a batch of set values

  fixes.forEach((f) => multi.set(f.key, f.value))
  const results = await multi.exec()
  console.log(results)
  // results.forEach((f, i) => t.is(f[1].value,"OK") && t.is(f[0],null))
  results.forEach((f, i) => t.is(f[1],"OK") && t.is(f[0],null))
  const getMulti = cProxy.multi()
  fixes.forEach((f) => getMulti.get(f.key))
  const gets = await getMulti.exec()
  
  let index = 0
  for await (const result of gets) {
    const [error, v] = await result;
    t.is (v, fixes[index].value)
    index++
  }

});
/*
test("multi", async (t) => {
  const { cProxy, small, baseKey } = t.context;
  const key = { ...baseKey, title: t.title };

  const ofixes = ["x", small].map((value, i) => ({
    key: { ...key, i },
    value,
  }));

  const fixes = ["x", "y"].map((value, i) => ({
    key: i.toString(),
    value,
  }));
  const multi = await cProxy.multi();

  // queue up a batch of set values
  const sets = await Promise.all(
    fixes.map((f) => multi.set(f.key, f.value))
  ).then(() => multi.exec());

  // the results themselves are also async
  const results = await Promise.all(sets.map((f) => f));

  t.is(
    results.every((f) => f[1] === "OK"),
    true
  );

  t.is(
    results.every((f) => f[0] === null),
    true
  );

  const getMulti = await cProxy.multi();
  const gets = await Promise.all(fixes.map((f) => getMulti.get(f.key))).then(
    () => multi.exec()
  );

  // the results themselves are also async

  const getResults = await Promise.all(gets.map((f) => f));

  t.is(
    getResults.every((f, i) => f[1] === fixes[i].value),
    true
  );

  t.is(
    getResults.every((f) => f[0] === null),
    true
  );
});

test("basic packing", (t) => {
  const { cProxy } = t.context;
  const fix = { abc: 1 };
  return cProxy
    .proxyPack(fix)
    .then((x) => {
      const ob = JSON.parse(x);
      t.true(Reflect.has(ob, "p"));
      t.false(Reflect.has(ob, "z"));
      return cProxy.proxyUnpack(x);
    })
    .then((y) => t.deepEqual(y.value, fix));
});

test("big packing", (t) => {
  const { cProxy, config } = t.context;
  const fix = Array.from({ length: config.gzipThreshold + 1 }).fill("x");
  return cProxy
    .proxyPack(fix)
    .then((x) => {
      const ob = JSON.parse(x);
      t.true(Reflect.has(ob, "z"));
      t.false(Reflect.has(ob, "p"));
      return cProxy.proxyUnpack(x);
    })
    .then((y) => t.deepEqual(y.value, fix));
});

test("huge chunk", (t) => {
  const { cProxy, hugeChunk, baseKey } = t.context;
  const key = { ...baseKey, title: t.title };

  return cProxy
    .set(key, hugeChunk)
    .then((ok) => {
      t.is(ok, "OK");
      return cProxy.get(key);
    })
    .then(({ value }) => {
      t.deepEqual(value, hugeChunk);
      return cProxy.del(key);
    })
    .then((y) => t.is(y, 1));
});

test("small chunk", async (t) => {
  const { cProxy, smallChunk, baseKey } = t.context;
  const key = { ...baseKey, title: t.title };

  return cProxy
    .set(key, smallChunk)
    .then((ok) => {
      t.is(ok, "OK");
      return cProxy.get(key);
    })
    .then(({ value }) => {
      t.deepEqual(value, smallChunk);
      return cProxy.del(key);
    })
    .then((y) => t.is(y, 1));
});

test("redis basic", async (t) => {
  const { cProxy, baseKey } = t.context;
  const fix = { xyz: [0, 1] };
  const key = { ...baseKey, title: t.title };

  return cProxy
    .set(key, fix)
    .then((ok) => {
      t.is(ok, "OK");
      return cProxy.get(key);
    })
    .then(({ value }) => {
      t.deepEqual(value, fix);
      return cProxy.del(key);
    })
    .then((dok) => {
      t.is(dok, 1);
      return cProxy.get(key);
    })
    .then((y) => t.is(y, null));
});

test("redis big", (t) => {
  const { cProxy, config, baseKey } = t.context;
  const fix = Array.from({ length: config.gzipThreshold + 1 }).fill("y");
  const key = { ...baseKey, title: t.title };

  return cProxy
    .set(key, fix)
    .then((ok) => {
      t.is(ok, "OK");
      return cProxy.get(key);
    })
    .then(({ value }) => {
      t.deepEqual(value, fix);
      return cProxy.del(key);
    })
    .then((dok) => {
      t.is(dok, 1);
      return cProxy.get(key);
    })
    .then((y) => t.is(y, null));
});

test("redis chunking", (t) => {
  const { cProxy, hugeChunk: fix, baseKey } = t.context;
  const key = { ...baseKey, title: t.title };

  return cProxy
    .set(key, fix)
    .then((ok) => {
      t.is(ok, "OK");
      return cProxy.get(key);
    })
    .then(({ value }) => {
      t.deepEqual(value, fix);
      return cProxy.del(key);
    })
    .then((dok) => {
      t.is(dok, 1);
      return cProxy.get(key);
    })
    .then((y) => t.is(y, null));
});

test("redis default expire", (t) => {
  const { cProxy, hugeChunk: fix, config, baseKey } = t.context;
  const key = { ...baseKey, title: t.title };
  return cProxy
    .set(key, fix)
    .then((ok) => {
      t.is(ok, "OK");
      return cProxy.get(key);
    })
    .then((v) => {
      t.deepEqual(v.value, fix);
      return cProxy.expiretime(v.hashedKey);
    })
    .then((y) =>
      t.is(y <= new Date().getTime() + config.expiration * 1000, true)
    );
});

test("redis explicit expire", (t) => {
  const { cProxy, smallChunk: fix, baseKey } = t.context;
  const key = { ...baseKey, title: t.title };
  const exSecs = 2;
  return cProxy
    .set(key, fix, "EX", exSecs)
    .then((ok) => {
      t.is(ok, "OK");
      return cProxy.get(key);
    })
    .then((v) => {
      t.deepEqual(v.value, fix);
      return cProxy.expiretime(v.hashedKey);
    })
    .then((v) => {
      t.is(v <= new Date().getTime() + exSecs * 1000, true);
      return delay((exSecs + 1) * 1000).then(() => cProxy.get(key));
    })
    .then((y) => t.is(y, null));
});
*/
