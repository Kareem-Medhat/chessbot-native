use anyhow::Result;
use rand::{rngs::ThreadRng, Rng};
use shakmaty::zobrist::{Zobrist64, ZobristHash};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdout, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};

use crate::{
    info_parser, message_handler,
    messages::{FindMoveMessage, FindMoveResponse, Message, SessionEndedMessage, StopMessage},
    opening::Openings,
    pgn::get_position,
};

pub struct Controller {
    instances: HashMap<usize, InstanceState>,
    book: Openings,
    rng: ThreadRng,
}

impl Controller {
    pub fn new() -> Self {
        Self {
            instances: HashMap::new(),
            book: Openings::init(),
            rng: rand::thread_rng(),
        }
    }

    pub fn handle_message(&mut self, message: Message) -> Result<()> {
        match message {
            Message::FIND_MOVE(find_move) => self.find_move(find_move)?,
            Message::SESSION_ENDED(session_ended) => self.kill_instance(session_ended)?,
            Message::STOP(stop) => self.stop(stop)?,
        };
        Ok(())
    }

    fn find_move(&mut self, message: FindMoveMessage) -> Result<()> {
        let position = get_position(&message.pgn);
        let position_hash: u64 = position
            .zobrist_hash::<Zobrist64>(shakmaty::EnPassantMode::Legal)
            .0;

        let instance = match self.instances.get_mut(&message.session_id) {
            Some(instance) => {
                instance.stop()?;
                instance
            }
            None => {
                let instance = InstanceState::new(message.session_id, message.request_id)?;
                self.instances.insert(message.session_id, instance);
                self.instances.get_mut(&message.session_id).unwrap()
            }
        };

        match self.book.get_moves(&position_hash) {
            Some(moves) => {
                let good_moves: Vec<_> = moves.iter().filter(|m| m.weight > 100).collect();
                let r#move = match good_moves.len() {
                    0 => &moves[self.rng.gen_range(0..std::cmp::min(moves.len(), 3))],
                    n => good_moves[self.rng.gen_range(0..n)],
                };
                let response = FindMoveResponse {
                    depth: 255,
                    r#move: r#move.r#move.to_owned(),
                    request_id: message.request_id,
                    session_id: message.session_id,
                };
                message_handler::send_message(serde_json::to_vec(&response).unwrap())?;
            }
            None => {
                let fen =
                    shakmaty::fen::Fen::from_position(position, shakmaty::EnPassantMode::Legal);
                instance.set_request_id(message.request_id);
                instance.go(fen.to_string())?;
            }
        }
        Ok(())
    }

    fn kill_instance(&mut self, message: SessionEndedMessage) -> Result<()> {
        let instance = self.instances.remove(&message.session_id);
        if let Some(instance) = instance {
            instance.kill()?;
        }
        Ok(())
    }

    fn stop(&mut self, message: StopMessage) -> Result<()> {
        if let Some(instance) = self.instances.get_mut(&message.session_id) {
            instance.stop()?;
        }
        Ok(())
    }
}

#[derive(Debug)]
pub struct InstanceState {
    stockfish: Child,
    session_id: Arc<usize>,
    request_id: Arc<Mutex<usize>>,
}

impl InstanceState {
    pub fn new(session_id: usize, request_id: usize) -> Result<Self> {
        let mut stockfish = Command::new("stockfish")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()?;
        let stdin = stockfish.stdin.as_mut().unwrap();
        let stdout = stockfish.stdout.take().unwrap();

        stdin.write_all(b"uci\nsetoption name Threads value 6\nsetoption name Hash value 12\n")?;
        stdin.flush()?;
        let instance = InstanceState {
            stockfish,
            session_id: Arc::new(session_id),
            request_id: Arc::new(Mutex::new(request_id)),
        };
        instance.handle_stdout(stdout);
        Ok(instance)
    }

    fn handle_stdout(&self, stdout: ChildStdout) {
        let mut stdout = BufReader::new(stdout);
        let request_id = Arc::clone(&self.request_id);
        let session_id = Arc::clone(&self.session_id);
        thread::spawn(move || -> Result<()> {
            let mut buffer = String::with_capacity(512);
            while let Ok(n) = stdout.read_line(&mut buffer) {
                if n == 0 {
                    break;
                }
                let line = &buffer[0..n - 1];
                if let Some(info) = info_parser::Info::parse_info(line).ok() {
                    let request_id = request_id.lock().unwrap();
                    let response = FindMoveResponse {
                        r#move: info.pv[0].to_string(),
                        request_id: *request_id,
                        session_id: *session_id,
                        depth: info.depth,
                    };
                    message_handler::send_message(serde_json::to_vec(&response)?)?;
                }
                buffer.clear();
            }
            Ok(())
        });
    }

    fn go<T: AsRef<str>>(&mut self, fen: T) -> Result<()> {
        let stdin = self.stockfish.stdin.as_mut().unwrap();
        stdin.write_all(format!("position fen {}\ngo\n", fen.as_ref()).as_bytes())?;
        stdin.flush()?;
        Ok(())
    }

    fn stop(&mut self) -> Result<()> {
        let stdin = self.stockfish.stdin.as_mut().unwrap();
        stdin.write_all(b"stop\n")?;
        stdin.flush()?;
        Ok(())
    }

    fn kill(mut self) -> Result<()> {
        self.stockfish.kill()?;
        self.stockfish.wait()?;
        Ok(())
    }

    pub fn set_request_id(&mut self, request_id: usize) {
        *self.request_id.lock().unwrap() = request_id;
    }
}
