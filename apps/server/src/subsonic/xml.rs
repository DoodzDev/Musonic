//! Subsonic XML output, built from the same JSON value as the JSON output, following the
//! Subsonic convention: scalar fields are attributes, objects are child elements, arrays are
//! repeated elements, and a `value` field is the element's text.

use serde_json::{Map, Value};

const NAMESPACE: &str = "http://subsonic.org/restapi";

fn escape(text: &str, out: &mut String) {
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            c if (c as u32) < 0x20 && !matches!(c, '\t' | '\n' | '\r') => {}
            c => out.push(c),
        }
    }
}

fn scalar(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn element(name: &str, value: &Value, out: &mut String) {
    match value {
        Value::Object(map) => object(name, map, None, out),
        Value::Array(items) => {
            for item in items {
                element(name, item, out);
            }
        }
        Value::Null => {}
        other => {
            // A list of plain values (e.g. genres): one element each, value as text.
            out.push('<');
            out.push_str(name);
            out.push('>');
            escape(&scalar(other).unwrap_or_default(), out);
            out.push_str("</");
            out.push_str(name);
            out.push('>');
        }
    }
}

fn object(name: &str, map: &Map<String, Value>, xmlns: Option<&str>, out: &mut String) {
    out.push('<');
    out.push_str(name);
    if let Some(ns) = xmlns {
        out.push_str(" xmlns=\"");
        out.push_str(ns);
        out.push('"');
    }
    for (k, v) in map {
        if k == "value" {
            continue;
        }
        if let Some(s) = scalar(v) {
            out.push(' ');
            out.push_str(k);
            out.push_str("=\"");
            escape(&s, out);
            out.push('"');
        }
    }
    let text = map.get("value").and_then(scalar);
    let children: Vec<(&String, &Value)> = map
        .iter()
        .filter(|(k, v)| *k != "value" && matches!(v, Value::Object(_) | Value::Array(_)))
        .collect();
    if text.is_none() && children.is_empty() {
        out.push_str("/>");
        return;
    }
    out.push('>');
    if let Some(t) = text {
        escape(&t, out);
    }
    for (k, v) in children {
        element(k, v, out);
    }
    out.push_str("</");
    out.push_str(name);
    out.push('>');
}

/// `{"subsonic-response": {...}}` as an XML document.
pub fn render(response: &Map<String, Value>) -> String {
    let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
    object("subsonic-response", response, Some(NAMESPACE), &mut out);
    out
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn follows_the_subsonic_layout() {
        let v = json!({
            "status": "ok",
            "version": "1.16.1",
            "musicFolders": { "musicFolder": [{ "id": 1, "name": "Music & Co" }] },
            "lyrics": { "artist": "A", "value": "la <la>" },
            "genres": { "genre": [{ "songCount": 2, "value": "Rap/Hip Hop" }] },
            "empty": {},
            "none": null
        });
        let xml = render(v.as_object().unwrap());
        assert_eq!(
            xml,
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\
             <subsonic-response xmlns=\"http://subsonic.org/restapi\" status=\"ok\" version=\"1.16.1\">\
             <empty/>\
             <genres><genre songCount=\"2\">Rap/Hip Hop</genre></genres>\
             <lyrics artist=\"A\">la &lt;la&gt;</lyrics>\
             <musicFolders><musicFolder id=\"1\" name=\"Music &amp; Co\"/></musicFolders>\
             </subsonic-response>"
        );
    }
}
