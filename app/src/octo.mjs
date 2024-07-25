import { Octokit } from "octokit";

import { gitAuth } from "./git.mjs";
import { profile } from "./settings.mjs";

export const getClient = () => {
  return new Octokit({
    auth: gitAuth(),
    userAgent: `${profile.app}/${profile.version}`,
    throttle: {
      onRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(
          `...${new Date().toISOString()}:waiting for ${retryAfter} - Request quota exhausted for request ${options.method} ${options.url}`
        );

        if (options.request.retryCount === 0) {
          // only retries once
          octokit.log.info(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(
          `SecondaryRateLimit detected for request ${options.method} ${options.url}`
        );

        if (options.request.retryCount === 0) {
          // only retries once
          octokit.log.info(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
    },
  });
};

// check the gql api wroks
export const checkCredsGql = async ({ client }) => {
  const {
    viewer: { login },
  } = await client.graphql(`{
    viewer {
      login
    }
  }`);
  console.log("...GQL API works using credentials of %s", login);
  return login;
};

// check the rest api wroks
export const checkCreds = async ({ client }) => {
  const {
    data: { login },
  } = await client.rest.users.getAuthenticated();
  console.log("...REST API works using credentials of %s", login);

  return login;
};

export const verify = async () => {
  // get an authenticated client
  const client = getClient();

  // check we can get the auth user with the rest api
  const restLogin = await checkCreds({ client });

  // and also the gql api
  const gqlLogin = await checkCredsGql({ client });

  return {
    restLogin,
    gqlLogin,
    client,
  };
};
