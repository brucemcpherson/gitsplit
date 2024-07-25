import { runParams } from "./src/getparams.mjs";
import { verify } from "./src/octo.mjs";
import { getOwnerMap } from "./src/getowners.mjs";
import { getRepoMap } from "./src/getrepos.mjs";
import { exportContent } from "./src/doExports.mjs";
import { treeUpRepoMap, decorateContent } from "./src/getmanifests.mjs";
import { getLibraries } from "./src/getlibraries.mjs";
import { loadJsonFile } from "load-json-file";
import { getRedisConfigs } from "./src/redisconfig.mjs";
import { timer} from "./src/usefuls.mjs"

import { default as cache } from "../cache/index.mjs";
const { getcProxy } = cache;

const scriver = async () => {
  const startedAt = new Date();

  // check we have connectivity
  const { client } = await verify();

  // get a redis client and check connecivity
  const cProxy = await getcProxy({
    database: "local",
    cConfigs: getRedisConfigs(),
  });

  // get params
  const rp = runParams();
  console.log("...caching is ", rp.cache ? "enabled" : "disabled");
  console.log("...caching write is ", rp.writecache ? "enabled" : "disabled");
  // because github api only gets recently updated manifests, we can supply an archive file
  // with other owners from the past that can be considered too
  let startTime = new Date();
  const archive = rp.archive ? await loadJsonFile(rp.archive) : {};
  console.log(
    rp.archive
      ? `...getting archive data from ${rp.archive}`
      : "...no achve data requested"
  );

  // get owners who have an findable appscript.json
  // this is just a seed, as the githib api will only
  // get possible apps script devs a selection
  // the map will have just the login as the key + the databaseid as the id
  // the database id is the reference used by the repos to index the owner
  //
  startTime = new Date();
  const { ownerMap } = await getOwnerMap({ client, rp, cProxy, archive });
  timer("...ownermapping done", startTime);

  // next we need to do a query that can find every repo owned by each of these owners
  // we're going to need to check for apps script manifest files later, so
  // we'll enhance the graphql query to include the initial tree
  // we cant do recursive in gql, and nesting causes gql errors so just op level
  startTime = new Date();
  const { repoMap } = await getRepoMap({
    client,
    ownerMap,
    cProxy,
    rp,
  });
  timer("...repoMapping done", startTime);

  // now we need to complete the tree for thos that have folders
  startTime = new Date();
  const { gasRepoMap } = await treeUpRepoMap({
    client,
    repoMap,
    cProxy,
    rp,
    ownerMap,
  });
  timer("...trees analyzed", startTime);

  // sumarize what we found
  logGas({ gasRepoMap, repoMap });

  // now get the content for every manifest file
  startTime = new Date();
  await decorateContent({ gasRepoMap, ownerMap, client, cProxy, rp });
  timer("...content decorated", startTime);

  // now fix up library refereces
  startTime = new Date();
  const { libraryMap } = getLibraries({ gasRepoMap });
  // now export the results
  startTime = new Date();
  const { owners, files, repos, libraries } = await exportContent({
    libraryMap,
    gasRepoMap,
    ownerMap,
    rp,
    repoMap,
  });

  timer("...export done", startTime);

  console.log(
    `...found ${owners.length} owners ${repos.length} repos ${files.length} manifests ${libraries.length} libraries`
  );
  timer("...all done", startedAt);

  process.exit(0);
};

const logGas = ({ gasRepoMap, repoMap }) => {
  const { manifestCount, filesAnalyzed } = Array.from(repoMap.values()).reduce(
    (p, c) => {
      return {
        manifestCount: p.manifestCount + c.files.length,
        filesAnalyzed: p.filesAnalyzed + c.fa,
      };
    },
    {
      manifestCount: 0,
      filesAnalyzed: 0,
    }
  );
  console.log(
    `...found ${manifestCount} manifests ${filesAnalyzed} files from ${repoMap.size} repos - ${gasRepoMap.size} gassy repos to process`
  );
};


scriver();
