import { doContentQuery } from "./gqlqueries.mjs";
import { settings } from "./settings.mjs";
import {default as cache} from "../../cache/index.mjs";
const {multiGet} = cache

const boringTrees = [
  new RegExp(/(\/|^)dist(\/|$)/),
  new RegExp(/(\/|^)build(\/|$)/),
  new RegExp(/(\/|^)libraries(\/|$)/),
  new RegExp(/(\/|^)node_modules(\/|$)/),
  new RegExp(/(\/|^)helm(\/|$)/),
  new RegExp(/(\/|^)react(\/|$)/),
  new RegExp(/(\/|^)webpack(\/|$)/),
  new RegExp(/(\/|^)packages(\/|$)/),
  new RegExp(/(\/|^)npm(\/|$)/),
  new RegExp(/(\/|^)yarn(\/|$)/),
  new RegExp(/(\/|^)bin(\/|$)/),
  new RegExp(/(\/|^)gemfiles(\/|$)/),
  new RegExp(/(\/|^)tmp(\/|$)/),
  new RegExp(/(\/|^)github\/workflows(\/|$)/),
  new RegExp(/\.tgz/),
  new RegExp(/\.zip/),
  new RegExp(/platform-catalog\//),
  new RegExp(/kernel\//),
  new RegExp(/jupyter\//),
  new RegExp(/prometheus\//),
  new RegExp(/python\//),
  new RegExp(/firmware\//),
  new RegExp(/drivers\//),
  new RegExp(/kvm\//),
];

// anything in a folder starting with . we can ignore, but watch for .clasp.json
const hiddenTree =   new RegExp(/(\/|^)\./)

const isInterestingFile = (file) => isGassy(file) && !boringTrees.some(f=>f.test(file.path));

const isInteresingTree = ({ type, path }) => {
  return (
    type === "tree" &&
    !hiddenTree.test(path) &&
    !boringTrees.some((f) => {
      return f.test(path);
    })
  );
};

export const decorateContent = async ({
  gasRepoMap,
  ownerMap,
  client,
  cProxy,
  rp,
}) => {
  // we'll organize by owner and get all his content at once
  // this just verifies we found something for everyone
  for await (const owner of ownerMap.values()) {
    const theirRepos = Array.from(gasRepoMap.values()).filter(
      (f) => f.login === owner.login
    );
    if (!theirRepos.length) {
      console.log(`...should have found some gas repos for ${owner.login}`);
    }
  }

  // now chunk up content queries

  return doContentQuery({ gasRepoMap, client, cProxy, rp });
};

const manifestRx = new RegExp(/(\/|^)appsscript\.json$/);
const claspRx = new RegExp(/(\/|^)\.clasp\.json$/);
const infoRx = new RegExp(/(\/|^)info\.json$/);
const gasCodeRx = new RegExp(/\.gs$/);

export const isManifest = ({ path }) =>  manifestRx.test(path)


export const isClasp = ({ path }) => claspRx.test(path)


export const isInfo = ({ path }) => infoRx.test(path);
export const isGasCode = ({ path }) => gasCodeRx.test(path);
const isGassy = (file) => isManifest(file) || isClasp(file) || isInfo(file);
const isNoise = (files) => !files.some(file > isGassy(file) || isGasCode(file));

// now afill out the trees
export const treeUpRepoMap = async ({
  client,
  repoMap,
  cProxy,
  rp,
  ownerMap,
}) => {
  let ncached = 0;
  let ntotal = 0;
  let ntree = 0;
  const reportAt = settings.chunks.reportAt;
  console.log(`...starting tree analysis on ${repoMap.size} repos`);

  // we'll just store the gassy files - there are millions of files
  // we'll also return a new Map with only repos that have gas files in them
  const gasRepoMap = new Map();

  const makeTrob = (repo) => ({
    owner: repo.login,
    repo: repo.name,
    tree_sha: repo.ref,
    recursive: 1,
  });
  const makeCacheKey = (repo) => ({
    trob: makeTrob(repo),
    method: "rest.git.getTree",
  });

  const makeProxyKey = (key) => cProxy.proxyKey(key);

  const getCacheMap = async () => {
    // an empty map as we're not doing caching
    if (!rp.cache) return new Map();
    // since we're using a pipeline, we'll need to emulate proxy keying
    const cacheKeys = Array.from(repoMap.values()).map((repo) =>
      makeProxyKey(makeCacheKey(repo))
    );
    return multiGet({ cacheKeys, cProxy });
  };

  const cacheMap = await getCacheMap();

  for await (const repo of repoMap.values()) {
    ntotal++;
    const owner = ownerMap.get(repo.login);
    if (!owner) {
      console.log(`failed to get owner for repo ${repo.nameWithOwner}`);
      throw `give up - missing owner means it's all screwed up somehow`;
    }

    // for normal proxied caching use this
    const cacheKey = makeCacheKey(repo);

    // for pipeline cache get us this
    const proxyKey = makeProxyKey(cacheKey);

    const cached = cacheMap.get(proxyKey);


    if (cached) {
      const {value, timestamp} = cached
      repo.files = value.files || [];
      repo.fa = value.fa;
      // temp to seed with timestamps
      cProxy.set(cacheKey, value);
      ncached++;
    } else {
      // all the files in the repo
      const { files } = repo;

      // TODO - something with repo.updatedAt
      // can we push that up to a query before caching ?
      // and only do updated after if its found in cache
      // also need to normalize the order (grop by owner)
      // since the entire query is written in one lunp - extra repos knock the whole thing out of seq

      // checking to see if some recursion is required in the basic contents of the repo
      if (files.some((file) => isInteresingTree(file))) {
        ntree++;
        // there is some recursion required. so we can use the tree endpoint
        try {
          // we need to go and recurse
          const result = await client.rest.git.getTree(makeTrob(repo));

          // discard any non gas files
          repo.files = result.data.tree
            .filter(f=>f.type !== 'tree')
            .filter(isInterestingFile);

          repo.fa = result.data.tree.length;

        } catch (err) {
          console.log(
            "...failed to get tree for",
            repo.nameWithOwner,
            "skipping"
          );
          repo.files = [];
          repo.fa = 0;
        }
      } else {
        // there was no recursion so we can just record what was found in the repo top evel
        // no need to check for boring trees as there were no trees
        repo.fa = repo.files.length;
        repo.files = repo.files.filter(isGassy);
      }

      // if there are no manifest files, then we'll just junk the other gassy files
      if (!repo.files.find(isManifest)) {
        repo.files = [];
      }

      // now clear out any file fields that we wont actually need
      const retain = settings.fields.file.retain;
      repo.files = repo.files.map((file) => {
        return Reflect.ownKeys(file).reduce((p, c) => {
          if (retain.has(c)) p[c] = file[c];
          return p;
        }, {});
      });

      // we always write to cache if we didnt find it earlier
      // even if there are no gas files we still have to write it to cache
      // to signal there are none. However we'll skip the files property to save space
      const cachePack = {
        fa: repo.fa,
      };
      if (repo.files.length) cachePack.files = repo.files;
      if (rp.writecache) {
        cProxy.set(cacheKey, cachePack);
      }
    }


    // this is a gassy repo, so we'll need that
    if (repo.files.length) {
      gasRepoMap.set(repo.id, repo);
    }

    // update the the owner stats count
    if (!owner.stats)
      owner.stats = {
        reposAnalyzed: 0,
        filesAnalyzed: 0,
      };

    owner.stats.filesAnalyzed += repo.fa;
    owner.stats.reposAnalyzed++;

    if (ntotal === repoMap.size || (ntotal && !(ntotal % reportAt))) {
      console.log(
        `... done ${ntotal}/${repoMap.size} repos with ${ntree} recursions - ${ncached} were cached`
      );
    }
  }

  return {
    gasRepoMap,
  };
};
