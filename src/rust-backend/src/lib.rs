pub mod message_handler;
mod controller;
mod messages;
mod pgn;
mod info_parser;
mod opening;

use anyhow::Result;

pub fn start() -> Result<()> {
    let mut message_handler = message_handler::MessageHandler::new();
    let mut controller = controller::Controller::new();
    message_handler.receive(|message| controller.handle_message(message))?;
    Ok(())
}
