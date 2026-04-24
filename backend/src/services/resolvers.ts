import { EventIndexer } from '../services/EventIndexer';

// In a real deployment, indexer instance would be injected via GraphQL context
let indexerInstance: EventIndexer;

export const resolvers = {
  Query: {
    eventHistory: (_: any, args: { limit?: number }, context: { indexer: EventIndexer }) => {
      const events = context.indexer.getCachedEvents();
      return args.limit ? events.slice(0, args.limit) : events;
    },
    eventById: (_: any, args: { id: string }, context: { indexer: EventIndexer }) => {
      return context.indexer.getCachedEvents().find(e => e.id === args.id) || null;
    }
  }
};

export default resolvers;