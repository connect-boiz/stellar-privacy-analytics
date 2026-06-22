export const create = () => ({
  add: async (data: any) => ({ cid: { toString: () => 'QmMock' }, size: data.length }),
  cat: async (cid: string) => Buffer.from('mock data'),
  pin: { add: async () => {}, rm: async () => {} },
  files: { stat: async () => ({ size: 100, cid: { toString: () => 'QmMock' } }) },
  swarm: { connect: async () => {} },
  id: async () => ({ id: 'mock-peer-id', addresses: ['/ip4/127.0.0.1/tcp/4001'] }),
  dag: { get: async () => {}, put: async () => {} },
  block: { get: async () => {}, put: async () => {}, stat: async () => ({ size: 100 }) },
  repo: { stat: async () => ({ numObjects: 0, repoSize: 0 }) },
  version: async () => ({ version: '0.0.0', commit: '', interface: '' }),
  stop: async () => {},
});
