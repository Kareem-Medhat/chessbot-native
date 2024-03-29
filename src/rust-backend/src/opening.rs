use byteorder::{BigEndian, ReadBytesExt};
use std::{collections::HashMap, io::Cursor};

const MOVES: [&str; 64] = [
    "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1", "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2",
    "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3", "a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4",
    "a5", "b5", "c5", "d5", "e5", "f5", "g5", "h5", "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6",
    "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7", "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8",
];

pub struct Openings {
    book: HashMap<u64, Vec<Move>>
}

#[derive(Debug)]
pub struct Move {
    pub r#move: String,
    pub weight: u16
}


impl Openings {
    pub fn init() -> Self {
        let mut hash: HashMap<u64, Vec<Move>> = HashMap::new();
        let bytes = include_bytes!(
            "../assets/optimus+dcbook.bin"
        );
        let mut cursor = Cursor::new(bytes);
        while let Ok(pos_hash) = cursor.read_u64::<BigEndian>() {
            let raw_move = cursor.read_u16::<BigEndian>().unwrap();
            let to = raw_move & 0x3f;
            let from = (raw_move >> 6) & 0x3f;
            let promotion = match (raw_move >> 12) & 7 {
                0 => "",
                1 => "n",
                2 => "b",
                3 => "r",
                4 => "q",
                _ => unreachable!("invalid book")
            };
            let r#move = format!("{}{}{}", MOVES[from as usize], MOVES[to as usize], promotion);
            let weight = cursor.read_u16::<BigEndian>().unwrap();

            match hash.get_mut(&pos_hash) {
                Some(moves) => {
                    moves.push(Move {
                        r#move,
                        weight
                    });
                    moves.sort_unstable_by(|a, b| b.weight.cmp(&a.weight));
                },
                None => {
                    hash.insert(pos_hash, vec![Move {
                        r#move,
                        weight
                    }]);
                },
            }
            cursor.set_position(cursor.position() + 4);
        }
        Self {
            book: hash
        }
    }

    pub fn get_moves(&self, pos: &u64) -> Option<&Vec<Move>> {
        self.book.get(pos)
    }
}


#[cfg(test)]
mod tests {
    use std::time::Instant;

    use anyhow::Result;
    use shakmaty::{
        zobrist::{Zobrist64, ZobristHash},
        Chess, Position,
    };

    use super::*;

    #[test]
    fn opening() -> Result<()> {
        let now = Instant::now();
        let openings = Openings::init();
        println!("{:?}", now.elapsed());
        let pos = Chess::default();
        // let pos = pos.play(&shakmaty::Move::Normal { role: shakmaty::Role::Pawn, from: shakmaty::Square::E2, capture: None, to: shakmaty::Square::E4, promotion: None }).unwrap();
        let hash = pos
            .zobrist_hash::<Zobrist64>(shakmaty::EnPassantMode::Legal)
            .0;
        println!("{:?}", openings.book.get(&hash));
        Ok(())
    }
}
