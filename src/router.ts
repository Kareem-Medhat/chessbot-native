export class Router {
  private map: Map<string, (message: any) => void>;

  constructor() {
    this.map = new Map();
  }

  handle(type: string, handler: (message: any) => void) {
    this.map.set(type, handler);
    return this;
  }

  route(message: any) {
    const handler = this.map.get(message.type);
    if (!handler) {
      throw new Error(`no handler for message with type "${message.type}"`);
    }
    handler(message);
  }

  unhandle(type: string) {
    this.map.delete(type);
  }
}
