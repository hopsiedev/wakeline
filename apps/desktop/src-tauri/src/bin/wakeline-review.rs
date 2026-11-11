fn main() {
    #[cfg(debug_assertions)]
    {
        let args: Vec<String> = std::env::args().collect();
        let input = if args.get(2).is_some_and(|arg| arg == "--stdin") {
            use std::io::Read;
            let mut raw = String::new();
            let _ = std::io::stdin()
                .take(20 * 1024 * 1024 + 1)
                .read_to_string(&mut raw);
            if raw.len() > 20 * 1024 * 1024 {
                println!("{}", serde_json::json!({"ok":false,"error":"IMAGE_LIMIT"}));
                return;
            }
            serde_json::from_str(&raw).unwrap_or(serde_json::Value::Null)
        } else {
            args.get(2)
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or(serde_json::Value::Null)
        };
        let result =
            wakeline_app::review::query(args.get(1).map(String::as_str).unwrap_or_default(), input);
        let output = match result {
            Ok(value) => serde_json::json!({"ok":true,"value":value}),
            Err(error) => serde_json::json!({"ok":false,"error":error}),
        };
        println!("{output}");
    }
    #[cfg(not(debug_assertions))]
    eprintln!("Development review adapter is unavailable in release builds.");
}
