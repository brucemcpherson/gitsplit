import { slices, getOwnerDetails } from "./octosearch.mjs";
import { settings } from "./settings.mjs";
import {default as cache} from "../../cache/index.mjs";
const {cacheAge} = cache
// some ownere have minimal apps script but thousands of cloned repos
// lets just drop them
const skipOwners = new Set([
  "2lambda123",
  "giantswarm",
  "gmh5225",
  "D-E-F-E-A-T",
  "senorflor",
  //"IamGideonIdoko", // dup repo also
  //"mushinako" // for some reason this guy has a duplicate repo id - shouldnt be able to happen!
]);

// this step will get all the owners who have an any appscript manifests
// in the last year - as returned by the github search.code api
export const getOwnerMap = async ({ client, rp, cProxy, archive = {} }) => {
  // get the seeds in
  const items = await slices({ client, rp, cProxy });

  // make an owners map
  // keyed on the owner id
  // at this point we only need the login for gql queries
  // if the user has proected their info, we cant get the owner databaseid
  // so we'll always use the login as the key for ownermap
  const ownerMap = new Map(
    items
      .filter((f) => !skipOwners.has(f.repository.owner.login))
      .slice(0, rp.limit)
      .map((f) => [
        f.repository.owner.login,
        {
          id: f.repository.owner.id,
          login: f.repository.owner.login,
        },
      ])
  );
  // because the github api only gives old stuff, we have the possibility of adding older owners to consider
  const archiveOwners = archive.owners || [];
  let narch = 0;
  archiveOwners.forEach((f) => {
    if (
      ownerMap.size < rp.limit &&
      !skipOwners.has(f.login) &&
      !ownerMap.has(f.login)
    ) {
      narch++;
      ownerMap.set(f.login, {
        id: f.id,
        login: f.login,
        fromArchive: true,
      });
    }
  });
  console.log(
    `...${narch} owners were added from ${archiveOwners.length} owners in ${
      rp.archive || "NO ARCHIVE REQUESTED"
    }`
  );

  // decorate the owners as the gql client we use later doesnt actually return as much as the rest client
  let nc = 0;
  for await (const owner of ownerMap.values()) {
    const cacheKey = { owner: owner.login, method: "rest.owner.get" };
    const cached = rp.cache ? await cProxy.get(cacheKey) : null;
    let result;
    if (cached) {
      const { value, timestamp} = cached
      result = { data: value };
      // temp to seed with timestamps
      cProxy.set(cacheKey, value);
    } else {
      try {
        result = await getOwnerDetails({ client, login: owner.login });
      } catch (err) {
        console.log(
          `...${err.status}: unable to find owner ${owner.login} - deleting from consideration`
        );
        if (!owner.fromArchive) {
          console.log(
            "this was an error - owner wasn't from archive and should have been found"
          );
        }
        ownerMap.delete(owner.login);
        result = null;
      }
    }
    if (result) {
      const { data: details = {} } = result;
      owner.avatarUrl = details.avatar_url;
      owner.bio = details.bio;
      owner.blog = details.blog;
      owner.company = details.company;
      owner.createdAt = details.created_at;
      owner.email = details.email;
      owner.followers = details.followers;
      owner.url = details.url;
      owner.location = details.location;
      owner.name = details.name;
      owner.publicGists = details.public_gists;
      owner.publicRepos = details.public_repos;
      owner.twitterUsername = details.twitter_username;
      owner.updatedAt = details.updated_at;
      owner.isHireable = details.hireable;
      if (!cached) {
        if (rp.writecache) {
          cProxy.set(cacheKey, details);
        }
      } else {
        nc++;
      }
    }
  }

  console.log(
    "...seeding with",
    items.length,
    "manifests from",
    ownerMap.size,
    "owners",
    nc,
    "owner details were cached"
  );
  return {
    ownerMap,
  };
};
