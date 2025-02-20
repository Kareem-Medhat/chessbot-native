use pgn_reader::{BufferedReader, Visitor};
use shakmaty::{Chess, Position};

struct PositionFen {
    pos: Chess,
}


impl PositionFen {
    fn new() -> Self { Self { pos: Chess::default() } }
}

impl Visitor for PositionFen {
    type Result = ();

    fn san(&mut self, san_plus: pgn_reader::SanPlus) {
        if let Ok(m) = san_plus.san.to_move(&self.pos) {
            self.pos.play_unchecked(&m);
        }
    }

    fn end_game(&mut self) -> Self::Result {
        ()
    }
}

pub fn get_position<T: AsRef<str>>(pgn: T) -> Chess {
    let mut reader = BufferedReader::new_cursor(pgn.as_ref());
    let mut visitor = PositionFen::new();
    reader.read_game(&mut visitor).unwrap();
    std::mem::take(&mut visitor.pos)
}

