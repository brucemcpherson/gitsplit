import {getSecrets} from "./getsecrets.mjs"
export const gitAuth = () => getSecrets({name: "GITSPLIT_SECRETS"}).gitConfigs.gitAuth
