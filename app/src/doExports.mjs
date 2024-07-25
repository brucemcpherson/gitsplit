import { isManifest } from "./getmanifests.mjs";
import { writeJsonFile } from "write-json-file";

export const exportContent = async ({
  gasRepoMap,
  ownerMap,
  rp,
  libraryMap,
  repoMap
}) => {
  const owners = Array.from(ownerMap.values()).map((f) => {
    const myRepos =  Array.from(f.repos).filter(g=>gasRepoMap.has(g))
    return {
      ...f,
      stats: {
        ...f.stats,
        gassyRepos: myRepos.length,
        manifests: myRepos.reduce(
          (p, c) =>
            p + (gasRepoMap.get(c).files || []).filter(isManifest).length,0
        )
      },
      // normalize - setting them undefined means they wont be stringified
      repos: undefined,
    };
  });


  const files = Array.from(gasRepoMap.values())
    .map((r) =>
      r.files.filter(isManifest).map((f) => ({
        ...f,
        repoId: r.id,
      }))
    )
    .flat(Infinity);

  const repos = Array.from(gasRepoMap.values()).map((f) => ({
    ...f,
    // normalize - setting them undefined means they wont be stringified
    owner: undefined,
    files: undefined,
    gqlId: undefined,
    fa: undefined,
    // this is the number of appscript signature files
    // only the manifests are actually kept
    gassyFiles: f.files.length,
    manifests: f.files.filter(isManifest).length,
    // property name was shortened to save cache space
    filesAnalyzed: f.fa,
  }));

  const libraries = Array.from(libraryMap.values()).map((f) => ({
    libraryId: f.libraryId,
    userSymbol: f.userSymbols[0],
    fileId: f.fileId,
  }));

  const payload = {
    owners,
    repos,
    files,
    libraries,
  };
  return writeJsonFile(rp.name, payload).then(() => payload);
};
