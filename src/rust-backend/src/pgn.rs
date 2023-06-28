use pgn_reader::{BufferedReader, Visitor};
use shakmaty::{Chess, Position, fen};

struct PositionFen {
    pos: Chess,
}

impl PositionFen {
    fn new() -> Self { Self { pos: Chess::default() } }
}

impl Visitor for PositionFen {
    type Result = String;

    fn san(&mut self, san_plus: pgn_reader::SanPlus) {
        if let Ok(m) = san_plus.san.to_move(&self.pos) {
            self.pos.play_unchecked(&m);
        }
    }

    fn end_game(&mut self) -> Self::Result {
        let position = std::mem::take(&mut self.pos);
        fen::Fen::from_position(position, shakmaty::EnPassantMode::Legal).to_string()
    }
}

pub fn get_fen<T: AsRef<str>>(pgn: T) -> String {
    let mut reader = BufferedReader::new_cursor(pgn.as_ref());
    let mut visitor = PositionFen::new();
    reader.read_game(&mut visitor).unwrap().unwrap_or(String::new())
}

