import { isManifest } from "./getmanifests.mjs";

// note there is post processing of this in libfix
// leaving this here for now but much of it will be discarded when libfix is run on it
export const getLibraries = ({ gasRepoMap }) => {
  // we have to try to establish which of these scripts are libraries
  // a file id map of manifest files indexed by gqlId

  // now dump all the gassy files that arent manifests
  const fileIdMap = new Map(
    Array.from(gasRepoMap.values())
      .map((r) =>
        r.files.filter(isManifest).map((f) => ({ ...f, repoId: r.id }))
      )
      .flat(Infinity)
      .map((f) => [f.gqlId, f]))

  // what dup scriptIds do we have - this can happen if someone's clasp.json has been cloned
  const idMap = Array.from(fileIdMap.values())
    .filter((f) => f.scriptId)
    .reduce((p, c) => {
      if (!p.get(c.scriptId)) p.set(c.scriptId, []);
      p.get(c.scriptId).push(c);
      return p;
    }, new Map());

  // so if its been cloned, pick the earliest created repo as the actual guy
  const scriptIdMap = Array.from(idMap.values()).reduce((p, c) => {
    if (c.length > 1) {
      const bests = c
        .map((file) => ({ repo: gasRepoMap.get(file.repoId), file }))
        .sort(
          (a, b) =>
            new Date(a.repo.createAt).getTime() -
            new Date(b.repo.createdAt).getTime()
        );
        p.set (bests[0].file.scriptId , bests[0].file)
        // also got to undo the wrongly assigned other files
        bests.slice(1).forEach(f=>{
          f.scriptId = undefined
          f.claspId = undefined
          f.infoId = undefined
        })
        console.log('...resolved scriptId ambiguity -picked', bests[0].repo.name)
    } else {
      p.set (c[0].scriptId, c[0])
    }
    return p;
  }, new Map());

  // lets make a map of the files and repos for quicker access
  const repoNameMap = new Map();
  for (const repo of gasRepoMap.values()) {
    if (!repoNameMap.has(repo.name)) repoNameMap.set(repo.name, new Set());
    repoNameMap.get(repo.name).add(repo.id);
  }

  // this is a map of libraries to manifest by libraryid
  const libraryIdMap = new Map();

  // now look at all files and ake all the library ids we're looking for
  for (const file of fileIdMap.values()) {
    const { content = {} } = file;
    const { dependencies = {} } = content;
    const { libraries = [] } = dependencies;

    // these are the libraries mentioned as dependencies in each manifest
    libraries.forEach((l) => {
      // record the id of each library seen, as well as the usersymbols
      if (!libraryIdMap.has(l.libraryId)) {
        libraryIdMap.set(l.libraryId, {
          libraryId: l.libraryId, 
          userSymbolMap: new Map(),
        });
      }
      const idEntry = libraryIdMap.get(l.libraryId);
      const { userSymbolMap } = idEntry;
      const symbolKey = l.userSymbol.toLowerCase();

      // record the usersymbols seen , and a map of each id they are seen with
      if (!userSymbolMap.has(symbolKey)) {
        userSymbolMap.set(symbolKey, 0);
      }
      const usymCount = userSymbolMap.get(symbolKey);
      userSymbolMap.set(symbolKey, usymCount + 1);
    });
  }

  // now sort the symbols by popularity
  // and assign a fileid if we already have it
  for (const lib of libraryIdMap.values()) {
    lib.userSymbols = Array.from(lib.userSymbolMap)
      .sort((a, b) => a[1] - b[1])
      .map(([key]) => key);
    const file = scriptIdMap.get(lib.libraryId);
    if (file) {
      lib.fileId = file.gqlId;
      file.userSymbol = lib.userSymbols[0];
      file.libraryId = lib.libraryId;
    }
  }

  // make a map of all the userSymbols
  const libUserSymbols = new Map(
    Array.from(libraryIdMap.values()).map((lib) => [lib.userSymbols[0], lib])
  );

  // we only have the reponame to go on but there may be multiple manifests in the same repo
  // lets look at them in this order
  const order = [
    new RegExp(/^appsscript.json$/),
    new RegExp(/(\/|^)src\/appsscript.json$/),
    new RegExp(/(\/|^)app\/appsscript.json$/),
    new RegExp(/(\/|^)code\/appsscript.json$/),
    new RegExp(/(\/|^)appsscript\.json$/),
  ];

  for (const repo of gasRepoMap.values()) {
    // assuming the user symbol matches the repo name (what else could we do?)
    const repoKey = repo.name.toLowerCase();
    if (libUserSymbols.has(repoKey)) {
      const lib = libUserSymbols.get(repoKey);

      // we dont need to bother if we already have a matching file
      if (!lib.fileId) {
        // here's a symbol match to a repo name
        // we'll do a heiracrchy of matching
        // toplevel, src, anything else
        const files = repo.files.filter(isManifest);
        const targetManifest = order.reduce((p, c) => {
          return p || files.find((f) => c.test(f.path));
        }, null);

        if (targetManifest) {
          // so the libraryId we'll assign will be the maximum referenced whose usersymbol matches the repo name
          targetManifest.libraryId = lib.libraryId;
          targetManifest.userSymbol = repoKey;
          targetManifest.scriptId = lib.libraryId;
          scriptIdMap.set(targetManifest.scriptId, targetManifest);
          lib.fileId = targetManifest.gqlId;
        }
      }
    }
  }

  // whew
  return {
    libraryMap: Array.from(libraryIdMap.values()),
  };
};
