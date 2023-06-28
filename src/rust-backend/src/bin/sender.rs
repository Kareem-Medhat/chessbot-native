fn main() {
    let message = std::env::args().skip(1).collect::<Vec<String>>().join(" ");
    chess_bot::message_handler::send_message(message).unwrap();
}
