export const settings = {
  chunks: {
    content: 50,
    reportAt: 100
  },
  fields: {
    file: {
      retain: new Set (["path", "url", "gqlId"])
    }
  }
}

export const profile = {
  app: "gitsplit",
  version: "1.0.1"
}