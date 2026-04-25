export const typeDefs = `#graphql
  type IndexedEvent {
    id: ID!
    contractId: String!
    ledger: Int!
    topic: [String!]!
    sanitizedData: String!
    timestamp: String!
  }

  type Query {
    """
    Retrieves the history of 'analytics_ready' events from the local cache.
    """
    eventHistory(limit: Int): [IndexedEvent!]!
    
    """
    Retrieves a specific event by ID.
    """
    eventById(id: ID!): IndexedEvent
  }
`;

export default typeDefs;