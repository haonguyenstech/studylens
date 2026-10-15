// Small helpers shared by the modules: time, ids, JSON files, JS-compatible string slicing.
use serde::{de::DeserializeOwned, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds since the epoch (JavaScript's Date.now()).
pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// "2026-10-15T08:30:00.123Z" (JavaScript's toISOString()).
pub fn iso(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let milli = ms.rem_euclid(1000);
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // civil-from-days (Howard Hinnant)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{milli:03}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

/// `n` random bytes as hex.
pub fn rand_hex(n: usize) -> String {
    let mut b = vec![0u8; n];
    getrandom::getrandom(&mut b).expect("random bytes");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

pub fn read_json<T: DeserializeOwned>(file: &Path) -> Option<T> {
    serde_json::from_str(&std::fs::read_to_string(file).ok()?).ok()
}

/// Write JSON, creating the folder. `pretty`: 2-space indent (JSON.stringify(x, null, 2)).
pub fn write_json<T: Serialize>(file: &Path, data: &T, pretty: bool) -> std::io::Result<()> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let text = if pretty { serde_json::to_string_pretty(data) } else { serde_json::to_string(data) }.map_err(std::io::Error::other)?;
    std::fs::write(file, text)
}

/// The first `n` UTF-16 code units of `s` (JavaScript's s.slice(0, n)), never splitting a character.
pub fn js_slice(s: &str, n: usize) -> &str {
    let mut units = 0;
    for (i, c) in s.char_indices() {
        units += c.len_utf16();
        if units > n {
            return &s[..i];
        }
    }
    s
}

/// The last `n` UTF-16 code units of `s` (JavaScript's s.slice(-n)).
pub fn js_tail(s: &str, n: usize) -> &str {
    let mut units = 0;
    for (i, c) in s.char_indices().rev() {
        units += c.len_utf16();
        if units > n {
            return &s[i + c.len_utf8()..];
        }
    }
    s
}

/// Length in UTF-16 code units (JavaScript's s.length).
pub fn js_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// 12345 → "12.345" (vi) or "12,345" (en): Number.prototype.toLocaleString for whole numbers.
pub fn group_int(n: u64, en: bool) -> String {
    let digits = n.to_string();
    let sep = if en { ',' } else { '.' };
    let mut out = String::new();
    for (i, ch) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(sep);
        }
        out.push(ch);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_matches_javascript() {
        assert_eq!(iso(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso(1_791_997_410_395), "2026-10-14T17:03:30.395Z");
        assert_eq!(iso(951_782_400_000), "2000-02-29T00:00:00.000Z");
    }

    #[test]
    fn js_strings() {
        assert_eq!(js_slice("Sổ tay", 2), "Sổ");
        assert_eq!(js_slice("a😀b", 2), "a");
        assert_eq!(js_tail("abcdef", 2), "ef");
        assert_eq!(js_len("😀"), 2);
        assert_eq!(group_int(1234567, false), "1.234.567");
        assert_eq!(group_int(999, true), "999");
        assert_eq!(group_int(1000, true), "1,000");
    }
}
