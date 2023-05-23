import { MoveIndicator } from "./move-indicator";
import { periodToNumber } from "./period-to-number";
import { Router } from "./router";
import { waitForElement } from "./wait-for-element";

const port = initPort();
const indicator = new MoveIndicator();

const clearBoard = (board: HTMLElement) => {
  const highlighted = board.querySelector(
    ".highlighted-by-kareem"
  ) as HTMLElement | null;
  if (highlighted) {
    highlighted.style.backgroundColor = "";
    highlighted.classList.remove("highlighted-by-kareem");
  }
  indicator.hide();
  indicator.setDefaultIcon();
};

function didMatchStart(sidebar: HTMLElement) {
  return !!sidebar.querySelector("vertical-move-list");
}

function didMatchEnd(sidebar: HTMLElement): Element | false {
  return (
    didMatchStart(sidebar) &&
    (sidebar.querySelector("vertical-move-list .game-result") || false)
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

function readMoves(sidebar: HTMLElement): {
  pgn: string;
  nextTurn: "black" | "white";
} {
  const moves = sidebar.querySelector("vertical-move-list");
  let pgn = "";
  let nextTurn: "black" | "white" = "white";
  for (const move of moves?.children || []) {
    const moveNumber = (move as HTMLElement).dataset.wholeMoveNumber;
    let [white, black] = move.querySelectorAll(".node");

    pgn += `${moveNumber}. ${(white as HTMLElement).innerText} `;

    if (black) {
      pgn += `${(black as HTMLElement).innerText} `;
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
  const chessboard = document.querySelector("chess-board")! as HTMLElement;
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
      "chess-board"
    ) as HTMLElement | null;
    if (chessboard) {
      clearBoard(chessboard);
    }
    router.unhandle("UNLISTEN_MOVES");
    router.handle("LISTEN_MOVES", onListen);
  };
  onListen();
}
function showMove(message: { move: string }) {
  const chessBoard = document.querySelector("chess-board")! as HTMLElement;
  clearBoard(chessBoard);
  const isFlipped = chessBoard.classList.contains("flipped");
  const [srcPeriod, srcRank, destPeriod, destRank, pieceToBe] = message.move;
  const piece = chessBoard.querySelector(
    `.piece.square-${periodToNumber(srcPeriod)}${srcRank}`
  )! as HTMLElement;
  if (!piece) return;
  const originalTransform = piece.style.transform;
  piece.style.transform = "";
  const {
    x: pieceX,
    y: pieceY,
    width: pieceWidth,
    height: pieceHeight,
  } = piece.getBoundingClientRect();
  piece.style.transform = originalTransform;
  const diffX = isFlipped
    ? periodToNumber(srcPeriod) - periodToNumber(destPeriod)
    : periodToNumber(destPeriod) - periodToNumber(srcPeriod);
  const diffY = isFlipped ? +srcRank - +destRank : +destRank - +srcRank;

  const destX = pieceX + pieceWidth * diffX + pieceWidth / 2;
  const destY = pieceY - pieceHeight * (diffY - 1) - pieceHeight / 2;

  piece.style.backgroundColor = "red";
  piece.classList.add("highlighted-by-kareem");

  if (pieceToBe) {
    indicator.setIcon(pieceToBe);
  }
  indicator.centerAt([destX, destY], {
    fontSize: `${pieceWidth / 2}px`,
  });
  indicator.show();
}
