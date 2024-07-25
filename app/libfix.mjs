import { runParams } from "./src/getlibfixparams.mjs";
import { loadJsonFile } from "load-json-file";
import { writeJsonFile } from "write-json-file";
import { timer } from "./src/usefuls.mjs"


const fixer = async () => {
  const startedAt = new Date();

  // get params
  const rp = runParams();
  let startTime = new Date();

  // get input
  const input = await loadJsonFile(rp.name)
  const { owners, files, repos, libraries } = input
  timer(`...got input data  from ${rp.name}`, startTime);

  const repoMap = new Map(repos.map(f => ([f.id, f])))

  files.forEach(file => {

    // this breaks normalization, but queries will be a bit less complex
    // no need to push this problem to bigQuery
    const repo = repoMap.get(file.repoId)
    file.ownerId = repo.ownerId
    file.fullPath = repo.url + '/' + file.path

  })

  // a map by scriptId for all files that we know the scriptId for
  const scriptMap = new Map(
    files.filter(f => f.scriptId).map(f => [f.scriptId, f])
  )
  // a map of all files by gqlId
  const fileMap = new Map(files.map(f => [f.gqlId, f]))

  // list of all referenced libs bylibraryId
  const refLibs = new Map()

  // see which of the manifests reference a library
  files.forEach(file => {
    file.content?.dependencies?.libraries?.forEach(lib => {
      const { libraryId, userSymbol } = lib

      // this is the file id for the library if its on github and identifiable
      const source = scriptMap.has(libraryId)
        ? scriptMap.get(libraryId)
        : null;

      if (!refLibs.has(libraryId)) {
        refLibs.set(libraryId, {
          libraryId,
          userSymbols: new Map(),
          count: 0,
          versions: new Map(),
          // these are the files that reference this library
          files: [],
          source
        })
      }

      // enumerate the referencers 
      const ref = refLibs.get(libraryId)
      ref.count++
      ref.files.push(file)

      // and the usersymbols used (later we'll pick the most common)
      const u = userSymbol.toLowerCase()
      if (!ref.userSymbols.has(u)) {
        ref.userSymbols.set(u, {
          userSymbol: u,
          count: 0
        })
      }
      const sym = ref.userSymbols.get(u)
      sym.count++

      // and all the versions used
      const version = lib.developmentMode
        ? 'dev'
        : lib.version

      // sometimes version is null or missising
      if (version) {
        if (!ref.versions.has(version)) {
          ref.versions.set(version, {
            version,
            count: 0
          })
        }
        const vers = ref.versions.get(version)
        vers.count++
      }
    })

  })
  console.log(`...found ${refLibs.size} libraryId references`)

  // now we need to sort out those refs that don't have source
  // but targets can only be ones that have no known scriptId
  // because if it had we would have found it by now
  const noScriptId = files.filter(f => !f.source)

  refLibs.forEach(ref => {
    // set the most popular userSymbol
    ref.userSymbol = Array.from(ref.userSymbols.values()).reduce((p, c) => {
      return c.count > p.count ? c : p
    }, { userSymbol: null, count: 0 }).userSymbol

    if (!ref.source) {
      // check all the files to see if there's a path match
      const rx = new RegExp(
        `.*\\/${ref.userSymbol}\\/appsscript.json`, "i"
      )
      // decide that the source is where the symbol matches somewhere in the path
      // this will give false positives but it's better than nothing
      const source = noScriptId.reduce((p, c) => {
        return p || (c.fullPath.match(rx) && c)
      }, null)

      if (source) {
        console.log(`...decided that ${ref.userSymbol} source is ${source.fullPath}`)
        source.scriptId = ref.libraryId
        source.libraryId = ref.libraryId
        ref.source = source
      }
    }
  })




  startTime = new Date();
  timer("...export done", startTime);

  console.log(
    `...found ${owners.length} owners ${repos.length} repos ${files.length} manifests ${libraries.length} libraries`
  );

  const cdFots = files.filter(f => f.scriptId)
  const cdLots = files.filter(f => f.libraryId)

  console.log(`...${cdLots.length} final library resolutions`)
  console.log(`...${cdFots.length} final scrptId resolutions`)
  timer("...all done", startedAt);

  // incorporate the unknown resolutions

  // {libraryId, userSymbol, versions[], referencers[], gqlId }
  const newLib = Array.from(refLibs.values())
    .map(lib => ({
      source: (lib.source && {
        gqlId: lib.source.gqlId,
        ownerId: lib.source.ownerId,
        repoId: lib.source.repoId
      }) || null,
      libraryId: lib.libraryId,
      userSymbol: lib.userSymbol,
      referencers: lib.files.map(f => ({
        gqlId: f.gqlId,
        ownerId: f.ownerId,
        repoId: f.repoId
      })),
      versions: Array.from(lib.versions.values()).map(f => f.version)
    }))

  console.log(`...${newLib.reduce((p, c) => p + (c.source ? 1 : 0), 0)} libs were resolved`)
  const payload = {
    owners,
    repos,
    files,
    libraries: newLib
  };
  await writeJsonFile(rp.output, payload).then(() => payload);
  process.exit(0);
};


fixer();
