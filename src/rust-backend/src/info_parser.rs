#[derive(Debug)]
pub struct Info<'a> {
    pub depth: usize,
    pub pv: Vec<&'a str>
}

impl<'a> Info<'a> {
    pub fn parse_info(line: &'a str) -> Option<Self> {
        if line.len() < 5 || &line[0..5] != "info " {
            return None;
        }

        let mut words = line[5..].split(' ');
        if let Some("depth") = words.next() {
            if let Some(depth) = words.next().map(|f| f.parse::<usize>().unwrap()) {
                if words.any(|w| w == "pv") {
                    let pv: Vec<&str> = words.collect();

                    return Some(Info { depth, pv });
                }
            }
        }
        None
    }
}
