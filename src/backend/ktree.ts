export type BestMove = {
  node: Node;
  depth: number;
} | null;

type RootNode = {
  bestmove: BestMove;
  moves: Map<string, Node>;
};

type Node = {
  moves: Map<string, Node>;
  bestmove: BestMove;
  move: string;
};

export function addBranch(root: RootNode, moves: string[]): Node[] {
  let current = root;
  const nodes = [];
  for (const move of moves) {
    const existing = current.moves.get(move);
    if (existing) {
      current = existing;
      nodes.push(existing);
      continue;
    }
    const node: Node = {
      moves: new Map(),
      move,
      bestmove: null,
    };
    current.moves.set(move, node);
    nodes.push(node);
    current = node;
  }
  return nodes;
}

export function getNode(root: RootNode, moves: string[]): RootNode {
	const branch = addBranch(root, moves);
	if (branch.length === 0) return root;
	return branch[branch.length-1];
}

export function addPV(root: RootNode, moves: string[], depth: number) {
  let current = root;
  for (const node of addBranch(current, moves)) {
    if (!current.bestmove || current.bestmove.depth < depth) {
      current.bestmove = {
        depth,
        node,
      };
    }
    depth--;
    current = node;
  }
}

export function encode(root: RootNode): Buffer {
  function commonEncode(root: RootNode): Buffer {
    const children = Buffer.allocUnsafe(1);
    children.writeUInt8(root.moves.size);
    const depth = Buffer.alloc(1);
    const chunks = [];
    if (root.bestmove) {
      depth.writeUInt8(root.bestmove.depth);
      chunks.push(encodeChild(root.bestmove.node));
    }
    for (const [, node] of root.moves) {
      if (root.bestmove?.node === node) {
        continue;
      }

      chunks.push(encodeChild(node));
    }
    return Buffer.concat([children, depth, ...chunks]);
  }

  function encodeChild(node: Node): Buffer {
    const move = Buffer.alloc(5);
    move.write(node.move);
    const common = commonEncode(node);

    return Buffer.concat([move, common]);
  }

  return commonEncode(root);
}

export function decode(buffer: Buffer): RootNode {
  let offset = 0;
  function commonDecode(): RootNode {
    let children = buffer.readUInt8(offset++);
    const depth = buffer.readUInt8(offset++);
    const root: RootNode = {
      bestmove: null,
      moves: new Map(),
    };
    if (depth) {
      const node = decodeChild();
      root.bestmove = {
        depth,
        node,
      };
      root.moves.set(node.move, node);
			children--;
    }
    for (let i = 0; i < children; i++) {
      const node = decodeChild();
      root.moves.set(node.move, node);
    }

    return root;
  }

  function decodeChild(): Node {
    const move = buffer.toString("utf8", offset, offset + 5).replace(/\0/g, "");
    offset += 5;
    const node = commonDecode();
    return {
      move,
      ...node,
    };
  }

  return commonDecode();
}

