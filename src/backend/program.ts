#!/usr/bin/node
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { BestMove, addPV, decode, encode, getNode } from "./ktree";
import { readFileSync, writeFileSync } from "fs";

const CACHE_FILE = "../../var/cache.ktree";

const cache = decode(readFileSync(CACHE_FILE));

function saveCache() {
	writeFileSync(CACHE_FILE, encode(cache));
}

type State = {
	session_id: any;
	request_id: any;
	lastMessage: string | null;
	uci: string[];
	cachedMove: BestMove | null;
	stockfish: ChildProcessWithoutNullStreams;
};

const sessions: Map<number, State> = new Map();

function createStdoutHandler(state: State) {
	return (data: Buffer) => {
		const text = data.toString("utf-8");
		const lines = text.trimEnd().split("\n");
		for (const line of lines) {
			let info;
			if ((info = parseInfo(line))?.pv) {
				const move = info.pv[0];
				const depth = +info.depth;
				if (state.cachedMove && state.cachedMove.depth > depth) {
					continue;
				}

				if (markAsLast(state, { move, depth })) {
					const node = getNode(cache, state.uci);
					addPV(node, info.pv.slice(0, Math.min(3, depth)), depth);
					sendMessage(
						encodeMessage({
							request_id: state.request_id,
							session_id: state.session_id,
							move,
							depth,
						})
					);
				}
			} else if (line.startsWith("bestmove")) {
				state.cachedMove = null;
				state.lastMessage = null;
			}
		}
	};
}

const markAsLast = (state: State, message: { depth: number; move: string }) => {
	const encoded = `${message.depth}\0${message.move}`;

	if (state.lastMessage === encoded) {
		return false;
	}

	state.lastMessage = encoded;
	return true;
};

function parseInfo(line: string) {
	const parts = line.split(" ");
	if (parts[0] !== "info") return;

	let info: Record<string, any> = {};
	let i = 1;

	loop: while (i < parts.length) {
		const name = parts[i];
		switch (name) {
			case "depth":
				info.depth = parts[i + 1];
				i++;
				break;
			case "pv":
				info.pv = parts.slice(i + 1);
				break loop;
		}
		i++;
	}

	return info;
}

function listen() {
	let payloadSize: number | null = null;
	let queue: Buffer[] = [];
	let handling = Promise.resolve();
	let chunks: Buffer[] = [];

	const flushChunksQueue = () => {
		payloadSize = null;
		chunks.splice(0);
	};

	const processData = async () => {
		const stringData = Buffer.concat(chunks);
		if (stringData.length === 0) return;

		if (!payloadSize) {
			payloadSize = stringData.readUInt32LE(0);
		}

		if (stringData.length >= payloadSize + 4) {
			// Remove the header
			const contentWithoutSize = stringData.subarray(4, payloadSize + 4);

			const message = JSON.parse(contentWithoutSize.toString());
			await handleMessage(message);

			if (stringData.length > payloadSize + 4) {
				chunks = [stringData.subarray(payloadSize + 4)];
				payloadSize = null;
				await processData();
			} else {
				flushChunksQueue();
			}
		}
	};

	process.stdin.on("readable", () => {
		let chunk = null;

		// Read all of the available data
		while ((chunk = process.stdin.read()) !== null) {
			queue.push(chunk);
		}

		handling.then(() => {
			chunks.push(...queue);
			queue.splice(0);

			handling = processData();
		});
	});
}

function encodeMessage(message: any) {
	const content = Buffer.from(JSON.stringify(message), "utf-8");
	const length = Buffer.allocUnsafe(4);
	length.writeInt32LE(content.length, 0);
	return Buffer.concat([length, content]);
}

function sendMessage(encoded: Buffer) {
	process.stdout.write(encoded);
}

function getUCIFromPGN(pgn: string): Promise<string[]> {
	return new Promise((resolve) => {
		let chunks: Buffer[] = [];
		let { stdout, stdin } = spawn("pgn-extract", ["-Wuci", "--notags", "--noresults"]);
		stdout.on("data", (chunk) => {
			chunks.push(chunk);
		});
		stdout.once("end", () => {
			resolve(Buffer.concat(chunks).toString("utf-8").trimEnd().replace("*", "").split(" ").filter(s => !!s));
		});
		stdin.write(pgn);
		stdin.end();
	});
}

async function handleMessage(message: any) {
	let session = sessions.get(message.session_id);
	if (!session) {
		const state: State = {
			session_id: message.session_id,
			lastMessage: null,
			request_id: null,
			stockfish: spawn("stockfish"),
			uci: [],
			cachedMove: null
		};
		state.stockfish.stdin.write("uci\n");
		state.stockfish.stdin.write("setoption name Threads value 6\n");
		state.stockfish.stdin.write("setoption name Hash value 12\n");
		state.stockfish.stdout.on("data", createStdoutHandler(state));
		sessions.set(message.session_id, state);
		session = state;
	}

	switch (message.type) {
		case "FIND_MOVE":
			session.request_id = message.request_id;
			let uci = await getUCIFromPGN(message.pgn);
			session.uci = uci;
			lookupInCache(session);
			session.stockfish.stdin.write(
				`position startpos moves ${uci.join(" ")}\ngo infinite\n`
			);
			break;
		case "STOP":
			session.stockfish.stdin.write("stop\n");
			saveCache();
			break;
		case "SESSION_ENDED":
			session.stockfish.kill();
			sessions.delete(session.session_id);
			saveCache();
			break;
	}
}

function lookupInCache(state: State) {
	const node = getNode(cache, state.uci);
	if (node && node.bestmove) {
		state.cachedMove = node.bestmove;
		sendMessage(
			encodeMessage({
				request_id: state.request_id,
				session_id: state.session_id,
				move: node.bestmove.node.move,
				depth: node.bestmove.depth,
			})
		);

	}
}

listen();
