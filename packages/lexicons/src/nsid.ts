const namespace = 'network.sharedcomputer.chat'

/** NSIDs for every record, space, and method. */
export const nsid = {
  conversation: `${namespace}.conversation`,
  settings: `${namespace}.settings`,
  info: `${namespace}.info`,
  message: `${namespace}.message`,
  conversationRef: `${namespace}.conversationRef`,
  preferences: `${namespace}.preferences`,
  permissions: `${namespace}.permissions`,
  requestSync: `${namespace}.requestSync`,
  defs: `${namespace}.defs`,
} as const
