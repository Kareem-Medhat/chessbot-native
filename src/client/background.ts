const nativePort = chrome.runtime.connectNative("com.chessbot.native");

type State = {
  id: number;
  requestID: number;
  isOn: boolean;
  port: chrome.runtime.Port;
};

const handleNative = (state: State) => async (message: any) => {
  if (
    state.isOn &&
    state.id === message.session_id &&
    state.requestID === message.request_id
  ) {
    chrome.action.setBadgeText({
      text: String(message.depth),
      tabId: state.id,
    });
    state.port.postMessage({
      type: "PLAY_MOVE",
      move: message.move,
    });
  }
};

const handleClick = (state: State) => (tab: chrome.tabs.Tab) => {
  if (tab.id === state.id) {
    toggleExtension({ state });
  }
};

chrome.runtime.onConnect.addListener(function (port) {
  const state: State = {
    id: port.sender!.tab!.id!,
    requestID: 1,
    isOn: false,
    port,
  };
  chrome.action.setBadgeText({
    text: "OFF",
    tabId: state.id,
  });

  const handleC = handleClick(state);
  const handleN = handleNative(state);

  port.onDisconnect.addListener(async () => {
    nativePort.postMessage({
      type: "SESSION_ENDED",
      session_id: state.id,
    });
    nativePort.onMessage.removeListener(handleN);
    chrome.action.onClicked.removeListener(handleC);
  });

  nativePort.onMessage.addListener(handleN);

  port.onMessage.addListener(async (message) => {
    switch (message.type) {
      case "MOVE_PLAYED":
        state.requestID++;
        nativePort.postMessage({ type: "STOP", session_id: state.id });
        await chrome.action.setBadgeText({
          text: "ON",
          tabId: state.id,
        });
        break;
      case "SWITCH_OFF":
        await deactivate({ state });
        break;
      case "FIND_MOVE":
        await findMove({
          state,
          pgn: message.pgn,
        });
        break;
    }
  });
  chrome.action.onClicked.addListener(handleC);
});

async function findMove({ state, pgn }: { state: State; pgn: string }) {
  nativePort.postMessage({
    type: "FIND_MOVE",
    pgn,
    request_id: state.requestID,
    session_id: state.id,
  });
}

async function toggleExtension({ state }: { state: State }) {
  if (state.isOn) {
    await deactivate({ state });
  } else {
    await activate({ state });
  }
}

async function activate({ state }: { state: State }) {
  state.isOn = true;
  chrome.action.setBadgeText({
    text: "ON",
    tabId: state.id,
  });

  state.port.postMessage({
    type: "LISTEN_MOVES",
  });
}

async function deactivate({ state }: { state: State }) {
  state.isOn = false;
  await chrome.action.setBadgeText({
    text: "OFF",
    tabId: state.id,
  });
  state.port.postMessage({
    type: "UNLISTEN_MOVES",
  });
  state.requestID++;
  nativePort.postMessage({
    type: "STOP",
    session_id: state.id,
  });
}

export {};
