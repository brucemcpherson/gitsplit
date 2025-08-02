import { gqlGetRepos } from "./gqlqueries.mjs";

// this step will get all the repos owned by anyone who has an apps script manifest
export const getRepoMap = async ({ client, ownerMap, cProxy, rp }) => {
  // decorated with all owners/all repos
  const repoMap = new Map();

  // now decorate by finding all the repos associted with every potential owner
  // they won't all be appsscript repos at this stage
  for await (const owner of ownerMap.values()) {
    // all the repos belonging to this owner
    const seeds = await seedRepos({
      client,
      login: owner.login,
      cProxy,
      rp,
    });
    // record which repos this owner has
    // add the data to overall repo map
    const ow = ownerMap.get(owner.login);
    ow.repos = new Set(seeds.data.map((f) => f.id));
    ow.stargazerCount = seeds.data.reduce(
      (p, c) => p + c.stargazerCount,
      ow.stargazerCount || 0
    );

    (seeds.data || []).forEach((f) => {

      if (repoMap.has(f.id)) {
        const g= repoMap.get(f.id)
        console.log(`unexpected dup repo`, f.id);
        console.log('trying to add', f.id,f.url,f.createdAt,f.login,f.ownerId)
        console.log('already have',g.id, g.url,g.createdAt,g.login,g.ownerId )
        console.log('...skipping')

      } else {
        repoMap.set(f.id, {
          ...f,
          ownerId: owner.id,
          login: owner.login,
        });
      }
    });
  }

  return {
    ownerMap,
    repoMap,
  };
};

const getRepos = async ({ login, client, cProxy, rp }) => {
  // for pagination
  const variables = {
    login,
    first: 100,
  };

  const makeCacheKey = (repo) => ({ login, gqlGetRepos, method: "graphql" });
  const cacheKey = makeCacheKey();

  const cached = rp.cache ? await cProxy.get(cacheKey) : null;
  if (cached) {
    const { value, timestamp } = cached;
    // temp to seed with timestamps
    cProxy.set(cacheKey, value);
    console.log(
      "...",
      login,
      "repos were cached",
      value.data && value.data.length,
      "items found"
    );
    return cached && cached.value;
  }

  let allData = [];
  let doMore = false;
  let pageNumber = 0;
  do {
    // log if we're hitting a big owner
    pageNumber++;
    if (pageNumber > 1) {
      console.log(
        `...over ${allData.length} (pagesize ${variables.first
        }) repos for ${login} .. now doing page ${pageNumber + 1}`
      );
    }

    // get the owner and repo data
    let result;
    try {
      result = await client.graphql(gqlGetRepos, {
        ...variables,
      });
    } catch (err) {
      console.error(
        "gql error",
        err.status,
        "on get repos for",
        login,
        "skipping the rest"
      );
      return {
        data: allData,
      };
    }

    // extract interestin gql response field s
    const { repositoryOwner } = result || {};
    if (!repositoryOwner) {
      console.log(
        "failed to find repo owner in gql result for",
        login,
        "...skippng the rest"
      );
      return { data: allData };
    }
    const { repositories } = repositoryOwner;
    const { pageInfo, nodes } = repositories;

    // accumulate repo nodes
    // Im going to filter out any repos found for this owner
    // but where the actual owner doesnt match
    // i've tried using the affiliation filter on the query but
    // i cant find the correct filter
    // so let's just do it here
    // it's not clear why a repository owner query returns repos he doesnt own
    allData = allData.concat(
      nodes
        .filter((f) => f.owner.login === repositoryOwner.login)
        .map((f) => ({
          ...f,
          // sometimes this is null - why?
          ref: f.defaultBranchRef && f.defaultBranchRef.name,
          defaultBranchRef: undefined,
          // this can be null too - presumably if there are no files
          files: (f.object && f.object.entries) || [],
          object: undefined,
          watchers: (f.watchers && f.watchers.totalCount) || 0,
          login: f.owner.login,
        }))
    );

    // see if we need to get some more
    const { hasNextPage, endCursor } = pageInfo;
    doMore = hasNextPage;
    variables.after = endCursor;
  } while (doMore);

  // this should be the accumulated repositories
  // as well as a copy of the owner specific data from the first fetch
  if (pageNumber > 1) {
    console.log(
      `... ${allData.length} repos for ${login} ..did  ${pageNumber} pages`
    );
  }
  const payload = {
    data: allData,
  };
  if (!cached) {
    if (rp.writecache) {
      cProxy.set(cacheKey, payload);
    }
  }
  return payload;
};

export const seedRepos = async ({ login, client, cProxy, rp }) => {
  // get all with pagination
  return getRepos({ login, client, cProxy, rp });
};
