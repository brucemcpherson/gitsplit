// so the point here is seef an owners map with all those who are likely to have appsscript files
// the octokit code search only returns files that are less than a year from being updated so we'll just use the results from this as a clue
import { createHash } from "node:crypto";
import { Octokit } from "octokit";
import { settings } from "./settings.mjs";

/**
 * Returns an MD5 hash for the given `content`.
 *
 * @param {String} content
 *
 * @returns {String}
 */
const md5 = (content) => {
  return createHash("md5").update(content).digest("hex");
};

/**
 * create a yielding function to offer up an array iterator
 * @param {[]} arr array to create yielding iterator function for
 * @return function
 */
export function* yielder(arr) {
  for (const n of arr) {
    yield n;
  }
}

/**
 * we have to do it in bits to fool the api to give us more results
 * @param {object} p
 * @param {Octokit.client} client authed client
 * @param {object} rp the run params from yarg
 * @param {cProxy} cProxy authed client
 * @return {object[]} items result of accumulated git queries
 */
export const slices = async ({ client, rp, cProxy }) => {
  const sizer = yielder(
    [
      "<50",
      "50..75",
      "76..85",
      "86..95",
      "96..100",
      "101..115",
      "116..125",
      "126..150",
      "151..200",
      "201..225",
      "226..250",
      "251..275",
      "276..300",
      "301..350",
      "351..400",
      "401..450",
      "451..500",
      "551..600",
      "601..650",
      "651..700",
      "701..800",
      ">800",
    ].slice(rp.offset, rp.max + rp.offset)
  );

  // build up the items here
  const items = [];

  // get each query
  for await (const size of sizer) {
    const q = `appsscript.json in:path size:${size}`;
    console.log("...doing", q);
    // paginate the entire query
    const r = await paginate({
      client,
      q,
      cProxy,
      rp,
    });

    // accoumulate the result
    Array.prototype.push.apply(items, r);
    console.log("...accumulated items so far", items.length);
  }
  return items;
};

// gql doesnt like this
export const dodgyPath = (path) => path.match(/\\/);

/**
 * call octokit rest api with pagination
 * @param {object} p
 * @param {Octokit.client} client
 * @param {string} query
 * @returns
 */
const paginate = async ({ client, q, cProxy, rp }) => {
  const cacheKey = { q, method: "rest.search.code" };
  const cached = rp.cache ? await cProxy.get(cacheKey) : null;
  if (cached) {
    const {value, timestamp} = cached
    console.log("...", q, "was cached");
          // temp to seed with timestamps
          cProxy.set(cacheKey, value);
    return value;
  }

  // check
  const items = [];
  for await (const r of client.paginate.iterator(client.rest.search.code, {
    q,
    per_page: 100,
  })) {
    Array.prototype.push.apply(items, r.data);
    console.log(
      "...items for this chunk",
      items.length,
      "from",
      r.data.total_count
    );
  }
  // write to cache for next time on this query
  if (!cached) {
    if (rp.writecache) {
      cProxy.set(cacheKey, items);
    }
  }
  return items;
};

export const getOwnerDetails = ({ client, login }) =>
  client.request(`GET /users/${login}`);

export const getTree = async ({ client, repo, owner, tree_sha }) => {
  return client.paginate(
    client.rest.git.getTree,
    {
      owner,
      repo,
      tree_sha,
      recursive: 1,
      per_page: 100,
    },
    (response) => {
      response.data.tree = response.data.tree.filter((r) =>
        r.path.match(/appsscript.json$/)
      );
      return response.data;
    },
    (err) => {
      console.log(err);
    }
  );
};
