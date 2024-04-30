use anyhow::Result;

fn main() -> Result<()> {
    chess_bot::start()?;
    Ok(())
}
