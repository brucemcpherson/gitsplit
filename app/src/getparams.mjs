import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import is from "./is.mjs";


export const runParams = () => {
  return yargs(hideBin(process.argv))
    .usage(
      "Usage: $0 --name filename.json --max maxnoofslices --offset sizeslicetostartat"
    )
    .strict(true)
    .check((argv, options) => {
      // check the correct types
      const errors = options.boolean
        .filter((f) => f !== "help" && f !== "version")
        .filter((f) => !is.boolean(argv[f]))
        .concat(
          options.number.filter((f) => !is.number(argv[f])),
          options.string.filter((f) => !is.string(argv[f]))
        );
      if (errors.length) {
        console.log("...these args were invalid type", errors.join(","));
        throw new Error(`...these args were invalid type ${errors.join(",")}`);
      }
      return !errors.length;
    }, true)
    .options({
      writecache: {
        default: true,
        description: "write results to cache",
        alias: "w",
        type: "boolean",
        requiresArg: true,       
      },
      limit: {
        default: Infinity,
        description: "max number of owners to consider",
        alias: "l",
        type: "number",
        requiresArg: true,
      },
      archive: {
        default: "",
        description: "filename for archive to get old owners from ",
        alias: "a",
        type: "string",
        requiresArg: true,
      },
      name: {
        default: "",
        description: "filename for json export of ",
        alias: "n",
        type: "string",
        requiresArg: true,
      },
      max: {
        default: Infinity,
        description: "max number of size slices to consider",
        alias: "m",
        requiresArg: true,
        type: "number",
      },
      offset: {
        default: 0,
        alias: "o",
        description: "size slice to start at",
        requiresArg: true,
        type: "number",
      },
      cache: {
        default: true,
        alias: "c",
        description: "use cache",
        type: "boolean"
      }
    }).argv;
};
