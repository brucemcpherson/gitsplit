import { createHash } from "node:crypto";
import { isClasp, isInfo, isManifest } from "./getmanifests.mjs";
import { settings } from "./settings.mjs";
import { chunkIt } from "./usefuls.mjs";
import path from "path";
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

export const gqlGetRepos = `
query ($first: Int = 100, $after: String = null, $login: String!) {
  repositoryOwner(login: $login) {
    login
    repositories(first: $first, after: $after) {
      pageInfo {
        ...paging
      }
      nodes {
        ... on Repository {
          ...repoInfo
          object(expression: "HEAD:") {
            ... on Tree {
              ...treeInfo
            }
          }
        }
      }
    }
  }
}

fragment treeInfo on Tree {
  entries {
    name
    path
    type
  }
}

fragment repoInfo on Repository {
  defaultBranchRef {
    name
  }
  url
  sshUrl
  homepageUrl
  createdAt
  pushedAt
  updatedAt
  id: databaseId
  description
  name
  nameWithOwner
  owner { 
  	login
  } 
  stargazerCount
  watchers {
    totalCount
  }
  defaultBranchRef {
    name
  }
}

fragment paging on PageInfo {
  startCursor
  hasNextPage
  endCursor
}
`;



const tryToParse = ({ text, repo, path }) => {
  try {
    return JSON.parse(text);
  } catch {
    console.log(
      "... skipping invalid content",
      text,
      " for ",
      repo.nameWithOwner,
      path
    );
    return null;
  }
};

export const doContentQuery = async ({
  gasRepoMap,
  client,
  cProxy,
  rp,
}) => {
  const chunkSize = settings.chunks.content;

  const grepos = Array.from(gasRepoMap.values());
  // attach a gqlId to everything
  grepos.forEach((repo) => {
    repo.gqlId = "r" + md5(repo.login + "_" + repo.name);
    repo.files.forEach(
      (file) =>
        (file.gqlId = "f" + md5(repo.login + "_" + repo.name + "_" + file.path))
    );
  });
  console.log(`...starting content queries on ${gasRepoMap.size} gassy repos`);

  // split into chunks of chunkSize repos
  const repoIt = chunkIt(grepos, chunkSize);

  const fileSeg = (file) =>
    `${file.gqlId}:object(expression: "HEAD:${file.path}") { ... on Blob { text }}`;

  const repoSeg = (repo) => `
    ${repo.gqlId}:repository (owner: "${
    repo.login
  }", name: "${repo.name.toString()}") {
      ${repo.files.map((file) => fileSeg(file)).join("\n")}
    }`;
  let nq = 0;
  let nc = 0;
  for await (const repos of repoIt) {
    try {
      nq += repos.length;
      nc++;
      const query = "{" + repos.map((repo) => repoSeg(repo)).join("\n") + "}";
      const cacheKey = { query, method: "graphql" };

      const cached = rp.cache && (await cProxy.get(cacheKey));
      const { value, timestamp } = cached || {};
      // temp to seed with timestamps
      if (cached)
        cProxy.set(cacheKey, value);
      const result = value || (await client.graphql(query));
      console.log(
        `... ${nq}/${grepos.length}  done - chunk ${nc} was ${
          cached ? "cached" : "not cached"
        }`
      );

      // reconstitute the result
      Reflect.ownKeys(result).forEach((rkey) => {
        const targetRepo = repos.find((f) => f.gqlId === rkey);
        const rob = result[rkey];
        // these would be all the files from the repo query
        Reflect.ownKeys(rob).forEach((fkey) => {
          const targetFile = targetRepo.files.find((f) => f.gqlId === fkey);
          const fob = rob[fkey];
          const parsed = tryToParse({
            text: fob.text,
            repo: targetRepo,
            path: targetFile.path,
          });
          if (parsed) {
            if (isManifest(targetFile)) targetFile.content = parsed;
            if (isClasp(targetFile)) {
              targetFile.claspId = parsed.scriptId;
            }
            if (isInfo(targetFile)) targetFile.infoId = parsed.id;
          }
        });
        // we want to assign either the claspid or infoid (if we can find them) as the scriptId for this file
        // but the clasps and infos must be in the same path as the manifest
        const pathMap = new Map(
          targetRepo.files.map((f) => [path.dirname(f.path), {}])
        );
        targetRepo.files
          .filter(isClasp)
          .forEach(
            (f) => (pathMap.get(path.dirname(f.path)).claspId = f.claspId)
          );
        targetRepo.files
          .filter(isInfo)
          .forEach(
            (f) => (pathMap.get(path.dirname(f.path)).infoId = f.infoId)
          );
        targetRepo.files.filter(isManifest).forEach((f) => {
          const mob = pathMap.get(path.dirname(f.path));
          f.claspId = mob.claspId;
          f.infoId = mob.infoId;
          f.scriptId = f.scriptId || mob.claspId || mob.infoId;
        });
      });

      if (!cached) {
        if (rp.writecache) {
          cProxy.set(cacheKey, result);
        }
      }
    } catch (err) {
      console.log(err);
    }
  }
  console.log(`... ${nq}/${grepos.length} done}`);
};
