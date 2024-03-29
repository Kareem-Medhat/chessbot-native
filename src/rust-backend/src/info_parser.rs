use anyhow::Result;
use nom::{
    branch::alt,
    bytes::complete::tag,
    character::complete::{alphanumeric1, char, digit1},
    combinator::{map, map_res, opt},
    multi::separated_list1,
    sequence::{preceded, tuple},
    IResult,
};

#[derive(Debug)]
pub struct Info<'a> {
    pub depth: usize,
    pub seldepth: usize,
    pub multipv: usize,
    pub score: Score,
    pub nodes: usize,
    pub nps: usize,
    pub hashfull: f32,
    pub tbhits: usize,
    pub time: usize,
    pub pv: Vec<&'a str>,
}

#[derive(Debug)]
pub enum Score {
    Mate(usize),
    CP(CPScore),
}

#[derive(Debug)]
pub struct CPScore {
    cp: f32,
    bound: Option<Bound>,
}

#[derive(Debug)]
pub enum Bound {
    Upper,
    Lower,
}


impl<'a> Info<'a> {
    pub fn parse_info(line: &'a str) -> Result<Self, nom::Err<nom::error::Error<&str>>> {
        let (_rest, (depth, seldepth, multipv, score, nodes, nps, hashfull, tbhits, time, pv)) =
            tuple((
                preceded(tag("info depth "), parse_usize),
                preceded(tag(" seldepth "), parse_usize),
                preceded(tag(" multipv "), parse_usize),
                preceded(tag(" score "), parse_score),
                preceded(tag(" nodes "), parse_usize),
                preceded(tag(" nps "), parse_usize),
                preceded(tag(" hashfull "), map(parse_uf32, |n| n/100.0)),
                preceded(tag(" tbhits "), parse_usize),
                preceded(tag(" time "), parse_usize),
                preceded(tag(" pv "), separated_list1(char(' '), alphanumeric1)),
            ))(line)?;
        Ok(Self {
            depth,
            seldepth,
            multipv,
            score,
            nodes,
            nps,
            hashfull,
            tbhits,
            time,
            pv
        })
    }
}

fn parse_usize(input: &str) -> IResult<&str, usize> {
    map_res(digit1, |s: &str| s.parse::<usize>())(input)
}

fn parse_uf32(input: &str) -> IResult<&str, f32> {
    map_res(digit1, |s: &str| s.parse::<f32>())(input)
}

fn parse_if32(input: &str) -> IResult<&str, f32> {
    let d = map_res(
        tuple((opt(char::<&str, nom::error::Error<&str>>('-')), digit1)),
        |(neg, num)| -> Result<f32> {
            let num: f32 = num.parse()?;
            if neg.is_some() {
                Ok(-num)
            } else {
                Ok(num)
            }
        },
    )(input);
    d
}

fn parse_score(input: &str) -> IResult<&str, Score> {
    alt((
        map(parse_cp, |cp| Score::CP(cp)),
        map(parse_mate, |mate| Score::Mate(mate)),
    ))(input)
}

fn parse_cp(input: &str) -> IResult<&str, CPScore> {
    tuple((
        preceded(tag("cp "), parse_if32),
        opt(map(
            preceded(char(' '), alt((tag("upperbound"), tag("lowerbound")))),
            |s| match s {
                "upperbound" => Bound::Upper,
                "lowerbound" => Bound::Lower,
                _ => unreachable!(),
            },
        )),
    ))(input)
    .map(|(rest, (cp, bound))| {
        (
            rest,
            CPScore {
                cp: cp / 100.0,
                bound,
            },
        )
    })
}

fn parse_mate(input: &str) -> IResult<&str, usize> {
    preceded(tag("mate "), parse_usize)(input)
}