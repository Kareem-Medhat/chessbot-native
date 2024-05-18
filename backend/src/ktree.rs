use anyhow::{anyhow, Result};
use nom::{
    branch::alt,
    bytes::complete::{take},
    combinator::{map_res, map},
    multi::{many0, many1},
    number::complete::u8,
    sequence::tuple,
    IResult,
};

trait BasicNode {
    fn get_moves(&self) -> &[Node];
    fn get_bestmove_info(&self) -> Option<&BestmoveInfo>;
    fn get_bestmove(&self) -> Option<&Node> {
        self.get_bestmove_info().map(|_| &self.get_moves()[0])
    }
}

#[derive(Debug)]
struct RootNode {
    bestmove_info: Option<BestmoveInfo>,
    moves: Vec<Node>,
}

impl BasicNode for RootNode {
    fn get_bestmove_info(&self) -> Option<&BestmoveInfo> {
        self.bestmove_info.as_ref()
    }

    fn get_moves(&self) -> &[Node] {
        &self.moves
    }
}

#[derive(Debug)]
struct BestmoveInfo {
    depth: u8,
}

#[derive(Debug)]
struct Node {
    r#move: String,
    bestmove_info: Option<BestmoveInfo>,
    moves: Vec<Node>,
}

impl BasicNode for Node {
    fn get_bestmove_info(&self) -> Option<&BestmoveInfo> {
        self.bestmove_info.as_ref()
    }

    fn get_moves(&self) -> &[Node] {
        &self.moves
    }
}

fn serialize<T: BasicNode>(root: &T) -> Vec<u8> {
    let mut bytes: Vec<u8> = vec![];
    let moves = root.get_moves();
    match root.get_bestmove_info() {
        Some(best) => {
            assert!(best.depth > 0);
            assert!(moves.len() > 0);
            bytes.push(best.depth);
        }
        None => {
            bytes.push(0);
        }
    };
    for r#move in moves {
        bytes.append(&mut serialize_move(r#move));
    }
    bytes
}

fn serialize_move(node: &Node) -> Vec<u8> {
    let string_len = node.r#move.len();
    assert!(matches!(string_len, 4 | 5));
    assert!(node.r#move.is_ascii());
    let mut bytes: Vec<u8> = vec![];
    bytes.extend_from_slice(node.r#move.as_bytes());
    if string_len == 5 {
        bytes[0] += 128;
    }
    bytes.append(&mut serialize(node));
    bytes
}

fn parse_base(input: &[u8]) -> IResult<&[u8], RootNode> {
    let (remaining, (depth, moves)) = alt((tuple((zero, many0(parse_child))), tuple((u8, many1(parse_child)))))(input)?;

    let root = if depth == 0 {
        RootNode {
            bestmove_info: None,
            moves
        }
    } else {
        RootNode {
            bestmove_info: Some(BestmoveInfo {
                depth,
            }),
            moves
        }
    };
    Ok((remaining, root))
}

fn parse_child(input: &[u8]) -> IResult<&[u8], Node> {
    map_res(tuple((alt((map(tuple((eightbit, take(4u8))), |(first, rest)| {
        let mut bytes = vec![first-128];
        bytes.extend_from_slice(rest);
        String::from_utf8(bytes)
    }), map(take(4u8), |b: &[u8]| {
        String::from_utf8(b.to_vec())
    }))), parse_base)), |(movename, root)| -> Result<Node> {
        Ok(Node {
            r#move: movename?,
            bestmove_info: root.bestmove_info,
            moves: root.moves
        })
    })(input)
}

fn eightbit(input: &[u8]) -> IResult<&[u8], u8> {
    map_res(u8, |n| {
        if n < 128 {
            Err(anyhow!("number less than 128"))
        } else {
            Ok(n)
        }
    })(input)
}

fn zero(input: &[u8]) -> IResult<&[u8], u8> {
    map_res(u8, |n| {
        match n {
            0 => Ok(n),
            _ => Err(anyhow!("number is not zero"))
        }
    })(input)
}
