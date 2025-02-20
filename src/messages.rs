use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
#[allow(non_camel_case_types, clippy::upper_case_acronyms)]
pub enum Message {
    FIND_MOVE(FindMoveMessage),
    SESSION_ENDED(SessionEndedMessage),
    STOP(StopMessage)

}

#[derive(Serialize, Deserialize, Debug)]
pub struct FindMoveMessage {
    pub pgn: String,
    pub request_id: usize,
    pub session_id: usize
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SessionEndedMessage {
    pub session_id: usize
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StopMessage {
    pub session_id: usize
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FindMoveResponse {
    pub r#move: String,
    pub request_id: usize,
    pub session_id: usize,
    pub depth: usize
}