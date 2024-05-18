import { MoveIndicator } from "./move-indicator";
import { periodToNumber } from "./period-to-number";
import { Router } from "./router";
import { waitForElement } from "./wait-for-element";

const port = initPort();
const indicator = new MoveIndicator();

const clearBoard = (board: HTMLElement) => {
  const highlighted = board.querySelector(".made-by-bot") as HTMLElement | null;
  if (highlighted) {
    highlighted.remove();
  }
  indicator.hide();
  indicator.setDefaultIcon();
};

function didMatchStart(sidebar: HTMLElement) {
  return !!sidebar.querySelector("wc-vertical-move-list");
}

function didMatchEnd(sidebar: HTMLElement): Element | false {
  return (
    didMatchStart(sidebar) &&
    (sidebar.querySelector("wc-vertical-move-list .game-result") || false)
  );
}

function waitForMatchStart(sidebar: HTMLElement) {
  return new Promise((resolve) => {
    const check = () => didMatchStart(sidebar);
    if (check()) {
      return resolve(true);
    }

    const observer = new MutationObserver(() => {
      if (check()) {
        observer.disconnect();
        return resolve(true);
      }
    });
    observer.observe(sidebar, {
      subtree: true,
      childList: true,
    });
  });
}

function moveFromNode(node: HTMLElement) {
	if (node.childNodes.length > 1) {
		return Array.from(node.childNodes).map((node) => {
			return node instanceof HTMLElement ? node.dataset.figurine : node.nodeValue;
		}).join("");
	}

	return node.innerText;
}

function readMoves(sidebar: HTMLElement): {
  pgn: string;
  nextTurn: "black" | "white";
} {
  const moves = sidebar.querySelectorAll("wc-vertical-move-list div[data-whole-move-number]");
  let pgn = "";
  let nextTurn: "black" | "white" = "white";
  for (const move of moves) {
    const moveNumber = (move as HTMLElement).dataset.wholeMoveNumber;
    let [white, black] = move.querySelectorAll(".node");

    pgn += `${moveNumber}. ${moveFromNode(white as HTMLElement)} `;

    if (black) {
      pgn += `${moveFromNode(black as HTMLElement)} `;
    } else {
      nextTurn = "black";
      break;
    }
  }

  return {
    pgn: `${pgn}*`,
    nextTurn,
  };
}

async function start(sidebar: HTMLElement) {
  await waitForMatchStart(sidebar);
  console.log("Match started");
  const chessboard = document.querySelector("wc-chess-board")! as HTMLElement;
  const isWhite = !chessboard.classList.contains("flipped");

  const moves = readMoves(sidebar);
  if ((moves.nextTurn === "white") === isWhite) {
    port.postMessage({
      type: "FIND_MOVE",
      pgn: moves.pgn,
    });
  }

  const observer = new MutationObserver((mut) => {
    if (didMatchEnd(sidebar)) {
      clearBoard(chessboard);
      observer.disconnect();
      port.postMessage({
        type: "SWITCH_OFF",
      });
    } else if (
      mut.some((m) => (m.target as HTMLElement).classList.contains("move"))
    ) {
      const moves = readMoves(sidebar);
      if ((moves.nextTurn === "white") === isWhite) {
        port.postMessage({
          type: "FIND_MOVE",
          pgn: moves.pgn,
        });
      } else {
        clearBoard(chessboard);
        port.postMessage({
          type: "MOVE_PLAYED",
        });
      }
    }
  });
  observer.observe(sidebar, {
    childList: true,
    subtree: true,
  });
  return observer;
}

function initPort(): chrome.runtime.Port {
  const port = chrome.runtime.connect();
  initMessageHandling(port);
  return port;
}

function initMessageHandling(port: chrome.runtime.Port) {
  const router = new Router();
  router.handle("PLAY_MOVE", showMove);
  router.handle("LISTEN_MOVES", () => toggleStart(router));
  port.onMessage.addListener(router.route.bind(router));
}

function toggleStart(router: Router) {
  const onListen = async () => {
    const observer = await waitForElement("#board-layout-sidebar").then(start);
    router.unhandle("LISTEN_MOVES");
    router.handle("UNLISTEN_MOVES", () => onUnlisten(observer));
  };
  const onUnlisten = (observer: MutationObserver) => {
    observer.disconnect();
    const chessboard = document.querySelector(
      "wc-chess-board"
    ) as HTMLElement | null;
    if (chessboard) {
      clearBoard(chessboard);
    }
    router.unhandle("UNLISTEN_MOVES");
    router.handle("LISTEN_MOVES", onListen);
  };
  onListen().then(() => console.log(router));
}
function showMove(message: { move: string }) {
  const chessBoard = document.querySelector("wc-chess-board")! as HTMLElement;
  clearBoard(chessBoard);
  const { x: boardX, y: boardY } = chessBoard.getBoundingClientRect();
  const isFlipped = chessBoard.classList.contains("flipped");
  const [srcPeriod, srcRank, destPeriod, destRank, pieceToBe] = message.move;
  const className = `square-${periodToNumber(srcPeriod)}${srcRank}`;
  const highlight = document.createElement("div");
  highlight.classList.add("highlight", className, "made-by-bot");
  highlight.style.backgroundColor = "rgb(0, 255, 0)";
  // highlight.style.backgroundColor = "rgb(235, 97, 80)";
  highlight.style.opacity = "1";
  // svg.insertAdjacentElement("afterend", highlight);
  chessBoard.insertBefore(highlight, chessBoard.childNodes[2]);

  const { width: pieceWidth, height: pieceHeight } =
    highlight.getBoundingClientRect();

  const diffX = isFlipped
    ? 8 - periodToNumber(destPeriod)
    : periodToNumber(destPeriod) - 1;
  const diffY = isFlipped ? +destRank - 1 : 8 - +destRank;

  const destX = boardX + pieceWidth * diffX + pieceWidth / 2;
  const destY = boardY + pieceHeight * diffY + pieceHeight / 2;

  if (pieceToBe) {
    indicator.setIcon(pieceToBe);
  }
  indicator.centerAt([destX, destY], {
    fontSize: `${pieceWidth / 2}px`,
  });
  indicator.show();
}
