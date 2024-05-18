use std::io::{Read, Write, stdout};
use crate::messages::Message;
use anyhow::Result;

#[derive(Debug)]
pub struct MessageHandler {
    packet_size: Option<u32>,
    data: Vec<u8>
}

pub fn send_message<T: AsRef<[u8]>>(data: T) -> std::io::Result<()> {
    let data = data.as_ref();
    let data_len = data.len();
    let mut buffer: Vec<u8> = Vec::with_capacity(data_len + 4);
    buffer.write_all(&(data_len as u32).to_le_bytes())?;
    buffer.write_all(data)?;
    stdout().write_all(&buffer)?;
    stdout().flush()?;
    Ok(())
}

impl MessageHandler {
    pub fn new() -> Self { Self { packet_size: None, data: Vec::new() } }

    pub fn receive<R, T: FnMut(Message) -> Result<R>>(&mut self, mut cb: T) -> Result<()> {
        let mut stdin = std::io::stdin().lock();
        let mut buf: [u8; 1024] = [0; 1024];

        while let Ok(n) = stdin.read(&mut buf) {
            if let Some(data) = self.handle(&buf[0..n]) {
                cb(serde_json::from_slice::<Message>(&data).unwrap())?;
            }
        }
        Ok(())
    }

    fn handle(&mut self, input: &[u8]) -> Option<Vec<u8>> {
        self.data.extend_from_slice(input);
        if self.packet_size.is_none() {
            if self.data.len() < 4 {
                return None;
            }
            let size = &self.data[0..4];
            self.packet_size = Some(u32::from_le_bytes(size.try_into().unwrap()));
            self.data = self.data[4..].to_vec();
        }

        let packet_size = self.packet_size.unwrap() as usize;
        if packet_size > self.data.len() {
            None
        } else {
            let packet_data: Vec<u8> = self.data.drain(0..packet_size).collect();
            self.packet_size = None;
            Some(packet_data)
        }
    }
}
