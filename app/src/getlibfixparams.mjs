import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import is from "./is.mjs";


export const runParams = () => {
  return yargs(hideBin(process.argv))
    .usage(
      "Usage: $0 --name filename.json --output outfile.json"
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
      name: {
        default: "",
        description: "filename for json input",
        alias: "n",
        type: "string",
        requiresArg: true,
      },
      output: {
        default: "",
        description: "filename for json patched output",
        alias: "o",
        type: "string",
        requiresArg: true,
      }
    }).argv;
};
