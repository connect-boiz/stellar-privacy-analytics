import { load } from 'protobufjs';
import path from 'path';

export class ProtobufSerializer {
  private root: any;

  async init() {
    this.root = await load(path.join(__dirname, '../proto/schema.proto'));
  }

  serialize(messageType: string, payload: any): Uint8Array {
    const Type = this.root.lookupType(`stellar_privacy.${messageType}`);
    const message = Type.create(payload);
    
    // Data validation and transformation layers
    const errMsg = Type.verify(message);
    if (errMsg) {
        throw new Error(`Schema validation failed: ${errMsg}`);
    }

    return Type.encode(message).finish();
  }

  deserialize(messageType: string, buffer: Uint8Array): any {
    const Type = this.root.lookupType(`stellar_privacy.${messageType}`);
    return Type.decode(buffer);
  }
}