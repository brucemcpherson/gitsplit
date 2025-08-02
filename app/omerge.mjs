import fs from 'node:fs'
import { loadJsonFile } from "load-json-file";
import { writeJsonFile } from "write-json-file";

const folder = '../data/loads'
// we'll merge all the owner sections from all time to rebase the archive
const getFiles = () => {
  const files = fs.readdirSync(folder)
    .filter(fn => fn.match("-final\.json"));
  console.log(files)
  return files
}

const merger = async () => {
  // get all the previously loaded files
  const files = getFiles();

  const content = await Promise.all(files.map(async f => {
    const input = await loadJsonFile(folder+'/'+f)
    return input.owners
  }))

  // just usethe latest version
  const ownerMap = new Map()
  content.forEach(f => f.forEach(o => ownerMap.set(o.id, o)))

  await writeJsonFile(
    folder + '/archive.json', { owners: Array.from(ownerMap.values()) }
  );
  console.log (ownerMap.size,' unique owners found')
}

merger()


