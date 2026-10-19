//! Encryption of the passwords kept for the legacy Subsonic token auth (`t = md5(password + s)`,
//! which needs the password itself). AES-256-GCM with a key that never goes in the database:
//! `MUSONIC_SECRET_KEY` (64 hex characters), else `secret.key` in the data directory, created
//! on first start (readable by its owner only).

use std::path::Path;

use aes_gcm::{
    Aes256Gcm, Key, Nonce,
    aead::{Aead, AeadCore, KeyInit, OsRng},
};
use anyhow::{Context, Result, anyhow, bail};
use base64::{Engine, engine::general_purpose::STANDARD};
use rand::RngCore;

const PREFIX: &str = "v1:";

pub struct SecretBox {
    cipher: Aes256Gcm,
}

impl SecretBox {
    pub fn from_key(key: &[u8; 32]) -> Self {
        Self {
            cipher: Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key)),
        }
    }

    /// The key from `MUSONIC_SECRET_KEY` when given, else from (or into) `<data_dir>/secret.key`.
    pub fn load(env_key: Option<&str>, data_dir: &Path) -> Result<Self> {
        if let Some(hex_key) = env_key {
            let bytes =
                hex::decode(hex_key.trim()).context("MUSONIC_SECRET_KEY: not hexadecimal")?;
            let key: [u8; 32] = bytes
                .try_into()
                .map_err(|_| anyhow!("MUSONIC_SECRET_KEY: 64 hexadecimal characters expected"))?;
            return Ok(Self::from_key(&key));
        }
        let path = data_dir.join("secret.key");
        if let Ok(text) = std::fs::read_to_string(&path) {
            let bytes = hex::decode(text.trim())
                .with_context(|| format!("{}: not hexadecimal", path.display()))?;
            let key: [u8; 32] = bytes
                .try_into()
                .map_err(|_| anyhow!("{}: 64 hexadecimal characters expected", path.display()))?;
            return Ok(Self::from_key(&key));
        }
        let mut key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        write_private(&path, &hex::encode(key))?;
        tracing::info!("created {}", path.display());
        Ok(Self::from_key(&key))
    }

    pub fn encrypt(&self, plain: &str) -> Result<String> {
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let mut out = nonce.to_vec();
        out.extend(
            self.cipher
                .encrypt(&nonce, plain.as_bytes())
                .map_err(|_| anyhow!("encryption failed"))?,
        );
        Ok(format!("{PREFIX}{}", STANDARD.encode(out)))
    }

    pub fn decrypt(&self, stored: &str) -> Result<String> {
        let Some(b64) = stored.strip_prefix(PREFIX) else {
            bail!("unknown encryption format");
        };
        let data = STANDARD.decode(b64).context("bad encoding")?;
        if data.len() < 12 {
            bail!("truncated value");
        }
        let (nonce, sealed) = data.split_at(12);
        let plain = self
            .cipher
            .decrypt(Nonce::from_slice(nonce), sealed)
            .map_err(|_| anyhow!("cannot decrypt (secret key changed?)"))?;
        Ok(String::from_utf8(plain)?)
    }
}

#[cfg(unix)]
fn write_private(path: &Path, content: &str) -> Result<()> {
    use std::{io::Write, os::unix::fs::OpenOptionsExt};
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
        .with_context(|| format!("creating {}", path.display()))?;
    f.write_all(content.as_bytes())?;
    Ok(())
}

#[cfg(not(unix))]
fn write_private(path: &Path, content: &str) -> Result<()> {
    std::fs::write(path, content).with_context(|| format!("creating {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_with_a_fresh_nonce_each_time() {
        let b = SecretBox::from_key(&[7; 32]);
        let a1 = b.encrypt("hunter2").unwrap();
        let a2 = b.encrypt("hunter2").unwrap();
        assert_ne!(a1, a2);
        assert_eq!(b.decrypt(&a1).unwrap(), "hunter2");
        assert!(
            SecretBox::from_key(&[8; 32]).decrypt(&a1).is_err(),
            "other key"
        );
        assert!(b.decrypt("v1:AAAA").is_err());
    }

    #[test]
    fn creates_then_reuses_the_key_file() {
        let dir = std::env::temp_dir().join(format!("musonic-secret-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let sealed = SecretBox::load(None, &dir).unwrap().encrypt("x").unwrap();
        assert_eq!(
            SecretBox::load(None, &dir)
                .unwrap()
                .decrypt(&sealed)
                .unwrap(),
            "x"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.join("secret.key"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        assert!(SecretBox::load(Some("abcd"), &dir).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
